import { defaultReaderTheme, type ReaderTheme, type TxtDocument } from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";
const FALLBACK_TXT_DOCUMENTS_KEY = "reader:fallback:txtDocuments";
const FALLBACK_READER_THEME_KEY = "reader:fallback:readerTheme";

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

export async function getReaderTheme(): Promise<ReaderTheme> {
  if (!hasTauriRuntime()) {
    return getFallbackReaderTheme();
  }

  return invokeCommand<ReaderTheme>("get_reader_theme");
}

export async function saveReaderTheme(theme: ReaderTheme): Promise<ReaderTheme> {
  if (!hasTauriRuntime()) {
    setFallbackReaderTheme(theme);
    return theme;
  }

  return invokeCommand<ReaderTheme>("save_reader_theme", { theme });
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

function getFallbackReaderTheme(): ReaderTheme {
  if (typeof window === "undefined") {
    return defaultReaderTheme;
  }

  const rawTheme = window.localStorage.getItem(FALLBACK_READER_THEME_KEY);

  if (rawTheme === null) {
    return defaultReaderTheme;
  }

  try {
    return {
      ...defaultReaderTheme,
      ...(JSON.parse(rawTheme) as Partial<ReaderTheme>),
    };
  } catch {
    return defaultReaderTheme;
  }
}

function setFallbackReaderTheme(theme: ReaderTheme): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(FALLBACK_READER_THEME_KEY, JSON.stringify(theme));
}
