mod db;

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
    db::import_book(&app, std::path::PathBuf::from(path)).map_err(|error| error.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            mark_book_opened,
            remove_book,
            save_book_cover,
            mark_book_cover_fallback,
            open_txt_book,
            get_reader_theme,
            save_reader_theme,
            get_reader_layout_preferences,
            save_reader_layout_preferences,
            get_reading_progress,
            save_reading_progress,
            list_bookmarks,
            create_bookmark,
            delete_bookmark,
            list_annotations,
            create_annotation,
            update_annotation,
            delete_annotation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
