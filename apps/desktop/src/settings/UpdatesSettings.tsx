import { useCallback, useEffect, useState } from "react";
import type {
  AppUpdateMetadata,
  AppUpdateStatus,
  UpdateDownloadProgress,
  UpdatePreferences,
  UpdaterCapability,
} from "@reader/core";

import {
  cancelUpdateDownload,
  checkForUpdate,
  downloadUpdate,
  getUpdatePreferences,
  getUpdaterCapability,
  installDownloadedUpdate,
  normalizeUpdaterError,
  saveUpdatePreferences,
} from "../tauri/updater";

export function UpdatesSettings() {
  const [capability, setCapability] = useState<UpdaterCapability | null>(null);
  const [preferences, setPreferences] = useState<UpdatePreferences>({
    dailyCheck: false,
  });
  const [status, setStatus] = useState<AppUpdateStatus>("idle");
  const [update, setUpdate] = useState<AppUpdateMetadata | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getUpdaterCapability(), getUpdatePreferences()])
      .then(([nextCapability, nextPreferences]) => {
        if (!active) return;
        setCapability(nextCapability);
        setPreferences(nextPreferences);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(normalizeUpdaterError(error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCheck = useCallback(async () => {
    setStatus("checking");
    setMessage(null);
    setProgress(null);
    try {
      const result = await checkForUpdate();
      setStatus(result.status);
      setUpdate(result.update ?? null);
    } catch (error) {
      const normalized = normalizeUpdaterError(error);
      setStatus(
        normalized.code === "signature-failure"
          ? "signature-failure"
          : "network-failure",
      );
      setMessage(normalized.message);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    setStatus("downloading");
    setMessage(null);
    setProgress({ downloaded: 0 });
    try {
      const result = await downloadUpdate(setProgress);
      setStatus(result.status);
    } catch (error) {
      const normalized = normalizeUpdaterError(error);
      setStatus(
        normalized.code === "signature-failure"
          ? "signature-failure"
          : "network-failure",
      );
      setMessage(normalized.message);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    if (await cancelUpdateDownload()) {
      setStatus("canceled");
    }
  }, []);

  const handleInstall = useCallback(async () => {
    setStatus("installing");
    setMessage(null);
    try {
      await installDownloadedUpdate();
    } catch (error) {
      setStatus("network-failure");
      setMessage(normalizeUpdaterError(error).message);
    }
  }, []);

  const handleDailyCheck = useCallback(
    async (dailyCheck: boolean) => {
      const previous = preferences;
      const next = { dailyCheck };
      setPreferences(next);
      setMessage(null);
      try {
        setPreferences(await saveUpdatePreferences(next));
      } catch (error) {
        setPreferences(previous);
        setMessage(normalizeUpdaterError(error).message);
      }
    },
    [preferences],
  );

  const percentage =
    progress?.contentLength && progress.contentLength > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100))
      : null;
  const enabled = capability?.enabled !== false;

  return (
    <>
      <div className="backup-notice update-notice" role="note">
        <UpdateShieldIcon />
        <div>
          <strong>Downloads are always verified before installation</strong>
          <p>
            Ebook Reader never downloads or installs updates automatically. Windows
            exits the app only after you confirm installation.
          </p>
        </div>
      </div>

      <section
        className="settings-card update-card"
        aria-labelledby="update-card-title"
      >
        <div className="settings-card__title">
          <div className="settings-card__icon" aria-hidden="true">
            <UpdateIcon />
          </div>
          <div>
            <h2 id="update-card-title">App updates</h2>
            <p>
              {capability?.track === "msi"
                ? "This MSI installation stays on the manual upgrade track."
                : "Check the signed NSIS update track when you choose."}
            </p>
          </div>
        </div>

        {capability?.track === "msi" ? (
          <div className="update-state update-state--manual" role="status">
            <strong>Manual updates for MSI</strong>
            <span>
              Download the next MSI from GitHub and install it over this version. Do not
              mix MSI and NSIS installers.
            </span>
          </div>
        ) : (
          <UpdateState
            status={status}
            update={update}
            message={message}
            percentage={percentage}
          />
        )}

        <footer className="settings-card__footer update-actions">
          <p>
            Track: {capability?.track?.toUpperCase() ?? "detecting"} · signed artifacts
            only
          </p>
          <div className="settings-button-group">
            {status === "checking" || status === "downloading" ? (
              <button
                type="button"
                className="settings-button settings-button--secondary"
                onClick={() => void handleCancel()}
              >
                Cancel
              </button>
            ) : null}
            {status === "available" ? (
              <button
                type="button"
                className="settings-button settings-button--primary"
                onClick={() => void handleDownload()}
              >
                Download update
              </button>
            ) : status === "downloaded" ? (
              <button
                type="button"
                className="settings-button settings-button--primary"
                onClick={() => void handleInstall()}
              >
                Install &amp; exit app
              </button>
            ) : (
              <button
                type="button"
                className="settings-button settings-button--primary"
                disabled={!enabled || status === "checking" || status === "downloading"}
                onClick={() => void handleCheck()}
              >
                Check for updates
              </button>
            )}
          </div>
        </footer>
      </section>

      <section className="settings-card update-card" aria-labelledby="schedule-title">
        <div className="settings-card__title">
          <div>
            <h2 id="schedule-title">Check schedule</h2>
            <p>
              Daily checks only look for availability. Downloads still require a click.
            </p>
          </div>
        </div>
        <label className="update-toggle">
          <span>
            <strong>Check once a day</strong>
            <small>Off by default. No background download or installation.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.dailyCheck}
            disabled={!enabled}
            onChange={(event) => void handleDailyCheck(event.target.checked)}
          />
          <i aria-hidden="true" />
        </label>
      </section>
    </>
  );
}

function UpdateState({
  status,
  update,
  message,
  percentage,
}: {
  status: AppUpdateStatus;
  update: AppUpdateMetadata | null;
  message: string | null;
  percentage: number | null;
}) {
  const copy: Record<AppUpdateStatus, string> = {
    idle: "Ready to check",
    checking: "Checking the signed release feed…",
    "up-to-date": "You are up to date",
    available: `Version ${update?.version ?? "new"} is available`,
    downloading: `Downloading${percentage === null ? "…" : ` · ${percentage}%`}`,
    downloaded: "Downloaded and signature verified",
    installing: "Starting the installer. This action cannot be canceled.",
    canceled: "Update operation canceled",
    "signature-failure": "Signature verification failed",
    "network-failure": "Could not reach the update service",
  };
  return (
    <div className="update-state" data-status={status} role="status" aria-live="polite">
      <span className="update-state__dot" aria-hidden="true" />
      <div>
        <strong>{copy[status]}</strong>
        {update?.notes ? <span>{update.notes}</span> : null}
        {message ? <span>{message}</span> : null}
      </div>
      {status === "downloading" ? (
        <div className="backup-progress__track" aria-hidden="true">
          <i
            data-indeterminate={percentage === null || undefined}
            style={{ transform: `scaleX(${(percentage ?? 12) / 100})` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function UpdateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5M6.1 8.2A7 7 0 0 1 18.7 7M5.3 17A7 7 0 0 0 17.9 15.8" />
    </svg>
  );
}

function UpdateShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}
