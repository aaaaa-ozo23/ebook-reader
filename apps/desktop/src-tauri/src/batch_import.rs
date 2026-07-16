use std::{
    collections::HashSet,
    fs::{self, File},
    io::Read,
    path::Path,
    sync::atomic::Ordering,
};

use anyhow::{bail, Context};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::{backup::DataOperationRegistry, db};

const MAX_DEPTH: usize = 32;
const MAX_ITEMS: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BatchItemStatus {
    Valid,
    Duplicate,
    Unsupported,
    Missing,
    Error,
    Imported,
    Repaired,
    Canceled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPreviewItem {
    pub path: String,
    pub name: String,
    pub status: BatchItemStatus,
    pub selected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPreview {
    pub operation_id: String,
    pub items: Vec<BatchPreviewItem>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResultItem {
    #[serde(flatten)]
    pub preview: BatchPreviewItem,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book: Option<db::Book>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BatchResultStatus {
    Completed,
    Canceled,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub operation_id: String,
    pub status: BatchResultStatus,
    pub items: Vec<BatchResultItem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    operation_id: &'a str,
    kind: &'static str,
    phase: &'static str,
    completed: usize,
    total: usize,
    message: &'a str,
}

pub fn scan_import_paths(
    app: &AppHandle,
    registry: &DataOperationRegistry,
    operation_id: &str,
    paths: Vec<String>,
) -> anyhow::Result<BatchPreview> {
    let canceled = registry.register(operation_id)?;
    let result = (|| {
        let storage = db::init_app_storage(app)?;
        let existing_hashes: HashSet<String> = db::list_books_at(&storage.database_path)?
            .into_iter()
            .map(|book| book.file_hash)
            .collect();
        let mut candidates = Vec::new();
        let mut truncated = false;
        for path in paths {
            if canceled.load(Ordering::Acquire) {
                break;
            }
            collect_path(Path::new(&path), 0, None, &mut candidates, &mut truncated)?;
            if truncated {
                break;
            }
        }
        let mut seen_hashes = HashSet::new();
        let total = candidates.len();
        for (index, item) in candidates.iter_mut().enumerate() {
            if canceled.load(Ordering::Acquire) {
                item.status = BatchItemStatus::Canceled;
                item.selected = false;
                continue;
            }
            if item.status == BatchItemStatus::Valid {
                match hash_file(Path::new(&item.path)) {
                    Ok(hash) => {
                        let duplicate =
                            existing_hashes.contains(&hash) || !seen_hashes.insert(hash.clone());
                        item.file_hash = Some(hash);
                        if duplicate {
                            item.status = BatchItemStatus::Duplicate;
                            item.selected = false;
                            item.message = Some("Already in this library or selection".to_string());
                        }
                    }
                    Err(error) => {
                        item.status = BatchItemStatus::Error;
                        item.selected = false;
                        item.message = Some(error.to_string());
                    }
                }
            }
            emit_progress(
                app,
                operation_id,
                "reading",
                index + 1,
                total,
                "Scanning import paths",
            );
        }
        Ok(BatchPreview {
            operation_id: operation_id.to_string(),
            items: candidates,
            truncated,
        })
    })();
    registry.finish(operation_id);
    result
}

pub fn import_batch(
    app: &AppHandle,
    registry: &DataOperationRegistry,
    operation_id: &str,
    paths: Vec<String>,
) -> anyhow::Result<BatchResult> {
    let canceled = registry.register(operation_id)?;
    let result = (|| {
        let storage = db::init_app_storage(app)?;
        let total = paths.len();
        let mut items = Vec::with_capacity(total);
        for (index, path) in paths.into_iter().enumerate() {
            if canceled.load(Ordering::Acquire) {
                items.push(result_item(
                    &path,
                    BatchItemStatus::Canceled,
                    None,
                    Some("Canceled before import"),
                ));
                continue;
            }
            let item = match db::import_book_at(&storage.database_path, &storage.library_dir, &path)
            {
                Ok(imported) => {
                    let status = match imported.status {
                        db::ImportBookStatus::Imported => BatchItemStatus::Imported,
                        db::ImportBookStatus::Duplicate => BatchItemStatus::Duplicate,
                        db::ImportBookStatus::Repaired => BatchItemStatus::Repaired,
                    };
                    result_item(&path, status, Some(imported.book), None)
                }
                Err(error) => result_item(
                    &path,
                    BatchItemStatus::Error,
                    None,
                    Some(&error.to_string()),
                ),
            };
            items.push(item);
            emit_progress(
                app,
                operation_id,
                "committing",
                index + 1,
                total,
                "Importing selected books",
            );
        }
        Ok(BatchResult {
            operation_id: operation_id.to_string(),
            status: if canceled.load(Ordering::Acquire) {
                BatchResultStatus::Canceled
            } else {
                BatchResultStatus::Completed
            },
            items,
        })
    })();
    registry.finish(operation_id);
    result
}

pub fn import_single(app: &AppHandle, path: &Path) -> anyhow::Result<db::ImportBookResult> {
    let storage = db::init_app_storage(app)?;
    db::import_book_at(&storage.database_path, &storage.library_dir, path)
}

fn collect_path(
    path: &Path,
    depth: usize,
    root: Option<&Path>,
    items: &mut Vec<BatchPreviewItem>,
    truncated: &mut bool,
) -> anyhow::Result<()> {
    if items.len() >= MAX_ITEMS {
        *truncated = true;
        return Ok(());
    }
    if !path.exists() {
        items.push(preview_item(
            path,
            BatchItemStatus::Missing,
            false,
            Some("Path no longer exists"),
        ));
        return Ok(());
    }
    let metadata = fs::symlink_metadata(path)?;
    if is_link_or_reparse(&metadata) {
        items.push(preview_item(
            path,
            BatchItemStatus::Unsupported,
            false,
            Some("Links and reparse paths are skipped"),
        ));
        return Ok(());
    }
    let canonical = path.canonicalize()?;
    let effective_root = root.unwrap_or(&canonical);
    if !canonical.starts_with(effective_root) {
        bail!("[import-path-escape] canonical path escaped the selected folder");
    }
    if metadata.is_dir() {
        if depth >= MAX_DEPTH {
            items.push(preview_item(
                path,
                BatchItemStatus::Error,
                false,
                Some("Maximum folder depth reached"),
            ));
            return Ok(());
        }
        for entry in fs::read_dir(&canonical)? {
            let entry = entry?;
            collect_path(
                &entry.path(),
                depth + 1,
                Some(effective_root),
                items,
                truncated,
            )?;
            if *truncated {
                break;
            }
        }
    } else if metadata.is_file() {
        let supported = matches!(
            path.extension()
                .and_then(|value| value.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("epub" | "txt" | "pdf")
        );
        items.push(preview_item(
            &canonical,
            if supported {
                BatchItemStatus::Valid
            } else {
                BatchItemStatus::Unsupported
            },
            supported,
            if supported {
                None
            } else {
                Some("Only EPUB, TXT, and PDF are supported")
            },
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    metadata.file_type().is_symlink()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

fn preview_item(
    path: &Path,
    status: BatchItemStatus,
    selected: bool,
    message: Option<&str>,
) -> BatchPreviewItem {
    BatchPreviewItem {
        path: path.display().to_string(),
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Unknown item")
            .to_string(),
        status,
        selected,
        file_hash: None,
        message: message.map(str::to_string),
    }
}

fn result_item(
    path: &str,
    status: BatchItemStatus,
    book: Option<db::Book>,
    message: Option<&str>,
) -> BatchResultItem {
    BatchResultItem {
        preview: preview_item(Path::new(path), status, false, message),
        book,
    }
}

fn hash_file(path: &Path) -> anyhow::Result<String> {
    let mut file =
        File::open(path).with_context(|| format!("failed to read {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn emit_progress(
    app: &AppHandle,
    operation_id: &str,
    phase: &'static str,
    completed: usize,
    total: usize,
    message: &str,
) {
    let _ = app.emit(
        "data-operation-progress",
        Progress {
            operation_id,
            kind: "batch-import",
            phase,
            completed,
            total,
            message,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn recursive_scan_honors_formats_depth_and_item_limit_helpers() {
        let dir = tempdir().expect("dir");
        fs::create_dir_all(dir.path().join("nested")).expect("nested");
        fs::write(dir.path().join("nested/book.epub"), b"epub").expect("book");
        fs::write(dir.path().join("notes.md"), b"notes").expect("unsupported");
        let mut items = Vec::new();
        let mut truncated = false;
        collect_path(dir.path(), 0, None, &mut items, &mut truncated).expect("scan");
        assert_eq!(items.len(), 2);
        assert!(items
            .iter()
            .any(|item| item.status == BatchItemStatus::Valid));
        assert!(items
            .iter()
            .any(|item| item.status == BatchItemStatus::Unsupported));
        assert!(!truncated);
    }

    #[test]
    fn missing_paths_are_reported_without_aborting_preview() {
        let mut items = Vec::new();
        let mut truncated = false;
        collect_path(
            Path::new("definitely-missing.epub"),
            0,
            None,
            &mut items,
            &mut truncated,
        )
        .expect("scan");
        assert_eq!(items[0].status, BatchItemStatus::Missing);
    }
}
