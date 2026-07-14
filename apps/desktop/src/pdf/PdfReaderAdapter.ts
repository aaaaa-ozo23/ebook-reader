import {
  normalizePdfLocator,
  type PdfLocator,
  type PdfViewMode,
  type ReaderAdapter,
  type ReaderTheme,
  type SearchHit,
  type TocItem,
} from "@reader/core";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export type { PdfViewMode } from "@reader/core";

export interface PdfPosition {
  locator: PdfLocator;
  page: number;
  totalPages: number;
  scale: number;
  zoomMode: "fit-width" | "custom";
  progression: number;
  viewMode: PdfViewMode;
  renderedMode: PdfViewMode;
}

export interface PdfPageRenderResult {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
}

export interface PdfPageMetrics {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
}

export interface PdfPageSurfaceRenderHandle {
  cancel: () => void;
  pageNumber: number;
  ready: Promise<PdfPageRenderResult>;
  release: () => void;
}

export interface PdfRenderLifecycleSnapshot {
  activePages: number;
  activeRenderTasks: number;
  activeTextLayers: number;
  cachedPageMetrics: number;
}

interface CancellableTextLayer {
  cancel: () => void;
  render: () => Promise<void>;
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
  private documentIdentity = 0;
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private readonly pageMetrics = new Map<number, PdfPageMetrics>();
  private readonly activePages = new Map<number, PDFPageProxy>();
  private readonly pagePromises = new Map<number, Promise<PDFPageProxy>>();
  private readonly renderTasks = new Map<number, RenderTask>();
  private readonly renderSequences = new Map<number, number>();
  private readonly textLayers = new Map<number, CancellableTextLayer>();
  private readonly textLayerSequences = new Map<number, number>();
  private pageOffsetRatio: number | undefined;
  private scale = PDF_DEFAULT_SCALE;
  private theme: ReaderTheme;
  private viewMode: PdfViewMode = "single";
  private renderedMode: PdfViewMode = "single";
  private zoomMode: "fit-width" | "custom" = "custom";

  constructor(options: PdfReaderAdapterOptions) {
    this.bookId = options.bookId;
    this.sourceUrl = options.sourceUrl;
    this.initialLocator = options.initialLocator;
    this.theme = options.theme;
    this.viewMode = options.viewMode ?? "single";
    this.onPositionChange = options.onPositionChange;
    this.currentPage = normalizePdfPage(options.initialLocator?.page ?? 1, 1);
    this.pageOffsetRatio = normalizePdfLocator(
      options.initialLocator ?? { kind: "pdf", page: 1 },
    ).pageOffsetRatio;
    this.scale = normalizePdfScale(options.initialLocator?.scale ?? PDF_DEFAULT_SCALE);
    this.zoomMode = options.initialLocator?.zoomMode ?? "custom";
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
    this.currentPage = normalizePdfPage(
      this.initialLocator?.page ?? 1,
      document.numPages,
    );
    this.pageOffsetRatio = normalizePdfLocator(
      this.initialLocator ?? { kind: "pdf", page: 1 },
    ).pageOffsetRatio;
    this.scale = normalizePdfScale(this.initialLocator?.scale ?? PDF_DEFAULT_SCALE);
    this.renderedMode = this.resolveRenderedMode(this.viewMode);
    this.currentPage = this.normalizePageForRenderedMode(this.currentPage);
    this.reportPosition();
  }

  async close(): Promise<void> {
    this.documentIdentity += 1;
    this.cancelAllPageRenders();
    this.cancelAllTextLayers();
    for (const page of this.activePages.values()) {
      page.cleanup();
    }
    this.activePages.clear();
    this.pageMetrics.clear();
    this.pagePromises.clear();
    this.renderSequences.clear();
    this.textLayerSequences.clear();

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
      const outlineItems = await pdfOutlineToTocItems(
        outline,
        document,
        document.numPages,
      );

      if (outlineItems.length > 0) {
        return outlineItems;
      }
    }

    return Array.from({ length: document.numPages }, (_, index) =>
      pdfPageToTocItem(index + 1, document.numPages),
    );
  }

  async goTo(locator: PdfLocator): Promise<void> {
    this.requireDocument();

    this.currentPage = this.normalizePageForRenderedMode(locator.page);
    this.pageOffsetRatio = normalizePdfLocator(locator).pageOffsetRatio;

    if (locator.scale !== undefined) {
      this.scale = normalizePdfScale(locator.scale);
    }

    this.zoomMode = locator.zoomMode ?? this.zoomMode;
    this.reportPosition();
  }

  async getCurrentLocator(): Promise<PdfLocator> {
    return this.getPosition().locator;
  }

  async setTheme(theme: ReaderTheme): Promise<void> {
    this.theme = theme;
  }

  async search(query: string): Promise<SearchHit<PdfLocator>[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (normalizedQuery.length === 0) {
      return [];
    }

    const document = this.requireDocument();
    const hits: SearchHit<PdfLocator>[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => (isPdfTextItem(item) ? item.str : ""))
        .join(" ");
      const normalizedPageText = pageText.toLocaleLowerCase();
      let matchIndex = normalizedPageText.indexOf(normalizedQuery);

      while (matchIndex !== -1 && hits.length < 100) {
        const selectedText = pageText.slice(matchIndex, matchIndex + query.length);

        hits.push({
          id: `pdf-search-${pageNumber}-${matchIndex}`,
          locator: {
            kind: "pdf",
            page: pageNumber,
            selectedText,
            contextBefore: pageText.slice(Math.max(0, matchIndex - 80), matchIndex),
            contextAfter: pageText.slice(
              matchIndex + query.length,
              matchIndex + query.length + 80,
            ),
          },
          excerpt: buildSearchExcerpt(pageText, matchIndex, query.length),
        });

        matchIndex = normalizedPageText.indexOf(
          normalizedQuery,
          matchIndex + Math.max(1, normalizedQuery.length),
        );
      }

      if (hits.length >= 100) {
        break;
      }
    }

    return hits;
  }

  async previous(): Promise<void> {
    const document = this.requireDocument();
    this.currentPage =
      this.renderedMode === "double"
        ? previousPdfSpreadStart(this.currentPage, document.numPages)
        : normalizePdfPage(this.currentPage - 1, document.numPages);
    this.pageOffsetRatio = 0;
    this.reportPosition();
  }

  async next(): Promise<void> {
    const document = this.requireDocument();
    this.currentPage =
      this.renderedMode === "double"
        ? nextPdfSpreadStart(this.currentPage, document.numPages)
        : normalizePdfPage(this.currentPage + 1, document.numPages);
    this.pageOffsetRatio = 0;
    this.reportPosition();
  }

  previewProgress(progression: number): PdfPosition {
    const document = this.requireDocument();
    const target =
      this.renderedMode === "continuous"
        ? progressToPdfContinuousPosition(progression, document.numPages)
        : {
            page: progressToPdfPage(progression, document.numPages),
            pageOffsetRatio: 0,
          };

    return this.createPosition(target.page, "custom", target.pageOffsetRatio);
  }

  async goToProgress(progression: number): Promise<void> {
    const document = this.requireDocument();
    if (this.renderedMode === "continuous") {
      const target = progressToPdfContinuousPosition(progression, document.numPages);
      this.currentPage = target.page;
      this.pageOffsetRatio = target.pageOffsetRatio;
    } else {
      this.currentPage = this.normalizePageForRenderedMode(
        progressToPdfPage(progression, document.numPages),
      );
      this.pageOffsetRatio = 0;
    }
    this.reportPosition();
  }

  setContinuousPosition(page: number, pageOffsetRatio: number): PdfPosition {
    const document = this.requireDocument();
    this.currentPage = normalizePdfPage(page, document.numPages);
    this.pageOffsetRatio = normalizePdfLocator({
      kind: "pdf",
      page: this.currentPage,
      pageOffsetRatio,
    }).pageOffsetRatio;
    this.reportPosition();
    return this.getPosition();
  }

  setZoom(scale: number): PdfPosition {
    this.scale = normalizePdfScale(scale);
    this.zoomMode = "custom";
    this.reportPosition(this.zoomMode);

    return this.getPosition();
  }

  async fitWidth(width: number, pageNumber = this.currentPage): Promise<PdfPosition> {
    const metrics = await this.getPageMetrics(pageNumber);
    this.scale = normalizePdfScale(width / Math.max(metrics.width, 1));
    this.zoomMode = "fit-width";
    this.reportPosition(this.zoomMode);

    return this.getPosition("fit-width");
  }

  setViewMode(mode: PdfViewMode, availableWidth?: number): PdfPosition {
    this.viewMode = mode;
    this.renderedMode = this.resolveRenderedMode(mode, availableWidth);
    this.currentPage = this.normalizePageForRenderedMode(this.currentPage);
    this.reportPosition();

    return this.getPosition();
  }

  getPosition(zoomMode: "fit-width" | "custom" = this.zoomMode): PdfPosition {
    const document = this.requireDocument();
    const page = normalizePdfPage(this.currentPage, document.numPages);

    return this.createPosition(page, zoomMode);
  }

  private createPosition(
    page: number,
    zoomMode: "fit-width" | "custom" = this.zoomMode,
    pageOffsetRatio = this.pageOffsetRatio,
  ): PdfPosition {
    const totalPages = this.requireDocument().numPages;
    const normalizedPage = normalizePdfPage(page, totalPages);
    const scale = normalizePdfScale(this.scale);

    return {
      locator: {
        kind: "pdf",
        page: normalizedPage,
        ...(pageOffsetRatio === undefined ? {} : { pageOffsetRatio }),
        scale,
        zoomMode,
      },
      page: normalizedPage,
      totalPages,
      scale,
      zoomMode,
      progression:
        this.renderedMode === "continuous"
          ? pdfContinuousPositionToProgress(
              normalizedPage,
              pageOffsetRatio ?? 0,
              totalPages,
            )
          : pageToProgress(normalizedPage, totalPages),
      viewMode: this.viewMode,
      renderedMode: this.renderedMode,
    };
  }

  getVisiblePages(): number[] {
    const document = this.requireDocument();

    if (this.renderedMode === "continuous") {
      return [];
    }

    if (this.renderedMode === "single") {
      return [this.currentPage];
    }

    return [this.currentPage, this.currentPage + 1].filter(
      (pageNumber) => pageNumber <= document.numPages,
    );
  }

  async getPageMetrics(pageNumber: number): Promise<PdfPageMetrics> {
    const normalizedPage = normalizePdfPage(pageNumber, this.totalPages);
    const cached = this.pageMetrics.get(normalizedPage);

    if (cached !== undefined) {
      return cached;
    }

    const page = await this.getPage(normalizedPage);
    const viewport = page.getViewport({ scale: 1 });
    const metrics = {
      pageNumber: normalizedPage,
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation,
    };
    this.pageMetrics.set(normalizedPage, metrics);
    return metrics;
  }

  getCachedPageMetrics(pageNumber: number): PdfPageMetrics | undefined {
    return this.pageMetrics.get(normalizePdfPage(pageNumber, this.totalPages));
  }

  async renderPage(
    canvas: HTMLCanvasElement,
    pageNumber = this.currentPage,
    scale = this.scale,
  ): Promise<PdfPageRenderResult> {
    const document = this.requireDocument();
    const normalizedPage = normalizePdfPage(pageNumber, document.numPages);
    this.cancelPageRender(normalizedPage, false);
    const renderSequence = this.nextSequence(this.renderSequences, normalizedPage);
    const page = await this.getPage(normalizedPage);
    this.assertCurrentSequence(this.renderSequences, normalizedPage, renderSequence);
    const renderScale = normalizePdfScale(scale);
    const outputScale = getOutputScale();
    const viewport = page.getViewport({ scale: renderScale });
    const context = canvas.getContext("2d");

    if (context === null) {
      throw new Error("PDF canvas 2D context is unavailable.");
    }

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

    this.renderTasks.set(normalizedPage, renderTask);
    try {
      await renderTask.promise;
      this.assertCurrentSequence(this.renderSequences, normalizedPage, renderSequence);
    } finally {
      if (this.renderTasks.get(normalizedPage) === renderTask) {
        this.renderTasks.delete(normalizedPage);
      }
    }

    return {
      pageNumber: page.pageNumber,
      width: viewport.width,
      height: viewport.height,
      scale: renderScale,
    };
  }

  async renderTextLayer(
    container: HTMLElement,
    pageNumber = this.currentPage,
    scale = this.scale,
  ): Promise<PdfPageRenderResult> {
    const pdfjs = await loadPdfjs();
    const document = this.requireDocument();
    const normalizedPage = normalizePdfPage(pageNumber, document.numPages);
    const textLayerSequence = this.nextSequence(
      this.textLayerSequences,
      normalizedPage,
    );
    this.cancelTextLayer(normalizedPage, false);
    const page = await this.getPage(normalizedPage);
    this.assertCurrentSequence(
      this.textLayerSequences,
      normalizedPage,
      textLayerSequence,
    );
    const renderScale = normalizePdfScale(scale);
    const viewport = page.getViewport({ scale: renderScale });
    const textContent = await page.getTextContent();

    container.replaceChildren();
    container.dataset.pageNumber = String(page.pageNumber);
    container.style.width = `${Math.floor(viewport.width)}px`;
    container.style.height = `${Math.floor(viewport.height)}px`;

    const textLayer = new pdfjs.TextLayer({
      textContentSource: textContent,
      container,
      viewport,
    });

    this.textLayers.set(normalizedPage, textLayer);
    try {
      await textLayer.render();
      this.assertCurrentSequence(
        this.textLayerSequences,
        normalizedPage,
        textLayerSequence,
      );
    } finally {
      if (this.textLayers.get(normalizedPage) === textLayer) {
        this.textLayers.delete(normalizedPage);
      }
    }

    return {
      pageNumber: page.pageNumber,
      width: viewport.width,
      height: viewport.height,
      scale: renderScale,
    };
  }

  async viewportRectsToPdfRects(
    pageNumber: number,
    rects: Array<{ x: number; y: number; width: number; height: number }>,
    scale = this.scale,
  ): Promise<PdfLocator["rects"]> {
    const document = this.requireDocument();
    const page = await document.getPage(
      normalizePdfPage(pageNumber, document.numPages),
    );
    const viewport = page.getViewport({ scale: normalizePdfScale(scale) });

    return rects
      .map((rect) => {
        const [x1, y1] = viewport.convertToPdfPoint(rect.x, rect.y);
        const [x2, y2] = viewport.convertToPdfPoint(
          rect.x + rect.width,
          rect.y + rect.height,
        );
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);

        return {
          x,
          y,
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
  }

  async pdfRectsToViewportRects(
    pageNumber: number,
    rects: NonNullable<PdfLocator["rects"]>,
    scale = this.scale,
  ): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
    const document = this.requireDocument();
    const page = await document.getPage(
      normalizePdfPage(pageNumber, document.numPages),
    );
    const viewport = page.getViewport({ scale: normalizePdfScale(scale) });

    return rects
      .map((rect) => {
        const viewportRect = viewport.convertToViewportRectangle([
          rect.x,
          rect.y,
          rect.x + rect.width,
          rect.y + rect.height,
        ]);
        const x = Math.min(viewportRect[0], viewportRect[2]);
        const y = Math.min(viewportRect[1], viewportRect[3]);

        return {
          x,
          y,
          width: Math.abs(viewportRect[2] - viewportRect[0]),
          height: Math.abs(viewportRect[3] - viewportRect[1]),
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
  }

  private get totalPages(): number {
    return this.requireDocument().numPages;
  }

  cancelPageRender(pageNumber: number, invalidate = true): void {
    const normalizedPage = this.normalizeLifecyclePage(pageNumber);
    const renderTask = this.renderTasks.get(normalizedPage);

    if (renderTask !== undefined) {
      renderTask.cancel();
      this.renderTasks.delete(normalizedPage);
    }
    if (invalidate) {
      this.nextSequence(this.renderSequences, normalizedPage);
    }
  }

  cancelTextLayer(pageNumber: number, invalidate = true): void {
    const normalizedPage = this.normalizeLifecyclePage(pageNumber);
    const textLayer = this.textLayers.get(normalizedPage);
    textLayer?.cancel();
    this.textLayers.delete(normalizedPage);
    if (invalidate) {
      this.nextSequence(this.textLayerSequences, normalizedPage);
    }
  }

  createPageSurfaceRender(options: {
    canvas: HTMLCanvasElement;
    pageNumber: number;
    renderTextLayer: boolean;
    scale: number;
    textLayer?: HTMLElement | null;
  }): PdfPageSurfaceRenderHandle {
    const pageNumber = normalizePdfPage(options.pageNumber, this.totalPages);
    let isReleased = false;
    const ready = this.renderPage(options.canvas, pageNumber, options.scale).then(
      async (result) => {
        if (
          options.renderTextLayer &&
          options.textLayer !== null &&
          options.textLayer
        ) {
          await this.renderTextLayer(options.textLayer, pageNumber, options.scale);
        }
        return result;
      },
    );

    return {
      pageNumber,
      ready,
      cancel: () => {
        this.cancelPageRender(pageNumber);
        this.cancelTextLayer(pageNumber);
      },
      release: () => {
        if (isReleased) {
          return;
        }
        isReleased = true;
        this.releasePageSurface(pageNumber, options.canvas, options.textLayer);
      },
    };
  }

  getRenderLifecycleSnapshot(): PdfRenderLifecycleSnapshot {
    return {
      activePages: this.activePages.size,
      activeRenderTasks: this.renderTasks.size,
      activeTextLayers: this.textLayers.size,
      cachedPageMetrics: this.pageMetrics.size,
    };
  }

  releasePageSurface(
    pageNumber: number,
    canvas?: HTMLCanvasElement | null,
    textLayer?: HTMLElement | null,
  ): void {
    this.cancelPageRender(pageNumber);
    this.cancelTextLayer(pageNumber);
    textLayer?.replaceChildren();
    textLayer?.removeAttribute("data-page-number");

    if (canvas !== undefined && canvas !== null) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.removeAttribute("data-page-number");
    }

    const normalizedPage = this.normalizeLifecyclePage(pageNumber);
    this.activePages.get(normalizedPage)?.cleanup();
    this.activePages.delete(normalizedPage);
    this.pagePromises.delete(normalizedPage);
  }

  private cancelAllPageRenders(): void {
    for (const renderTask of this.renderTasks.values()) {
      renderTask.cancel();
    }
    this.renderTasks.clear();
  }

  private cancelAllTextLayers(): void {
    for (const textLayer of this.textLayers.values()) {
      textLayer.cancel();
    }
    this.textLayers.clear();
  }

  private getPage(pageNumber: number): Promise<PDFPageProxy> {
    const normalizedPage = normalizePdfPage(pageNumber, this.totalPages);
    const activePage = this.activePages.get(normalizedPage);
    if (activePage !== undefined) {
      return Promise.resolve(activePage);
    }
    const cachedPromise = this.pagePromises.get(normalizedPage);

    if (cachedPromise !== undefined) {
      return cachedPromise;
    }

    const document = this.requireDocument();
    const documentIdentity = this.documentIdentity;
    const pagePromise = document.getPage(normalizedPage).then((page) => {
      if (this.document !== document || this.documentIdentity !== documentIdentity) {
        page.cleanup();
        throw createRenderingCancelledError();
      }
      this.activePages.set(normalizedPage, page);
      this.pagePromises.delete(normalizedPage);
      return page;
    });
    this.pagePromises.set(normalizedPage, pagePromise);
    void pagePromise.catch(() => {
      if (this.pagePromises.get(normalizedPage) === pagePromise) {
        this.pagePromises.delete(normalizedPage);
      }
    });
    return pagePromise;
  }

  private normalizeLifecyclePage(pageNumber: number): number {
    return normalizePdfPage(
      pageNumber,
      this.document?.numPages ?? Math.max(1, Math.floor(pageNumber) || 1),
    );
  }

  private nextSequence(sequences: Map<number, number>, pageNumber: number): number {
    const nextSequence = (sequences.get(pageNumber) ?? 0) + 1;
    sequences.set(pageNumber, nextSequence);
    return nextSequence;
  }

  private assertCurrentSequence(
    sequences: Map<number, number>,
    pageNumber: number,
    sequence: number,
  ): void {
    if (sequences.get(pageNumber) !== sequence) {
      throw createRenderingCancelledError();
    }
  }

  private reportPosition(zoomMode: "fit-width" | "custom" = this.zoomMode): void {
    this.onPositionChange?.(this.getPosition(zoomMode));
  }

  private resolveRenderedMode(
    mode: PdfViewMode,
    availableWidth = Number.POSITIVE_INFINITY,
  ): PdfViewMode {
    if (mode === "continuous") {
      return "continuous";
    }
    if (mode === "double" && availableWidth >= PDF_DOUBLE_VIEW_MIN_WIDTH) {
      return "double";
    }

    return "single";
  }

  private normalizePageForRenderedMode(pageNumber: number): number {
    return this.renderedMode === "double"
      ? getPdfSpreadStart(pageNumber, this.totalPages)
      : normalizePdfPage(pageNumber, this.totalPages);
  }

  private requireDocument(): PDFDocumentProxy {
    if (this.document === null) {
      throw new Error("PDF document is not open.");
    }

    return this.document;
  }
}

export function pdfContinuousPositionToProgress(
  page: number,
  pageOffsetRatio: number,
  totalPages: number,
): number {
  const normalizedTotalPages = Math.max(1, Math.floor(totalPages));
  const normalizedPage = normalizePdfPage(page, normalizedTotalPages);
  const normalizedRatio =
    normalizePdfLocator({
      kind: "pdf",
      page: normalizedPage,
      pageOffsetRatio,
    }).pageOffsetRatio ?? 0;

  return Math.min(
    1,
    Math.max(0, (normalizedPage - 1 + normalizedRatio) / normalizedTotalPages),
  );
}

export function progressToPdfContinuousPosition(
  progression: number,
  totalPages: number,
): { page: number; pageOffsetRatio: number } {
  const normalizedTotalPages = Math.max(1, Math.floor(totalPages));
  const clampedProgression = Number.isFinite(progression)
    ? Math.min(1, Math.max(0, progression))
    : 0;

  if (clampedProgression === 1) {
    return { page: normalizedTotalPages, pageOffsetRatio: 1 };
  }

  const scaledPosition = clampedProgression * normalizedTotalPages;
  const pageIndex = Math.floor(scaledPosition);

  return {
    page: normalizePdfPage(pageIndex + 1, normalizedTotalPages),
    pageOffsetRatio: scaledPosition - pageIndex,
  };
}

export function getPdfSpreadStart(page: number, totalPages: number): number {
  const normalizedPage = normalizePdfPage(page, totalPages);
  if (normalizedPage <= 1) {
    return 1;
  }
  return normalizedPage % 2 === 0 ? normalizedPage : normalizedPage - 1;
}

export function nextPdfSpreadStart(page: number, totalPages: number): number {
  const spreadStart = getPdfSpreadStart(page, totalPages);
  return normalizePdfPage(spreadStart === 1 ? 2 : spreadStart + 2, totalPages);
}

export function previousPdfSpreadStart(page: number, totalPages: number): number {
  const spreadStart = getPdfSpreadStart(page, totalPages);
  return spreadStart <= 2 ? 1 : normalizePdfPage(spreadStart - 2, totalPages);
}

function createRenderingCancelledError(): Error {
  const error = new Error("Rendering cancelled because the page surface changed.");
  error.name = "RenderingCancelledException";
  return error;
}

async function loadPdfjs(): Promise<PdfjsModule> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  return pdfjs;
}

function getPdfjsAssetUrl(directory: "cmaps" | "standard_fonts"): string {
  return new URL(
    `${import.meta.env.BASE_URL}pdfjs/${directory}/`,
    window.location.href,
  ).toString();
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

export function progressToPdfPage(progression: number, totalPages: number): number {
  const normalizedTotalPages = Number.isFinite(totalPages)
    ? Math.max(1, Math.floor(totalPages))
    : 1;

  if (normalizedTotalPages <= 1 || !Number.isFinite(progression)) {
    return 1;
  }

  const clampedProgression = Math.min(1, Math.max(0, progression));
  const page = Math.round(clampedProgression * (normalizedTotalPages - 1)) + 1;

  return normalizePdfPage(page, normalizedTotalPages);
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

function isPdfTextItem(item: unknown): item is { str: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string"
  );
}

function buildSearchExcerpt(
  text: string,
  matchIndex: number,
  queryLength: number,
): string {
  const excerptStart = Math.max(0, matchIndex - 48);
  const excerptEnd = Math.min(text.length, matchIndex + queryLength + 72);
  const prefix = excerptStart > 0 ? "..." : "";
  const suffix = excerptEnd < text.length ? "..." : "";

  return `${prefix}${text.slice(excerptStart, excerptEnd).trim()}${suffix}`;
}

function getOutputScale(): number {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, window.devicePixelRatio || 1);
}
