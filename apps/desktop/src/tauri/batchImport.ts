import type { BatchImportPreview, BatchImportResult } from "@reader/core";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function pickImportFiles(): Promise<string[]> {
  if (!hasTauriRuntime()) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: true,
    filters: [{ name: "Books", extensions: ["epub", "txt", "pdf"] }],
  });
  return Array.isArray(selected) ? selected : selected === null ? [] : [selected];
}

export async function pickImportFolder(): Promise<string[]> {
  if (!hasTauriRuntime()) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? [selected] : [];
}

export async function scanImportPaths(
  operationId: string,
  paths: string[],
): Promise<BatchImportPreview> {
  if (!hasTauriRuntime())
    throw new Error("Batch import requires the Tauri desktop runtime.");
  return invokeCommand("scan_import_paths", { operationId, paths });
}

export async function importBatch(
  operationId: string,
  paths: string[],
): Promise<BatchImportResult> {
  if (!hasTauriRuntime())
    throw new Error("Batch import requires the Tauri desktop runtime.");
  return invokeCommand("import_batch", { operationId, paths });
}

export async function listenForBookDrops(
  handler: (event: { type: "enter" | "leave" | "drop"; paths: string[] }) => void,
): Promise<() => void> {
  if (!hasTauriRuntime()) return () => undefined;
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return getCurrentWebviewWindow().onDragDropEvent((event) => {
    if (event.payload.type === "enter")
      handler({ type: "enter", paths: event.payload.paths });
    if (event.payload.type === "leave") handler({ type: "leave", paths: [] });
    if (event.payload.type === "drop")
      handler({ type: "drop", paths: event.payload.paths });
  });
}
