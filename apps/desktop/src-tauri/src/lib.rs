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
            mark_book_opened
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
