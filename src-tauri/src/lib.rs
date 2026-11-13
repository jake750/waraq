mod files;
mod launch;
mod mobile;
#[cfg(windows)]
mod office;
mod print;
mod update;

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

    // Desktop: signed self-updates from GitHub releases (see update.rs for Android).
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(mobile::init())
        .invoke_handler(tauri::generate_handler![
            files::read_file,
            files::save_output,
            files::open_output,
            files::reveal_output,
            files::temp_dir,
            launch::startup_file,
            launch::selftest_dir,
            #[cfg(any(windows, target_os = "android"))]
            print::html_to_pdf,
            #[cfg(windows)]
            office::office_status,
            #[cfg(windows)]
            office::office_install,
            #[cfg(windows)]
            office::office_convert,
            #[cfg(windows)]
            office::office_cancel,
            mobile::android_save_to_downloads,
            mobile::android_share,
            mobile::android_view,
            mobile::android_display_name,
            mobile::android_incoming,
            mobile::android_persist,
            mobile::android_immersive,
            #[cfg(target_os = "android")]
            update::latest_release,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Waraq");
}
