mod db;

#[tauri::command]
fn app_health(app: tauri::AppHandle) -> Result<db::AppHealth, String> {
    db::app_health(&app).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            db::init_app_database(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_health])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
