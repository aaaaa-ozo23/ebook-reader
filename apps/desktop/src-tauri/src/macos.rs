#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use tauri::{
    menu::{Menu, MenuBuilder, MenuEvent, MenuItem, SubmenuBuilder},
    AppHandle, Emitter, Runtime,
};

pub const NATIVE_APP_ACTION_EVENT: &str = "native-app-action";

const IMPORT_BOOKS_MENU_ID: &str = "import-books";
const IMPORT_FOLDER_MENU_ID: &str = "import-folder";
const SETTINGS_MENU_ID: &str = "settings";

pub fn menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let import_books = MenuItem::with_id(
        app,
        IMPORT_BOOKS_MENU_ID,
        "Import Books…",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let import_folder = MenuItem::with_id(
        app,
        IMPORT_FOLDER_MENU_ID,
        "Import Folder…",
        true,
        Some("CmdOrCtrl+Shift+O"),
    )?;
    let settings = MenuItem::with_id(
        app,
        SETTINGS_MENU_ID,
        "Settings…",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    let app_menu = SubmenuBuilder::new(app, "Ebook Reader")
        .about(None)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&import_books)
        .item(&import_folder)
        .separator()
        .close_window()
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .fullscreen()
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
        .build()
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: &MenuEvent) {
    let action = match event.id().as_ref() {
        IMPORT_BOOKS_MENU_ID => Some("import-files"),
        IMPORT_FOLDER_MENU_ID => Some("import-folder"),
        SETTINGS_MENU_ID => Some("settings"),
        _ => None,
    };

    if let Some(action) = action {
        let _ = app.emit(NATIVE_APP_ACTION_EVENT, action);
    }
}
