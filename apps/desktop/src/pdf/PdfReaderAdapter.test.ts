import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizePdfPage,
  normalizePdfScale,
  pageToProgress,
  PdfReaderAdapter,
} from "./PdfReaderAdapter";

const destroyMock = vi.hoisted(() => vi.fn(async () => undefined));
const getDocumentMock = vi.hoisted(() =>
  vi.fn(() => ({
    destroy: destroyMock,
    promise: Promise.resolve({
      numPages: 12,
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
    }),
  })),
);
const workerOptions = vi.hoisted(() => ({ workerSrc: "" }));

vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: workerOptions,
}));

describe("PdfReaderAdapter", () => {
  beforeEach(() => {
    getDocumentMock.mockClear();
    destroyMock.mockClear();
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
        standardFontDataUrl: expect.stringContaining("/pdfjs/standard_fonts/") as string,
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

  it("normalizes pages, scale, and progress", () => {
    expect(normalizePdfPage(Number.NaN, 12)).toBe(1);
    expect(normalizePdfPage(99, 12)).toBe(12);
    expect(normalizePdfScale(0.1)).toBe(0.5);
    expect(normalizePdfScale(6)).toBe(3);
    expect(pageToProgress(6, 11)).toBe(0.5);
  });
});
