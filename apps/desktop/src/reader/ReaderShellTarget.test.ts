import type { LibrarySearchHit, SearchHit } from "@reader/core";
import { describe, expect, it } from "vitest";

import { findLibrarySearchTargetHit } from "./ReaderSearchTarget";

const requestBase: Omit<LibrarySearchHit, "target"> = {
  id: "library-hit",
  bookId: "book",
  title: "Book",
  format: "epub",
  readerFormat: "epub",
  availability: "available",
  excerpt: "history",
  excerptMatchStart: 0,
  excerptMatchEnd: 7,
  locationLabel: "Chapter",
};

describe("library search reader targets", () => {
  it("matches EPUB hrefs even when the adapter includes the OPF directory", () => {
    const hits: SearchHit[] = [
      {
        id: "first",
        excerpt: "history",
        locator: { kind: "epub", href: "OPS/first.xhtml", cfi: "first" },
      },
      {
        id: "target",
        excerpt: "history",
        locator: { kind: "epub", href: "OPS/chapter.xhtml", cfi: "target" },
      },
    ];
    expect(
      findLibrarySearchTargetHit(hits, {
        ...requestBase,
        target: { kind: "epub", href: "chapter.xhtml" },
      })?.id,
    ).toBe("target");
  });

  it("uses the chapter or page match index for repeated passages", () => {
    const epubHits: SearchHit[] = ["first", "second"].map((id) => ({
      id,
      excerpt: "history",
      locator: { kind: "epub", href: "OPS/chapter.xhtml", cfi: id },
    }));
    expect(
      findLibrarySearchTargetHit(epubHits, {
        ...requestBase,
        target: { kind: "epub", href: "chapter.xhtml", matchIndex: 1 },
      })?.id,
    ).toBe("second");

    const pdfHits: SearchHit[] = ["page-first", "page-second"].map((id) => ({
      id,
      excerpt: "history",
      locator: { kind: "pdf", page: 18 },
    }));
    expect(
      findLibrarySearchTargetHit(pdfHits, {
        ...requestBase,
        format: "pdf",
        readerFormat: "pdf",
        target: { kind: "pdf", page: 18, matchIndex: 1 },
      })?.id,
    ).toBe("page-second");
  });

  it("chooses the nearest TXT character offset and exact PDF page", () => {
    const txtHits: SearchHit[] = [100, 420].map((charOffset) => ({
      id: `txt-${charOffset}`,
      excerpt: "history",
      locator: { kind: "txt", charOffset },
    }));
    expect(
      findLibrarySearchTargetHit(txtHits, {
        ...requestBase,
        format: "txt",
        readerFormat: "txt",
        target: { kind: "txt", charOffset: 400 },
      })?.id,
    ).toBe("txt-420");

    const pdfHits: SearchHit[] = [2, 18].map((page) => ({
      id: `pdf-${page}`,
      excerpt: "history",
      locator: { kind: "pdf", page },
    }));
    expect(
      findLibrarySearchTargetHit(pdfHits, {
        ...requestBase,
        format: "pdf",
        readerFormat: "pdf",
        target: { kind: "pdf", page: 18 },
      })?.id,
    ).toBe("pdf-18");
  });
});
