pub mod classroom;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let service = classroom::credential_service(&app.config().identifier);
            let store = Arc::new(classroom::secrets::KeyringStore::new(service));
            let opener: classroom::Opener = Arc::new(|url: &str| {
                tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string())
            });
            app.manage(classroom::Connector::new(store, opener));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            classroom::commands::classroom_status,
            classroom::commands::classroom_configure,
            classroom::commands::classroom_connect,
            classroom::commands::classroom_cancel_connect,
            classroom::commands::classroom_list_courses,
            classroom::commands::classroom_fetch_courses,
            classroom::commands::classroom_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
