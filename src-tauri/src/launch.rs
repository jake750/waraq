//! Files handed to the app by Windows ("Open with", double-click on a .pdf).

/// The first argument (after the program itself) that names a .pdf file.
pub fn pick_pdf_arg(args: &[&str]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && a.to_lowercase().ends_with(".pdf"))
        .map(|a| a.to_string())
}

/// The PDF this process was launched with, if any (read once by the UI at startup).
#[tauri::command]
pub fn startup_file() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    pick_pdf_arg(&refs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_pdf_with_arabic_name_any_case() {
        assert_eq!(
            pick_pdf_arg(&["waraq.exe", "--flag", r"C:\كتب\ملف.PDF"]),
            Some(r"C:\كتب\ملف.PDF".to_string())
        );
    }

    #[test]
    fn none_without_pdf() {
        assert_eq!(pick_pdf_arg(&["waraq.exe"]), None);
        assert_eq!(pick_pdf_arg(&["waraq.exe", "notes.txt"]), None);
    }

    #[test]
    fn program_itself_is_skipped() {
        assert_eq!(pick_pdf_arg(&[r"C:\apps\odd.pdf"]), None);
    }
}
