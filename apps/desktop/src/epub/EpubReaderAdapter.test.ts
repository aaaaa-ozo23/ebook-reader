import { defaultReaderTheme, type ReaderTheme } from "@reader/core";
import { describe, expect, it, vi } from "vitest";

import {
  buildEpubThemeRules,
  EpubReaderAdapter,
  nextEpubLocationIndex,
  progressionToEpubLocation,
} from "./EpubReaderAdapter";

describe("buildEpubThemeRules", () => {
  it("maps reader theme tokens into EPUB iframe CSS rules", () => {
    const theme: ReaderTheme = {
      ...defaultReaderTheme,
      mode: "dark",
      backgroundColor: "#171a1d",
      textColor: "#f0e8d7",
      fontFamily: "Georgia, serif",
      fontSize: 22,
      lineHeight: 1.9,
      paragraphSpacing: 18,
      pageMargin: 34,
    };

    const rules = buildEpubThemeRules(theme);

    expect(rules.html).toMatchObject({
      background: "#171a1d !important",
      color: "#f0e8d7 !important",
    });
    expect(rules.body).toMatchObject({
      background: "#171a1d !important",
      color: "#f0e8d7 !important",
      "font-family": "Georgia, serif !important",
      "font-size": "22px !important",
      "line-height": "1.9 !important",
      margin: "0 !important",
      padding: "0 34px !important",
      "user-select": "text !important",
    });
    expect(rules["body, p, div, section, article"]).toMatchObject({
      "user-select": "text !important",
    });
    expect(rules.p).toMatchObject({
      "margin-bottom": "18px !important",
      "margin-top": "0 !important",
    });
    expect(rules["a, a:visited"]).toMatchObject({
      color: "#f3bc55",
    });
    expect(rules[".reader-epub-viewable-image:focus-visible"]).toMatchObject({
      outline: "3px solid #f3bc55 !important",
    });
  });

  it("maps generated locations progress to EPUB locations", () => {
    expect(progressionToEpubLocation(0, 10)).toBe(1);
    expect(progressionToEpubLocation(0.5, 10)).toBe(6);
    expect(progressionToEpubLocation(1, 10)).toBe(10);
    expect(progressionToEpubLocation(2, 10)).toBe(10);
  });

  it("maps page navigation to generated location indexes", () => {
    expect(nextEpubLocationIndex(1, 10)).toBe(1);
    expect(nextEpubLocationIndex(9, 10)).toBe(9);
    expect(nextEpubLocationIndex(10, 10)).toBeNull();
    expect(nextEpubLocationIndex(null, 10)).toBeNull();
  });
});

describe("EPUB selection annotations", () => {
  function createAdapter(onSelected = vi.fn()) {
    return new EpubReaderAdapter({
      bookId: "epub-book",
      container: document.createElement("div"),
      onSelected,
      sourceUrl: "blob:epub-book",
      theme: defaultReaderTheme,
    });
  }

  it("anchors the selection menu to the visible rendition range", async () => {
    const onSelected = vi.fn();
    const adapter = createAdapter(onSelected);
    const frameElement = {
      getBoundingClientRect: () => ({ left: 320, top: 140 }),
    };
    const visibleRange = {
      commonAncestorContainer: { textContent: "Before selected text after" },
      getBoundingClientRect: () => ({ height: 24, left: 48, top: 260, width: 120 }),
      getClientRects: () => [{ height: 24, left: 48, top: 260, width: 120 }],
      startContainer: {
        ownerDocument: {
          defaultView: { frameElement },
        },
      },
      toString: () => "selected text",
    } as unknown as Range;
    const fallbackRange = {
      ...visibleRange,
      getClientRects: () => [],
    } as unknown as Range;
    const bookGetRange = vi.fn().mockResolvedValue(fallbackRange);
    const renditionGetRange = vi.fn(() => visibleRange);
    const internals = adapter as unknown as {
      book: { getRange: typeof bookGetRange };
      captureSelection: (cfiRange: string) => Promise<void>;
      rendition: { getRange: typeof renditionGetRange };
    };

    internals.book = { getRange: bookGetRange };
    internals.rendition = { getRange: renditionGetRange };

    await internals.captureSelection("epubcfi(/6/2!/4/2,/1:0,/1:13)");

    expect(renditionGetRange).toHaveBeenCalled();
    expect(bookGetRange).not.toHaveBeenCalled();
    expect(onSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorRect: {
          height: 24,
          left: 368,
          top: 400,
          width: 120,
        },
        selectedText: "selected text",
      }),
    );
  });

  it("keeps the underline hit rect unpainted", () => {
    const adapter = createAdapter();
    const underline = vi.fn();
    const internals = adapter as unknown as {
      rendition: { annotations: { underline: typeof underline } };
    };
    internals.rendition = { annotations: { underline } };

    adapter.addUnderline("epubcfi(/6/2!/4/2,/1:0,/1:13)", "#77a86b");

    expect(underline).toHaveBeenCalledWith(
      expect.any(String),
      {},
      undefined,
      "reader-epub-note-underline",
      expect.objectContaining({
        stroke: "#77a86b",
        "stroke-dasharray": "3 3",
        "stroke-width": "0",
      }),
    );
  });
});

describe("EPUB rendition image lifecycle", () => {
  it("registers image activation with the content document and cleans it up", () => {
    const onImageActivate = vi.fn();
    const adapter = new EpubReaderAdapter({
      bookId: "epub-images",
      container: document.createElement("div"),
      onImageActivate,
      sourceUrl: "blob:epub-images",
      theme: defaultReaderTheme,
    });
    const frameDocument = document.implementation.createHTMLDocument("EPUB frame");
    frameDocument.body.innerHTML = `<img src="blob:plate" alt="Plate" />`;
    const image = frameDocument.querySelector("img") as HTMLImageElement;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      currentSrc: { configurable: true, value: "blob:plate" },
      naturalHeight: { configurable: true, value: 600 },
      naturalWidth: { configurable: true, value: 800 },
    });
    const internals = adapter as unknown as {
      observeSelectionDocument: (document: Document) => void;
      stopSelectionObservers: () => void;
    };

    internals.observeSelectionDocument(frameDocument);
    image.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(onImageActivate).toHaveBeenCalledTimes(1);

    internals.stopSelectionObservers();
    image.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(onImageActivate).toHaveBeenCalledTimes(1);
  });
});

describe("EPUB layout invalidation", () => {
  it("cancels animation consumers and restores the current CFI after theme changes", async () => {
    const onLayoutInvalidated = vi.fn();
    const adapter = new EpubReaderAdapter({
      bookId: "epub-layout",
      container: document.createElement("div"),
      onLayoutInvalidated,
      sourceUrl: "blob:epub-layout",
      theme: defaultReaderTheme,
    });
    const display = vi.fn(async () => undefined);
    const register = vi.fn();
    const select = vi.fn();
    const font = vi.fn();
    const fontSize = vi.fn();
    const internals = adapter as unknown as {
      lastPosition: {
        locator: { kind: "epub"; href: string; cfi: string };
      } | null;
      rendition: {
        display: typeof display;
        themes: {
          register: typeof register;
          select: typeof select;
          font: typeof font;
          fontSize: typeof fontSize;
        };
      } | null;
    };
    internals.lastPosition = {
      locator: {
        kind: "epub",
        href: "OPS/chapter.xhtml",
        cfi: "epubcfi(/6/2!/4/2/2:0)",
      },
    };
    internals.rendition = {
      display,
      themes: { register, select, font, fontSize },
    };

    await adapter.setTheme({ ...defaultReaderTheme, fontSize: 24 });

    expect(onLayoutInvalidated).toHaveBeenCalledWith("theme");
    expect(display).toHaveBeenCalledWith("epubcfi(/6/2!/4/2/2:0)");
  });
});
