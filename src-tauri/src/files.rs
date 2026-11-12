//! Reading documents by path (desktop). Android content URIs are read by plugin-fs from the UI.

use std::path::Path;

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
    fn directory_is_unreadable() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_bytes(dir.path()), Err(FileError::Unreadable));
    }
}
