import {
  type Annotation,
  type AnnotationKind,
  type Bookmark,
  type Book,
  defaultReaderTheme,
  type EpubLocator,
  type Locator,
  type PdfLocator,
  type ReaderProgress,
  type ReaderTheme,
  type TxtDocument,
  type TxtLocator,
} from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";
const FALLBACK_EPUB_SOURCES_KEY = "reader:fallback:epubSources";
const FALLBACK_PDF_SOURCES_KEY = "reader:fallback:pdfSources";
const FALLBACK_TXT_DOCUMENTS_KEY = "reader:fallback:txtDocuments";
const FALLBACK_ANNOTATIONS_KEY = "reader:fallback:annotations";
const FALLBACK_BOOKMARKS_KEY = "reader:fallback:bookmarks";
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

export async function getPdfBookSource(book: Book): Promise<string> {
  if (book.format !== "pdf") {
    throw new Error("PDF source can only be created for pdf books.");
  }

  if (!hasTauriRuntime()) {
    const fallbackSource = getFallbackPdfSource(book.id);

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
  locator: Locator,
  progress?: number,
): Promise<ReaderProgress<Locator>> {
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

  return invokeCommand<ReaderProgress<Locator>>("save_reading_progress", {
    bookId,
    locator,
    progress,
  });
}

export async function listBookmarks<TLocator extends Locator = Locator>(
  bookId: string,
): Promise<Array<Bookmark<TLocator>>> {
  if (!hasTauriRuntime()) {
    return getFallbackBookmarks<TLocator>(bookId);
  }

  return invokeCommand<Array<Bookmark<TLocator>>>("list_bookmarks", { bookId });
}

export async function createBookmark<TLocator extends Locator = Locator>(
  bookId: string,
  locator: TLocator,
  label?: string,
): Promise<Bookmark<TLocator>> {
  if (!hasTauriRuntime()) {
    const bookmark: Bookmark<TLocator> = {
      id: createFallbackId(),
      bookId,
      locator,
      label: normalizeBookmarkLabel(label),
      createdAt: new Date().toISOString(),
    };
    setFallbackBookmarks(bookId, [bookmark, ...getFallbackBookmarks<TLocator>(bookId)]);
    return bookmark;
  }

  return invokeCommand<Bookmark<TLocator>>("create_bookmark", {
    bookId,
    locator,
    label,
  });
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  if (!hasTauriRuntime()) {
    deleteFallbackBookmark(bookmarkId);
    return;
  }

  return invokeCommand<void>("delete_bookmark", { bookmarkId });
}

export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  if (!hasTauriRuntime()) {
    return getFallbackAnnotations(bookId);
  }

  return invokeCommand<Annotation[]>("list_annotations", { bookId });
}

export async function createAnnotation(
  bookId: string,
  annotationType: AnnotationKind,
  locator: Locator,
  color?: string,
  selectedText?: string,
  note?: string,
): Promise<Annotation> {
  if (!hasTauriRuntime()) {
    const now = new Date().toISOString();
    const annotation: Annotation = {
      id: createFallbackId(),
      bookId,
      type: annotationType,
      color: normalizeOptionalText(color),
      selectedText: normalizeOptionalText(selectedText),
      note: normalizeOptionalText(note),
      locator,
      createdAt: now,
      updatedAt: now,
    };
    setFallbackAnnotations(bookId, [annotation, ...getFallbackAnnotations(bookId)]);
    return annotation;
  }

  return invokeCommand<Annotation>("create_annotation", {
    bookId,
    annotationType,
    locator,
    color,
    selectedText,
    note,
  });
}

export async function updateAnnotation(
  annotationId: string,
  color?: string,
  note?: string,
): Promise<Annotation> {
  if (!hasTauriRuntime()) {
    return updateFallbackAnnotation(annotationId, color, note);
  }

  return invokeCommand<Annotation>("update_annotation", {
    annotationId,
    color,
    note,
  });
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  if (!hasTauriRuntime()) {
    deleteFallbackAnnotation(annotationId);
    return;
  }

  return invokeCommand<void>("delete_annotation", { annotationId });
}

function getFallbackPdfSource(bookId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSources = window.localStorage.getItem(FALLBACK_PDF_SOURCES_KEY);

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
  progress: ReaderProgress<TxtLocator | EpubLocator | PdfLocator>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const rawProgress = window.localStorage.getItem(FALLBACK_READING_PROGRESS_KEY);
  let progressByBook: Record<string, ReaderProgress<TxtLocator | EpubLocator | PdfLocator>> = {};

  if (rawProgress !== null) {
    try {
      progressByBook = JSON.parse(rawProgress) as Record<
        string,
        ReaderProgress<TxtLocator | EpubLocator | PdfLocator>
      >;
    } catch {
      progressByBook = {};
    }
  }

  progressByBook[bookId] = progress;
  window.localStorage.setItem(FALLBACK_READING_PROGRESS_KEY, JSON.stringify(progressByBook));
}

function getFallbackBookmarks<TLocator extends Locator>(
  bookId: string,
): Array<Bookmark<TLocator>> {
  if (typeof window === "undefined") {
    return [];
  }

  const rawBookmarks = window.localStorage.getItem(FALLBACK_BOOKMARKS_KEY);

  if (rawBookmarks === null) {
    return [];
  }

  try {
    const bookmarksByBook = JSON.parse(rawBookmarks) as Record<
      string,
      Array<Bookmark<TLocator>>
    >;
    return bookmarksByBook[bookId] ?? [];
  } catch {
    return [];
  }
}

function setFallbackBookmarks<TLocator extends Locator>(
  bookId: string,
  bookmarks: Array<Bookmark<TLocator>>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const rawBookmarks = window.localStorage.getItem(FALLBACK_BOOKMARKS_KEY);
  let bookmarksByBook: Record<string, Array<Bookmark<Locator>>> = {};

  if (rawBookmarks !== null) {
    try {
      bookmarksByBook = JSON.parse(rawBookmarks) as Record<string, Array<Bookmark<Locator>>>;
    } catch {
      bookmarksByBook = {};
    }
  }

  bookmarksByBook[bookId] = bookmarks as Array<Bookmark<Locator>>;
  window.localStorage.setItem(FALLBACK_BOOKMARKS_KEY, JSON.stringify(bookmarksByBook));
}

function deleteFallbackBookmark(bookmarkId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const rawBookmarks = window.localStorage.getItem(FALLBACK_BOOKMARKS_KEY);

  if (rawBookmarks === null) {
    return;
  }

  try {
    const bookmarksByBook = JSON.parse(rawBookmarks) as Record<
      string,
      Array<Bookmark<Locator>>
    >;
    const nextBookmarksByBook = Object.fromEntries(
      Object.entries(bookmarksByBook).map(([bookId, bookmarks]) => [
        bookId,
        bookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
      ]),
    );
    window.localStorage.setItem(
      FALLBACK_BOOKMARKS_KEY,
      JSON.stringify(nextBookmarksByBook),
    );
  } catch {
    window.localStorage.removeItem(FALLBACK_BOOKMARKS_KEY);
  }
}

function getFallbackAnnotations(bookId: string): Annotation[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawAnnotations = window.localStorage.getItem(FALLBACK_ANNOTATIONS_KEY);

  if (rawAnnotations === null) {
    return [];
  }

  try {
    const annotationsByBook = JSON.parse(rawAnnotations) as Record<
      string,
      Annotation[]
    >;
    return (annotationsByBook[bookId] ?? []).filter(
      (annotation) => annotation.deletedAt === undefined,
    );
  } catch {
    return [];
  }
}

function setFallbackAnnotations(bookId: string, annotations: Annotation[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const rawAnnotations = window.localStorage.getItem(FALLBACK_ANNOTATIONS_KEY);
  let annotationsByBook: Record<string, Annotation[]> = {};

  if (rawAnnotations !== null) {
    try {
      annotationsByBook = JSON.parse(rawAnnotations) as Record<string, Annotation[]>;
    } catch {
      annotationsByBook = {};
    }
  }

  annotationsByBook[bookId] = annotations;
  window.localStorage.setItem(FALLBACK_ANNOTATIONS_KEY, JSON.stringify(annotationsByBook));
}

function updateFallbackAnnotation(
  annotationId: string,
  color?: string,
  note?: string,
): Annotation {
  if (typeof window === "undefined") {
    throw new Error(`annotation not found: ${annotationId}`);
  }

  const rawAnnotations = window.localStorage.getItem(FALLBACK_ANNOTATIONS_KEY);

  if (rawAnnotations === null) {
    throw new Error(`annotation not found: ${annotationId}`);
  }

  const annotationsByBook = JSON.parse(rawAnnotations) as Record<string, Annotation[]>;

  for (const [bookId, annotations] of Object.entries(annotationsByBook)) {
    const annotationIndex = annotations.findIndex(
      (annotation) => annotation.id === annotationId && annotation.deletedAt === undefined,
    );

    if (annotationIndex === -1) {
      continue;
    }

    const currentAnnotation = annotations[annotationIndex];
    const updatedAnnotation: Annotation = {
      ...currentAnnotation,
      color: normalizeOptionalText(color) ?? currentAnnotation.color,
      note: normalizeOptionalText(note),
      updatedAt: new Date().toISOString(),
    };
    annotationsByBook[bookId] = annotations.map((annotation) =>
      annotation.id === annotationId ? updatedAnnotation : annotation,
    );
    window.localStorage.setItem(
      FALLBACK_ANNOTATIONS_KEY,
      JSON.stringify(annotationsByBook),
    );

    return updatedAnnotation;
  }

  throw new Error(`annotation not found: ${annotationId}`);
}

function deleteFallbackAnnotation(annotationId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const rawAnnotations = window.localStorage.getItem(FALLBACK_ANNOTATIONS_KEY);

  if (rawAnnotations === null) {
    return;
  }

  try {
    const annotationsByBook = JSON.parse(rawAnnotations) as Record<
      string,
      Annotation[]
    >;
    const deletedAt = new Date().toISOString();
    const nextAnnotationsByBook = Object.fromEntries(
      Object.entries(annotationsByBook).map(([bookId, annotations]) => [
        bookId,
        annotations.map((annotation) =>
          annotation.id === annotationId
            ? { ...annotation, deletedAt, updatedAt: deletedAt }
            : annotation,
        ),
      ]),
    );
    window.localStorage.setItem(
      FALLBACK_ANNOTATIONS_KEY,
      JSON.stringify(nextAnnotationsByBook),
    );
  } catch {
    window.localStorage.removeItem(FALLBACK_ANNOTATIONS_KEY);
  }
}

function createFallbackId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `bookmark-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function normalizeBookmarkLabel(label: string | undefined): string | undefined {
  const normalizedLabel = label?.trim();
  return normalizedLabel === "" ? undefined : normalizedLabel;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue === "" ? undefined : normalizedValue;
}
