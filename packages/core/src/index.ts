export type BookFormat = "epub" | "txt" | "pdf" | "mobi" | "azw3";
export type ReaderFormat = "epub" | "txt" | "pdf";
export type BookCoverStatus = "pending" | "ready" | "fallback";
export type BookAvailability = "available" | "missing";

export type AnnotationKind = "highlight" | "note";

export type ReaderThemeMode = "light" | "dark" | "sepia" | "green";

export type PageTransitionMode = "none" | "slide" | "cover" | "page-curl";
export type EpubViewMode = "paginated";
export type TxtViewMode = "scroll" | "paginated";
export type TxtPaginatedViewMode = "single" | "double";
export type PdfPaginatedViewMode = "single" | "double";
export type PdfViewMode = "single" | "double" | "continuous";
export type ReaderViewMode = EpubViewMode | TxtViewMode | PdfViewMode;

export interface ReaderCapabilities {
  viewModes: readonly ReaderViewMode[];
  pageTransitions: readonly PageTransitionMode[];
  supportsPublicationPageLabels: boolean;
  supportsImageViewer: boolean;
}

export interface ReaderExperiencePreferences {
  epub: {
    viewMode: EpubViewMode;
    transition: PageTransitionMode;
  };
  txt: {
    viewMode: TxtViewMode;
    paginatedViewMode: TxtPaginatedViewMode;
    transition: PageTransitionMode;
  };
  pdf: {
    viewMode: PdfViewMode;
    paginatedViewMode: PdfPaginatedViewMode;
    transition: PageTransitionMode;
  };
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  sourcePath?: string;
  libraryPath: string;
  fileHash: string;
  readerFormat: ReaderFormat;
  readerPath: string;
  readerHash: string;
  coverPath?: string;
  coverStatus: BookCoverStatus;
  availability?: BookAvailability;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

export type BookCoverOrigin = "automatic" | "user" | "fallback";

export interface BookDetails {
  book: Book;
  automaticTitle: string;
  automaticAuthor?: string;
  automaticCoverPath?: string;
  coverOrigin: BookCoverOrigin;
  titleOverrideUpdatedAt?: string;
  authorOverrideUpdatedAt?: string;
  coverOverrideUpdatedAt?: string;
}

export type MetadataOverridePatch =
  | { action: "unchanged" }
  | { action: "set"; value: string }
  | { action: "reset" };

export interface BookMetadataOverridePatch {
  title: MetadataOverridePatch;
  author: MetadataOverridePatch;
}

export type ImportBookStatus = "imported" | "duplicate" | "repaired";

export interface ImportBookResult {
  status: ImportBookStatus;
  book: Book;
}

export type BatchImportItemStatus =
  | "valid"
  | "duplicate"
  | "unsupported"
  | "missing"
  | "error"
  | "imported"
  | "repaired"
  | "canceled";

export interface BatchImportPreviewItem {
  path: string;
  name: string;
  status: BatchImportItemStatus;
  selected: boolean;
  fileHash?: string;
  message?: string;
}

export interface BatchImportPreview {
  operationId: string;
  items: BatchImportPreviewItem[];
  truncated: boolean;
}

export interface BatchImportResultItem extends BatchImportPreviewItem {
  book?: Book;
}

export interface BatchImportResult {
  operationId: string;
  status: "completed" | "canceled";
  items: BatchImportResultItem[];
}

export interface RemoveBookResult {
  book: Book;
  removedLibraryPath: string;
}

export interface TxtChapter {
  id: string;
  title: string;
  startChar: number;
  endChar: number;
  text: string;
}

export interface TxtDocument {
  book: Book;
  encoding: string;
  byteLength: number;
  charCount: number;
  lineCount: number;
  chapters: TxtChapter[];
}

export interface TocItem {
  id: string;
  title: string;
  href?: string;
  locator?: Locator;
  children?: TocItem[];
}

export interface ReaderTheme {
  mode: ReaderThemeMode;
  fontId?: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  pageMargin: number;
  backgroundColor: string;
  textColor: string;
}

export interface CustomFont {
  id: string;
  familyName: string;
  styleName: string;
  fileName: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
  familyAlias: string;
  enabled: boolean;
  importedAt: string;
  updatedAt: string;
}

export interface ImportCustomFontResult {
  status: "imported" | "duplicate";
  font: CustomFont;
}

export interface CustomFontPreview {
  familyName: string;
  styleName: string;
  fileName: string;
  fileSize: number;
  duplicateFont?: CustomFont;
}

export interface ReaderLayoutPreferences {
  sidebarWidth: number;
}

export const defaultReaderLayoutPreferences: ReaderLayoutPreferences = {
  sidebarWidth: 366,
};

export interface LocatorContext {
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface TxtLocator extends LocatorContext {
  kind: "txt";
  chapterId?: string;
  charOffset: number;
  endCharOffset?: number;
}

export interface EpubLocator extends LocatorContext {
  kind: "epub";
  href: string;
  cfi?: string;
  progression?: number;
}

export interface PdfLocator extends LocatorContext {
  kind: "pdf";
  page: number;
  pageOffsetRatio?: number;
  zoomMode?: "fit-width" | "custom";
  rects?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  scale?: number;
}

export type Locator = TxtLocator | EpubLocator | PdfLocator;

export interface ReaderProgress<TLocator extends Locator = Locator> {
  bookId: string;
  locator: TLocator;
  progress?: number;
  updatedAt: string;
}

export interface Bookmark<TLocator extends Locator = Locator> {
  id: string;
  bookId: string;
  locator: TLocator;
  label?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupOptions {
  includeData: boolean;
  includeCovers: boolean;
  includeBooks: boolean;
}

export type DataOperationKind = "backup-export" | "backup-restore" | "batch-import";
export type OperationProgressPhase =
  | "preparing"
  | "scanning"
  | "hashing"
  | "converting"
  | "validating"
  | "reading"
  | "writing"
  | "verifying"
  | "committing"
  | "complete"
  | "canceled";

export interface OperationProgress {
  operationId: string;
  kind: DataOperationKind;
  phase: OperationProgressPhase;
  completed: number;
  total: number;
  message: string;
}

export interface BackupPayloadDescriptor {
  path: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  formatIdentifier: "ebook-reader-backup";
  formatVersion: 1 | 2;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  options: BackupOptions;
  recordCounts: Record<string, number>;
  payloads: BackupPayloadDescriptor[];
}

export interface BackupResult {
  operationId: string;
  status: "completed" | "canceled";
  outputPath?: string;
  fileName?: string;
  bytesWritten: number;
  manifest?: BackupManifest;
}

export interface BackupPreview {
  operationId: string;
  fileName: string;
  manifest: BackupManifest;
  archiveBytes: number;
  warnings: string[];
}

export interface RestorePreview extends BackupPreview {
  newBooks: number;
  matchedBooks: number;
  missingFiles: number;
  conflictRecords: number;
  canRestore: boolean;
}

export type RestoreItemStatus =
  | "restored"
  | "merged"
  | "local-kept"
  | "missing-file"
  | "skipped"
  | "failed";

export interface RestoreResultItem {
  category: "book" | "progress" | "bookmark" | "annotation" | "setting" | "file";
  id: string;
  label: string;
  status: RestoreItemStatus;
  message: string;
}

export interface RestoreResult {
  operationId: string;
  status: "completed" | "canceled";
  counts: Record<RestoreItemStatus, number>;
  items: RestoreResultItem[];
}

export interface Annotation {
  id: string;
  bookId: string;
  type: AnnotationKind;
  color?: string;
  selectedText?: string;
  note?: string;
  locator: Locator;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SearchHit<TLocator extends Locator = Locator> {
  id: string;
  locator: TLocator;
  excerpt: string;
}

export interface ReaderAdapter<TLocator extends Locator = Locator> {
  open(bookId: string): Promise<void>;
  close(): Promise<void>;
  getToc(): Promise<TocItem[]>;
  goTo(locator: TLocator): Promise<void>;
  getCurrentLocator(): Promise<TLocator>;
  setTheme(theme: ReaderTheme): Promise<void>;
  search?(query: string): Promise<SearchHit<TLocator>[]>;
}

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "canceled"
  | "signature-failure"
  | "network-failure";

export interface UpdaterCapability {
  enabled: boolean;
  track: "nsis" | "msi";
  endpoint: string;
}

export interface AppUpdateMetadata {
  version: string;
  currentVersion: string;
  notes?: string;
  publishedAt?: string;
}

export interface UpdateCheckResult {
  status: "up-to-date" | "available" | "canceled";
  update?: AppUpdateMetadata;
}

export interface UpdateActionResult {
  status: "downloaded" | "installing" | "canceled";
}

export interface UpdateDownloadProgress {
  downloaded: number;
  contentLength?: number;
}

export interface UpdatePreferences {
  dailyCheck: boolean;
}

export const defaultReaderTheme: ReaderTheme = {
  mode: "sepia",
  fontFamily: '"Noto Serif SC", "Songti SC", "Microsoft YaHei", Georgia, serif',
  fontSize: 18,
  lineHeight: 1.75,
  paragraphSpacing: 12,
  pageMargin: 32,
  backgroundColor: "#f7f1e3",
  textColor: "#25211d",
};

const EPUB_PAGE_TRANSITIONS = ["none", "page-curl", "cover", "slide"] as const;

export const readerCapabilitiesByFormat: Readonly<
  Record<ReaderFormat, ReaderCapabilities>
> = {
  epub: {
    viewModes: ["paginated"],
    pageTransitions: EPUB_PAGE_TRANSITIONS,
    supportsPublicationPageLabels: true,
    supportsImageViewer: true,
  },
  txt: {
    viewModes: ["scroll", "paginated"],
    pageTransitions: EPUB_PAGE_TRANSITIONS,
    supportsPublicationPageLabels: false,
    supportsImageViewer: false,
  },
  pdf: {
    viewModes: ["single", "double", "continuous"],
    pageTransitions: EPUB_PAGE_TRANSITIONS,
    supportsPublicationPageLabels: false,
    supportsImageViewer: false,
  },
};

export const defaultReaderExperiencePreferences: ReaderExperiencePreferences = {
  epub: { viewMode: "paginated", transition: "none" },
  txt: { viewMode: "scroll", paginatedViewMode: "single", transition: "slide" },
  pdf: { viewMode: "single", paginatedViewMode: "single", transition: "slide" },
};

export function normalizeReaderExperiencePreferences(
  value: unknown,
): ReaderExperiencePreferences {
  const input = isRecord(value) ? value : {};
  const epub = isRecord(input.epub) ? input.epub : {};
  const txt = isRecord(input.txt) ? input.txt : {};
  const pdf = isRecord(input.pdf) ? input.pdf : {};

  return {
    epub: {
      viewMode: "paginated",
      transition: normalizePageTransition(
        epub.transition,
        defaultReaderExperiencePreferences.epub.transition,
      ),
    },
    txt: {
      viewMode:
        txt.viewMode === "paginated" || txt.viewMode === "scroll"
          ? txt.viewMode
          : defaultReaderExperiencePreferences.txt.viewMode,
      paginatedViewMode:
        txt.paginatedViewMode === "double" || txt.paginatedViewMode === "single"
          ? txt.paginatedViewMode
          : defaultReaderExperiencePreferences.txt.paginatedViewMode,
      transition: normalizePageTransition(
        txt.transition,
        defaultReaderExperiencePreferences.txt.transition,
      ),
    },
    pdf: {
      viewMode:
        pdf.viewMode === "double" ||
        pdf.viewMode === "continuous" ||
        pdf.viewMode === "single"
          ? pdf.viewMode
          : defaultReaderExperiencePreferences.pdf.viewMode,
      paginatedViewMode:
        pdf.paginatedViewMode === "double" || pdf.paginatedViewMode === "single"
          ? pdf.paginatedViewMode
          : pdf.viewMode === "double" || pdf.viewMode === "single"
            ? pdf.viewMode
            : defaultReaderExperiencePreferences.pdf.paginatedViewMode,
      transition: normalizePageTransition(
        pdf.transition,
        defaultReaderExperiencePreferences.pdf.transition,
      ),
    },
  };
}

export function resolveEffectivePageTransition(
  format: BookFormat,
  preferences: ReaderExperiencePreferences,
  prefersReducedMotion: boolean,
): PageTransitionMode {
  if (
    prefersReducedMotion ||
    (format === "txt" && preferences.txt.viewMode === "scroll") ||
    (format === "pdf" && preferences.pdf.viewMode === "continuous")
  ) {
    return "none";
  }

  return preferences[readerFormatForBookFormat(format)].transition;
}

export function readerFormatForBookFormat(format: BookFormat): ReaderFormat {
  return format === "mobi" || format === "azw3" ? "epub" : format;
}

export function normalizePdfLocator(locator: PdfLocator): PdfLocator {
  const ratio = locator.pageOffsetRatio;

  if (ratio === undefined || !Number.isFinite(ratio)) {
    const normalized = { ...locator };
    delete normalized.pageOffsetRatio;
    return normalized;
  }

  return {
    ...locator,
    pageOffsetRatio: Math.min(1, Math.max(0, ratio)),
  };
}

function normalizePageTransition(
  value: unknown,
  fallback: PageTransitionMode,
): PageTransitionMode {
  return value === "none" ||
    value === "page-curl" ||
    value === "cover" ||
    value === "slide"
    ? value
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
