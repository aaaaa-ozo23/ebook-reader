import type {
  PdfLocator,
  ReaderAdapter,
  ReaderTheme,
  SearchHit,
  TocItem,
} from "@reader/core";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export type PdfViewMode = "single" | "double" | "continuous";

export interface PdfPosition {
  locator: PdfLocator;
  page: number;
  totalPages: number;
  scale: number;
  zoomMode: "fit-width" | "custom";
  progression: number;
  viewMode: PdfViewMode;
  renderedMode: Exclude<PdfViewMode, "continuous">;
}

export interface PdfPageRenderResult {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
}

interface PdfReaderAdapterOptions {
  bookId: string;
  sourceUrl: string;
  initialLocator?: PdfLocator;
  theme: ReaderTheme;
  viewMode?: PdfViewMode;
  onPositionChange?: (position: PdfPosition) => void;
}

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDestination = unknown[];
interface PdfRefProxy {
  num: number;
  gen: number;
}

interface PdfOutlineNode {
  title: string;
  dest: string | PdfDestination | null;
  items?: PdfOutlineNode[];
}

const PDF_MIN_SCALE = 0.5;
const PDF_MAX_SCALE = 3;
const PDF_DEFAULT_SCALE = 1;
const PDF_DOUBLE_VIEW_MIN_WIDTH = 920;

export class PdfReaderAdapter implements ReaderAdapter<PdfLocator> {
  private readonly bookId: string;
  private readonly initialLocator?: PdfLocator;
  private readonly onPositionChange?: (position: PdfPosition) => void;
  private readonly sourceUrl: string;
  private currentPage = 1;
  private document: PDFDocumentProxy | null = null;
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private renderTask: RenderTask | null = null;
  private scale = PDF_DEFAULT_SCALE;
  private theme: ReaderTheme;
  private viewMode: PdfViewMode = "single";
  private renderedMode: Exclude<PdfViewMode, "continuous"> = "single";

  constructor(options: PdfReaderAdapterOptions) {
    this.bookId = options.bookId;
    this.sourceUrl = options.sourceUrl;
    this.initialLocator = options.initialLocator;
    this.theme = options.theme;
    this.viewMode = options.viewMode ?? "single";
    this.onPositionChange = options.onPositionChange;
    this.currentPage = normalizePdfPage(options.initialLocator?.page ?? 1, 1);
    this.scale = normalizePdfScale(options.initialLocator?.scale ?? PDF_DEFAULT_SCALE);
  }

  async open(bookId: string): Promise<void> {
    if (bookId !== this.bookId) {
      throw new Error(`PDF adapter was initialized for ${this.bookId}, not ${bookId}.`);
    }

    await this.close();

    const pdfjs = await loadPdfjs();
    const loadingTask = pdfjs.getDocument({
      url: this.sourceUrl,
      cMapPacked: true,
      cMapUrl: getPdfjsAssetUrl("cmaps"),
      standardFontDataUrl: getPdfjsAssetUrl("standard_fonts"),
      useWorkerFetch: true,
    });
    const document = await loadingTask.promise;

    this.loadingTask = loadingTask;
    this.document = document;
    this.currentPage = normalizePdfPage(this.initialLocator?.page ?? 1, document.numPages);
    this.scale = normalizePdfScale(this.initialLocator?.scale ?? PDF_DEFAULT_SCALE);
    this.renderedMode = this.resolveRenderedMode(this.viewMode);
    this.reportPosition();
  }

  async close(): Promise<void> {
    this.cancelRenderTask();

    if (this.loadingTask !== null) {
      await this.loadingTask.destroy();
      this.loadingTask = null;
    }

    this.document = null;
  }

  async getToc(): Promise<TocItem[]> {
    const document = this.requireDocument();
    const outline = await document.getOutline();

    if (outline !== null && outline.length > 0) {
      const outlineItems = await pdfOutlineToTocItems(outline, document, document.numPages);

      if (outlineItems.length > 0) {
        return outlineItems;
      }
    }

    return Array.from({ length: document.numPages }, (_, index) =>
      pdfPageToTocItem(index + 1, document.numPages),
    );
  }

  async goTo(locator: PdfLocator): Promise<void> {
    const document = this.requireDocument();

    this.currentPage = normalizePdfPage(locator.page, document.numPages);

    if (locator.scale !== undefined) {
      this.scale = normalizePdfScale(locator.scale);
    }

    this.reportPosition();
  }

  async getCurrentLocator(): Promise<PdfLocator> {
    return this.getPosition().locator;
  }

  async setTheme(theme: ReaderTheme): Promise<void> {
    this.theme = theme;
  }

  async search(query: string): Promise<SearchHit<PdfLocator>[]> {
    void query;

    return [];
  }

  async previous(): Promise<void> {
    const document = this.requireDocument();
    const step = this.renderedMode === "double" ? 2 : 1;
    this.currentPage = normalizePdfPage(this.currentPage - step, document.numPages);
    this.reportPosition();
  }

  async next(): Promise<void> {
    const document = this.requireDocument();
    const step = this.renderedMode === "double" ? 2 : 1;
    this.currentPage = normalizePdfPage(this.currentPage + step, document.numPages);
    this.reportPosition();
  }

  setZoom(scale: number): PdfPosition {
    this.scale = normalizePdfScale(scale);
    this.reportPosition();

    return this.getPosition();
  }

  async fitWidth(width: number, pageNumber = this.currentPage): Promise<PdfPosition> {
    const page = await this.requireDocument().getPage(normalizePdfPage(pageNumber, this.totalPages));
    const viewport = page.getViewport({ scale: 1 });
    this.scale = normalizePdfScale(width / Math.max(viewport.width, 1));
    this.reportPosition("fit-width");

    return this.getPosition("fit-width");
  }

  setViewMode(mode: PdfViewMode, availableWidth?: number): PdfPosition {
    this.viewMode = mode;
    this.renderedMode = this.resolveRenderedMode(mode, availableWidth);
    this.reportPosition();

    return this.getPosition();
  }

  getPosition(zoomMode: "fit-width" | "custom" = "custom"): PdfPosition {
    const document = this.requireDocument();
    const totalPages = document.numPages;
    const page = normalizePdfPage(this.currentPage, totalPages);
    const scale = normalizePdfScale(this.scale);

    return {
      locator: {
        kind: "pdf",
        page,
        scale,
        zoomMode,
      },
      page,
      totalPages,
      scale,
      zoomMode,
      progression: pageToProgress(page, totalPages),
      viewMode: this.viewMode,
      renderedMode: this.renderedMode,
    };
  }

  getVisiblePages(): number[] {
    const document = this.requireDocument();

    if (this.renderedMode === "single") {
      return [this.currentPage];
    }

    return [this.currentPage, this.currentPage + 1].filter(
      (pageNumber) => pageNumber <= document.numPages,
    );
  }

  async renderPage(
    canvas: HTMLCanvasElement,
    pageNumber = this.currentPage,
    scale = this.scale,
  ): Promise<PdfPageRenderResult> {
    const document = this.requireDocument();
    const page = await document.getPage(normalizePdfPage(pageNumber, document.numPages));
    const renderScale = normalizePdfScale(scale);
    const outputScale = getOutputScale();
    const viewport = page.getViewport({ scale: renderScale });
    const context = canvas.getContext("2d");

    if (context === null) {
      throw new Error("PDF canvas 2D context is unavailable.");
    }

    this.cancelRenderTask();
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const renderTask = page.render({
      canvas,
      canvasContext: context,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      viewport,
      background: this.theme.backgroundColor,
    });

    this.renderTask = renderTask;
    await renderTask.promise;

    if (this.renderTask === renderTask) {
      this.renderTask = null;
    }

    return {
      pageNumber: page.pageNumber,
      width: viewport.width,
      height: viewport.height,
      scale: renderScale,
    };
  }

  private get totalPages(): number {
    return this.requireDocument().numPages;
  }

  private cancelRenderTask(): void {
    if (this.renderTask !== null) {
      this.renderTask.cancel();
      this.renderTask = null;
    }
  }

  private reportPosition(zoomMode: "fit-width" | "custom" = "custom"): void {
    this.onPositionChange?.(this.getPosition(zoomMode));
  }

  private resolveRenderedMode(
    mode: PdfViewMode,
    availableWidth = Number.POSITIVE_INFINITY,
  ): Exclude<PdfViewMode, "continuous"> {
    if (mode === "double" && availableWidth >= PDF_DOUBLE_VIEW_MIN_WIDTH) {
      return "double";
    }

    return "single";
  }

  private requireDocument(): PDFDocumentProxy {
    if (this.document === null) {
      throw new Error("PDF document is not open.");
    }

    return this.document;
  }
}

async function loadPdfjs(): Promise<PdfjsModule> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  return pdfjs;
}

function getPdfjsAssetUrl(directory: "cmaps" | "standard_fonts"): string {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/${directory}/`, window.location.href).toString();
}

export function normalizePdfPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, totalPages));
}

export function normalizePdfScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return PDF_DEFAULT_SCALE;
  }

  return Math.min(PDF_MAX_SCALE, Math.max(PDF_MIN_SCALE, scale));
}

export function pageToProgress(page: number, totalPages: number): number {
  if (totalPages <= 1) {
    return 0;
  }

  return (normalizePdfPage(page, totalPages) - 1) / (totalPages - 1);
}

async function pdfOutlineToTocItems(
  outline: PdfOutlineNode[],
  document: PDFDocumentProxy,
  totalPages: number,
  parentId = "pdf-outline",
): Promise<TocItem[]> {
  const tocItems: TocItem[] = [];

  for (const [index, item] of outline.entries()) {
    const page = await resolvePdfOutlinePage(item, document, totalPages);
    const children = await pdfOutlineToTocItems(
      item.items ?? [],
      document,
      totalPages,
      `${parentId}-${index + 1}`,
    );

    if (page === null && children.length === 0) {
      continue;
    }

    const title = item.title.trim() || `Page ${page ?? 1}`;
    const tocItem: TocItem = {
      id: `${parentId}-${index + 1}`,
      title,
    };

    if (page !== null) {
      tocItem.locator = {
        kind: "pdf",
        page,
      };
    }

    if (children.length > 0) {
      tocItem.children = children;
    }

    tocItems.push(tocItem);
  }

  return tocItems;
}

async function resolvePdfOutlinePage(
  item: PdfOutlineNode,
  document: PDFDocumentProxy,
  totalPages: number,
): Promise<number | null> {
  try {
    const destination = await resolvePdfDestination(item.dest, document);

    if (destination === null) {
      return null;
    }

    const pageIndex = await resolvePdfDestinationPageIndex(destination, document);

    if (pageIndex === null) {
      return null;
    }

    return normalizePdfPage(pageIndex + 1, totalPages);
  } catch {
    return null;
  }
}

async function resolvePdfDestination(
  destination: string | PdfDestination | null,
  document: PDFDocumentProxy,
): Promise<PdfDestination | null> {
  if (typeof destination === "string") {
    return document.getDestination(destination);
  }

  if (Array.isArray(destination)) {
    return destination;
  }

  return null;
}

async function resolvePdfDestinationPageIndex(
  destination: PdfDestination,
  document: PDFDocumentProxy,
): Promise<number | null> {
  const pageReference = destination[0];

  if (typeof pageReference === "number") {
    return Math.max(0, Math.floor(pageReference));
  }

  if (isRefProxy(pageReference)) {
    return document.getPageIndex(pageReference);
  }

  return null;
}

function isRefProxy(value: unknown): value is PdfRefProxy {
  return (
    typeof value === "object" &&
    value !== null &&
    "num" in value &&
    "gen" in value &&
    typeof value.num === "number" &&
    typeof value.gen === "number"
  );
}

function pdfPageToTocItem(page: number, totalPages: number): TocItem {
  return {
    id: `pdf-page-${page}`,
    title: `Page ${page}`,
    locator: {
      kind: "pdf",
      page: normalizePdfPage(page, totalPages),
    },
  };
}

function getOutputScale(): number {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, window.devicePixelRatio || 1);
}
