use std::{
    collections::{BTreeMap, HashMap},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use anyhow::{bail, Context};
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::db;

pub const BACKUP_PROGRESS_EVENT: &str = "data-operation-progress";
const BACKUP_FORMAT_IDENTIFIER: &str = "ebook-reader-backup";
const BACKUP_FORMAT_VERSION: u8 = 1;

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
struct OperationProgress<'a> {
    operation_id: &'a str,
    kind: &'static str,
    phase: &'static str,
    completed: u64,
    total: u64,
    message: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PortableBackupData {
    books: Vec<PortableBook>,
    reading_progress: Vec<PortableProgress>,
    bookmarks: Vec<PortableBookmark>,
    annotations: Vec<PortableAnnotation>,
    settings: Vec<PortableSetting>,
}

#[derive(Debug, Serialize)]
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PortableProgress {
    book_id: String,
    locator: Value,
    progress: Option<f64>,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PortableBookmark {
    id: String,
    book_id: String,
    locator: Value,
    label: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Serialize)]
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
                books.file_hash, books.cover_path, books.created_at, books.updated_at,
                books.last_opened_at,
                COALESCE(book_cover_state.status,
                  CASE WHEN books.cover_path IS NOT NULL THEN 'ready'
                       WHEN books.format = 'txt' THEN 'fallback' ELSE 'pending' END)
         FROM books
         LEFT JOIN book_cover_state ON book_cover_state.book_id = books.id
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
        create_bookmark_at, import_book_at, save_reader_cache_at, Locator, TxtLocator,
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
}
