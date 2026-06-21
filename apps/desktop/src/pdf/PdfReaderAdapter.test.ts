import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizePdfPage,
  normalizePdfScale,
  pageToProgress,
  progressToPdfPage,
  PdfReaderAdapter,
} from "./PdfReaderAdapter";

const destroyMock = vi.hoisted(() => vi.fn(async () => undefined));
const getDestinationMock = vi.hoisted(() =>
  vi.fn(async (id: string): Promise<unknown[] | null> => {
    void id;

    return null;
  }),
);
const getDocumentMock = vi.hoisted(() =>
  vi.fn(() => ({
    destroy: destroyMock,
    promise: Promise.resolve({
      numPages: 12,
      getDestination: getDestinationMock,
      getOutline: getOutlineMock,
      getPage: vi.fn(async (pageNumber: number) => ({
        pageNumber,
        getViewport: vi.fn(({ scale }: { scale: number }) => ({
          width: 600 * scale,
          height: 800 * scale,
        })),
        render: vi.fn(() => ({
          cancel: vi.fn(),
          promise: Promise.resolve(),
        })),
      })),
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

vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: workerOptions,
}));

describe("PdfReaderAdapter", () => {
  beforeEach(() => {
    getDestinationMock.mockReset();
    getDocumentMock.mockClear();
    getOutlineMock.mockReset();
    getPageIndexMock.mockReset();
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

    expect(adapter.getVisiblePages()).toEqual([5, 6]);

    await adapter.previous();

    expect(adapter.getPosition()).toEqual(
      expect.objectContaining({
        page: 3,
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
});
