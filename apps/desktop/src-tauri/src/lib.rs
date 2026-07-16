mod backup;
mod batch_import;
mod db;
mod file_open;

use tauri::{Emitter, Manager};

#[tauri::command]
async fn export_backup(
    app: tauri::AppHandle,
    operation_id: String,
    output_path: String,
    options: backup::BackupOptions,
) -> Result<backup::BackupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let operations = app.state::<backup::DataOperationRegistry>();
        backup::export_backup(
            &app,
            &operations,
            &operation_id,
            std::path::Path::new(&output_path),
            options,
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("[backup-task-failed] {error}"))?
}

#[tauri::command]
async fn inspect_backup(
    app: tauri::AppHandle,
    operation_id: String,
    path: String,
) -> Result<backup::RestorePreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let operations = app.state::<backup::DataOperationRegistry>();
        backup::inspect_backup(
            &app,
            &operations,
            &operation_id,
            std::path::Path::new(&path),
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("[backup-inspection-task-failed] {error}"))?
}

#[tauri::command]
async fn restore_backup(
    app: tauri::AppHandle,
    operation_id: String,
    path: String,
) -> Result<backup::RestoreResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let operations = app.state::<backup::DataOperationRegistry>();
        backup::restore_backup(
            &app,
            &operations,
            &operation_id,
            std::path::Path::new(&path),
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("[backup-restore-task-failed] {error}"))?
}

#[tauri::command]
fn cancel_data_operation(
    operations: tauri::State<'_, backup::DataOperationRegistry>,
    operation_id: String,
) -> bool {
    operations.cancel(&operation_id)
}

#[tauri::command]
fn app_health(app: tauri::AppHandle) -> Result<db::AppHealth, String> {
    db::app_health(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_books(app: tauri::AppHandle) -> Result<Vec<db::Book>, String> {
    db::list_books(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_book(app: tauri::AppHandle, path: String) -> Result<db::ImportBookResult, String> {
    batch_import::import_single(&app, std::path::Path::new(&path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn scan_import_paths(
    app: tauri::AppHandle,
    operation_id: String,
    paths: Vec<String>,
) -> Result<batch_import::BatchPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let operations = app.state::<backup::DataOperationRegistry>();
        batch_import::scan_import_paths(&app, &operations, &operation_id, paths)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("[batch-scan-task-failed] {error}"))?
}

#[tauri::command]
async fn import_batch(
    app: tauri::AppHandle,
    operation_id: String,
    paths: Vec<String>,
) -> Result<batch_import::BatchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let operations = app.state::<backup::DataOperationRegistry>();
        batch_import::import_batch(&app, &operations, &operation_id, paths)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("[batch-import-task-failed] {error}"))?
}

#[tauri::command]
fn mark_book_opened(app: tauri::AppHandle, book_id: String) -> Result<db::Book, String> {
    db::mark_book_opened(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_book(app: tauri::AppHandle, book_id: String) -> Result<db::RemoveBookResult, String> {
    db::remove_book(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_book_details(app: tauri::AppHandle, book_id: String) -> Result<db::BookDetails, String> {
    db::get_book_details(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_book_metadata_overrides(
    app: tauri::AppHandle,
    book_id: String,
    patch: db::BookMetadataOverridePatch,
) -> Result<db::BookDetails, String> {
    db::save_book_metadata_overrides(&app, &book_id, patch).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_user_book_cover(
    app: tauri::AppHandle,
    book_id: String,
    image_bytes: Vec<u8>,
) -> Result<db::BookDetails, String> {
    db::save_user_book_cover(&app, &book_id, image_bytes).map_err(|error| error.to_string())
}

#[tauri::command]
fn reset_book_overrides(
    app: tauri::AppHandle,
    book_id: String,
    fields: Vec<String>,
) -> Result<db::BookDetails, String> {
    db::reset_book_overrides(&app, &book_id, fields).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_book_cover(
    app: tauri::AppHandle,
    book_id: String,
    image_bytes: Vec<u8>,
    image_format: String,
) -> Result<db::Book, String> {
    db::save_book_cover(&app, &book_id, image_bytes, &image_format)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mark_book_cover_fallback(app: tauri::AppHandle, book_id: String) -> Result<db::Book, String> {
    db::mark_book_cover_fallback(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_txt_book(app: tauri::AppHandle, book_id: String) -> Result<db::TxtDocument, String> {
    db::open_txt_book(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_reader_theme(app: tauri::AppHandle) -> Result<db::ReaderTheme, String> {
    db::get_reader_theme(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_reader_theme(
    app: tauri::AppHandle,
    theme: db::ReaderTheme,
) -> Result<db::ReaderTheme, String> {
    db::save_reader_theme(&app, theme).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_reader_layout_preferences(
    app: tauri::AppHandle,
) -> Result<db::ReaderLayoutPreferences, String> {
    db::get_reader_layout_preferences(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_reader_layout_preferences(
    app: tauri::AppHandle,
    preferences: db::ReaderLayoutPreferences,
) -> Result<db::ReaderLayoutPreferences, String> {
    db::save_reader_layout_preferences(&app, preferences).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_reader_experience_preferences(
    app: tauri::AppHandle,
) -> Result<db::ReaderExperiencePreferences, String> {
    db::get_reader_experience_preferences(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_reader_experience_preferences(
    app: tauri::AppHandle,
    preferences: db::ReaderExperiencePreferences,
) -> Result<db::ReaderExperiencePreferences, String> {
    db::save_reader_experience_preferences(&app, preferences).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_reader_cache(
    app: tauri::AppHandle,
    book_id: String,
    cache_key: String,
) -> Result<Option<String>, String> {
    db::get_reader_cache(&app, &book_id, &cache_key).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_reader_cache(
    app: tauri::AppHandle,
    book_id: String,
    cache_key: String,
    value_json: String,
) -> Result<(), String> {
    db::save_reader_cache(&app, &book_id, &cache_key, &value_json)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_reading_progress(
    app: tauri::AppHandle,
    book_id: String,
) -> Result<Option<db::ReaderProgress>, String> {
    db::get_reading_progress(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_reading_progress(
    app: tauri::AppHandle,
    book_id: String,
    locator: db::Locator,
    progress: Option<f64>,
) -> Result<db::ReaderProgress, String> {
    db::save_reading_progress(&app, &book_id, locator, progress).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_bookmarks(app: tauri::AppHandle, book_id: String) -> Result<Vec<db::Bookmark>, String> {
    db::list_bookmarks(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_bookmark(
    app: tauri::AppHandle,
    book_id: String,
    locator: db::Locator,
    label: Option<String>,
) -> Result<db::Bookmark, String> {
    db::create_bookmark(&app, &book_id, locator, label).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_bookmark(app: tauri::AppHandle, bookmark_id: String) -> Result<(), String> {
    db::delete_bookmark(&app, &bookmark_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_annotations(app: tauri::AppHandle, book_id: String) -> Result<Vec<db::Annotation>, String> {
    db::list_annotations(&app, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_annotation(
    app: tauri::AppHandle,
    book_id: String,
    annotation_type: db::AnnotationKind,
    locator: db::Locator,
    color: Option<String>,
    selected_text: Option<String>,
    note: Option<String>,
) -> Result<db::Annotation, String> {
    db::create_annotation(
        &app,
        &book_id,
        annotation_type,
        locator,
        color,
        selected_text,
        note,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_annotation(
    app: tauri::AppHandle,
    annotation_id: String,
    color: Option<String>,
    note: Option<String>,
) -> Result<db::Annotation, String> {
    db::update_annotation(&app, &annotation_id, color, note).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_annotation(app: tauri::AppHandle, annotation_id: String) -> Result<(), String> {
    db::delete_annotation(&app, &annotation_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn take_pending_open_files(
    pending_files: tauri::State<'_, file_open::PendingOpenFiles>,
) -> Vec<String> {
    pending_files.take_and_mark_ready()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending_open_files = file_open::PendingOpenFiles::from_args(std::env::args_os().skip(1));

    tauri::Builder::default()
        .manage(pending_open_files)
        .manage(backup::DataOperationRegistry::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths = file_open::collect_book_paths(args);

            if paths.is_empty() {
                return;
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            if let Some(paths_to_emit) = app
                .state::<file_open::PendingOpenFiles>()
                .route_new_paths(paths)
            {
                let _ = app.emit(file_open::OPEN_BOOK_FILES_EVENT, paths_to_emit);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            db::init_app_database(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_health,
            list_books,
            import_book,
            scan_import_paths,
            import_batch,
            mark_book_opened,
            remove_book,
            get_book_details,
            save_book_metadata_overrides,
            save_user_book_cover,
            reset_book_overrides,
            save_book_cover,
            mark_book_cover_fallback,
            open_txt_book,
            get_reader_theme,
            save_reader_theme,
            get_reader_layout_preferences,
            save_reader_layout_preferences,
            get_reader_experience_preferences,
            save_reader_experience_preferences,
            get_reader_cache,
            save_reader_cache,
            get_reading_progress,
            save_reading_progress,
            list_bookmarks,
            create_bookmark,
            delete_bookmark,
            list_annotations,
            create_annotation,
            update_annotation,
            delete_annotation,
            export_backup,
            inspect_backup,
            restore_backup,
            cancel_data_operation,
            take_pending_open_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
