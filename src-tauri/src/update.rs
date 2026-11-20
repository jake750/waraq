//! App updates. On desktop the updater plugin does everything (check, download, verify the
//! signature, install). It doesn't run on Android, so there the app reads the same `latest.json`
//! the desktop updater reads, downloads the release's APK into its cache and hands it to the
//! system installer (which only accepts it when it carries the same signing key).

use serde::Serialize;

/// The release manifest `tauri-action` publishes with every GitHub release (also set as the
/// updater endpoint in tauri.conf.json).
pub const LATEST_JSON: &str = "https://github.com/jake750/waraq/releases/latest/download/latest.json";

#[derive(Debug, Serialize, PartialEq)]
pub struct Release {
    pub version: String,
    pub notes: Option<String>,
}

/// Reads `version` (with any leading "v" dropped) and `notes` from a latest.json body.
pub fn parse_latest(json: &str) -> Result<Release, String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|_| "bad-manifest".to_string())?;
    let version = v
        .get("version")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().trim_start_matches('v').to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "bad-manifest".to_string())?;
    let notes = v.get("notes").and_then(|x| x.as_str()).map(str::to_string).filter(|s| !s.trim().is_empty());
    Ok(Release { version, notes })
}

/// Android: the latest published release. Errors are short codes the UI maps to a message.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn latest_release() -> Result<Release, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let body = ureq::get(LATEST_JSON)
            .timeout(std::time::Duration::from_secs(20))
            .call()
            .map_err(|_| "network".to_string())?
            .into_string()
            .map_err(|_| "network".to_string())?;
        parse_latest(&body)
    })
    .await
    .map_err(|_| "network".to_string())?
}

/// The APK the release workflow attaches to release `version`. Only plain version numbers are
/// accepted, so nothing else can end up in the URL or the file name.
pub fn apk_url(version: &str) -> Result<String, String> {
    let ok = !version.is_empty() && version.len() <= 32 && version.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    if !ok {
        return Err("bad-version".into());
    }
    Ok(format!("https://github.com/jake750/waraq/releases/download/v{version}/Waraq_{version}_android.apk"))
}

/// Android: downloads the new APK into the app cache, reporting (bytes so far, total) on
/// `progress`, and returns its path for `android_install_apk`.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn android_download_update(
    app: tauri::AppHandle,
    version: String,
    progress: tauri::ipc::Channel<(u64, Option<u64>)>,
) -> Result<String, String> {
    use std::io::{Read, Write};
    use tauri::Manager;
    let url = apk_url(&version)?;
    let dir = app.path().app_cache_dir().map_err(|_| "io".to_string())?.join("updates");
    tauri::async_runtime::spawn_blocking(move || {
        let io = |_| "io".to_string();
        // Older downloads are no use once a newer one starts.
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).map_err(io)?;
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(std::time::Duration::from_secs(20))
            .timeout_read(std::time::Duration::from_secs(60))
            .build();
        let resp = agent.get(&url).call().map_err(|_| "network".to_string())?;
        let total = resp.header("Content-Length").and_then(|s| s.parse::<u64>().ok());
        let part = dir.join("download.part");
        let mut file = std::fs::File::create(&part).map_err(io)?;
        let mut reader = resp.into_reader();
        let mut buf = vec![0u8; 64 * 1024];
        let (mut done, mut told) = (0u64, 0u64);
        loop {
            let n = reader.read(&mut buf).map_err(|_| "network".to_string())?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(io)?;
            done += n as u64;
            if done - told >= 256 * 1024 {
                told = done;
                let _ = progress.send((done, total));
            }
        }
        file.flush().map_err(io)?;
        drop(file);
        if total.is_some_and(|t| t != done) {
            return Err("network".into());
        }
        let _ = progress.send((done, total));
        let apk = dir.join(format!("Waraq_{version}.apk"));
        std::fs::rename(&part, &apk).map_err(io)?;
        Ok(apk.to_string_lossy().into_owned())
    })
    .await
    .map_err(|_| "io".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apk_url_takes_plain_versions_only() {
        assert_eq!(
            apk_url("0.2.34").unwrap(),
            "https://github.com/jake750/waraq/releases/download/v0.2.34/Waraq_0.2.34_android.apk"
        );
        assert!(apk_url("../x").is_err());
        assert!(apk_url("1.0/evil").is_err());
        assert!(apk_url("").is_err());
    }

    #[test]
    fn reads_version_and_notes() {
        let r = parse_latest(r#"{"version":"v0.2.0","notes":"Fixes","platforms":{}}"#).unwrap();
        assert_eq!(r, Release { version: "0.2.0".into(), notes: Some("Fixes".into()) });
    }

    #[test]
    fn empty_notes_are_none() {
        assert_eq!(parse_latest(r#"{"version":"1.0.0","notes":"  "}"#).unwrap().notes, None);
    }

    #[test]
    fn rejects_a_manifest_without_version() {
        assert!(parse_latest(r#"{"notes":"x"}"#).is_err());
        assert!(parse_latest("not json").is_err());
    }
}
