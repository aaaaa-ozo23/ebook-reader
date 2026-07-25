import type { TxtDocument } from "@reader/core";
import { describe, expect, it } from "vitest";

import { searchTxtDocument } from "./ReaderFormatContents";

describe("TXT multilingual search", () => {
  it("keeps original offsets after Unicode normalization and case folding", () => {
    const text = "序章。Un café déjà vu. Straße. 结尾。";
    const document: TxtDocument = {
      book: {
        id: "txt-search",
        title: "Search fixture",
        author: "Test",
        format: "txt",
        libraryPath: "library/search.txt",
        fileHash: "source-hash",
        readerFormat: "txt",
        readerPath: "library/search.txt",
        readerHash: "source-hash",
        coverStatus: "fallback",
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
      byteLength: text.length,
      charCount: text.length,
      chapters: [
        {
          id: "chapter-1",
          startChar: 0,
          endChar: text.length,
          text,
          title: "Chapter 1",
        },
      ],
      encoding: "utf-8",
      lineCount: 1,
    };

    const accentHit = searchTxtDocument(document, "CAFE\u0301 DE\u0301JA\u0300")[0];
    const sharpS = searchTxtDocument(document, "STRASSE")[0];

    expect(accentHit?.locator.selectedText).toBe("café déjà");
    expect(
      text.slice(accentHit?.locator.charOffset, accentHit?.locator.endCharOffset),
    ).toBe("café déjà");
    expect(sharpS?.locator.selectedText).toBe("Straße");
  });
});
