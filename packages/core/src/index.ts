export type BookFormat = "epub" | "txt" | "pdf";
export type BookCoverStatus = "pending" | "ready" | "fallback";

export type AnnotationKind = "highlight" | "note";

export type ReaderThemeMode = "light" | "dark" | "sepia" | "green";

export interface Book {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  sourcePath?: string;
  libraryPath: string;
  fileHash: string;
  coverPath?: string;
  coverStatus: BookCoverStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

export type ImportBookStatus = "imported" | "duplicate" | "repaired";

export interface ImportBookResult {
  status: ImportBookStatus;
  book: Book;
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
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  pageMargin: number;
  backgroundColor: string;
  textColor: string;
}

export interface ReaderLayoutPreferences {
  sidebarWidth: number;
}

export const defaultReaderLayoutPreferences: ReaderLayoutPreferences = {
  sidebarWidth: 292,
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
