import type { Book } from "@reader/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prepareBookCover } from "./bookCovers";
import { getEpubBookSource } from "../tauri/reader";
import { markBookCoverFallback } from "../tauri/library";

vi.mock("../tauri/reader", () => ({
  getEpubBookSource: vi.fn(),
  getPdfBookSource: vi.fn(),
}));

vi.mock("../tauri/library", () => ({
  markBookCoverFallback: vi.fn(),
  saveBookCover: vi.fn(),
}));

const getEpubBookSourceMock = vi.mocked(getEpubBookSource);
const markBookCoverFallbackMock = vi.mocked(markBookCoverFallback);

describe("prepareBookCover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markBookCoverFallbackMock.mockImplementation(async (bookId) => ({
      ...createBook(),
      id: bookId,
      coverStatus: "fallback",
    }));
  });

  it("marks TXT books as fallback without attempting extraction", async () => {
    const book = createBook({ format: "txt", coverStatus: "pending" });

    const result = await prepareBookCover(book);

    expect(result.coverStatus).toBe("fallback");
    expect(markBookCoverFallbackMock).toHaveBeenCalledWith(book.id);
    expect(getEpubBookSourceMock).not.toHaveBeenCalled();
  });

  it("falls back when an EPUB cover cannot be extracted", async () => {
    const book = createBook({ format: "epub", coverStatus: "pending" });
    getEpubBookSourceMock.mockRejectedValueOnce(new Error("missing source"));

    const result = await prepareBookCover(book);

    expect(result.coverStatus).toBe("fallback");
    expect(markBookCoverFallbackMock).toHaveBeenCalledWith(book.id);
  });

  it("does not process a settled cover again", async () => {
    const book = createBook({ coverStatus: "ready" });

    await expect(prepareBookCover(book)).resolves.toBe(book);
    expect(markBookCoverFallbackMock).not.toHaveBeenCalled();
  });
});

function createBook(overrides: Partial<Book> = {}): Book {
  const format = overrides.format ?? "epub";
  const libraryPath = overrides.libraryPath ?? "D:\\library\\cover.epub";
  const fileHash = overrides.fileHash ?? "cover-hash";
  return {
    id: "cover-book",
    title: "Cover Book",
    format,
    sourcePath: "D:\\books\\cover.epub",
    libraryPath,
    fileHash,
    readerFormat: format === "mobi" || format === "azw3" ? "epub" : format,
    readerPath: overrides.readerPath ?? libraryPath,
    readerHash: overrides.readerHash ?? fileHash,
    coverStatus: "pending",
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...overrides,
  };
}
