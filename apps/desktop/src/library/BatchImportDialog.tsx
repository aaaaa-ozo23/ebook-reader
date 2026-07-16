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
      >
        <header>
          <div>
            <p>Review before import</p>
            <h2 id={titleId}>Import books</h2>
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
        {preview !== null ? (
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
                <label key={item.path} className="batch-item" data-status={item.status}>
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
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.message ?? item.path}</small>
                  </span>
                  <em>{item.status}</em>
                </label>
              ))}
            </div>
          </>
        ) : null}
        {progress !== null && result === null ? (
          <div className="batch-progress" role="status">
            {progress.message} · {progress.completed}/{progress.total}
          </div>
        ) : null}
        {result !== null ? (
          <div className="batch-result" role="status">
            <strong>
              {result.status === "completed" ? "Import complete" : "Import canceled"}
            </strong>
            <span>
              {result.items.filter((item) => item.book !== undefined).length} books
              added or repaired.
            </span>
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
          {preview !== null && result === null ? (
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
