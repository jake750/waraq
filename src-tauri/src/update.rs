//! App updates. On desktop the updater plugin does everything (check, download, verify the
//! signature, install). It doesn't run on Android, so there the app reads the same `latest.json`
//! the desktop updater reads and sends the user to the release page for the new APK.

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

#[cfg(test)]
mod tests {
    use super::*;

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
