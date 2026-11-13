//! Reading documents by path (desktop). Android content URIs are read by plugin-fs from the UI.

use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq)]
pub enum FileError {
    Missing,
    Unreadable,
}

impl FileError {
    pub fn code(&self) -> &'static str {
        match self {
            FileError::Missing => "file-missing",
            FileError::Unreadable => "read-failed",
        }
    }
}

pub fn read_bytes(path: &Path) -> Result<Vec<u8>, FileError> {
    std::fs::read(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => FileError::Missing,
        _ => FileError::Unreadable,
    })
}

/// Returns the file's raw bytes (not a JSON array) to the UI.
#[tauri::command]
pub async fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || read_bytes(Path::new(&path)))
        .await
        .map_err(|_| FileError::Unreadable.code().to_string())?
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.code().to_string())
}

/// Writes `bytes` to a NEW file in `dir`: `name`, else `name (2)`, `name (3)` … Never overwrites,
/// even if another program creates the same name meanwhile (create_new is atomic).
/// Only the file-name part of `name` is used, so a name can't point outside `dir`.
pub fn write_new(dir: &Path, name: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    use std::io::Write;
    let file_name = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty() && *n != "." && *n != "..")
        .unwrap_or("output");
    let (stem, ext) = match file_name.rfind('.') {
        Some(i) if i > 0 => (&file_name[..i], &file_name[i..]),
        _ => (file_name, ""),
    };
    for n in 1..10_000 {
        let candidate = if n == 1 { dir.join(file_name) } else { dir.join(format!("{stem} ({n}){ext}")) };
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(mut f) => {
                if let Err(e) = f.write_all(bytes).and_then(|_| f.sync_all()) {
                    drop(f);
                    let _ = std::fs::remove_file(&candidate); // no half-written outputs
                    return Err(e);
                }
                return Ok(candidate);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::other("too many files with this name"))
}

/// Decodes %XX escapes (UTF-8). Header values must be ASCII, so the UI percent-encodes names.
pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

const OUTPUT_EXTS: [&str; 8] = ["pdf", "docx", "txt", "md", "html", "png", "jpg", "jpeg"];

/// Outputs the app may hand to the OS to open: documents and images only, never programs.
pub fn is_output_ext(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| OUTPUT_EXTS.contains(&e.to_ascii_lowercase().as_str()))
}

fn header(req: &tauri::ipc::Request<'_>, name: &str) -> Option<String> {
    req.headers().get(name).and_then(|v| v.to_str().ok()).map(percent_decode)
}

/// Saves an output (raw request body) as a new file. Headers: x-dir (folder; empty = app cache), x-name.
/// Returns the final path.
#[tauri::command]
pub async fn save_output(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    use tauri::Manager;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("write-failed".into());
    };
    let name = header(&request, "x-name").ok_or("write-failed")?;
    let dir = match header(&request, "x-dir").filter(|d| !d.is_empty()) {
        Some(d) => PathBuf::from(d),
        None => {
            let d = app.path().app_cache_dir().map_err(|_| "write-failed")?.join("outputs");
            std::fs::create_dir_all(&d).map_err(|_| "write-failed")?;
            d
        }
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || write_new(&dir, &name, &bytes))
        .await
        .map_err(|_| "write-failed".to_string())?
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|_| "write-failed".to_string())
}

/// A fresh, empty scratch folder in the app cache (for print input/output and LibreOffice work).
#[tauri::command]
pub fn temp_dir(app: tauri::AppHandle) -> Result<String, String> {
    use std::sync::atomic::{AtomicU32, Ordering};
    use tauri::Manager;
    static N: AtomicU32 = AtomicU32::new(0);
    let base = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("work");
    let dir = base.join(format!("{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Opens an output file with its default app (documents/images only).
#[tauri::command]
pub fn open_output(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let p = PathBuf::from(&path);
    if !is_output_ext(&p) || !p.is_file() {
        return Err("not-allowed".into());
    }
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

/// Shows an output file selected in Explorer.
#[tauri::command]
pub fn reveal_output(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().reveal_item_in_dir(PathBuf::from(path)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_arabic_path_with_spaces() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("ملف تجريبي.pdf");
        std::fs::write(&p, b"%PDF-1.7").unwrap();
        assert_eq!(read_bytes(&p).unwrap(), b"%PDF-1.7");
    }

    #[test]
    fn missing_file_is_missing() {
        assert_eq!(read_bytes(Path::new("C:/no/such/file.pdf")), Err(FileError::Missing));
    }

    #[test]
    fn new_files_never_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path().join("مجلد تجريبي");
        std::fs::create_dir(&d).unwrap();
        let a = write_new(&d, "تقرير (converted).pdf", b"one").unwrap();
        let b = write_new(&d, "تقرير (converted).pdf", b"two").unwrap();
        let c = write_new(&d, "تقرير (converted).pdf", b"three").unwrap();
        assert_eq!(a.file_name().unwrap(), "تقرير (converted).pdf");
        assert_eq!(b.file_name().unwrap(), "تقرير (converted) (2).pdf");
        assert_eq!(c.file_name().unwrap(), "تقرير (converted) (3).pdf");
        assert_eq!(std::fs::read(&a).unwrap(), b"one");
    }

    #[test]
    fn names_cannot_escape_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        let p = write_new(dir.path(), "../evil.pdf", b"x").unwrap();
        assert_eq!(p.parent().unwrap(), dir.path());
        assert_eq!(p.file_name().unwrap(), "evil.pdf");
    }

    #[test]
    fn percent_decoding_handles_arabic() {
        assert_eq!(percent_decode("%D9%85%D9%84%D9%81%20a.pdf"), "ملف a.pdf");
        assert_eq!(percent_decode("plain"), "plain");
    }

    #[test]
    fn only_document_outputs_can_be_opened() {
        assert!(is_output_ext(Path::new("C:/x/a (converted).PDF")));
        assert!(is_output_ext(Path::new("a.docx")));
        assert!(!is_output_ext(Path::new("a.exe")));
        assert!(!is_output_ext(Path::new("a.pdf.bat")));
        assert!(!is_output_ext(Path::new("noext")));
    }

    #[test]
    fn directory_is_unreadable() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_bytes(dir.path()), Err(FileError::Unreadable));
    }
}
