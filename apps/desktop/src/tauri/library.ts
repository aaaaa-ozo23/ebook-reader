import type { Book, ImportBookResult } from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");

  return invoke<T>(command, args);
}

export async function listBooks(): Promise<Book[]> {
  if (!hasTauriRuntime()) {
    return [];
  }

  return invokeCommand<Book[]>("list_books");
}

export async function importBook(path: string): Promise<ImportBookResult> {
  if (!hasTauriRuntime()) {
    throw new Error(`Importing books failed. ${DESKTOP_RUNTIME_ERROR}`);
  }

  return invokeCommand<ImportBookResult>("import_book", { path });
}

export async function markBookOpened(bookId: string): Promise<Book> {
  if (!hasTauriRuntime()) {
    throw new Error(`Opening a book failed. ${DESKTOP_RUNTIME_ERROR}`);
  }

  return invokeCommand<Book>("mark_book_opened", { bookId });
}

export async function pickBookFile(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    return null;
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Books",
        extensions: ["epub", "txt", "pdf"],
      },
    ],
  });

  if (Array.isArray(selected)) {
    return selected[0] ?? null;
  }

  return selected;
}
