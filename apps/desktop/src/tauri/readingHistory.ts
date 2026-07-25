import type {
  ReadingHistoryExportResult,
  ReadingHistoryPreferences,
  ReadingSession,
  ReadingStatistics,
} from "@reader/core";

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

export async function getReadingHistoryPreferences(): Promise<ReadingHistoryPreferences> {
  if (!hasTauriRuntime()) {
    return { enabled: true, updatedAt: new Date(0).toISOString() };
  }
  return invokeCommand<ReadingHistoryPreferences>("get_reading_history_preferences");
}

export async function saveReadingHistoryPreferences(
  enabled: boolean,
): Promise<ReadingHistoryPreferences> {
  if (!hasTauriRuntime()) {
    return { enabled, updatedAt: new Date().toISOString() };
  }
  return invokeCommand<ReadingHistoryPreferences>("save_reading_history_preferences", {
    enabled,
  });
}

export async function startReadingSession(
  bookId: string,
): Promise<ReadingSession | null> {
  if (!hasTauriRuntime()) return null;
  return invokeCommand<ReadingSession | null>("start_reading_session", { bookId });
}

export async function heartbeatReadingSession(
  sessionId: string,
): Promise<ReadingSession> {
  return invokeCommand<ReadingSession>("heartbeat_reading_session", { sessionId });
}

export async function endReadingSession(sessionId: string): Promise<ReadingSession> {
  return invokeCommand<ReadingSession>("end_reading_session", { sessionId });
}

export async function getReadingStatistics(): Promise<ReadingStatistics> {
  if (!hasTauriRuntime()) {
    return {
      enabled: true,
      activeSession: false,
      todaySeconds: 0,
      last7DaysSeconds: 0,
      totalSeconds: 0,
      daily: [],
      books: [],
    };
  }
  return invokeCommand<ReadingStatistics>("get_reading_statistics");
}

export async function clearReadingHistory(): Promise<ReadingHistoryPreferences> {
  if (!hasTauriRuntime()) {
    return {
      enabled: true,
      updatedAt: new Date().toISOString(),
      clearedAt: new Date().toISOString(),
    };
  }
  return invokeCommand<ReadingHistoryPreferences>("clear_reading_history");
}

export function defaultReadingHistoryFileName(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  return `ebook-reader-reading-history-${localDate}.csv`;
}

export async function pickReadingHistoryDestination(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    throw new Error("CSV export requires the Tauri desktop runtime.");
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: defaultReadingHistoryFileName(),
    filters: [{ name: "Reading history CSV", extensions: ["csv"] }],
  });
}

export async function exportReadingHistory(
  outputPath: string,
): Promise<ReadingHistoryExportResult> {
  return invokeCommand<ReadingHistoryExportResult>("export_reading_history", {
    outputPath,
  });
}

export async function revealReadingHistoryExport(outputPath: string): Promise<void> {
  if (!hasTauriRuntime()) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(outputPath);
}
