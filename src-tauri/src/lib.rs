mod files;
mod launch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Desktop: a second launch (double-clicking another PDF) hands its file to the open window.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        use tauri::{Emitter, Manager};
        let refs: Vec<&str> = argv.iter().map(String::as_str).collect();
        if let Some(path) = launch::pick_pdf_arg(&refs) {
            let _ = app.emit("open-file", path);
        }
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![files::read_file, launch::startup_file])
        .run(tauri::generate_context!())
        .expect("error while running Waraq");
}
