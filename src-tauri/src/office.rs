//! LibreOffice on Windows: find it, install it per-user (pinned official MSI, SHA-256 checked,
//! administrative extract, no admin rights), and run one headless conversion at a time.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

pub const LO_VERSION: &str = "26.2.7";
pub const LO_URL: &str = "https://download.documentfoundation.org/libreoffice/stable/26.2.7/win/x86_64/LibreOffice_26.2.7_Win_x86-64.msi";
pub const LO_SHA256: &str = "480fecf759fc6393bd614fbf43753eb95a8198fc1a065d41b727e3b664cd1e59";
pub const LO_SIZE: u64 = 373_121_024;
const TIMEOUT: Duration = Duration::from_secs(180);
const NO_WINDOW: u32 = 0x0800_0000;

static BUSY: Mutex<()> = Mutex::new(()); // one LibreOffice at a time
static INSTALLING: AtomicBool = AtomicBool::new(false); // one download at a time

/// Cancelling bumps a counter; an operation is cancelled when the counter moved since it started.
/// So a cancel reaches the operations already asked for (running, or waiting for `BUSY`) and never
/// a later one, and stopping a conversion doesn't stop a LibreOffice download (separate counters).
pub struct CancelEpoch(AtomicU64);
impl CancelEpoch {
    pub const fn new() -> Self {
        CancelEpoch(AtomicU64::new(0))
    }
    pub fn token(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
    pub fn cancel(&self) {
        self.0.fetch_add(1, Ordering::SeqCst);
    }
    pub fn cancelled(&self, token: u64) -> bool {
        self.0.load(Ordering::SeqCst) != token
    }
}
static CANCEL_INSTALL: CancelEpoch = CancelEpoch::new();
static CANCEL_CONVERT: CancelEpoch = CancelEpoch::new();

/// Releases the install guard however `install` ends.
struct Installing;
impl Drop for Installing {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::SeqCst);
    }
}

/// LibreOffice export filter for a target format.
pub fn filter_for(target: &str) -> Option<&'static str> {
    match target {
        "pdf" => Some("pdf:writer_pdf_Export"),
        "docx" => Some("docx:MS Word 2007 XML"),
        "txt" => Some("txt:Text (encoded):UTF8"),
        _ => None,
    }
}

#[cfg(test)]
pub fn sha256_hex(mut r: impl Read) -> std::io::Result<String> {
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = r.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// `program\soffice.com` (console launcher that waits) or `soffice.exe`, searched up to 3 levels below `root`.
fn soffice_under(root: &Path, depth: u32) -> Option<PathBuf> {
    for name in ["soffice.com", "soffice.exe"] {
        let p = root.join("program").join(name);
        if p.is_file() {
            return Some(p);
        }
    }
    if depth == 0 {
        return None;
    }
    std::fs::read_dir(root).ok()?.flatten().filter(|e| e.path().is_dir()).find_map(|e| soffice_under(&e.path(), depth - 1))
}

/// Our own per-user copy first, then an installed LibreOffice, then LIBREOFFICE_PATH.
pub fn find_soffice(own: &Path, installed_roots: &[PathBuf], env: Option<PathBuf>) -> Option<PathBuf> {
    soffice_under(own, 3)
        .or_else(|| installed_roots.iter().find_map(|r| soffice_under(r, 0)))
        .or_else(|| env.filter(|p| p.is_file()))
}

fn own_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("libreoffice"))
}

fn locate(app: &tauri::AppHandle) -> Option<PathBuf> {
    let pf = |v: &str| std::env::var_os(v).map(|p| PathBuf::from(p).join("LibreOffice"));
    let roots: Vec<PathBuf> = [pf("ProgramFiles"), pf("ProgramFiles(x86)"), pf("ProgramW6432")].into_iter().flatten().collect();
    find_soffice(&own_dir(app).ok()?, &roots, std::env::var_os("LIBREOFFICE_PATH").map(PathBuf::from))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeStatus {
    installed: bool,
    version: &'static str,
    download_bytes: u64,
}

#[tauri::command]
pub fn office_status(app: tauri::AppHandle) -> OfficeStatus {
    OfficeStatus { installed: locate(&app).is_some(), version: LO_VERSION, download_bytes: LO_SIZE }
}

/// Downloads, verifies and extracts LibreOffice into the app's data folder. Progress: bytes downloaded.
#[tauri::command]
pub async fn office_install(app: tauri::AppHandle, on_progress: tauri::ipc::Channel<u64>) -> Result<(), String> {
    let dir = own_dir(&app)?;
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("busy".into()); // a second download would write the same .msi
    }
    let guard = Installing;
    let token = CANCEL_INSTALL.token();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let r = install(&dir, &on_progress, token);
        if r.is_err() {
            let _ = std::fs::remove_dir_all(&dir); // never leave a half-installed copy
        }
        r
    })
    .await
    .map_err(|e| e.to_string())?
}

fn install(dir: &Path, progress: &tauri::ipc::Channel<u64>, token: u64) -> Result<(), String> {
    use std::io::Write;
    let parent = dir.parent().ok_or("bad path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let msi = parent.join("libreoffice-download.msi");
    let _ = std::fs::remove_dir_all(dir);

    // Download while hashing.
    // Timeouts: a stalled connection fails instead of leaving "Downloading…" up forever.
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(20))
        .timeout_read(Duration::from_secs(60))
        .build();
    let res = agent.get(LO_URL).call().map_err(|_| "download-failed".to_string())?;
    let mut reader = res.into_reader();
    let mut file = std::fs::File::create(&msi).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    let mut total = 0u64;
    let mut last = Instant::now();
    loop {
        if CANCEL_INSTALL.cancelled(token) {
            drop(file);
            let _ = std::fs::remove_file(&msi);
            return Err("cancelled".into());
        }
        let n = reader.read(&mut buf).map_err(|_| "download-failed".to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        total += n as u64;
        if last.elapsed() > Duration::from_millis(250) {
            let _ = progress.send(total);
            last = Instant::now();
        }
    }
    drop(file);
    let _ = progress.send(total);
    let hex: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if hex != LO_SHA256 {
        let _ = std::fs::remove_file(&msi);
        return Err("hash-mismatch".into());
    }
    extract(&msi, dir)?;
    let _ = std::fs::remove_file(&msi);
    Ok(())
}

/// Administrative install = plain extraction of the MSI's files into `dir` (per-user, no registry, no admin).
pub fn extract(msi: &Path, dir: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let status = Command::new("msiexec")
        .raw_arg(format!("/a \"{}\" /qn TARGETDIR=\"{}\"", msi.display(), dir.display()))
        .creation_flags(NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() || soffice_under(dir, 3).is_none() {
        return Err("extract-failed".into());
    }
    Ok(())
}

/// The temp copy LibreOffice works on: ASCII name, same extension (LibreOffice and some shells dislike Arabic paths).
pub fn work_name(input: &Path) -> String {
    let ext = input.extension().and_then(|e| e.to_str()).unwrap_or("bin").to_ascii_lowercase();
    format!("input.{ext}")
}

/// Converts `input` to `target` (pdf/docx/txt) with LibreOffice and saves it as a new file `out_name` in `out_dir`.
#[tauri::command]
pub async fn office_convert(app: tauri::AppHandle, input: String, target: String, out_dir: String, out_name: String) -> Result<String, String> {
    use tauri::Manager;
    if out_dir.trim().is_empty() {
        return Err("write-failed".into()); // never a relative (working-directory) folder
    }
    let soffice = locate(&app).ok_or("office-missing")?;
    let filter = filter_for(&target).ok_or("unsupported")?;
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let profile = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("libreoffice-profile");
    let token = CANCEL_CONVERT.token(); // taken before waiting for BUSY, so a cancel while waiting counts
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = BUSY.lock().unwrap_or_else(|e| e.into_inner());
        if CANCEL_CONVERT.cancelled(token) {
            return Err("cancelled".to_string());
        }
        let work = cache.join("office").join(format!("{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&work);
        let out = work.join("out");
        std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        let src = work.join(work_name(Path::new(&input)));
        std::fs::copy(&input, &src).map_err(|_| "file-missing".to_string())?;
        let result = run_soffice(&soffice, &profile, filter, &src, &out, token).and_then(|_| {
            let produced = std::fs::read_dir(&out)
                .map_err(|e| e.to_string())?
                .flatten()
                .map(|e| e.path())
                .find(|p| p.extension().and_then(|e| e.to_str()) == Some(target.as_str()))
                .ok_or("engine-failed")?;
            let bytes = std::fs::read(&produced).map_err(|e| e.to_string())?;
            crate::files::write_new(Path::new(&out_dir), &out_name, &bytes).map_err(|_| "write-failed".to_string())
        });
        let _ = std::fs::remove_dir_all(&work);
        result.map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn run_soffice(soffice: &Path, profile: &Path, filter: &str, src: &Path, out: &Path, token: u64) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let profile_url = tauri::Url::from_directory_path(profile).map_err(|_| "bad profile path")?;
    let mut child = Command::new(soffice)
        .args(["--headless", "--norestore", "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard"])
        .arg(format!("-env:UserInstallation={profile_url}"))
        .arg("--convert-to")
        .arg(filter)
        .arg("--outdir")
        .arg(out)
        .arg(src)
        .creation_flags(NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return if status.success() { Ok(()) } else { Err("engine-failed".into()) };
        }
        let cancelled = CANCEL_CONVERT.cancelled(token);
        if cancelled || start.elapsed() > TIMEOUT {
            // Kill our launcher's whole process tree (it starts soffice.bin), never other LibreOffice windows.
            kill_tree(child.id());
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancelled { "cancelled".into() } else { "timeout".into() });
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

/// soffice.com starts soffice.bin; killing only the launcher would leave it running.
fn kill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).creation_flags(NO_WINDOW).status();
}

/// Cancels the LibreOffice download (`what` = "install") or the conversions asked for so far
/// (anything else, the default).
#[tauri::command]
pub fn office_cancel(what: Option<String>) {
    if what.as_deref() == Some("install") {
        CANCEL_INSTALL.cancel();
    } else {
        CANCEL_CONVERT.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters() {
        assert_eq!(filter_for("pdf"), Some("pdf:writer_pdf_Export"));
        assert_eq!(filter_for("docx"), Some("docx:MS Word 2007 XML"));
        assert_eq!(filter_for("txt"), Some("txt:Text (encoded):UTF8"));
        assert_eq!(filter_for("exe"), None);
    }

    #[test]
    fn hash_matches_known_value() {
        assert_eq!(sha256_hex(&b"abc"[..]).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_ne!(sha256_hex(&b"abd"[..]).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn finds_own_copy_before_installed() {
        let t = tempfile::tempdir().unwrap();
        let own = t.path().join("own");
        let prog = own.join("LibreOffice").join("program");
        std::fs::create_dir_all(&prog).unwrap();
        std::fs::write(prog.join("soffice.com"), b"").unwrap();
        let installed = t.path().join("pf").join("LibreOffice");
        std::fs::create_dir_all(installed.join("program")).unwrap();
        std::fs::write(installed.join("program").join("soffice.exe"), b"").unwrap();
        assert_eq!(find_soffice(&own, &[installed.clone()], None), Some(prog.join("soffice.com")));
        assert_eq!(find_soffice(&t.path().join("none"), &[installed.clone()], None), Some(installed.join("program").join("soffice.exe")));
        assert_eq!(find_soffice(&t.path().join("none"), &[], None), None);
    }

    #[test]
    fn cancel_reaches_earlier_operations_only() {
        let c = CancelEpoch::new();
        let running = c.token();
        assert!(!c.cancelled(running));
        c.cancel();
        assert!(c.cancelled(running)); // asked for before the cancel: stops
        let later = c.token();
        assert!(!c.cancelled(later)); // asked for after it: runs
        let other = CancelEpoch::new();
        let download = other.token();
        c.cancel();
        assert!(!other.cancelled(download)); // stopping conversions leaves a download alone
    }

    #[test]
    fn work_copy_has_an_ascii_name() {
        assert_eq!(work_name(Path::new(r"C:\كتب\تقرير سنوي.DOCX")), "input.docx");
        assert_eq!(work_name(Path::new("noext")), "input.bin");
    }
}
