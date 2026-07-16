import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type {
  BackupOptions,
  BackupResult,
  OperationProgress,
  RestorePreview,
  RestoreResult,
} from "@reader/core";

import {
  cancelDataOperation,
  exportBackup,
  inspectBackup,
  listenForDataOperationProgress,
  pickBackupDestination,
  pickBackupFile,
  restoreBackup,
} from "../tauri/backup";

import "./SettingsCenter.css";

const DEFAULT_OPTIONS: BackupOptions = {
  includeData: true,
  includeCovers: true,
  includeBooks: false,
};

export function SettingsCenter({
  onClose,
  onLibraryChanged = () => undefined,
}: {
  onClose: () => void;
  onLibraryChanged?: () => void;
}) {
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [progress, setProgress] = useState<OperationProgress | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"export" | "restore">("export");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeOperationIdRef = useRef<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenForDataOperationProgress((nextProgress) => {
      setProgress((current) =>
        nextProgress.operationId === activeOperationIdRef.current
          ? nextProgress
          : current,
      );
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && operationId === null) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, operationId]);

  const handleExport = useCallback(async () => {
    setErrorSource("export");
    setError(null);
    setResult(null);
    let destination: string | null;
    try {
      destination = await pickBackupDestination();
    } catch (nextError) {
      setError(errorMessage(nextError));
      return;
    }
    if (destination === null) {
      return;
    }

    const nextOperationId = createOperationId();
    activeOperationIdRef.current = nextOperationId;
    setOperationId(nextOperationId);
    setProgress({
      operationId: nextOperationId,
      kind: "backup-export",
      phase: "preparing",
      completed: 0,
      total: 1,
      message: "Preparing portable data",
    });
    try {
      const nextResult = await exportBackup(nextOperationId, destination, options);
      setResult(nextResult);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      activeOperationIdRef.current = null;
      setOperationId(null);
    }
  }, [options]);

  const handleCancel = useCallback(async () => {
    if (operationId !== null) {
      await cancelDataOperation(operationId);
    }
  }, [operationId]);

  const handleInspectRestore = useCallback(async () => {
    setErrorSource("restore");
    setError(null);
    setRestorePreview(null);
    setRestoreResult(null);
    let path: string | null;
    try {
      path = await pickBackupFile();
    } catch (nextError) {
      setError(errorMessage(nextError));
      return;
    }
    if (path === null) return;

    const nextOperationId = createOperationId("restore-inspect");
    activeOperationIdRef.current = nextOperationId;
    setRestorePath(path);
    setOperationId(nextOperationId);
    setProgress({
      operationId: nextOperationId,
      kind: "backup-restore",
      phase: "verifying",
      completed: 0,
      total: 1,
      message: "Checking backup safety",
    });
    try {
      setRestorePreview(await inspectBackup(nextOperationId, path));
    } catch (nextError) {
      setError(errorMessage(nextError));
      setRestorePath(null);
    } finally {
      activeOperationIdRef.current = null;
      setOperationId(null);
      setProgress(null);
    }
  }, []);

  const handleRestore = useCallback(async () => {
    if (restorePath === null || restorePreview === null) return;
    const nextOperationId = createOperationId("restore");
    activeOperationIdRef.current = nextOperationId;
    setErrorSource("restore");
    setError(null);
    setRestoreResult(null);
    setOperationId(nextOperationId);
    setProgress({
      operationId: nextOperationId,
      kind: "backup-restore",
      phase: "preparing",
      completed: 0,
      total: 1,
      message: "Preparing a safe staging area",
    });
    try {
      const nextResult = await restoreBackup(nextOperationId, restorePath);
      setRestoreResult(nextResult);
      if (nextResult.status === "completed") onLibraryChanged();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      activeOperationIdRef.current = null;
      setOperationId(null);
      setProgress(null);
    }
  }, [onLibraryChanged, restorePath, restorePreview]);

  const percentage =
    progress === null || progress.total <= 0
      ? 0
      : Math.min(100, Math.round((progress.completed / progress.total) * 100));
  const canExport =
    options.includeData || options.includeCovers || options.includeBooks;

  return (
    <main className="settings-shell" aria-labelledby={titleId}>
      <aside className="settings-sidebar" aria-label="Settings navigation">
        <div className="settings-sidebar__mark" aria-hidden="true">
          ER
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="settings-back"
          onClick={onClose}
        >
          <BackIcon />
          <span>Back to shelf</span>
        </button>
        <div className="settings-sidebar__heading">
          <span>Settings</span>
          <strong>Keep your library yours.</strong>
        </div>
        <nav aria-label="Settings sections">
          <button type="button" className="settings-nav-item" aria-current="page">
            <DatabaseIcon />
            <span>Data &amp; Backup</span>
          </button>
          <button type="button" className="settings-nav-item" disabled>
            <UpdateIcon />
            <span>Updates</span>
            <small>Later</small>
          </button>
        </nav>
      </aside>

      <section className="settings-content">
        <header className="settings-content__header">
          <div>
            <p>Local-first controls</p>
            <h1 id={titleId}>Data &amp; Backup</h1>
            <span>
              Create a portable copy of your library data whenever you choose.
            </span>
          </div>
          <button
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="backup-notice" role="note">
          <ShieldIcon />
          <div>
            <strong>Backups are not encrypted</strong>
            <p>
              They may contain books, annotations, bookmarks, and reading history. Store
              the file somewhere you trust.
            </p>
          </div>
        </div>

        <section className="settings-card" aria-labelledby="backup-card-title">
          <div className="settings-card__title">
            <div className="settings-card__icon" aria-hidden="true">
              <ArchiveIcon />
            </div>
            <div>
              <h2 id="backup-card-title">Export a backup</h2>
              <p>
                The archive contains a versioned manifest and SHA-256 checksums for
                every payload.
              </p>
            </div>
          </div>

          <fieldset className="backup-options" disabled={operationId !== null}>
            <legend>Include</legend>
            <BackupOption
              checked={options.includeData}
              description="Library metadata, reading preferences, progress, bookmarks, annotations, and deletion records."
              label="Core reading data"
              locked
              onChange={(checked) =>
                setOptions((current) => ({ ...current, includeData: checked }))
              }
            />
            <BackupOption
              checked={options.includeCovers}
              description="Automatic and custom cover images managed by Ebook Reader."
              label="Book covers"
              onChange={(checked) =>
                setOptions((current) => ({ ...current, includeCovers: checked }))
              }
            />
            <BackupOption
              checked={options.includeBooks}
              description="Original EPUB, TXT, and PDF library copies. This can make the backup much larger."
              label="Original book files"
              onChange={(checked) =>
                setOptions((current) => ({ ...current, includeBooks: checked }))
              }
            />
          </fieldset>

          {progress !== null &&
          operationId !== null &&
          progress.kind === "backup-export" ? (
            <div className="backup-progress" role="status" aria-live="polite">
              <div className="backup-progress__copy">
                <strong>{progress.message}</strong>
                <span>{percentage}%</span>
              </div>
              <div className="backup-progress__track" aria-hidden="true">
                <i style={{ transform: `scaleX(${percentage / 100})` }} />
              </div>
              <button
                type="button"
                className="settings-button settings-button--secondary"
                onClick={() => void handleCancel()}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {result?.status === "completed" ? (
            <div className="backup-result backup-result--success" role="status">
              <SuccessIcon />
              <div>
                <strong>Backup complete</strong>
                <span>
                  {result.fileName} · {formatBytes(result.bytesWritten)}
                </span>
              </div>
            </div>
          ) : null}
          {result?.status === "canceled" ? (
            <div className="backup-result" role="status">
              <span>Backup canceled. No partial archive was kept.</span>
            </div>
          ) : null}
          {error !== null && errorSource === "export" ? (
            <div className="backup-result backup-result--error" role="alert">
              <strong>Backup failed</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <footer className="settings-card__footer">
            <p>Reader caches and machine-specific paths are always excluded.</p>
            <button
              type="button"
              className="settings-button settings-button--primary"
              disabled={!canExport || operationId !== null}
              onClick={() => void handleExport()}
            >
              <ExportIcon />
              Choose location &amp; export
            </button>
          </footer>
        </section>

        <section className="settings-card" aria-labelledby="restore-card-title">
          <div className="settings-card__title">
            <div className="settings-card__icon" aria-hidden="true">
              <RestoreIcon />
            </div>
            <div>
              <h2 id="restore-card-title">Restore a backup</h2>
              <p>
                Every archive is checked for unsafe paths, size limits, version
                compatibility, and checksum integrity before anything changes.
              </p>
            </div>
          </div>

          {restorePreview !== null ? (
            <div className="restore-preview" aria-label="Restore preview">
              <div className="restore-preview__heading">
                <div>
                  <strong>{restorePreview.fileName}</strong>
                  <span>
                    Format v{restorePreview.manifest.formatVersion} · exported{" "}
                    {formatDate(restorePreview.manifest.exportedAt)}
                  </span>
                </div>
                <span className="restore-preview__safe">
                  <ShieldIcon /> Safe to restore
                </span>
              </div>
              <dl className="restore-preview__stats">
                <RestoreStat label="New books" value={restorePreview.newBooks} />
                <RestoreStat label="Matched" value={restorePreview.matchedBooks} />
                <RestoreStat label="Files needed" value={restorePreview.missingFiles} />
                <RestoreStat label="Conflicts" value={restorePreview.conflictRecords} />
              </dl>
              <p className="restore-preview__rule">
                Newer records win. Equal timestamps keep the local copy. Missing book
                files remain repairable by importing the same file later.
              </p>
              {restorePreview.warnings.map((warning) => (
                <p className="restore-preview__warning" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          {progress !== null &&
          operationId !== null &&
          progress.kind === "backup-restore" ? (
            <div className="backup-progress" role="status" aria-live="polite">
              <div className="backup-progress__copy">
                <strong>{progress.message}</strong>
                <span>{percentage}%</span>
              </div>
              <div className="backup-progress__track" aria-hidden="true">
                <i style={{ transform: `scaleX(${percentage / 100})` }} />
              </div>
              <button
                type="button"
                className="settings-button settings-button--secondary"
                onClick={() => void handleCancel()}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {restoreResult !== null ? (
            <div className="restore-report" role="status" aria-live="polite">
              <div className="restore-report__title">
                <SuccessIcon />
                <div>
                  <strong>
                    {restoreResult.status === "completed"
                      ? "Restore complete"
                      : "Restore canceled"}
                  </strong>
                  <span>
                    Each retained, merged, and missing item is reported below.
                  </span>
                </div>
              </div>
              <div className="restore-report__counts">
                {Object.entries(restoreResult.counts).map(([status, count]) => (
                  <span key={status}>
                    <strong>{count}</strong> {status}
                  </span>
                ))}
              </div>
              <ul>
                {restoreResult.items.slice(0, 12).map((item) => (
                  <li key={`${item.category}-${item.id}`}>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.message}</small>
                    </span>
                    <em data-status={item.status}>{item.status}</em>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error !== null && errorSource === "restore" ? (
            <div className="backup-result backup-result--error" role="alert">
              <strong>Restore stopped safely</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <footer className="settings-card__footer">
            <p>Changes begin only after inspection and your explicit confirmation.</p>
            {restorePreview === null ? (
              <button
                type="button"
                className="settings-button settings-button--secondary"
                disabled={operationId !== null}
                onClick={() => void handleInspectRestore()}
              >
                <RestoreIcon /> Choose backup
              </button>
            ) : (
              <div className="settings-button-group">
                <button
                  type="button"
                  className="settings-button settings-button--secondary"
                  disabled={operationId !== null}
                  onClick={() => {
                    setRestorePath(null);
                    setRestorePreview(null);
                    setRestoreResult(null);
                  }}
                >
                  Choose another
                </button>
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={!restorePreview.canRestore || operationId !== null}
                  onClick={() => void handleRestore()}
                >
                  Confirm &amp; restore
                </button>
              </div>
            )}
          </footer>
        </section>
      </section>
    </main>
  );
}

function BackupOption({
  checked,
  description,
  label,
  locked = false,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  locked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="backup-option">
      <span className="backup-option__check">
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <i aria-hidden="true">
          <CheckIcon />
        </i>
      </span>
      <span className="backup-option__copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {locked ? <em>Required</em> : null}
    </label>
  );
}

function RestoreStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function createOperationId(prefix = "backup"): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error.replace(/^\[[^\]]+\]\s*/, "");
  return "An unexpected backup error occurred.";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleDateString();
}

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
const BackIcon = () => (
  <SvgIcon>
    <path d="m14.5 5-7 7 7 7" />
    <path d="M8 12h11" />
  </SvgIcon>
);
const CloseIcon = () => (
  <SvgIcon>
    <path d="m6 6 12 12M18 6 6 18" />
  </SvgIcon>
);
const DatabaseIcon = () => (
  <SvgIcon>
    <ellipse cx="12" cy="5" rx="7" ry="3" />
    <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </SvgIcon>
);
const UpdateIcon = () => (
  <SvgIcon>
    <path d="M20 7v5h-5" />
    <path d="M19 12a7 7 0 1 0-2 5" />
  </SvgIcon>
);
const ShieldIcon = () => (
  <SvgIcon>
    <path d="M12 3 5.5 6v5c0 4.2 2.6 7.6 6.5 9 3.9-1.4 6.5-4.8 6.5-9V6L12 3Z" />
    <path d="M12 8v4M12 16h.01" />
  </SvgIcon>
);
const ArchiveIcon = () => (
  <SvgIcon>
    <path d="M4 7h16v13H4zM3 4h18v3H3z" />
    <path d="M9 11h6" />
  </SvgIcon>
);
const ExportIcon = () => (
  <SvgIcon>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M5 14v6h14v-6" />
  </SvgIcon>
);
const RestoreIcon = () => (
  <SvgIcon>
    <path d="M4 7v13h16V7M3 4h18v3H3" />
    <path d="M12 17V9M8.5 13.5 12 17l3.5-3.5" />
  </SvgIcon>
);
const CheckIcon = () => (
  <SvgIcon>
    <path d="m5 12 4 4L19 6" />
  </SvgIcon>
);
const SuccessIcon = () => (
  <SvgIcon>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </SvgIcon>
);
