import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  BatchImportPreview,
  BatchImportResult,
  Book,
  OperationProgress,
} from "@reader/core";

import { cancelDataOperation, listenForDataOperationProgress } from "../tauri/backup";
import { importBatch, scanImportPaths } from "../tauri/batchImport";

export function BatchImportDialog({
  paths,
  onClose,
  onImported,
}: {
  paths: string[] | null;
  onClose: () => void;
  onImported: (books: Book[]) => void;
}) {
  const scanOperationIdRef = useRef(createOperationId());
  const importOperationIdRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<BatchImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanProgress, setScanProgress] = useState<OperationProgress | null>(null);
  const [importProgress, setImportProgress] = useState<OperationProgress | null>(null);
  const [view, setView] = useState<"scanning" | "preview" | "importing" | "result">(
    "scanning",
  );
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (paths === null) return;
    let active = true;
    const operationId = createOperationId();
    scanOperationIdRef.current = operationId;
    let unlisten: (() => void) | undefined;
    const startScan = () => {
      if (!active) return;
      void scanImportPaths(operationId, paths).then(
        (next) => {
          if (!active) return;
          setScanProgress(null);
          setPreview(next);
          setSelected(
            new Set(
              next.items.filter((item) => item.selected).map((item) => item.path),
            ),
          );
          setView("preview");
        },
        (nextError) => {
          if (!active) return;
          setScanProgress(null);
          setError(errorMessage(nextError));
          setView("preview");
        },
      );
    };
    void listenForDataOperationProgress((next) => {
      if (next.operationId === scanOperationIdRef.current) setScanProgress(next);
      if (next.operationId === importOperationIdRef.current) setImportProgress(next);
    }).then((stop) => {
      if (!active) {
        stop();
        return;
      }
      unlisten = stop;
      startScan();
    }, startScan);
    return () => {
      active = false;
      unlisten?.();
    };
  }, [paths]);

  const counts = useMemo(() => {
    const next = new Map<string, number>();
    for (const item of preview?.items ?? [])
      next.set(item.status, (next.get(item.status) ?? 0) + 1);
    return [...next.entries()];
  }, [preview]);
  const resultCounts = useMemo(() => {
    const imported =
      result?.items.filter((item) => item.book !== undefined).length ?? 0;
    const issues = result?.items.filter((item) => item.status === "error") ?? [];
    return { imported, issues };
  }, [result]);

  if (paths === null) return null;

  const handleImport = async () => {
    setError(null);
    setResult(null);
    setImportProgress(null);
    setView("importing");
    const operationId = createOperationId();
    importOperationIdRef.current = operationId;
    try {
      const next = await importBatch(operationId, [...selected]);
      setResult(next);
      setView("result");
      onImported(
        next.items.flatMap((item) => (item.book === undefined ? [] : [item.book])),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
      setView("preview");
    }
  };

  const cancelAndClose = () => {
    const operationId =
      view === "importing"
        ? importOperationIdRef.current
        : view === "scanning"
          ? scanOperationIdRef.current
          : null;
    if (operationId !== null) void cancelDataOperation(operationId);
    onClose();
  };

  const displayedImportProgress =
    importProgress ??
    ({
      operationId: "pending-import",
      kind: "batch-import",
      phase: "hashing",
      completed: 0,
      total: selected.size,
      message: "Preparing selected books",
    } satisfies OperationProgress);

  return (
    <div className="batch-dialog-backdrop">
      <section
        className="batch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-view={view}
      >
        <header>
          <div>
            <p>
              {view === "result"
                ? "Import report"
                : view === "importing"
                  ? "Local conversion"
                  : view === "scanning"
                    ? "Preparing import"
                    : "Review before import"}
            </p>
            <h2 id={titleId}>
              {view === "result"
                ? resultCounts.issues.length > 0
                  ? "Some books need attention"
                  : "Import complete"
                : view === "importing"
                  ? "Importing books"
                  : view === "scanning"
                    ? "Scanning folder"
                    : "Import books"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close import preview"
            onClick={cancelAndClose}
          >
            ×
          </button>
        </header>
        {view === "scanning" && error === null ? (
          <div className="batch-scan-progress" role="status" aria-live="polite">
            <div className="batch-progress__current">
              <i className="batch-item__format" aria-hidden="true">
                SCAN
              </i>
              <span>
                <strong>
                  {scanProgress?.phase === "hashing"
                    ? "Checking discovered books"
                    : "Discovering books in this folder"}
                </strong>
                <small>
                  {scanProgress?.phase === "hashing"
                    ? scanProgress.message
                    : "Scanning supported files and nested folders"}
                </small>
              </span>
              <em>
                {scanProgress?.phase === "hashing" && scanProgress.total > 0
                  ? `${scanProgress.completed} of ${scanProgress.total}`
                  : "Local only"}
              </em>
            </div>
            <div
              className="batch-progress__meter"
              data-indeterminate={scanProgress?.phase !== "hashing"}
              aria-hidden="true"
            >
              <span
                style={
                  scanProgress?.phase === "hashing"
                    ? {
                        width: `${(scanProgress.completed / Math.max(1, scanProgress.total)) * 100}%`,
                      }
                    : undefined
                }
              />
            </div>
            <ol className="batch-scan-progress__stages" aria-label="Folder scan stages">
              <li
                data-state={scanProgress?.phase === "hashing" ? "complete" : "active"}
              >
                Scanning
              </li>
              <li data-state={scanProgress?.phase === "hashing" ? "active" : "pending"}>
                Hashing
              </li>
              <li data-state="pending">Preview</li>
            </ol>
            <p className="batch-progress__privacy">
              The folder stays on this computer. No book content is uploaded.
            </p>
          </div>
        ) : null}
        {preview !== null && view === "preview" ? (
          <>
            <div className="batch-summary">
              {counts.map(([status, count]) => (
                <span key={status} data-status={status}>
                  <strong>{count}</strong>
                  {status}
                </span>
              ))}
              {preview.truncated ? (
                <span data-status="error">10,000 item limit reached</span>
              ) : null}
            </div>
            {preview.items.length === 0 ? (
              <div className="batch-empty-preview" role="status">
                <strong>No supported books found</strong>
                <span>
                  Choose another folder containing EPUB, TXT, PDF, MOBI, or AZW3.
                </span>
              </div>
            ) : null}
            <div className="batch-list" role="list" aria-label="Import preview">
              {preview.items.map((item) => (
                <label
                  key={item.path}
                  className="batch-item"
                  data-status={item.status}
                  role="listitem"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.path)}
                    disabled={item.status !== "valid"}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(item.path);
                        else next.delete(item.path);
                        return next;
                      })
                    }
                  />
                  <i className="batch-item__format" aria-hidden="true">
                    {formatBadge(item.path)}
                  </i>
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.status === "valid" && isMobiPath(item.path)
                        ? `${formatFromPath(item.path)} · Will convert locally to EPUB`
                        : item.status === "error"
                          ? friendlyImportMessage(item.message)
                          : (item.message ?? item.path)}
                    </small>
                  </span>
                  <em>{item.status}</em>
                </label>
              ))}
            </div>
          </>
        ) : null}
        {view === "importing" ? (
          <div className="batch-progress" role="status">
            <div className="batch-progress__current">
              <i className="batch-item__format" aria-hidden="true">
                {formatBadge(displayedImportProgress.message)}
              </i>
              <span>
                <strong>{displayedImportProgress.message}</strong>
                <small>
                  {displayedImportProgress.phase === "converting"
                    ? "Converting locally with libmobi 0.12"
                    : phaseLabel(displayedImportProgress.phase)}
                </small>
              </span>
              <em>
                {Math.min(
                  displayedImportProgress.completed + 1,
                  displayedImportProgress.total,
                )}{" "}
                of {displayedImportProgress.total}
              </em>
            </div>
            <div className="batch-progress__meter" aria-hidden="true">
              <span
                style={{
                  width: `${Math.max(
                    8,
                    (displayedImportProgress.completed /
                      Math.max(1, displayedImportProgress.total)) *
                      100,
                  )}%`,
                }}
              />
            </div>
            <ol className="batch-progress__stages" aria-label="Import stages">
              {[
                "scanning",
                "hashing",
                "converting",
                "validating",
                "committing",
                "complete",
              ].map((phase) => (
                <li
                  key={phase}
                  data-state={importStageState(displayedImportProgress.phase, phase)}
                >
                  {phase === "complete" ? "Completed" : phaseLabel(phase)}
                </li>
              ))}
            </ol>
            <p className="batch-progress__privacy">
              The source file stays on this computer. No book content is uploaded.
            </p>
          </div>
        ) : null}
        {result !== null ? (
          <div className="batch-result" role="status">
            <section className="batch-result__summary">
              <span aria-hidden="true">
                {resultCounts.issues.length > 0 ? "!" : "✓"}
              </span>
              <strong>
                {resultCounts.imported} of {result.items.length} imported
              </strong>
              <p>
                Successful books are already on the shelf. Failed items did not create
                library records or leftover files.
              </p>
              {resultCounts.issues.some((item) =>
                item.message?.includes("mobi-drm-unsupported"),
              ) ? (
                <aside className="batch-result__drm">
                  <strong>DRM-protected file</strong>
                  <p>
                    This file is protected. Ebook Reader will not attempt to remove DRM.
                    Use an unprotected copy from its publisher or seller.
                  </p>
                </aside>
              ) : null}
            </section>
            <ul className="batch-result__items" aria-label="Import item results">
              {result.items.map((item) => (
                <li key={item.path} data-status={item.status}>
                  <i aria-hidden="true">{item.book === undefined ? "!" : "✓"}</i>
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.book === undefined
                        ? friendlyImportMessage(item.message)
                        : isMobiPath(item.path)
                          ? "Imported · converted locally to EPUB"
                          : "Imported"}
                    </small>
                  </span>
                  <em>
                    {item.book === undefined
                      ? importIssueLabel(item.message)
                      : formatBadge(item.path)}
                  </em>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {error === null ? null : (
          <div className="details-error" role="alert">
            {error}
          </div>
        )}
        <footer>
          {view === "scanning" ? (
            <button type="button" className="dialog-button" onClick={cancelAndClose}>
              Cancel scan
            </button>
          ) : null}
          {view === "importing" ? (
            <button
              type="button"
              className="dialog-button"
              onClick={() => {
                if (importOperationIdRef.current !== null)
                  void cancelDataOperation(importOperationIdRef.current);
              }}
            >
              Cancel import
            </button>
          ) : null}
          {view !== "scanning" ? (
            <button type="button" className="dialog-button" onClick={cancelAndClose}>
              {view === "result" ? "Done" : "Cancel"}
            </button>
          ) : null}
          {preview !== null && view === "preview" ? (
            <button
              type="button"
              className="dialog-button dialog-button--primary"
              disabled={selected.size === 0}
              onClick={() => void handleImport()}
            >
              Import {selected.size} selected
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function createOperationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error).replace(/^\[[^\]]+\]\s*/, "");
}

function formatFromPath(path: string): "MOBI" | "AZW3" {
  return path.toLowerCase().endsWith(".azw3") ? "AZW3" : "MOBI";
}

function formatBadge(path: string): string {
  return path.split(".").pop()?.slice(0, 4).toUpperCase() ?? "FILE";
}

function isMobiPath(path: string): boolean {
  return /\.(mobi|azw3)$/i.test(path);
}

function friendlyImportMessage(message?: string): string {
  if (message?.includes("[mobi-drm-unsupported]")) {
    return "This file is protected. Ebook Reader will not attempt to remove DRM.";
  }
  return message?.replace(/^\[[^\]]+\]\s*/, "") ?? "Import failed";
}

function importIssueLabel(message?: string): string {
  return message?.includes("mobi-drm-unsupported") ? "DRM" : "Failed";
}

function phaseLabel(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

const IMPORT_STAGES = [
  "scanning",
  "hashing",
  "converting",
  "validating",
  "committing",
  "complete",
] as const;

function importStageState(currentPhase: string, phase: string): string {
  const currentIndex = IMPORT_STAGES.indexOf(
    currentPhase as (typeof IMPORT_STAGES)[number],
  );
  const phaseIndex = IMPORT_STAGES.indexOf(phase as (typeof IMPORT_STAGES)[number]);
  if (phaseIndex < currentIndex) return "complete";
  return phaseIndex === currentIndex ? "active" : "pending";
}
