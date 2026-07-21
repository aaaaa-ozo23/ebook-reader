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
  const operationIdRef = useRef(createOperationId());
  const [preview, setPreview] = useState<BatchImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<OperationProgress | null>(null);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (paths === null) return;
    let active = true;
    const operationId = operationIdRef.current;
    void scanImportPaths(operationId, paths).then(
      (next) => {
        if (!active) return;
        setPreview(next);
        setSelected(
          new Set(next.items.filter((item) => item.selected).map((item) => item.path)),
        );
      },
      (nextError) => active && setError(errorMessage(nextError)),
    );
    return () => {
      active = false;
    };
  }, [paths]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenForDataOperationProgress((next) => {
      if (next.operationId === operationIdRef.current) setProgress(next);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);

  const counts = useMemo(() => {
    const next = new Map<string, number>();
    for (const item of preview?.items ?? [])
      next.set(item.status, (next.get(item.status) ?? 0) + 1);
    return [...next.entries()];
  }, [preview]);
  const isImporting = progress !== null && result === null;
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
    operationIdRef.current = createOperationId();
    try {
      const next = await importBatch(operationIdRef.current, [...selected]);
      setResult(next);
      onImported(
        next.items.flatMap((item) => (item.book === undefined ? [] : [item.book])),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  };

  return (
    <div className="batch-dialog-backdrop">
      <section
        className="batch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-view={result !== null ? "result" : isImporting ? "progress" : "preview"}
      >
        <header>
          <div>
            <p>
              {result !== null
                ? "Import report"
                : isImporting
                  ? "Local conversion"
                  : "Review before import"}
            </p>
            <h2 id={titleId}>
              {result !== null
                ? resultCounts.issues.length > 0
                  ? "Some books need attention"
                  : "Import complete"
                : isImporting
                  ? "Importing books"
                  : "Import books"}
            </h2>
          </div>
          <button type="button" aria-label="Close import preview" onClick={onClose}>
            ×
          </button>
        </header>
        {preview === null && error === null ? (
          <div className="batch-scanning" role="status">
            Scanning folders and checking duplicates…
          </div>
        ) : null}
        {preview !== null && !isImporting && result === null ? (
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
        {isImporting ? (
          <div className="batch-progress" role="status">
            <div className="batch-progress__current">
              <i className="batch-item__format" aria-hidden="true">
                {formatBadge(progress.message)}
              </i>
              <span>
                <strong>{progress.message}</strong>
                <small>
                  {progress.phase === "converting"
                    ? "Converting locally with libmobi 0.12"
                    : phaseLabel(progress.phase)}
                </small>
              </span>
              <em>
                {Math.min(progress.completed + 1, progress.total)} of {progress.total}
              </em>
            </div>
            <div className="batch-progress__meter" aria-hidden="true">
              <span
                style={{
                  width: `${Math.max(8, (progress.completed / Math.max(1, progress.total)) * 100)}%`,
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
                <li key={phase} data-active={phase === progress.phase}>
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
          {progress !== null && result === null ? (
            <button
              type="button"
              className="dialog-button"
              onClick={() => void cancelDataOperation(operationIdRef.current)}
            >
              Cancel import
            </button>
          ) : null}
          <button type="button" className="dialog-button" onClick={onClose}>
            {result === null ? "Cancel" : "Done"}
          </button>
          {preview !== null && !isImporting && result === null ? (
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
