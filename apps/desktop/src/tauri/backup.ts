import type {
  BackupOptions,
  BackupResult,
  OperationProgress,
  RestorePreview,
  RestoreResult,
} from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "Backup requires the Tauri desktop runtime.";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export function defaultBackupFileName(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  return `ebook-reader-backup-${localDate}.erbackup`;
}

export async function pickBackupDestination(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: defaultBackupFileName(),
    filters: [{ name: "Ebook Reader backup", extensions: ["erbackup"] }],
  });
}

export async function pickBackupFile(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Ebook Reader backup", extensions: ["erbackup"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function exportBackup(
  operationId: string,
  outputPath: string,
  options: BackupOptions,
): Promise<BackupResult> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  return invokeCommand<BackupResult>("export_backup", {
    operationId,
    outputPath,
    options,
  });
}

export async function inspectBackup(
  operationId: string,
  path: string,
): Promise<RestorePreview> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  return invokeCommand<RestorePreview>("inspect_backup", { operationId, path });
}

export async function restoreBackup(
  operationId: string,
  path: string,
): Promise<RestoreResult> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  return invokeCommand<RestoreResult>("restore_backup", { operationId, path });
}

export async function cancelDataOperation(operationId: string): Promise<boolean> {
  if (!hasTauriRuntime()) {
    return false;
  }
  return invokeCommand<boolean>("cancel_data_operation", { operationId });
}

export async function listenForDataOperationProgress(
  handler: (progress: OperationProgress) => void,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => undefined;
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<OperationProgress>("data-operation-progress", (event) => {
    handler(event.payload);
  });
}
