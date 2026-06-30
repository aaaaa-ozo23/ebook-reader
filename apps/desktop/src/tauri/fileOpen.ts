export type StopListening = () => void;
export type OpenBookFilesHandler = (paths: string[]) => void | Promise<void>;

const OPEN_BOOK_FILES_EVENT = "open-book-files";

export async function takePendingOpenFiles(): Promise<string[]> {
  if (!hasTauriRuntime()) {
    return [];
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("take_pending_open_files");
}

export async function listenForOpenBookFiles(
  handler: OpenBookFilesHandler,
): Promise<StopListening> {
  if (!hasTauriRuntime()) {
    return () => undefined;
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<string[]>(OPEN_BOOK_FILES_EVENT, (event) => {
    void handler(event.payload);
  });
}

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
