import {
  type Book,
  defaultReaderTheme,
  type EpubLocator,
  type Locator,
  type ReaderProgress,
  type ReaderTheme,
  type TxtDocument,
  type TxtLocator,
} from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";
const FALLBACK_EPUB_SOURCES_KEY = "reader:fallback:epubSources";
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

export async function getEpubBookSource(book: Book): Promise<string> {
  if (book.format !== "epub") {
    throw new Error("EPUB source can only be created for epub books.");
  }

  if (!hasTauriRuntime()) {
    const fallbackSource = getFallbackEpubSource(book.id);

    if (fallbackSource !== null) {
      return fallbackSource;
    }

    return book.libraryPath;
  }

  const { convertFileSrc } = await import("@tauri-apps/api/core");

  return convertFileSrc(book.libraryPath);
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

export async function getReadingProgress<TLocator extends Locator = Locator>(
  bookId: string,
): Promise<ReaderProgress<TLocator> | null> {
  if (!hasTauriRuntime()) {
    return getFallbackReadingProgress<TLocator>(bookId);
  }

  return invokeCommand<ReaderProgress<TLocator> | null>("get_reading_progress", { bookId });
}

export async function saveReadingProgress(
  bookId: string,
  locator: TxtLocator | EpubLocator,
  progress?: number,
): Promise<ReaderProgress<TxtLocator | EpubLocator>> {
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

  return invokeCommand<ReaderProgress<TxtLocator | EpubLocator>>("save_reading_progress", {
    bookId,
    locator,
    progress,
  });
}

function getFallbackEpubSource(bookId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSources = window.localStorage.getItem(FALLBACK_EPUB_SOURCES_KEY);

  if (rawSources === null) {
    return null;
  }

  try {
    const sources = JSON.parse(rawSources) as Record<string, string>;
    return sources[bookId] ?? null;
  } catch {
    return null;
  }
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

function getFallbackReadingProgress<TLocator extends Locator>(
  bookId: string,
): ReaderProgress<TLocator> | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawProgress = window.localStorage.getItem(FALLBACK_READING_PROGRESS_KEY);

  if (rawProgress === null) {
    return null;
  }

  try {
    const progressByBook = JSON.parse(rawProgress) as Record<string, ReaderProgress<TLocator>>;
    return progressByBook[bookId] ?? null;
  } catch {
    return null;
  }
}

function setFallbackReadingProgress(
  bookId: string,
  progress: ReaderProgress<TxtLocator | EpubLocator>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const rawProgress = window.localStorage.getItem(FALLBACK_READING_PROGRESS_KEY);
  let progressByBook: Record<string, ReaderProgress<TxtLocator | EpubLocator>> = {};

  if (rawProgress !== null) {
    try {
      progressByBook = JSON.parse(rawProgress) as Record<string, ReaderProgress<TxtLocator | EpubLocator>>;
    } catch {
      progressByBook = {};
    }
  }

  progressByBook[bookId] = progress;
  window.localStorage.setItem(FALLBACK_READING_PROGRESS_KEY, JSON.stringify(progressByBook));
}
