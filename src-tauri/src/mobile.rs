//! Bridge to the Android Kotlin plugin (WaraqPlugin.kt). On desktop the commands report "unsupported".

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "android")]
pub struct Native<R: Runtime>(pub tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("waraq-native")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin("com.jake750.waraq", "WaraqPlugin")?;
                _app.manage(Native(handle));
            }
            Ok(())
        })
        .build()
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Saved {
    pub uri: String,
    pub label: String,
}

#[cfg(target_os = "android")]
async fn call<T: serde::de::DeserializeOwned + Send + 'static>(app: &tauri::AppHandle, method: &'static str, args: Value) -> Result<T, String> {
    use tauri::Manager;
    let handle = app.state::<Native<tauri::Wry>>().0.clone();
    tauri::async_runtime::spawn_blocking(move || handle.run_mobile_plugin::<T>(method, args))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
async fn call<T>(_app: &tauri::AppHandle, _method: &'static str, _args: Value) -> Result<T, String> {
    Err("unsupported".into())
}

#[cfg(target_os = "android")]
pub async fn html_to_pdf(app: &tauri::AppHandle, html_path: String, out_path: String, opts: crate::print::PrintOpts) -> Result<(), String> {
    let size = if opts.size == crate::print::PaperSize::Letter { "Letter" } else { "A4" };
    let _: Value = call(
        app,
        "htmlToPdf",
        serde_json::json!({ "htmlPath": html_path, "outPath": out_path, "size": size, "landscape": opts.landscape }),
    )
    .await?;
    Ok(())
}

/// Moves a finished file from the app cache into Downloads/Waraq.
#[tauri::command]
pub async fn android_save_to_downloads(app: tauri::AppHandle, path: String, name: String, mime: String) -> Result<Saved, String> {
    call(&app, "saveToDownloads", serde_json::json!({ "path": path, "name": name, "mime": mime })).await
}

#[tauri::command]
pub async fn android_share(app: tauri::AppHandle, uri: String, mime: String) -> Result<(), String> {
    let _: Value = call(&app, "share", serde_json::json!({ "uri": uri, "mime": mime })).await?;
    Ok(())
}

#[tauri::command]
pub async fn android_view(app: tauri::AppHandle, uri: String, mime: String) -> Result<(), String> {
    let _: Value = call(&app, "view", serde_json::json!({ "uri": uri, "mime": mime })).await?;
    Ok(())
}

#[derive(Deserialize)]
struct IncomingResp {
    uris: Vec<String>,
}

/// Files another app asked us to open or shared with us, not yet handled.
#[tauri::command]
pub async fn android_incoming(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let r: IncomingResp = call(&app, "incoming", serde_json::json!({})).await?;
    Ok(r.uris)
}

#[tauri::command]
pub async fn android_persist(app: tauri::AppHandle, uri: String) -> Result<(), String> {
    let _: Value = call(&app, "persist", serde_json::json!({ "uri": uri })).await?;
    Ok(())
}

#[derive(Deserialize)]
struct NameResp {
    name: Option<String>,
}

#[tauri::command]
pub async fn android_display_name(app: tauri::AppHandle, uri: String) -> Result<Option<String>, String> {
    let r: NameResp = call(&app, "displayName", serde_json::json!({ "uri": uri })).await?;
    Ok(r.name)
}
