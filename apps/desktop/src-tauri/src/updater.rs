use std::{sync::Mutex, time::Duration};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio_util::sync::CancellationToken;

use crate::db;

const UPDATE_PREFERENCES_KEY: &str = "update_preferences";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterCapability {
    pub enabled: bool,
    pub track: &'static str,
    pub endpoint: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub status: &'static str,
    pub update: Option<UpdateMetadata>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActionResult {
    pub status: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum UpdateDownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
        downloaded: u64,
        content_length: Option<u64>,
    },
    Finished,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreferences {
    pub daily_check: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterError {
    pub code: &'static str,
    pub message: String,
}

impl UpdaterError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn from_plugin(error: tauri_plugin_updater::Error) -> Self {
        let code = match &error {
            tauri_plugin_updater::Error::Minisign(_)
            | tauri_plugin_updater::Error::Base64(_)
            | tauri_plugin_updater::Error::SignatureUtf8(_) => "signature-failure",
            tauri_plugin_updater::Error::Reqwest(_)
            | tauri_plugin_updater::Error::Network(_)
            | tauri_plugin_updater::Error::ReleaseNotFound => "network-failure",
            tauri_plugin_updater::Error::InsecureTransportProtocol => "insecure-transport",
            _ => "updater-failure",
        };
        Self::new(code, error.to_string())
    }
}

struct DownloadedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

#[derive(Default)]
pub struct UpdaterState {
    pending: Mutex<Option<Update>>,
    downloaded: Mutex<Option<DownloadedUpdate>>,
    active_cancel: Mutex<Option<CancellationToken>>,
}

impl UpdaterState {
    fn begin(&self) -> Result<CancellationToken, UpdaterError> {
        let mut active = self.active_cancel.lock().expect("updater cancel lock");
        if active.is_some() {
            return Err(UpdaterError::new(
                "update-operation-active",
                "Another update operation is already running.",
            ));
        }
        let token = CancellationToken::new();
        *active = Some(token.clone());
        Ok(token)
    }

    fn finish(&self) {
        *self.active_cancel.lock().expect("updater cancel lock") = None;
    }

    pub fn cancel(&self) -> bool {
        let active = self.active_cancel.lock().expect("updater cancel lock");
        if let Some(token) = active.as_ref() {
            token.cancel();
            true
        } else {
            false
        }
    }
}

pub fn capability() -> UpdaterCapability {
    let enabled = option_env!("EBOOK_READER_BUILD_FLAVOR") != Some("msi");
    UpdaterCapability {
        enabled,
        track: if enabled { "nsis" } else { "msi" },
        endpoint:
            "https://github.com/aaaaa-ozo23/ebook-reader/releases/latest/download/latest.json",
    }
}

pub async fn check_for_update(
    app: AppHandle,
    state: &UpdaterState,
) -> Result<UpdateCheckResult, UpdaterError> {
    require_enabled()?;
    let cancel = state.begin()?;
    let result = async {
        let updater = app
            .updater_builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(UpdaterError::from_plugin)?;
        let check = updater.check();
        tokio::pin!(check);
        tokio::select! {
            value = &mut check => value.map(CheckOutcome::Completed).map_err(UpdaterError::from_plugin),
            _ = cancel.cancelled() => Ok(CheckOutcome::Canceled),
        }
    }
    .await;
    state.finish();

    match result? {
        CheckOutcome::Canceled => Ok(UpdateCheckResult {
            status: "canceled",
            update: None,
        }),
        CheckOutcome::Completed(None) => {
            *state.pending.lock().expect("pending update lock") = None;
            *state.downloaded.lock().expect("downloaded update lock") = None;
            Ok(UpdateCheckResult {
                status: "up-to-date",
                update: None,
            })
        }
        CheckOutcome::Completed(Some(update)) => {
            let metadata = UpdateMetadata {
                version: update.version.clone(),
                current_version: update.current_version.clone(),
                notes: update.body.clone(),
                published_at: update.date.map(|value| value.to_string()),
            };
            *state.pending.lock().expect("pending update lock") = Some(update);
            *state.downloaded.lock().expect("downloaded update lock") = None;
            Ok(UpdateCheckResult {
                status: "available",
                update: Some(metadata),
            })
        }
    }
}

enum CheckOutcome {
    Canceled,
    Completed(Option<Update>),
}

pub async fn download_update(
    state: &UpdaterState,
    on_event: Channel<UpdateDownloadEvent>,
) -> Result<UpdateActionResult, UpdaterError> {
    require_enabled()?;
    let update = state
        .pending
        .lock()
        .expect("pending update lock")
        .clone()
        .ok_or_else(|| UpdaterError::new("no-pending-update", "Check for an update first."))?;
    let cancel = state.begin()?;
    let result = async {
        let mut downloaded = 0_u64;
        let download = update.download(
            |chunk_length, content_length| {
                downloaded += chunk_length as u64;
                if downloaded == chunk_length as u64 {
                    let _ = on_event.send(UpdateDownloadEvent::Started { content_length });
                }
                let _ = on_event.send(UpdateDownloadEvent::Progress {
                    chunk_length,
                    downloaded,
                    content_length,
                });
            },
            || {
                let _ = on_event.send(UpdateDownloadEvent::Finished);
            },
        );
        tokio::pin!(download);
        tokio::select! {
            value = &mut download => value.map_err(UpdaterError::from_plugin).map(Some),
            _ = cancel.cancelled() => Ok(None),
        }
    }
    .await;
    state.finish();

    match result? {
        None => Ok(UpdateActionResult { status: "canceled" }),
        Some(bytes) => {
            *state.downloaded.lock().expect("downloaded update lock") =
                Some(DownloadedUpdate { update, bytes });
            Ok(UpdateActionResult {
                status: "downloaded",
            })
        }
    }
}

pub fn install_downloaded_update(state: &UpdaterState) -> Result<UpdateActionResult, UpdaterError> {
    require_enabled()?;
    let downloaded = state
        .downloaded
        .lock()
        .expect("downloaded update lock")
        .take()
        .ok_or_else(|| {
            UpdaterError::new(
                "no-downloaded-update",
                "Download and verify the update before installing.",
            )
        })?;
    downloaded
        .update
        .install(downloaded.bytes)
        .map_err(UpdaterError::from_plugin)?;
    Ok(UpdateActionResult {
        status: "installing",
    })
}

pub fn get_preferences(app: &AppHandle) -> Result<UpdatePreferences, UpdaterError> {
    let storage = db::init_app_storage(app)
        .map_err(|error| UpdaterError::new("settings-failure", error.to_string()))?;
    let conn = Connection::open(storage.database_path)
        .map_err(|error| UpdaterError::new("settings-failure", error.to_string()))?;
    let value = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![UPDATE_PREFERENCES_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| UpdaterError::new("settings-failure", error.to_string()))?;
    Ok(value
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or(UpdatePreferences { daily_check: false }))
}

pub fn save_preferences(
    app: &AppHandle,
    preferences: UpdatePreferences,
) -> Result<UpdatePreferences, UpdaterError> {
    let storage = db::init_app_storage(app)
        .map_err(|error| UpdaterError::new("settings-failure", error.to_string()))?;
    let conn = Connection::open(storage.database_path)
        .map_err(|error| UpdaterError::new("settings-failure", error.to_string()))?;
    let value = serde_json::to_string(&preferences)
        .map_err(|error| UpdaterError::new("settings-failure", error.to_string()))?;
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
        params![UPDATE_PREFERENCES_KEY, value],
    )
    .map_err(|error| UpdaterError::new("settings-failure", error.to_string()))?;
    Ok(preferences)
}

fn require_enabled() -> Result<(), UpdaterError> {
    if capability().enabled {
        Ok(())
    } else {
        Err(UpdaterError::new(
            "updater-disabled-msi",
            "This MSI installation uses manual upgrades to avoid mixing installer tracks.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_build_uses_manual_nsis_track_without_daily_checks() {
        let capability = capability();
        assert_eq!(capability.track, "nsis");
        assert!(capability.enabled);
        assert!(!UpdatePreferences { daily_check: false }.daily_check);
    }

    #[test]
    fn cancellation_registry_is_explicit_and_reusable() {
        let state = UpdaterState::default();
        let first = state.begin().expect("operation");
        assert!(state.begin().is_err());
        assert!(state.cancel());
        assert!(first.is_cancelled());
        state.finish();
        assert!(state.begin().is_ok());
    }
}
