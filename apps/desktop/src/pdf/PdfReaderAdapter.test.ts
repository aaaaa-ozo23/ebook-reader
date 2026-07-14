import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPdfSpreadStart,
  nextPdfSpreadStart,
  normalizePdfPage,
  normalizePdfScale,
  pageToProgress,
  pdfContinuousPositionToProgress,
  progressToPdfContinuousPosition,
  progressToPdfPage,
  previousPdfSpreadStart,
  PdfReaderAdapter,
} from "./PdfReaderAdapter";

const destroyMock = vi.hoisted(() => vi.fn(async () => undefined));
const getDestinationMock = vi.hoisted(() =>
  vi.fn(async (id: string): Promise<unknown[] | null> => {
    void id;

    return null;
  }),
);
const getPageMock = vi.hoisted(() =>
  vi.fn(async (pageNumber: number) => ({
    cleanup: vi.fn(),
    pageNumber,
    getTextContent: vi.fn(async () => ({ items: [] })),
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      rotation: 0,
    })),
    render: vi.fn(() => ({
      cancel: vi.fn(),
      promise: Promise.resolve(),
    })),
  })),
);
const getDocumentMock = vi.hoisted(() =>
  vi.fn(() => ({
    destroy: destroyMock,
    promise: Promise.resolve({
      numPages: 12,
      getDestination: getDestinationMock,
      getOutline: getOutlineMock,
      getPage: getPageMock,
      getPageIndex: getPageIndexMock,
    }),
  })),
);
const getOutlineMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<Array<{
      title: string;
      dest: string | unknown[] | null;
      items?: Array<{
        title: string;
        dest: string | unknown[] | null;
        items?: unknown[];
      }>;
    }> | null> => null,
  ),
);
const getPageIndexMock = vi.hoisted(() =>
  vi.fn(async (ref: { num: number; gen: number }) => {
    void ref;

    return 0;
  }),
);
const workerOptions = vi.hoisted(() => ({ workerSrc: "" }));
const textLayerCancelMock = vi.hoisted(() => vi.fn());
const textLayerRenderMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: workerOptions,
  TextLayer: class TextLayer {
    cancel = textLayerCancelMock;
    render = textLayerRenderMock;
  },
}));

function createPdfAdapter(): PdfReaderAdapter {
  return new PdfReaderAdapter({
    bookId: "pdf-book",
    sourceUrl: "blob:pdf-book",
    theme: {
      mode: "light",
      fontFamily: "serif",
      fontSize: 18,
      lineHeight: 1.7,
      paragraphSpacing: 12,
      pageMargin: 32,
      backgroundColor: "#ffffff",
      textColor: "#111111",
    },
  });
}

describe("PdfReaderAdapter", () => {
  beforeEach(() => {
    getDestinationMock.mockReset();
    getDocumentMock.mockClear();
    getOutlineMock.mockReset();
    getPageIndexMock.mockReset();
    getPageMock.mockReset();
    getPageMock.mockImplementation(async (pageNumber: number) => ({
      cleanup: vi.fn(),
      pageNumber,
      getTextContent: vi.fn(async () => ({ items: [] })),
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
        rotation: 0,
      })),
      render: vi.fn(() => ({
        cancel: vi.fn(),
        promise: Promise.resolve(),
      })),
    }));
    textLayerCancelMock.mockClear();
    textLayerRenderMock.mockClear();
    destroyMock.mockClear();
    getDestinationMock.mockResolvedValue(null);
    getOutlineMock.mockResolvedValue(null);
    getPageIndexMock.mockResolvedValue(0);
    workerOptions.workerSrc = "";
  });

  it("opens a PDF with worker and bundled resource URLs", async () => {
    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      theme: {
        mode: "sepia",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#f7f1e3",
        textColor: "#25211d",
      },
      initialLocator: {
        kind: "pdf",
        page: 20,
        scale: 4,
      },
    });

    await adapter.open("pdf-book");

    expect(workerOptions.workerSrc).toContain("pdf.worker");
    expect(getDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "blob:pdf-book",
        cMapPacked: true,
        cMapUrl: expect.stringContaining("/pdfjs/cmaps/") as string,
        standardFontDataUrl: expect.stringContaining(
          "/pdfjs/standard_fonts/",
        ) as string,
        useWorkerFetch: true,
      }),
    );
    expect(await adapter.getCurrentLocator()).toEqual({
      kind: "pdf",
      page: 12,
      scale: 3,
      zoomMode: "custom",
    });
  });

  it("tracks page stepping and double-page mode", async () => {
    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      theme: {
        mode: "light",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#ffffff",
        textColor: "#111111",
      },
      initialLocator: {
        kind: "pdf",
        page: 3,
        scale: 1,
      },
    });

    await adapter.open("pdf-book");
    adapter.setViewMode("double", 1280);
    await adapter.next();

    expect(adapter.getVisiblePages()).toEqual([4, 5]);

    await adapter.previous();

    expect(adapter.getPosition()).toEqual(
      expect.objectContaining({
        page: 2,
        totalPages: 12,
        renderedMode: "double",
      }),
    );
  });

  it("maps PDF outline destinations into nested table of contents items", async () => {
    getOutlineMock.mockResolvedValueOnce([
      {
        title: "Cover",
        dest: [{ num: 7, gen: 0 }],
      },
      {
        title: "Part One",
        dest: "part-one",
        items: [
          {
            title: "Chapter One",
            dest: [2],
          },
        ],
      },
    ]);
    getDestinationMock.mockResolvedValueOnce([{ num: 9, gen: 0 }]);
    getPageIndexMock.mockImplementation(async (ref) => {
      if (ref.num === 7) {
        return 0;
      }

      if (ref.num === 9) {
        return 4;
      }

      return 0;
    });
    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      theme: {
        mode: "light",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#ffffff",
        textColor: "#111111",
      },
    });

    await adapter.open("pdf-book");

    expect(await adapter.getToc()).toEqual([
      {
        id: "pdf-outline-1",
        title: "Cover",
        locator: {
          kind: "pdf",
          page: 1,
        },
      },
      {
        id: "pdf-outline-2",
        title: "Part One",
        locator: {
          kind: "pdf",
          page: 5,
        },
        children: [
          {
            id: "pdf-outline-2-1",
            title: "Chapter One",
            locator: {
              kind: "pdf",
              page: 3,
            },
          },
        ],
      },
    ]);
    expect(getDestinationMock).toHaveBeenCalledWith("part-one");
  });

  it("falls back to page numbers when a PDF has no outline", async () => {
    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      theme: {
        mode: "light",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#ffffff",
        textColor: "#111111",
      },
    });

    await adapter.open("pdf-book");

    expect((await adapter.getToc()).slice(0, 3)).toEqual([
      {
        id: "pdf-page-1",
        title: "Page 1",
        locator: {
          kind: "pdf",
          page: 1,
        },
      },
      {
        id: "pdf-page-2",
        title: "Page 2",
        locator: {
          kind: "pdf",
          page: 2,
        },
      },
      {
        id: "pdf-page-3",
        title: "Page 3",
        locator: {
          kind: "pdf",
          page: 3,
        },
      },
    ]);
  });

  it("normalizes pages, scale, and progress", () => {
    expect(normalizePdfPage(Number.NaN, 12)).toBe(1);
    expect(normalizePdfPage(99, 12)).toBe(12);
    expect(normalizePdfScale(0.1)).toBe(0.5);
    expect(normalizePdfScale(6)).toBe(3);
    expect(pageToProgress(6, 11)).toBe(0.5);
    expect(progressToPdfPage(0.5, 3)).toBe(2);
    expect(progressToPdfPage(0.75, 3)).toBe(3);
    expect(progressToPdfPage(Number.NaN, 12)).toBe(1);
  });

  it("normalizes double-page spreads around the cover and odd last page", async () => {
    expect(getPdfSpreadStart(1, 12)).toBe(1);
    expect(getPdfSpreadStart(3, 12)).toBe(2);
    expect(getPdfSpreadStart(12, 12)).toBe(12);
    expect(nextPdfSpreadStart(1, 12)).toBe(2);
    expect(nextPdfSpreadStart(2, 12)).toBe(4);
    expect(previousPdfSpreadStart(4, 12)).toBe(2);
    expect(previousPdfSpreadStart(2, 12)).toBe(1);

    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      viewMode: "double",
      initialLocator: { kind: "pdf", page: 3 },
      theme: {
        mode: "light",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#ffffff",
        textColor: "#111111",
      },
    });
    await adapter.open("pdf-book");
    expect(adapter.getVisiblePages()).toEqual([2, 3]);
    await adapter.previous();
    expect(adapter.getVisiblePages()).toEqual([1]);
    await adapter.next();
    expect(adapter.getVisiblePages()).toEqual([2, 3]);
  });

  it("previews and commits PDF progress jumps by page", async () => {
    const positions: number[] = [];
    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      theme: {
        mode: "light",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#ffffff",
        textColor: "#111111",
      },
      onPositionChange: (position) => {
        positions.push(position.page);
      },
    });

    await adapter.open("pdf-book");

    expect(adapter.previewProgress(0.5)).toEqual(
      expect.objectContaining({
        page: 7,
        progression: 6 / 11,
      }),
    );
    expect(adapter.getPosition().page).toBe(1);

    await adapter.goToProgress(0.5);

    expect(adapter.getPosition()).toEqual(
      expect.objectContaining({
        page: 7,
        progression: 6 / 11,
      }),
    );
    expect(positions.at(-1)).toBe(7);
  });

  it("maps continuous progress to a page and a clamped in-page offset", () => {
    expect(pdfContinuousPositionToProgress(2, 0.5, 4)).toBe(0.375);
    expect(pdfContinuousPositionToProgress(2, -10, 4)).toBe(0.25);
    expect(pdfContinuousPositionToProgress(2, 10, 4)).toBe(0.5);
    expect(progressToPdfContinuousPosition(0.375, 4)).toEqual({
      page: 2,
      pageOffsetRatio: 0.5,
    });
    expect(progressToPdfContinuousPosition(1, 4)).toEqual({
      page: 4,
      pageOffsetRatio: 1,
    });
  });

  it("loads and caches page metrics without walking the document", async () => {
    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      theme: {
        mode: "light",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#ffffff",
        textColor: "#111111",
      },
    });
    await adapter.open("pdf-book");
    getPageMock.mockClear();

    await expect(adapter.getPageMetrics(7)).resolves.toEqual({
      pageNumber: 7,
      width: 600,
      height: 800,
      rotation: 0,
    });
    await adapter.getPageMetrics(7);

    expect(getPageMock).toHaveBeenCalledTimes(1);
    expect(getPageMock).toHaveBeenCalledWith(7);
    expect(adapter.getCachedPageMetrics(7)?.height).toBe(800);
  });

  it("keeps concurrent page render tasks independent and releases backing stores", async () => {
    const tasks = new Map<
      number,
      {
        cancel: ReturnType<typeof vi.fn>;
        reject: (error: Error) => void;
        resolve: () => void;
      }
    >();
    getPageMock.mockImplementation(async (pageNumber: number) => ({
      cleanup: vi.fn(),
      pageNumber,
      getTextContent: vi.fn(async () => ({ items: [] })),
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
        rotation: 0,
      })),
      render: vi.fn(() => {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<void>((resolvePromise, rejectPromise) => {
          resolve = resolvePromise;
          reject = rejectPromise;
        });
        const cancel = vi.fn(() => {
          const error = new Error("Rendering cancelled");
          error.name = "RenderingCancelledException";
          reject(error);
        });
        tasks.set(pageNumber, { cancel, reject, resolve });
        return { cancel, promise };
      }),
    }));
    const adapter = createPdfAdapter();
    await adapter.open("pdf-book");
    const firstCanvas = document.createElement("canvas");
    const secondCanvas = document.createElement("canvas");
    vi.spyOn(firstCanvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(secondCanvas, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    const firstRender = adapter.renderPage(firstCanvas, 1);
    const secondRender = adapter.renderPage(secondCanvas, 2);
    await vi.waitFor(() => {
      expect(adapter.getRenderLifecycleSnapshot().activeRenderTasks).toBe(2);
    });

    adapter.cancelPageRender(1);
    expect(tasks.get(1)?.cancel).toHaveBeenCalledOnce();
    expect(adapter.getRenderLifecycleSnapshot().activeRenderTasks).toBe(1);
    tasks.get(2)?.resolve();

    await expect(firstRender).rejects.toMatchObject({
      name: "RenderingCancelledException",
    });
    await expect(secondRender).resolves.toEqual(
      expect.objectContaining({ pageNumber: 2 }),
    );

    adapter.releasePageSurface(1, firstCanvas);
    adapter.releasePageSurface(2, secondCanvas);
    expect(firstCanvas.width).toBe(0);
    expect(secondCanvas.height).toBe(0);
    expect(adapter.getRenderLifecycleSnapshot()).toEqual(
      expect.objectContaining({ activePages: 0, activeRenderTasks: 0 }),
    );
  });

  it("renders and releases a cancellable canvas and text-layer handle", async () => {
    const adapter = createPdfAdapter();
    await adapter.open("pdf-book");
    const canvas = document.createElement("canvas");
    const textLayer = document.createElement("div");
    textLayer.append(document.createElement("span"));
    vi.spyOn(canvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);

    const handle = adapter.createPageSurfaceRender({
      canvas,
      pageNumber: 4,
      renderTextLayer: true,
      scale: 1,
      textLayer,
    });
    await expect(handle.ready).resolves.toEqual(
      expect.objectContaining({ pageNumber: 4 }),
    );
    expect(textLayerRenderMock).toHaveBeenCalledOnce();

    handle.release();
    expect(canvas.width).toBe(0);
    expect(textLayer.childElementCount).toBe(0);
    expect(adapter.getRenderLifecycleSnapshot().activePages).toBe(0);
  });

  it("restores and reports a continuous in-page locator", async () => {
    const adapter = new PdfReaderAdapter({
      bookId: "pdf-book",
      sourceUrl: "blob:pdf-book",
      viewMode: "continuous",
      initialLocator: {
        kind: "pdf",
        page: 3,
        pageOffsetRatio: 0.75,
      },
      theme: {
        mode: "light",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphSpacing: 12,
        pageMargin: 32,
        backgroundColor: "#ffffff",
        textColor: "#111111",
      },
    });

    await adapter.open("pdf-book");

    expect(adapter.getPosition()).toEqual(
      expect.objectContaining({
        page: 3,
        progression: 2.75 / 12,
        renderedMode: "continuous",
        locator: expect.objectContaining({ pageOffsetRatio: 0.75 }),
      }),
    );

    await adapter.goToProgress(0.5);
    expect(adapter.getPosition()).toEqual(
      expect.objectContaining({
        page: 7,
        progression: 0.5,
        locator: expect.objectContaining({ pageOffsetRatio: 0 }),
      }),
    );
  });
});
