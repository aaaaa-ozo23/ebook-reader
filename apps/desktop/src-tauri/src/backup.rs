use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use anyhow::{bail, Context};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::db;

pub const BACKUP_PROGRESS_EVENT: &str = "data-operation-progress";
const BACKUP_FORMAT_IDENTIFIER: &str = "ebook-reader-backup";
const BACKUP_FORMAT_VERSION: u8 = 1;
const MAX_ARCHIVE_ENTRIES: usize = 20_000;
const MAX_ENTRY_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES: u64 = 25 * 1024 * 1024 * 1024;
const MAX_METADATA_BYTES: u64 = 64 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 200;

#[derive(Default)]
pub struct DataOperationRegistry {
    operations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl DataOperationRegistry {
    fn register(&self, operation_id: &str) -> anyhow::Result<Arc<AtomicBool>> {
        let mut operations = self.operations.lock().map_err(|_| {
            anyhow::anyhow!("[operation-registry-poisoned] operation registry unavailable")
        })?;
        if operations.contains_key(operation_id) {
            bail!("[operation-id-in-use] operation ID is already active");
        }
        let canceled = Arc::new(AtomicBool::new(false));
        operations.insert(operation_id.to_string(), Arc::clone(&canceled));
        Ok(canceled)
    }

    fn finish(&self, operation_id: &str) {
        if let Ok(mut operations) = self.operations.lock() {
            operations.remove(operation_id);
        }
    }

    pub fn cancel(&self, operation_id: &str) -> bool {
        let Ok(operations) = self.operations.lock() else {
            return false;
        };
        let Some(canceled) = operations.get(operation_id) else {
            return false;
        };
        canceled.store(true, Ordering::Release);
        true
    }
}

struct OperationGuard<'a> {
    registry: &'a DataOperationRegistry,
    operation_id: String,
}

impl Drop for OperationGuard<'_> {
    fn drop(&mut self) {
        self.registry.finish(&self.operation_id);
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    #[serde(default = "default_true")]
    pub include_data: bool,
    #[serde(default = "default_true")]
    pub include_covers: bool,
    #[serde(default)]
    pub include_books: bool,
}

impl Default for BackupOptions {
    fn default() -> Self {
        Self {
            include_data: true,
            include_covers: true,
            include_books: false,
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPayloadDescriptor {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format_identifier: String,
    pub format_version: u8,
    pub app_version: String,
    pub schema_version: i64,
    pub exported_at: String,
    pub options: BackupOptions,
    pub record_counts: BTreeMap<String, u64>,
    pub payloads: Vec<BackupPayloadDescriptor>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub operation_id: String,
    pub status: BackupStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    pub bytes_written: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<BackupManifest>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupStatus {
    Completed,
    Canceled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub operation_id: String,
    pub file_name: String,
    pub manifest: BackupManifest,
    pub archive_bytes: u64,
    pub warnings: Vec<String>,
    pub new_books: u64,
    pub matched_books: u64,
    pub missing_files: u64,
    pub conflict_records: u64,
    pub can_restore: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
pub enum RestoreItemStatus {
    Restored,
    Merged,
    LocalKept,
    MissingFile,
    Skipped,
    Failed,
}

impl RestoreItemStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Restored => "restored",
            Self::Merged => "merged",
            Self::LocalKept => "local-kept",
            Self::MissingFile => "missing-file",
            Self::Skipped => "skipped",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResultItem {
    pub category: &'static str,
    pub id: String,
    pub label: String,
    pub status: RestoreItemStatus,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub operation_id: String,
    pub status: BackupStatus,
    pub counts: BTreeMap<String, u64>,
    pub items: Vec<RestoreResultItem>,
}

struct InspectedBackup {
    manifest: BackupManifest,
    data: PortableBackupData,
    archive_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationProgress<'a> {
    operation_id: &'a str,
    kind: &'static str,
    phase: &'static str,
    completed: u64,
    total: u64,
    message: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableBackupData {
    books: Vec<PortableBook>,
    reading_progress: Vec<PortableProgress>,
    bookmarks: Vec<PortableBookmark>,
    annotations: Vec<PortableAnnotation>,
    settings: Vec<PortableSetting>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableBook {
    id: String,
    title: String,
    author: Option<String>,
    format: String,
    file_hash: String,
    cover_status: String,
    cover_archive_path: Option<String>,
    book_archive_path: Option<String>,
    created_at: String,
    updated_at: String,
    last_opened_at: Option<String>,
    #[serde(default)]
    user_title: Option<String>,
    #[serde(default)]
    title_override_updated_at: Option<String>,
    #[serde(default)]
    user_author: Option<String>,
    #[serde(default)]
    author_override_updated_at: Option<String>,
    #[serde(default)]
    user_cover: bool,
    #[serde(default)]
    cover_override_updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableProgress {
    book_id: String,
    locator: Value,
    progress: Option<f64>,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableBookmark {
    id: String,
    book_id: String,
    locator: Value,
    label: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableAnnotation {
    id: String,
    book_id: String,
    annotation_type: String,
    color: Option<String>,
    selected_text: Option<String>,
    note: Option<String>,
    locator: Value,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableSetting {
    key: String,
    value: Value,
    updated_at: String,
}

struct FilePayload {
    archive_path: String,
    source_path: PathBuf,
    descriptor: BackupPayloadDescriptor,
}

pub fn export_backup(
    app: &AppHandle,
    registry: &DataOperationRegistry,
    operation_id: &str,
    output_path: &Path,
    options: BackupOptions,
) -> anyhow::Result<BackupResult> {
    if operation_id.trim().is_empty() {
        bail!("[invalid-operation-id] operation ID is required");
    }
    if !options.include_data && !options.include_covers && !options.include_books {
        bail!("[empty-backup] select at least one backup content option");
    }
    validate_output_path(output_path)?;

    let canceled = registry.register(operation_id)?;
    let _guard = OperationGuard {
        registry,
        operation_id: operation_id.to_string(),
    };
    emit_progress(
        app,
        operation_id,
        "preparing",
        0,
        1,
        "Preparing portable data",
    );

    let storage = db::init_app_storage(app)?;
    let conn = Connection::open(&storage.database_path)
        .context("[database-open-failed] failed to open database")?;
    let schema_version: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    let exported_at: String =
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })?;

    let (mut data, mut file_payloads) =
        collect_portable_data(&conn, &storage.library_dir, options)?;
    if canceled.load(Ordering::Acquire) {
        emit_progress(app, operation_id, "canceled", 0, 0, "Backup canceled");
        return Ok(canceled_result(operation_id));
    }

    let data_bytes = if options.include_data {
        serde_json::to_vec_pretty(&data)
            .context("[data-serialization-failed] failed to serialize backup data")?
    } else {
        data.books.clear();
        Vec::new()
    };
    let mut payloads = Vec::with_capacity(file_payloads.len() + usize::from(options.include_data));
    if options.include_data {
        payloads.push(descriptor_for_bytes("data.json", &data_bytes));
    }
    payloads.extend(
        file_payloads
            .iter()
            .map(|payload| payload.descriptor.clone()),
    );
    payloads.sort_by(|left, right| left.path.cmp(&right.path));

    let record_counts = record_counts(&data, &file_payloads);
    let manifest = BackupManifest {
        format_identifier: BACKUP_FORMAT_IDENTIFIER.to_string(),
        format_version: BACKUP_FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        schema_version,
        exported_at,
        options,
        record_counts,
        payloads,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .context("[manifest-serialization-failed] failed to serialize backup manifest")?;

    let temp_path = temporary_output_path(output_path, operation_id)?;
    let write_result = write_archive(
        app,
        operation_id,
        &temp_path,
        &manifest_bytes,
        &data_bytes,
        options.include_data,
        &mut file_payloads,
        &canceled,
    );

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        if canceled.load(Ordering::Acquire) {
            emit_progress(app, operation_id, "canceled", 0, 0, "Backup canceled");
            return Ok(canceled_result(operation_id));
        }
        return Err(error);
    }
    if canceled.load(Ordering::Acquire) {
        let _ = fs::remove_file(&temp_path);
        emit_progress(app, operation_id, "canceled", 0, 0, "Backup canceled");
        return Ok(canceled_result(operation_id));
    }

    fs::rename(&temp_path, output_path).with_context(|| {
        format!(
            "[backup-commit-failed] failed to atomically move backup to {}",
            output_path.display()
        )
    })?;
    let bytes_written = fs::metadata(output_path)?.len();
    emit_progress(app, operation_id, "complete", 1, 1, "Backup complete");

    Ok(BackupResult {
        operation_id: operation_id.to_string(),
        status: BackupStatus::Completed,
        output_path: Some(output_path.display().to_string()),
        file_name: output_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned()),
        bytes_written,
        manifest: Some(manifest),
    })
}

pub fn inspect_backup(
    app: &AppHandle,
    registry: &DataOperationRegistry,
    operation_id: &str,
    backup_path: &Path,
) -> anyhow::Result<RestorePreview> {
    validate_backup_input_path(backup_path)?;
    let canceled = registry.register(operation_id)?;
    let _guard = OperationGuard {
        registry,
        operation_id: operation_id.to_string(),
    };
    emit_restore_progress(
        app,
        operation_id,
        "verifying",
        0,
        1,
        "Checking backup safety",
    );
    let inspected = inspect_archive(backup_path, &canceled)?;
    ensure_not_canceled(&canceled)?;

    let storage = db::init_app_storage(app)?;
    let conn = Connection::open(&storage.database_path)?;
    let mut new_books = 0_u64;
    let mut matched_books = 0_u64;
    let mut missing_files = 0_u64;
    for book in &inspected.data.books {
        let local: Option<String> = conn
            .query_row(
                "SELECT library_path FROM books WHERE file_hash = ?1",
                params![&book.file_hash],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(local_path) = local {
            matched_books += 1;
            if !Path::new(&local_path).is_file() && book.book_archive_path.is_none() {
                missing_files += 1;
            }
        } else {
            new_books += 1;
            if book.book_archive_path.is_none() {
                missing_files += 1;
            }
        }
    }
    let conflict_records = count_conflicts(&conn, &inspected.data)?;
    emit_restore_progress(
        app,
        operation_id,
        "complete",
        1,
        1,
        "Backup is safe to restore",
    );

    Ok(RestorePreview {
        operation_id: operation_id.to_string(),
        file_name: backup_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "backup.erbackup".to_string()),
        manifest: inspected.manifest,
        archive_bytes: inspected.archive_bytes,
        warnings: vec![
            "This backup is not encrypted.".to_string(),
            if missing_files > 0 {
                format!("{missing_files} books will need their original file before they can open.")
            } else {
                "All referenced books are available locally or included in the backup.".to_string()
            },
        ],
        new_books,
        matched_books,
        missing_files,
        conflict_records,
        can_restore: true,
    })
}

pub fn restore_backup(
    app: &AppHandle,
    registry: &DataOperationRegistry,
    operation_id: &str,
    backup_path: &Path,
) -> anyhow::Result<RestoreResult> {
    validate_backup_input_path(backup_path)?;
    let canceled = registry.register(operation_id)?;
    let _guard = OperationGuard {
        registry,
        operation_id: operation_id.to_string(),
    };
    emit_restore_progress(
        app,
        operation_id,
        "verifying",
        0,
        1,
        "Rechecking backup safety",
    );
    let inspected = inspect_archive(backup_path, &canceled)?;
    ensure_not_canceled(&canceled)?;

    let storage = db::init_app_storage(app)?;
    let app_data_dir = storage
        .library_dir
        .parent()
        .context("[storage-path-invalid] library has no app-data parent")?;
    let staging_root = app_data_dir.join("restore-staging");
    fs::create_dir_all(&staging_root)?;
    let staging_dir = staging_root.join(safe_operation_segment(operation_id));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir)?;
    }
    fs::create_dir(&staging_dir)?;

    let mut created_files = Vec::new();
    let restore_result = (|| {
        extract_restore_payloads(
            app,
            operation_id,
            backup_path,
            &inspected,
            &staging_dir,
            &canceled,
        )?;
        ensure_not_canceled(&canceled)?;
        let moved_files = commit_restore_files(
            &storage.library_dir,
            &staging_dir,
            &inspected.manifest,
            &mut created_files,
        )?;
        ensure_not_canceled(&canceled)?;
        emit_restore_progress(
            app,
            operation_id,
            "committing",
            0,
            1,
            "Merging reading data",
        );
        let mut conn = Connection::open(&storage.database_path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let transaction = conn.transaction()?;
        let items = merge_restore_data(
            &transaction,
            &inspected.data,
            &moved_files,
            &storage.library_dir,
        )?;
        ensure_not_canceled(&canceled)?;
        transaction.commit()?;
        Ok::<_, anyhow::Error>(items)
    })();

    let _ = fs::remove_dir_all(&staging_dir);
    let items = match restore_result {
        Ok(items) => items,
        Err(error) => {
            for path in created_files.iter().rev() {
                let _ = fs::remove_file(path);
            }
            if canceled.load(Ordering::Acquire) {
                emit_restore_progress(app, operation_id, "canceled", 0, 0, "Restore canceled");
                return Ok(RestoreResult {
                    operation_id: operation_id.to_string(),
                    status: BackupStatus::Canceled,
                    counts: empty_restore_counts(),
                    items: Vec::new(),
                });
            }
            return Err(error);
        }
    };
    let counts = restore_counts(&items);
    emit_restore_progress(app, operation_id, "complete", 1, 1, "Restore complete");
    Ok(RestoreResult {
        operation_id: operation_id.to_string(),
        status: BackupStatus::Completed,
        counts,
        items,
    })
}

fn inspect_archive(backup_path: &Path, canceled: &AtomicBool) -> anyhow::Result<InspectedBackup> {
    let archive_bytes = fs::metadata(backup_path)?.len();
    let file = File::open(backup_path)?;
    let mut archive =
        ZipArchive::new(file).context("[invalid-zip] backup is not a readable ZIP archive")?;
    if archive.len() == 0 || archive.len() > MAX_ARCHIVE_ENTRIES {
        bail!("[entry-limit-exceeded] backup entry count is outside the safe limit");
    }

    let mut names = HashSet::new();
    let mut total_uncompressed = 0_u64;
    for index in 0..archive.len() {
        ensure_not_canceled(canceled)?;
        let entry = archive.by_index(index)?;
        let name = entry.name().to_string();
        register_archive_entry(&mut names, &name)?;
        if entry.is_dir() {
            bail!("[directory-entry-rejected] backup contains an unexpected directory entry");
        }
        let size = entry.size();
        if size > MAX_ENTRY_BYTES {
            bail!("[entry-too-large] backup entry {name} exceeds the safe limit");
        }
        total_uncompressed = total_uncompressed
            .checked_add(size)
            .context("[archive-size-overflow] backup size overflow")?;
        if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES {
            bail!("[archive-too-large] backup expands beyond the safe limit");
        }
        let compressed = entry.compressed_size();
        if size > 0 && (compressed == 0 || size / compressed.max(1) > MAX_COMPRESSION_RATIO) {
            bail!("[compression-bomb] backup entry {name} has an unsafe compression ratio");
        }
    }
    if !names.contains("manifest.json") {
        bail!("[manifest-missing] backup does not contain manifest.json");
    }

    let manifest_bytes = read_zip_entry_limited(&mut archive, "manifest.json", MAX_METADATA_BYTES)?;
    let manifest: BackupManifest = serde_json::from_slice(&manifest_bytes)
        .context("[manifest-invalid] manifest.json is not valid backup metadata")?;
    validate_manifest(&manifest)?;

    let declared_names: HashSet<&str> = manifest
        .payloads
        .iter()
        .map(|payload| payload.path.as_str())
        .collect();
    if declared_names.len() != manifest.payloads.len() {
        bail!("[duplicate-payload] manifest declares the same payload more than once");
    }
    for name in &names {
        if name != "manifest.json" && !declared_names.contains(name.as_str()) {
            bail!("[undeclared-entry] archive entry {name} is not declared by the manifest");
        }
    }
    if declared_names.iter().any(|name| !names.contains(*name)) {
        bail!("[payload-missing] a manifest payload is missing from the archive");
    }

    for payload in &manifest.payloads {
        ensure_not_canceled(canceled)?;
        validate_archive_path(&payload.path)?;
        let mut entry = archive.by_name(&payload.path)?;
        if entry.size() != payload.size {
            bail!(
                "[size-mismatch] payload {} has a different declared size",
                payload.path
            );
        }
        let mut hasher = Sha256::new();
        let mut bytes_read = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            ensure_not_canceled(canceled)?;
            let count = entry.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            bytes_read += count as u64;
            if bytes_read > payload.size || bytes_read > MAX_ENTRY_BYTES {
                bail!(
                    "[size-mismatch] payload {} expands beyond its declaration",
                    payload.path
                );
            }
            hasher.update(&buffer[..count]);
        }
        if bytes_read != payload.size || hex::encode(hasher.finalize()) != payload.sha256 {
            bail!(
                "[checksum-mismatch] payload {} failed SHA-256 verification",
                payload.path
            );
        }
    }

    let data = if manifest.options.include_data {
        let descriptor = manifest
            .payloads
            .iter()
            .find(|payload| payload.path == "data.json")
            .context("[data-missing] manifest requires data.json")?;
        if descriptor.size > MAX_METADATA_BYTES {
            bail!("[data-too-large] data.json exceeds the safe metadata limit");
        }
        let bytes = read_zip_entry_limited(&mut archive, "data.json", MAX_METADATA_BYTES)?;
        serde_json::from_slice::<PortableBackupData>(&bytes)
            .context("[data-invalid] data.json is not valid portable data")?
    } else {
        PortableBackupData {
            books: Vec::new(),
            reading_progress: Vec::new(),
            bookmarks: Vec::new(),
            annotations: Vec::new(),
            settings: Vec::new(),
        }
    };
    validate_portable_data(&data, &manifest)?;
    Ok(InspectedBackup {
        manifest,
        data,
        archive_bytes,
    })
}

fn validate_manifest(manifest: &BackupManifest) -> anyhow::Result<()> {
    if manifest.format_identifier != BACKUP_FORMAT_IDENTIFIER {
        bail!("[format-identifier-unsupported] this is not an Ebook Reader backup");
    }
    if manifest.format_version != BACKUP_FORMAT_VERSION {
        bail!("[format-version-unsupported] backup major format version is unsupported");
    }
    if manifest
        .payloads
        .iter()
        .any(|payload| payload.path == "manifest.json")
    {
        bail!("[manifest-self-signature] manifest.json must not sign itself");
    }
    for payload in &manifest.payloads {
        if payload.size > MAX_ENTRY_BYTES
            || payload.sha256.len() != 64
            || !payload.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            bail!("[payload-descriptor-invalid] manifest payload descriptor is invalid");
        }
    }
    Ok(())
}

fn validate_portable_data(
    data: &PortableBackupData,
    manifest: &BackupManifest,
) -> anyhow::Result<()> {
    let book_ids: HashSet<&str> = data.books.iter().map(|book| book.id.as_str()).collect();
    if book_ids.len() != data.books.len() {
        bail!("[duplicate-book-id] data contains duplicate book IDs");
    }
    for book in &data.books {
        if book.id.trim().is_empty()
            || book.title.trim().is_empty()
            || !matches!(book.format.as_str(), "epub" | "txt" | "pdf")
            || book.file_hash.len() != 64
            || !book.file_hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            bail!("[book-record-invalid] portable book metadata is invalid");
        }
        if let Some(path) = &book.book_archive_path {
            if !path.starts_with("books/") {
                bail!("[book-payload-invalid] book archive path is invalid");
            }
            let descriptor = manifest
                .payloads
                .iter()
                .find(|payload| &payload.path == path)
                .context("[book-payload-missing] book payload is not declared")?;
            if descriptor.sha256 != book.file_hash {
                bail!("[book-hash-mismatch] included book does not match its file hash");
            }
        }
        if let Some(path) = &book.cover_archive_path {
            if !path.starts_with("covers/")
                || !manifest
                    .payloads
                    .iter()
                    .any(|payload| &payload.path == path)
            {
                bail!("[cover-payload-invalid] cover payload is invalid");
            }
        }
    }
    for book_id in data
        .reading_progress
        .iter()
        .map(|record| record.book_id.as_str())
        .chain(data.bookmarks.iter().map(|record| record.book_id.as_str()))
        .chain(
            data.annotations
                .iter()
                .map(|record| record.book_id.as_str()),
        )
    {
        if !book_ids.contains(book_id) {
            bail!("[orphan-record] portable reading record references an unknown book");
        }
    }
    Ok(())
}

fn validate_archive_path(path: &str) -> anyhow::Result<()> {
    if path.is_empty()
        || path.starts_with('/')
        || path.contains('\\')
        || path.contains(':')
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        bail!("[unsafe-entry-path] backup contains an unsafe entry path");
    }
    Ok(())
}

fn register_archive_entry(names: &mut HashSet<String>, name: &str) -> anyhow::Result<()> {
    validate_archive_path(name)?;
    if !names.insert(name.to_string()) {
        bail!("[duplicate-entry] backup contains duplicate entry {name}");
    }
    Ok(())
}

fn read_zip_entry_limited(
    archive: &mut ZipArchive<File>,
    name: &str,
    limit: u64,
) -> anyhow::Result<Vec<u8>> {
    let entry = archive.by_name(name)?;
    if entry.size() > limit {
        bail!("[metadata-too-large] {name} exceeds the safe metadata limit");
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        bail!("[metadata-too-large] {name} exceeds the safe metadata limit");
    }
    Ok(bytes)
}

fn extract_restore_payloads(
    app: &AppHandle,
    operation_id: &str,
    backup_path: &Path,
    inspected: &InspectedBackup,
    staging_dir: &Path,
    canceled: &AtomicBool,
) -> anyhow::Result<()> {
    let mut archive = ZipArchive::new(File::open(backup_path)?)?;
    let file_payloads: Vec<_> = inspected
        .manifest
        .payloads
        .iter()
        .filter(|payload| payload.path.starts_with("books/") || payload.path.starts_with("covers/"))
        .collect();
    let total = file_payloads.len() as u64;
    for (index, payload) in file_payloads.into_iter().enumerate() {
        ensure_not_canceled(canceled)?;
        let destination = staging_dir.join(Path::new(&payload.path));
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut source = archive.by_name(&payload.path)?;
        let mut output = File::create(&destination)?;
        let mut buffer = [0_u8; 64 * 1024];
        let mut written = 0_u64;
        loop {
            ensure_not_canceled(canceled)?;
            let count = source.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            written += count as u64;
            if written > payload.size {
                bail!("[size-mismatch] extracted payload exceeded its declaration");
            }
            output.write_all(&buffer[..count])?;
        }
        output.sync_all()?;
        emit_restore_progress(
            app,
            operation_id,
            "writing",
            index as u64 + 1,
            total,
            "Staging verified files",
        );
    }
    Ok(())
}

fn commit_restore_files(
    library_dir: &Path,
    staging_dir: &Path,
    manifest: &BackupManifest,
    created_files: &mut Vec<PathBuf>,
) -> anyhow::Result<HashMap<String, String>> {
    fs::create_dir_all(library_dir)?;
    fs::create_dir_all(library_dir.join("covers"))?;
    let mut moved = HashMap::new();
    for payload in manifest
        .payloads
        .iter()
        .filter(|payload| payload.path.starts_with("books/") || payload.path.starts_with("covers/"))
    {
        let staged = staging_dir.join(Path::new(&payload.path));
        let file_name = Path::new(&payload.path)
            .file_name()
            .context("[payload-path-invalid] payload has no file name")?;
        let destination = if payload.path.starts_with("covers/") {
            library_dir.join("covers").join(file_name)
        } else {
            library_dir.join(file_name)
        };
        if destination.exists() {
            let existing = descriptor_for_file(&payload.path, &destination)?;
            if existing.sha256 != payload.sha256 {
                bail!("[content-address-conflict] existing managed file has different content");
            }
        } else {
            fs::rename(&staged, &destination)?;
            created_files.push(destination.clone());
        }
        moved.insert(payload.path.clone(), destination.display().to_string());
    }
    Ok(moved)
}

fn merge_restore_data(
    transaction: &Transaction<'_>,
    data: &PortableBackupData,
    moved_files: &HashMap<String, String>,
    library_dir: &Path,
) -> anyhow::Result<Vec<RestoreResultItem>> {
    let mut items = Vec::new();
    let mut book_id_map = HashMap::new();

    for book in &data.books {
        let existing: Option<(String, String, Option<String>, String, Option<String>)> = transaction
            .query_row(
                "SELECT id, library_path, cover_path, updated_at, last_opened_at FROM books WHERE file_hash = ?1",
                params![&book.file_hash],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .optional()?;
        let restored_book_path = book
            .book_archive_path
            .as_ref()
            .and_then(|path| moved_files.get(path))
            .cloned();
        let restored_cover_path = book
            .cover_archive_path
            .as_ref()
            .and_then(|path| moved_files.get(path))
            .cloned();
        if let Some((
            local_id,
            local_library_path,
            local_cover_path,
            local_updated_at,
            local_last_opened,
        )) = existing
        {
            book_id_map.insert(book.id.clone(), local_id.clone());
            let incoming_newer = book.updated_at > local_updated_at;
            let repaired_library = if !Path::new(&local_library_path).is_file() {
                restored_book_path.as_deref().unwrap_or(&local_library_path)
            } else {
                &local_library_path
            };
            let effective_cover = if local_cover_path.is_none() && restored_cover_path.is_some() {
                if book.user_cover {
                    None
                } else {
                    restored_cover_path.as_deref()
                }
            } else {
                local_cover_path.as_deref()
            };
            let last_opened = max_optional_timestamp(
                local_last_opened.as_deref(),
                book.last_opened_at.as_deref(),
            );
            transaction.execute(
                "UPDATE books SET
                    title = CASE WHEN ?1 THEN ?2 ELSE title END,
                    author = CASE WHEN ?1 THEN ?3 ELSE author END,
                    library_path = ?4,
                    cover_path = ?5,
                    updated_at = CASE WHEN ?1 THEN ?6 ELSE updated_at END,
                    last_opened_at = ?7
                 WHERE id = ?8",
                params![
                    incoming_newer,
                    &book.title,
                    book.author.as_deref(),
                    repaired_library,
                    effective_cover,
                    &book.updated_at,
                    last_opened,
                    &local_id,
                ],
            )?;
            if restored_cover_path.is_some() && local_cover_path.is_none() {
                transaction.execute(
                    "INSERT INTO book_cover_state (book_id, status, updated_at) VALUES (?1, 'ready', ?2)
                     ON CONFLICT(book_id) DO UPDATE SET status = 'ready', updated_at = excluded.updated_at",
                    params![&local_id, &book.updated_at],
                )?;
            }
            let status = if incoming_newer || repaired_library != local_library_path {
                RestoreItemStatus::Merged
            } else {
                RestoreItemStatus::LocalKept
            };
            items.push(restore_item(
                "book",
                &local_id,
                &book.title,
                status,
                if status == RestoreItemStatus::Merged {
                    "Merged by file hash"
                } else {
                    "Local book was newer or equal"
                },
            ));
            merge_book_overrides(
                transaction,
                book,
                &local_id,
                if book.user_cover {
                    restored_cover_path.as_deref()
                } else {
                    None
                },
            )?;
        } else {
            let local_id = if is_uuid_like(&book.id) {
                book.id.clone()
            } else {
                uuid::Uuid::new_v4().to_string()
            };
            book_id_map.insert(book.id.clone(), local_id.clone());
            let expected_library_path = restored_book_path.unwrap_or_else(|| {
                library_dir
                    .join(format!("{}.{}", book.file_hash, book.format))
                    .display()
                    .to_string()
            });
            transaction.execute(
                "INSERT INTO books (
                    id, title, author, format, source_path, library_path, file_hash, cover_path,
                    created_at, updated_at, last_opened_at
                 ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    &local_id,
                    &book.title,
                    book.author.as_deref(),
                    &book.format,
                    &expected_library_path,
                    &book.file_hash,
                    if book.user_cover {
                        None
                    } else {
                        restored_cover_path.as_deref()
                    },
                    &book.created_at,
                    &book.updated_at,
                    book.last_opened_at.as_deref(),
                ],
            )?;
            let cover_status = if restored_cover_path.is_some() {
                "ready"
            } else if book.format == "txt" {
                "fallback"
            } else {
                "pending"
            };
            transaction.execute(
                "INSERT INTO book_cover_state (book_id, status, updated_at) VALUES (?1, ?2, ?3)",
                params![&local_id, cover_status, &book.updated_at],
            )?;
            let available = Path::new(&expected_library_path).is_file();
            items.push(restore_item(
                "book",
                &local_id,
                &book.title,
                if available {
                    RestoreItemStatus::Restored
                } else {
                    RestoreItemStatus::MissingFile
                },
                if available {
                    "Book and reading identity restored"
                } else {
                    "File needed; reading data was retained"
                },
            ));
            merge_book_overrides(
                transaction,
                book,
                &local_id,
                if book.user_cover {
                    restored_cover_path.as_deref()
                } else {
                    None
                },
            )?;
        }
    }

    merge_progress(
        transaction,
        &data.reading_progress,
        &book_id_map,
        &mut items,
    )?;
    merge_bookmarks(transaction, &data.bookmarks, &book_id_map, &mut items)?;
    merge_annotations(transaction, &data.annotations, &book_id_map, &mut items)?;
    merge_settings(transaction, &data.settings, &mut items)?;
    Ok(items)
}

fn merge_book_overrides(
    transaction: &Transaction<'_>,
    book: &PortableBook,
    local_book_id: &str,
    user_cover_path: Option<&str>,
) -> anyhow::Result<()> {
    transaction.execute(
        "INSERT OR IGNORE INTO book_user_metadata (book_id) VALUES (?1)",
        params![local_book_id],
    )?;
    if let Some(updated_at) = &book.title_override_updated_at {
        transaction.execute(
            "UPDATE book_user_metadata SET user_title = ?1, title_updated_at = ?2
             WHERE book_id = ?3 AND (title_updated_at IS NULL OR title_updated_at < ?2)",
            params![book.user_title.as_deref(), updated_at, local_book_id],
        )?;
    }
    if let Some(updated_at) = &book.author_override_updated_at {
        transaction.execute(
            "UPDATE book_user_metadata SET user_author = ?1, author_updated_at = ?2
             WHERE book_id = ?3 AND (author_updated_at IS NULL OR author_updated_at < ?2)",
            params![book.user_author.as_deref(), updated_at, local_book_id],
        )?;
    }
    if let Some(updated_at) = &book.cover_override_updated_at {
        transaction.execute(
            "UPDATE book_user_metadata SET user_cover_path = ?1, cover_updated_at = ?2
             WHERE book_id = ?3 AND (cover_updated_at IS NULL OR cover_updated_at < ?2)",
            params![user_cover_path, updated_at, local_book_id],
        )?;
    }
    Ok(())
}

fn merge_progress(
    transaction: &Transaction<'_>,
    records: &[PortableProgress],
    book_ids: &HashMap<String, String>,
    items: &mut Vec<RestoreResultItem>,
) -> anyhow::Result<()> {
    for record in records {
        let Some(local_book_id) = book_ids.get(&record.book_id) else {
            continue;
        };
        let local_updated: Option<String> = transaction
            .query_row(
                "SELECT updated_at FROM reading_progress WHERE book_id = ?1",
                params![local_book_id],
                |row| row.get(0),
            )
            .optional()?;
        let newer = local_updated
            .as_deref()
            .is_none_or(|timestamp| record.updated_at.as_str() > timestamp);
        if newer {
            transaction.execute(
                "INSERT INTO reading_progress (book_id, locator_json, progress, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(book_id) DO UPDATE SET locator_json = excluded.locator_json,
                    progress = excluded.progress, updated_at = excluded.updated_at",
                params![
                    local_book_id,
                    serde_json::to_string(&record.locator)?,
                    record.progress,
                    &record.updated_at
                ],
            )?;
        }
        items.push(restore_item(
            "progress",
            local_book_id,
            "Reading progress",
            if newer {
                RestoreItemStatus::Merged
            } else {
                RestoreItemStatus::LocalKept
            },
            if newer {
                "Newer backup progress applied"
            } else {
                "Local progress was newer or equal"
            },
        ));
    }
    Ok(())
}

fn merge_bookmarks(
    transaction: &Transaction<'_>,
    records: &[PortableBookmark],
    book_ids: &HashMap<String, String>,
    items: &mut Vec<RestoreResultItem>,
) -> anyhow::Result<()> {
    for record in records {
        let Some(local_book_id) = book_ids.get(&record.book_id) else {
            continue;
        };
        let local_updated: Option<String> = transaction
            .query_row(
                "SELECT updated_at FROM bookmarks WHERE id = ?1",
                params![&record.id],
                |row| row.get(0),
            )
            .optional()?;
        let newer = local_updated
            .as_deref()
            .is_none_or(|timestamp| record.updated_at.as_str() > timestamp);
        if newer {
            transaction.execute(
                "INSERT INTO bookmarks (id, book_id, locator_json, label, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id,
                    locator_json = excluded.locator_json, label = excluded.label,
                    created_at = excluded.created_at, updated_at = excluded.updated_at",
                params![
                    &record.id,
                    local_book_id,
                    serde_json::to_string(&record.locator)?,
                    record.label.as_deref(),
                    &record.created_at,
                    &record.updated_at
                ],
            )?;
        }
        items.push(restore_item(
            "bookmark",
            &record.id,
            record.label.as_deref().unwrap_or("Bookmark"),
            if local_updated.is_none() {
                RestoreItemStatus::Restored
            } else if newer {
                RestoreItemStatus::Merged
            } else {
                RestoreItemStatus::LocalKept
            },
            if newer {
                "Backup bookmark applied"
            } else {
                "Local bookmark was newer or equal"
            },
        ));
    }
    Ok(())
}

fn merge_annotations(
    transaction: &Transaction<'_>,
    records: &[PortableAnnotation],
    book_ids: &HashMap<String, String>,
    items: &mut Vec<RestoreResultItem>,
) -> anyhow::Result<()> {
    for record in records {
        let Some(local_book_id) = book_ids.get(&record.book_id) else {
            continue;
        };
        let local_updated: Option<String> = transaction
            .query_row(
                "SELECT updated_at FROM annotations WHERE id = ?1",
                params![&record.id],
                |row| row.get(0),
            )
            .optional()?;
        let newer = local_updated
            .as_deref()
            .is_none_or(|timestamp| record.updated_at.as_str() > timestamp);
        if newer {
            transaction.execute(
                "INSERT INTO annotations (
                    id, book_id, type, color, selected_text, note, locator_json,
                    created_at, updated_at, deleted_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id, type = excluded.type,
                    color = excluded.color, selected_text = excluded.selected_text, note = excluded.note,
                    locator_json = excluded.locator_json, created_at = excluded.created_at,
                    updated_at = excluded.updated_at, deleted_at = excluded.deleted_at",
                params![&record.id, local_book_id, &record.annotation_type, record.color.as_deref(), record.selected_text.as_deref(), record.note.as_deref(), serde_json::to_string(&record.locator)?, &record.created_at, &record.updated_at, record.deleted_at.as_deref()],
            )?;
        }
        items.push(restore_item(
            "annotation",
            &record.id,
            if record.deleted_at.is_some() {
                "Deleted annotation"
            } else {
                "Annotation"
            },
            if local_updated.is_none() {
                RestoreItemStatus::Restored
            } else if newer {
                RestoreItemStatus::Merged
            } else {
                RestoreItemStatus::LocalKept
            },
            if record.deleted_at.is_some() && newer {
                "Deletion tombstone applied"
            } else if newer {
                "Backup annotation applied"
            } else {
                "Local annotation was newer or equal"
            },
        ));
    }
    Ok(())
}

fn merge_settings(
    transaction: &Transaction<'_>,
    records: &[PortableSetting],
    items: &mut Vec<RestoreResultItem>,
) -> anyhow::Result<()> {
    for record in records {
        let local_updated: Option<String> = transaction
            .query_row(
                "SELECT updated_at FROM app_settings WHERE key = ?1",
                params![&record.key],
                |row| row.get(0),
            )
            .optional()?;
        let newer = local_updated
            .as_deref()
            .is_none_or(|timestamp| record.updated_at.as_str() > timestamp);
        if newer {
            transaction.execute(
                "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
                params![&record.key, serde_json::to_string(&record.value)?, &record.updated_at],
            )?;
        }
        items.push(restore_item(
            "setting",
            &record.key,
            &record.key,
            if local_updated.is_none() {
                RestoreItemStatus::Restored
            } else if newer {
                RestoreItemStatus::Merged
            } else {
                RestoreItemStatus::LocalKept
            },
            if newer {
                "Backup setting applied"
            } else {
                "Local setting was newer or equal"
            },
        ));
    }
    Ok(())
}

fn count_conflicts(conn: &Connection, data: &PortableBackupData) -> anyhow::Result<u64> {
    let mut conflicts = 0_u64;
    for bookmark in &data.bookmarks {
        conflicts += conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM bookmarks WHERE id = ?1)",
            params![&bookmark.id],
            |row| row.get::<_, bool>(0),
        )? as u64;
    }
    for annotation in &data.annotations {
        conflicts += conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM annotations WHERE id = ?1)",
            params![&annotation.id],
            |row| row.get::<_, bool>(0),
        )? as u64;
    }
    for setting in &data.settings {
        conflicts += conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = ?1)",
            params![&setting.key],
            |row| row.get::<_, bool>(0),
        )? as u64;
    }
    Ok(conflicts)
}

fn restore_item(
    category: &'static str,
    id: &str,
    label: &str,
    status: RestoreItemStatus,
    message: &str,
) -> RestoreResultItem {
    RestoreResultItem {
        category,
        id: id.to_string(),
        label: label.to_string(),
        status,
        message: message.to_string(),
    }
}

fn restore_counts(items: &[RestoreResultItem]) -> BTreeMap<String, u64> {
    let mut counts = empty_restore_counts();
    for item in items {
        *counts.entry(item.status.as_str().to_string()).or_default() += 1;
    }
    counts
}

fn empty_restore_counts() -> BTreeMap<String, u64> {
    [
        "restored",
        "merged",
        "local-kept",
        "missing-file",
        "skipped",
        "failed",
    ]
    .into_iter()
    .map(|status| (status.to_string(), 0))
    .collect()
}

fn max_optional_timestamp<'a>(left: Option<&'a str>, right: Option<&'a str>) -> Option<&'a str> {
    match (left, right) {
        (Some(left), Some(right)) => Some(if right > left { right } else { left }),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn is_uuid_like(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok()
}

fn safe_operation_segment(operation_id: &str) -> String {
    operation_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .take(64)
        .collect()
}

fn validate_backup_input_path(path: &Path) -> anyhow::Result<()> {
    if path.extension().and_then(|value| value.to_str()) != Some("erbackup") || !path.is_file() {
        bail!("[invalid-backup-file] choose an existing .erbackup file");
    }
    Ok(())
}

fn emit_restore_progress(
    app: &AppHandle,
    operation_id: &str,
    phase: &'static str,
    completed: u64,
    total: u64,
    message: &str,
) {
    let _ = app.emit(
        BACKUP_PROGRESS_EVENT,
        OperationProgress {
            operation_id,
            kind: "backup-restore",
            phase,
            completed,
            total,
            message,
        },
    );
}

fn collect_portable_data(
    conn: &Connection,
    library_dir: &Path,
    options: BackupOptions,
) -> anyhow::Result<(PortableBackupData, Vec<FilePayload>)> {
    let canonical_library = library_dir
        .canonicalize()
        .context("[library-unavailable] failed to resolve the managed library")?;
    let mut file_payloads = Vec::new();
    let mut statement = conn.prepare(
        "SELECT books.id, books.title, books.author, books.format, books.library_path,
                books.file_hash, COALESCE(metadata.user_cover_path, books.cover_path), books.created_at, books.updated_at,
                books.last_opened_at,
                COALESCE(book_cover_state.status,
                  CASE WHEN metadata.user_cover_path IS NOT NULL OR books.cover_path IS NOT NULL THEN 'ready'
                       WHEN books.format = 'txt' THEN 'fallback' ELSE 'pending' END)
                , metadata.user_title, metadata.title_updated_at,
                  metadata.user_author, metadata.author_updated_at,
                  metadata.user_cover_path IS NOT NULL, metadata.cover_updated_at
         FROM books
         LEFT JOIN book_cover_state ON book_cover_state.book_id = books.id
         LEFT JOIN book_user_metadata metadata ON metadata.book_id = books.id
         ORDER BY books.id",
    )?;
    let books = statement
        .query_map([], |row| portable_book_from_row(row))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut portable_books = Vec::with_capacity(books.len());
    for (mut book, library_path, cover_path) in books {
        if options.include_books {
            if let Some(payload) = file_payload(
                &canonical_library,
                &library_path,
                format!("books/{}.{}", book.file_hash, book.format),
            )? {
                book.book_archive_path = Some(payload.archive_path.clone());
                file_payloads.push(payload);
            }
        }
        if options.include_covers {
            if let Some(cover_path) = cover_path {
                let extension = Path::new(&cover_path)
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("webp")
                    .to_ascii_lowercase();
                if let Some(payload) = file_payload(
                    &canonical_library,
                    &cover_path,
                    format!("covers/{}.{}", book.file_hash, extension),
                )? {
                    book.cover_archive_path = Some(payload.archive_path.clone());
                    file_payloads.push(payload);
                }
            }
        }
        portable_books.push(book);
    }

    Ok((
        PortableBackupData {
            books: portable_books,
            reading_progress: query_progress(conn)?,
            bookmarks: query_bookmarks(conn)?,
            annotations: query_annotations(conn)?,
            settings: query_settings(conn)?,
        },
        file_payloads,
    ))
}

fn portable_book_from_row(
    row: &Row<'_>,
) -> rusqlite::Result<(PortableBook, String, Option<String>)> {
    let format: String = row.get(3)?;
    Ok((
        PortableBook {
            id: row.get(0)?,
            title: row.get(1)?,
            author: row.get(2)?,
            format,
            file_hash: row.get(5)?,
            cover_status: row.get(10)?,
            cover_archive_path: None,
            book_archive_path: None,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            last_opened_at: row.get(9)?,
            user_title: row.get(11)?,
            title_override_updated_at: row.get(12)?,
            user_author: row.get(13)?,
            author_override_updated_at: row.get(14)?,
            user_cover: row.get(15)?,
            cover_override_updated_at: row.get(16)?,
        },
        row.get(4)?,
        row.get(6)?,
    ))
}

fn query_progress(conn: &Connection) -> anyhow::Result<Vec<PortableProgress>> {
    let mut statement = conn.prepare(
        "SELECT book_id, locator_json, progress, updated_at FROM reading_progress ORDER BY book_id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(PortableProgress {
                book_id: row.get(0)?,
                locator: json_column(row, 1)?,
                progress: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(anyhow::Error::from)?;
    Ok(rows)
}

fn query_bookmarks(conn: &Connection) -> anyhow::Result<Vec<PortableBookmark>> {
    let mut statement = conn.prepare(
        "SELECT id, book_id, locator_json, label, created_at, updated_at FROM bookmarks ORDER BY id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(PortableBookmark {
                id: row.get(0)?,
                book_id: row.get(1)?,
                locator: json_column(row, 2)?,
                label: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(anyhow::Error::from)?;
    Ok(rows)
}

fn query_annotations(conn: &Connection) -> anyhow::Result<Vec<PortableAnnotation>> {
    let mut statement = conn.prepare(
        "SELECT id, book_id, type, color, selected_text, note, locator_json,
                created_at, updated_at, deleted_at
         FROM annotations ORDER BY id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(PortableAnnotation {
                id: row.get(0)?,
                book_id: row.get(1)?,
                annotation_type: row.get(2)?,
                color: row.get(3)?,
                selected_text: row.get(4)?,
                note: row.get(5)?,
                locator: json_column(row, 6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                deleted_at: row.get(9)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(anyhow::Error::from)?;
    Ok(rows)
}

fn query_settings(conn: &Connection) -> anyhow::Result<Vec<PortableSetting>> {
    let mut statement = conn.prepare(
        "SELECT key, value_json, updated_at FROM app_settings
         WHERE key NOT IN ('updater_last_checked_at') ORDER BY key",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(PortableSetting {
                key: row.get(0)?,
                value: json_column(row, 1)?,
                updated_at: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(anyhow::Error::from)?;
    Ok(rows)
}

fn json_column(row: &Row<'_>, index: usize) -> rusqlite::Result<Value> {
    let raw: String = row.get(index)?;
    serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn file_payload(
    canonical_library: &Path,
    source_path: &str,
    archive_path: String,
) -> anyhow::Result<Option<FilePayload>> {
    let path = PathBuf::from(source_path);
    if !path.is_file() {
        return Ok(None);
    }
    let canonical = path
        .canonicalize()
        .with_context(|| format!("[payload-unavailable] failed to resolve {}", path.display()))?;
    if !canonical.starts_with(canonical_library) {
        bail!("[payload-outside-library] managed payload escaped the app library");
    }
    let descriptor = descriptor_for_file(&archive_path, &canonical)?;
    Ok(Some(FilePayload {
        archive_path,
        source_path: canonical,
        descriptor,
    }))
}

fn descriptor_for_bytes(path: &str, bytes: &[u8]) -> BackupPayloadDescriptor {
    BackupPayloadDescriptor {
        path: path.to_string(),
        size: bytes.len() as u64,
        sha256: hex::encode(Sha256::digest(bytes)),
    }
}

fn descriptor_for_file(
    archive_path: &str,
    source_path: &Path,
) -> anyhow::Result<BackupPayloadDescriptor> {
    let mut file = File::open(source_path)?;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        size += count as u64;
        hasher.update(&buffer[..count]);
    }
    Ok(BackupPayloadDescriptor {
        path: archive_path.to_string(),
        size,
        sha256: hex::encode(hasher.finalize()),
    })
}

fn record_counts(data: &PortableBackupData, files: &[FilePayload]) -> BTreeMap<String, u64> {
    let mut counts = BTreeMap::new();
    counts.insert("books".to_string(), data.books.len() as u64);
    counts.insert(
        "readingProgress".to_string(),
        data.reading_progress.len() as u64,
    );
    counts.insert("bookmarks".to_string(), data.bookmarks.len() as u64);
    counts.insert("annotations".to_string(), data.annotations.len() as u64);
    counts.insert("settings".to_string(), data.settings.len() as u64);
    counts.insert(
        "covers".to_string(),
        files
            .iter()
            .filter(|payload| payload.archive_path.starts_with("covers/"))
            .count() as u64,
    );
    counts.insert(
        "bookFiles".to_string(),
        files
            .iter()
            .filter(|payload| payload.archive_path.starts_with("books/"))
            .count() as u64,
    );
    counts
}

fn write_archive(
    app: &AppHandle,
    operation_id: &str,
    temp_path: &Path,
    manifest_bytes: &[u8],
    data_bytes: &[u8],
    include_data: bool,
    file_payloads: &mut [FilePayload],
    canceled: &AtomicBool,
) -> anyhow::Result<()> {
    let file = File::create(temp_path).with_context(|| {
        format!(
            "[backup-create-failed] failed to create {}",
            temp_path.display()
        )
    })?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    let total = file_payloads.len() as u64 + 1 + u64::from(include_data);
    let mut completed = 0_u64;

    zip.start_file("manifest.json", options)?;
    zip.write_all(manifest_bytes)?;
    completed += 1;
    emit_progress(
        app,
        operation_id,
        "writing",
        completed,
        total,
        "Writing manifest",
    );

    if include_data {
        ensure_not_canceled(canceled)?;
        zip.start_file("data.json", options)?;
        zip.write_all(data_bytes)?;
        completed += 1;
        emit_progress(
            app,
            operation_id,
            "writing",
            completed,
            total,
            "Writing reading data",
        );
    }

    let mut buffer = [0_u8; 64 * 1024];
    for payload in file_payloads {
        ensure_not_canceled(canceled)?;
        zip.start_file(&payload.archive_path, options)?;
        let mut source = File::open(&payload.source_path)?;
        loop {
            ensure_not_canceled(canceled)?;
            let count = source.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            zip.write_all(&buffer[..count])?;
        }
        completed += 1;
        emit_progress(
            app,
            operation_id,
            "writing",
            completed,
            total,
            "Writing managed files",
        );
    }
    zip.finish()?;
    Ok(())
}

fn ensure_not_canceled(canceled: &AtomicBool) -> anyhow::Result<()> {
    if canceled.load(Ordering::Acquire) {
        bail!("[operation-canceled] backup canceled");
    }
    Ok(())
}

fn emit_progress(
    app: &AppHandle,
    operation_id: &str,
    phase: &'static str,
    completed: u64,
    total: u64,
    message: &str,
) {
    let _ = app.emit(
        BACKUP_PROGRESS_EVENT,
        OperationProgress {
            operation_id,
            kind: "backup-export",
            phase,
            completed,
            total,
            message,
        },
    );
}

fn validate_output_path(path: &Path) -> anyhow::Result<()> {
    if path.extension().and_then(|value| value.to_str()) != Some("erbackup") {
        bail!("[invalid-backup-extension] backup file must use .erbackup");
    }
    let parent = path
        .parent()
        .context("[invalid-output-path] backup destination has no parent")?;
    if !parent.is_dir() {
        bail!("[invalid-output-path] backup destination folder does not exist");
    }
    if path.exists() {
        bail!("[output-exists] choose a new backup file name");
    }
    Ok(())
}

fn temporary_output_path(output_path: &Path, operation_id: &str) -> anyhow::Result<PathBuf> {
    let file_name = output_path
        .file_name()
        .and_then(|value| value.to_str())
        .context("[invalid-output-path] backup file name is invalid")?;
    let safe_operation_id: String = operation_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .take(64)
        .collect();
    Ok(output_path.with_file_name(format!(".{file_name}.{safe_operation_id}.tmp")))
}

fn canceled_result(operation_id: &str) -> BackupResult {
    BackupResult {
        operation_id: operation_id.to_string(),
        status: BackupStatus::Canceled,
        output_path: None,
        file_name: None,
        bytes_written: 0,
        manifest: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        create_bookmark_at, get_reading_progress_at, import_book_at, init_database_at,
        list_books_at, save_reader_cache_at, save_reading_progress_at, ImportBookStatus, Locator,
        TxtLocator,
    };
    use std::io::Read;
    use tempfile::tempdir;
    use zip::ZipArchive;

    #[test]
    fn default_backup_options_keep_books_opt_in() {
        let options = BackupOptions::default();
        assert!(options.include_data);
        assert!(options.include_covers);
        assert!(!options.include_books);
    }

    #[test]
    fn manifest_descriptor_hashes_payload_without_self_signing() {
        let descriptor = descriptor_for_bytes("data.json", b"portable");
        assert_eq!(descriptor.size, 8);
        assert_eq!(descriptor.path, "data.json");
        assert_eq!(descriptor.sha256.len(), 64);
        assert_ne!(descriptor.path, "manifest.json");
    }

    #[test]
    fn temporary_file_stays_next_to_destination() {
        let directory = tempdir().expect("tempdir");
        let output = directory
            .path()
            .join("ebook-reader-backup-2026-07-16.erbackup");
        let temp = temporary_output_path(&output, "operation/unsafe").expect("temp path");
        assert_eq!(temp.parent(), output.parent());
        assert!(temp
            .file_name()
            .unwrap()
            .to_string_lossy()
            .ends_with(".tmp"));
        assert!(!temp.to_string_lossy().contains("operation/unsafe"));
    }

    #[test]
    fn portable_data_and_archive_exclude_machine_paths_and_reader_cache() {
        let directory = tempdir().expect("tempdir");
        let database_path = directory.path().join("reader.sqlite3");
        let library_dir = directory.path().join("library");
        fs::create_dir_all(&library_dir).expect("library dir");
        let source_path = directory.path().join("portable.txt");
        fs::write(&source_path, "portable reading data").expect("source");
        let imported = import_book_at(&database_path, &library_dir, &source_path)
            .expect("import portable book");
        create_bookmark_at(
            &database_path,
            &imported.book.id,
            Locator::Txt(TxtLocator {
                chapter_id: None,
                char_offset: 3,
                end_char_offset: None,
            }),
            Some("Resume here".to_string()),
        )
        .expect("bookmark");
        save_reader_cache_at(
            &database_path,
            &imported.book.id,
            "txt_pages_v1",
            r#"{"machine":"only"}"#,
        )
        .expect("reader cache");

        let conn = Connection::open(&database_path).expect("database");
        let (data, files) =
            collect_portable_data(&conn, &library_dir, BackupOptions::default()).expect("data");
        let data_bytes = serde_json::to_vec_pretty(&data).expect("serialize data");
        let data_text = String::from_utf8(data_bytes.clone()).expect("utf8");
        assert_eq!(data.books.len(), 1);
        assert_eq!(data.bookmarks.len(), 1);
        assert_eq!(data.bookmarks[0].created_at, data.bookmarks[0].updated_at);
        assert!(!data_text.contains("sourcePath"));
        assert!(!data_text.contains("libraryPath"));
        assert!(!data_text.contains("reader_cache"));
        assert!(!data_text.contains(&source_path.display().to_string()));
        assert!(files.is_empty());

        let manifest = BackupManifest {
            format_identifier: BACKUP_FORMAT_IDENTIFIER.to_string(),
            format_version: BACKUP_FORMAT_VERSION,
            app_version: "0.1.0".to_string(),
            schema_version: 4,
            exported_at: "2026-07-16T00:00:00.000Z".to_string(),
            options: BackupOptions::default(),
            record_counts: record_counts(&data, &files),
            payloads: vec![descriptor_for_bytes("data.json", &data_bytes)],
        };
        let archive_path = directory.path().join("round-trip.erbackup");
        let mut writer = ZipWriter::new(File::create(&archive_path).expect("archive"));
        let zip_options = SimpleFileOptions::default();
        writer
            .start_file("manifest.json", zip_options)
            .expect("manifest entry");
        writer
            .write_all(&serde_json::to_vec(&manifest).expect("manifest json"))
            .expect("manifest bytes");
        writer
            .start_file("data.json", zip_options)
            .expect("data entry");
        writer.write_all(&data_bytes).expect("data bytes");
        writer.finish().expect("finish archive");

        let mut archive =
            ZipArchive::new(File::open(archive_path).expect("open archive")).expect("read archive");
        let restored_manifest: BackupManifest =
            serde_json::from_reader(archive.by_name("manifest.json").expect("manifest"))
                .expect("manifest round trip");
        assert_eq!(
            restored_manifest.format_identifier,
            BACKUP_FORMAT_IDENTIFIER
        );
        assert_eq!(restored_manifest.format_version, 1);
        assert!(restored_manifest
            .payloads
            .iter()
            .all(|payload| payload.path != "manifest.json"));
        let mut restored_data = String::new();
        archive
            .by_name("data.json")
            .expect("data")
            .read_to_string(&mut restored_data)
            .expect("read data");
        assert_eq!(restored_data, data_text);
    }

    #[test]
    fn operation_registry_exposes_cooperative_cancellation() {
        let registry = DataOperationRegistry::default();
        let canceled = registry.register("backup-1").expect("register");
        assert!(registry.cancel("backup-1"));
        assert!(canceled.load(Ordering::Acquire));
        registry.finish("backup-1");
        assert!(!registry.cancel("backup-1"));
    }

    fn empty_portable_data() -> PortableBackupData {
        PortableBackupData {
            books: Vec::new(),
            reading_progress: Vec::new(),
            bookmarks: Vec::new(),
            annotations: Vec::new(),
            settings: Vec::new(),
        }
    }

    fn write_safe_test_archive(path: &Path) {
        let data_bytes = serde_json::to_vec(&empty_portable_data()).expect("data json");
        let manifest = BackupManifest {
            format_identifier: BACKUP_FORMAT_IDENTIFIER.to_string(),
            format_version: BACKUP_FORMAT_VERSION,
            app_version: "0.1.0".to_string(),
            schema_version: 4,
            exported_at: "2026-07-16T00:00:00Z".to_string(),
            options: BackupOptions::default(),
            record_counts: BTreeMap::new(),
            payloads: vec![descriptor_for_bytes("data.json", &data_bytes)],
        };
        let mut writer = ZipWriter::new(File::create(path).expect("archive file"));
        let options = SimpleFileOptions::default();
        writer
            .start_file("manifest.json", options)
            .expect("manifest");
        writer
            .write_all(&serde_json::to_vec(&manifest).expect("manifest json"))
            .expect("manifest bytes");
        writer.start_file("data.json", options).expect("data");
        writer.write_all(&data_bytes).expect("data bytes");
        writer.finish().expect("finish");
    }

    #[test]
    fn restore_preflight_accepts_a_valid_v1_archive() {
        let directory = tempdir().expect("tempdir");
        let archive = directory.path().join("valid.erbackup");
        write_safe_test_archive(&archive);
        let inspected = inspect_archive(&archive, &AtomicBool::new(false)).expect("inspect");
        assert_eq!(inspected.manifest.format_version, 1);
        assert!(inspected.data.books.is_empty());
    }

    #[test]
    fn restore_preflight_rejects_path_traversal_before_extraction() {
        let directory = tempdir().expect("tempdir");
        let archive = directory.path().join("traversal.erbackup");
        let mut writer = ZipWriter::new(File::create(&archive).expect("archive file"));
        writer
            .start_file("../outside.txt", SimpleFileOptions::default())
            .expect("unsafe entry");
        writer.write_all(b"outside").expect("unsafe bytes");
        writer.finish().expect("finish");

        let error = inspect_archive(&archive, &AtomicBool::new(false))
            .err()
            .expect("traversal must fail")
            .to_string();
        assert!(error.contains("unsafe-entry-path"));
        assert!(!directory.path().join("outside.txt").exists());
    }

    #[test]
    fn restore_preflight_rejects_duplicate_entries() {
        let mut names = HashSet::new();
        register_archive_entry(&mut names, "data.json").expect("first entry");
        let error = register_archive_entry(&mut names, "data.json")
            .expect_err("duplicates must fail")
            .to_string();
        assert!(error.contains("duplicate-entry"));
    }

    #[test]
    fn restore_preflight_rejects_checksum_and_declared_size_mismatches() {
        let directory = tempdir().expect("tempdir");
        for (name, descriptor) in [
            (
                "checksum",
                BackupPayloadDescriptor {
                    path: "data.json".to_string(),
                    size: 2,
                    sha256: "0".repeat(64),
                },
            ),
            (
                "size",
                BackupPayloadDescriptor {
                    path: "data.json".to_string(),
                    size: 99,
                    sha256: descriptor_for_bytes("data.json", b"{}").sha256,
                },
            ),
        ] {
            let archive = directory.path().join(format!("{name}.erbackup"));
            let manifest = BackupManifest {
                format_identifier: BACKUP_FORMAT_IDENTIFIER.to_string(),
                format_version: 1,
                app_version: "0.1.0".to_string(),
                schema_version: 4,
                exported_at: "2026-07-16T00:00:00Z".to_string(),
                options: BackupOptions::default(),
                record_counts: BTreeMap::new(),
                payloads: vec![descriptor],
            };
            let mut writer = ZipWriter::new(File::create(&archive).expect("archive file"));
            let options = SimpleFileOptions::default();
            writer
                .start_file("manifest.json", options)
                .expect("manifest");
            writer
                .write_all(&serde_json::to_vec(&manifest).expect("manifest json"))
                .expect("manifest bytes");
            writer.start_file("data.json", options).expect("data");
            writer.write_all(b"{}").expect("data bytes");
            writer.finish().expect("finish");

            let error = inspect_archive(&archive, &AtomicBool::new(false))
                .err()
                .expect("invalid payload must fail")
                .to_string();
            assert!(error.contains(if name == "checksum" {
                "checksum-mismatch"
            } else {
                "size-mismatch"
            }));
        }
    }

    #[test]
    fn restore_keeps_missing_identity_and_repair_preserves_newer_local_data() {
        let directory = tempdir().expect("tempdir");
        let source_db = directory.path().join("source.sqlite3");
        let source_library = directory.path().join("source-library");
        let source_file = directory.path().join("repair-me.txt");
        fs::create_dir_all(&source_library).expect("source library");
        fs::write(&source_file, "Chapter 1\nPortable identity").expect("source book");
        let imported = import_book_at(&source_db, &source_library, &source_file).expect("import");
        save_reading_progress_at(
            &source_db,
            &imported.book.id,
            Locator::Txt(TxtLocator {
                chapter_id: None,
                char_offset: 5,
                end_char_offset: None,
            }),
            Some(0.35),
        )
        .expect("progress");
        create_bookmark_at(
            &source_db,
            &imported.book.id,
            Locator::Txt(TxtLocator {
                chapter_id: None,
                char_offset: 6,
                end_char_offset: None,
            }),
            Some("Portable bookmark".to_string()),
        )
        .expect("bookmark");
        let source_conn = Connection::open(&source_db).expect("source connection");
        let (data, _) =
            collect_portable_data(&source_conn, &source_library, BackupOptions::default())
                .expect("portable data");

        let target_db = directory.path().join("target.sqlite3");
        let target_library = directory.path().join("target-library");
        fs::create_dir_all(&target_library).expect("target library");
        init_database_at(&target_db).expect("target database");
        let mut target_conn = Connection::open(&target_db).expect("target connection");
        let transaction = target_conn.transaction().expect("transaction");
        let items = merge_restore_data(&transaction, &data, &HashMap::new(), &target_library)
            .expect("merge missing book");
        transaction.commit().expect("commit");
        assert!(items
            .iter()
            .any(|item| item.status == RestoreItemStatus::MissingFile));
        let missing = list_books_at(&target_db).expect("list missing");
        assert_eq!(missing.len(), 1);
        assert_eq!(
            missing[0].availability,
            crate::db::BookAvailability::Missing
        );
        assert_eq!(
            get_reading_progress_at(&target_db, &missing[0].id)
                .expect("read progress")
                .expect("progress record")
                .progress,
            Some(0.35)
        );

        let repaired = import_book_at(&target_db, &target_library, &source_file).expect("repair");
        assert_eq!(repaired.status, ImportBookStatus::Repaired);
        assert_eq!(repaired.book.id, missing[0].id);
        assert_eq!(
            repaired.book.availability,
            crate::db::BookAvailability::Available
        );

        let conn = Connection::open(&target_db).expect("target connection");
        conn.execute(
            "UPDATE reading_progress SET progress = 0.8, updated_at = '2030-01-01T00:00:00Z' WHERE book_id = ?1",
            params![&missing[0].id],
        )
        .expect("newer local progress");
        drop(conn);
        let mut target_conn = Connection::open(&target_db).expect("target connection");
        let transaction = target_conn.transaction().expect("transaction");
        let items = merge_restore_data(&transaction, &data, &HashMap::new(), &target_library)
            .expect("repeat merge");
        transaction.commit().expect("commit");
        assert!(items.iter().any(|item| {
            item.category == "progress" && item.status == RestoreItemStatus::LocalKept
        }));
        assert_eq!(
            get_reading_progress_at(&target_db, &missing[0].id)
                .expect("read progress")
                .expect("progress record")
                .progress,
            Some(0.8)
        );
    }
}
