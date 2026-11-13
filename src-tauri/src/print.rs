//! HTML → PDF with the platform browser engine, so Arabic is shaped exactly as the browser shows it
//! and the PDF keeps real, selectable text. Windows: WebView2 `PrintToPdf` in a hidden window.
//! Android: the Kotlin plugin (`WaraqPlugin.htmlToPdf`), reached through `mobile.rs`.

use serde::Deserialize;

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PrintOpts {
    pub size: PaperSize,
    pub landscape: bool,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum PaperSize {
    A4,
    Letter,
}

/// Paper size in inches (portrait).
pub fn paper_inches(size: PaperSize) -> (f64, f64) {
    match size {
        PaperSize::A4 => (8.27, 11.69),
        PaperSize::Letter => (8.5, 11.0),
    }
}

#[cfg(windows)]
#[tauri::command]
pub async fn html_to_pdf(app: tauri::AppHandle, html_path: String, out_path: String, opts: PrintOpts) -> Result<(), String> {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::mpsc;
    use std::time::Duration;
    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    static N: AtomicU32 = AtomicU32::new(0);
    let label = format!("print-{}", N.fetch_add(1, Ordering::Relaxed));
    let url = tauri::Url::from_file_path(&html_path).map_err(|_| "bad-input".to_string())?;
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let out = out_path.clone();

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .on_page_load(move |win, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let tx_err = tx.clone();
            let tx = tx.clone();
            let out = out.clone();
            let res = win.with_webview(move |wv| {
                if let Err(e) = start_print(wv, &out, opts, tx.clone()) {
                    let _ = tx.send(Err(e));
                }
            });
            if let Err(e) = res {
                let _ = tx_err.send(Err(e.to_string()));
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    // The page load and the print callback run on the main thread; wait for them off it.
    let result = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(90)))
        .await
        .map_err(|e| e.to_string())?;
    let _ = window.destroy();
    match result {
        Ok(r) => r,
        Err(_) => {
            let _ = std::fs::remove_file(&out_path);
            Err("timeout".into())
        }
    }
}

#[cfg(windows)]
fn start_print(
    wv: tauri::webview::PlatformWebview,
    out: &str,
    opts: PrintOpts,
    tx: std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{HSTRING, Interface};

    let err = |e: windows_core::Error| e.message().to_string();
    unsafe {
        let core = wv.controller().CoreWebView2().map_err(err)?;
        let core7: ICoreWebView2_7 = core.cast().map_err(err)?;
        let env6: ICoreWebView2Environment6 = wv.environment().cast().map_err(err)?;
        let settings = env6.CreatePrintSettings().map_err(err)?;
        let (w, h) = paper_inches(opts.size);
        settings.SetPageWidth(w).map_err(err)?;
        settings.SetPageHeight(h).map_err(err)?;
        settings
            .SetOrientation(if opts.landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })
            .map_err(err)?;
        // Margins come from the page's own @page CSS.
        for set in [
            ICoreWebView2PrintSettings::SetMarginTop,
            ICoreWebView2PrintSettings::SetMarginBottom,
            ICoreWebView2PrintSettings::SetMarginLeft,
            ICoreWebView2PrintSettings::SetMarginRight,
        ] {
            set(&settings, 0.0).map_err(err)?;
        }
        settings.SetShouldPrintBackgrounds(true.into()).map_err(err)?;
        settings.SetShouldPrintHeaderAndFooter(false.into()).map_err(err)?;
        let handler = PrintToPdfCompletedHandler::create(Box::new(move |hr, ok| {
            let _ = tx.send(match (hr, ok) {
                (Ok(()), true) => Ok(()),
                (Err(e), _) => Err(e.message().to_string()),
                _ => Err("engine-failed".into()),
            });
            Ok(())
        }));
        core7.PrintToPdf(&HSTRING::from(out), &settings, &handler).map_err(err)?;
    }
    Ok(())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn html_to_pdf(app: tauri::AppHandle, html_path: String, out_path: String, opts: PrintOpts) -> Result<(), String> {
    crate::mobile::html_to_pdf(&app, html_path, out_path, opts).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paper_sizes() {
        assert_eq!(paper_inches(PaperSize::A4), (8.27, 11.69));
        assert_eq!(paper_inches(PaperSize::Letter), (8.5, 11.0));
    }

    #[test]
    fn opts_from_ui_json() {
        let o: PrintOpts = serde_json::from_str(r#"{"size":"Letter","landscape":true}"#).unwrap();
        assert_eq!(o.size, PaperSize::Letter);
        assert!(o.landscape);
    }
}
