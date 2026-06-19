export type BookFormat = "epub" | "txt" | "pdf";

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
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
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

export interface LocatorContext {
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface TxtLocator extends LocatorContext {
  kind: "txt";
  chapterId?: string;
  charOffset: number;
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
  rects?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  scale?: number;
}

export type Locator = TxtLocator | EpubLocator | PdfLocator;

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
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 18,
  lineHeight: 1.75,
  paragraphSpacing: 12,
  pageMargin: 32,
  backgroundColor: "#f7f5ef",
  textColor: "#1f2933",
};
