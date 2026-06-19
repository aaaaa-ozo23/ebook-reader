import {
  defaultReaderTheme,
  type ReaderProgress,
  type ReaderTheme,
  type TxtDocument,
  type TxtLocator,
} from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";
const FALLBACK_TXT_DOCUMENTS_KEY = "reader:fallback:txtDocuments";
const FALLBACK_READER_THEME_KEY = "reader:fallback:readerTheme";
const FALLBACK_READING_PROGRESS_KEY = "reader:fallback:readingProgress";

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

export async function getReadingProgress(bookId: string): Promise<ReaderProgress<TxtLocator> | null> {
  if (!hasTauriRuntime()) {
    return getFallbackReadingProgress(bookId);
  }

  return invokeCommand<ReaderProgress<TxtLocator> | null>("get_reading_progress", { bookId });
}

export async function saveReadingProgress(
  bookId: string,
  locator: TxtLocator,
  progress?: number,
): Promise<ReaderProgress<TxtLocator>> {
  if (!hasTauriRuntime()) {
    const savedProgress = {
      bookId,
      locator,
      progress,
      updatedAt: new Date().toISOString(),
    };
    setFallbackReadingProgress(bookId, savedProgress);
    return savedProgress;
  }

  return invokeCommand<ReaderProgress<TxtLocator>>("save_reading_progress", {
    bookId,
    locator,
    progress,
  });
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

function getFallbackReadingProgress(bookId: string): ReaderProgress<TxtLocator> | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawProgress = window.localStorage.getItem(FALLBACK_READING_PROGRESS_KEY);

  if (rawProgress === null) {
    return null;
  }

  try {
    const progressByBook = JSON.parse(rawProgress) as Record<string, ReaderProgress<TxtLocator>>;
    return progressByBook[bookId] ?? null;
  } catch {
    return null;
  }
}

function setFallbackReadingProgress(
  bookId: string,
  progress: ReaderProgress<TxtLocator>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const rawProgress = window.localStorage.getItem(FALLBACK_READING_PROGRESS_KEY);
  let progressByBook: Record<string, ReaderProgress<TxtLocator>> = {};

  if (rawProgress !== null) {
    try {
      progressByBook = JSON.parse(rawProgress) as Record<string, ReaderProgress<TxtLocator>>;
    } catch {
      progressByBook = {};
    }
  }

  progressByBook[bookId] = progress;
  window.localStorage.setItem(FALLBACK_READING_PROGRESS_KEY, JSON.stringify(progressByBook));
}
