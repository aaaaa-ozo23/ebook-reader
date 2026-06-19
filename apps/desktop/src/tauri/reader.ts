import type { TxtDocument } from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";
const FALLBACK_TXT_DOCUMENTS_KEY = "reader:fallback:txtDocuments";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");

  return invoke<T>(command, args);
}

export async function openTxtBook(bookId: string): Promise<TxtDocument> {
  if (!hasTauriRuntime()) {
    const fallbackDocument = getFallbackTxtDocument(bookId);

    if (fallbackDocument !== null) {
      return fallbackDocument;
    }

    throw new Error(`Opening TXT books failed. ${DESKTOP_RUNTIME_ERROR}`);
  }

  return invokeCommand<TxtDocument>("open_txt_book", { bookId });
}

function getFallbackTxtDocument(bookId: string): TxtDocument | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawDocuments = window.localStorage.getItem(FALLBACK_TXT_DOCUMENTS_KEY);

  if (rawDocuments === null) {
    return null;
  }

  try {
    const documents = JSON.parse(rawDocuments) as Record<string, TxtDocument>;
    return documents[bookId] ?? null;
  } catch {
    return null;
  }
}
