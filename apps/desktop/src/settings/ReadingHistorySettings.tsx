import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReadingHistoryExportResult,
  ReadingHistoryPreferences,
} from "@reader/core";

import {
  clearReadingHistory,
  exportReadingHistory,
  getReadingHistoryPreferences,
  pickReadingHistoryDestination,
  revealReadingHistoryExport,
  saveReadingHistoryPreferences,
} from "../tauri/readingHistory";

import "./ReadingHistorySettings.css";

export function ReadingHistorySettings() {
  const [preferences, setPreferences] = useState<ReadingHistoryPreferences | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [exportResult, setExportResult] = useState<ReadingHistoryExportResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelClearRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void getReadingHistoryPreferences()
      .then((nextPreferences) => {
        if (active) setPreferences(nextPreferences);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showClearDialog) return;
    cancelClearRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isClearing) {
        setShowClearDialog(false);
        window.requestAnimationFrame(() => clearTriggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClearing, showClearDialog]);

  const handleToggle = useCallback(async () => {
    if (preferences === null || isSaving) return;
    const previous = preferences;
    const enabled = !previous.enabled;
    setPreferences({ ...previous, enabled });
    setIsSaving(true);
    setError(null);
    try {
      setPreferences(await saveReadingHistoryPreferences(enabled));
    } catch (saveError) {
      setPreferences(previous);
      setError(errorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, preferences]);

  const handleExport = useCallback(async () => {
    setError(null);
    setExportResult(null);
    let destination: string | null;
    try {
      destination = await pickReadingHistoryDestination();
    } catch (pickError) {
      setError(errorMessage(pickError));
      return;
    }
    if (destination === null) return;
    setIsExporting(true);
    try {
      setExportResult(await exportReadingHistory(destination));
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleClear = useCallback(async () => {
    setIsClearing(true);
    setError(null);
    try {
      setPreferences(await clearReadingHistory());
      setExportResult(null);
      setShowClearDialog(false);
      window.requestAnimationFrame(() => clearTriggerRef.current?.focus());
    } catch (clearError) {
      setError(errorMessage(clearError));
    } finally {
      setIsClearing(false);
    }
  }, []);

  const handleRevealExport = useCallback(async () => {
    if (exportResult === null) return;
    setError(null);
    try {
      await revealReadingHistoryExport(exportResult.outputPath);
    } catch (revealError) {
      setError(errorMessage(revealError));
    }
  }, [exportResult]);

  return (
    <div className="history-settings">
      {error !== null ? (
        <div className="history-feedback history-feedback--error" role="alert">
          {error}
        </div>
      ) : null}
      {exportResult !== null ? (
        <div className="history-feedback history-feedback--success" role="status">
          <strong>CSV exported</strong>
          <span>
            {exportResult.sessionCount} local sessions were written successfully. No
            copy was uploaded or retained by the app.
          </span>
          <button
            type="button"
            className="history-feedback__action"
            onClick={() => void handleRevealExport()}
          >
            Show in folder
          </button>
        </div>
      ) : null}

      <section className="history-settings-card" aria-label="Reading history controls">
        <div className="history-setting-row">
          <div>
            <strong>Record reading history</strong>
            <p>
              Count time only while the reader is visible, focused and recently used.
              Turning this off ends the active session immediately.
            </p>
          </div>
          <button
            type="button"
            className="history-switch"
            role="switch"
            aria-checked={preferences?.enabled ?? true}
            aria-label="Record reading history"
            disabled={preferences === null || isSaving}
            onClick={() => void handleToggle()}
          >
            <span aria-hidden="true" />
          </button>
        </div>
        <div className="history-setting-row">
          <div>
            <strong>Export history as CSV</strong>
            <p>
              Choose a local destination for sessions, effective seconds and final saved
              progress.
            </p>
          </div>
          <button
            type="button"
            className="history-action history-action--secondary"
            disabled={isExporting}
            onClick={() => void handleExport()}
          >
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
        <div className="history-setting-row">
          <div>
            <strong>Clear reading history</strong>
            <p>
              Remove sessions and statistics from this device. Books, progress,
              bookmarks and annotations stay intact.
            </p>
          </div>
          <button
            ref={clearTriggerRef}
            type="button"
            className="history-action history-action--danger"
            onClick={() => setShowClearDialog(true)}
          >
            Clear history
          </button>
        </div>
      </section>

      <div className="history-privacy-note" role="note">
        <PrivacyIcon />
        <span>
          Portable backups include history preferences, sessions and the latest clear
          timestamp. A newer local clear always wins over older restored sessions.
        </span>
      </div>

      {showClearDialog ? (
        <div className="history-dialog-backdrop" role="presentation">
          <section
            className="history-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
            aria-describedby="clear-history-description"
          >
            <p>Confirm local deletion</p>
            <h2 id="clear-history-title">Clear all reading history?</h2>
            <span id="clear-history-description">
              This removes session rows and Insights totals from this device. Your
              books, saved position, bookmarks and notes are not affected.
            </span>
            <div>
              A clear timestamp is kept so an older backup cannot restore history you
              already removed.
            </div>
            <footer>
              <button
                ref={cancelClearRef}
                type="button"
                disabled={isClearing}
                onClick={() => {
                  setShowClearDialog(false);
                  window.requestAnimationFrame(() => clearTriggerRef.current?.focus());
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={() => void handleClear()}
              >
                {isClearing ? "Clearing…" : "Clear history"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function PrivacyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 4.5 6v5.6c0 4.6 3 7.8 7.5 9.4 4.5-1.6 7.5-4.8 7.5-9.4V6L12 3Z" />
      <path d="M9.4 12.1 11 13.7l3.8-4" />
    </svg>
  );
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return error instanceof Error ? error.message : String(error);
}
