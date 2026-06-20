import type {
  EpubLocator,
  ReaderAdapter,
  ReaderTheme,
  SearchHit,
  TocItem,
} from "@reader/core";
import type { Book as EpubBook, Location, NavItem, Rendition } from "epubjs";

interface EpubReaderAdapterOptions {
  bookId: string;
  sourceUrl: string;
  container: HTMLElement;
  initialLocator?: EpubLocator;
  theme: ReaderTheme;
  onRelocated?: (locator: EpubLocator, progress?: number) => void;
  onSelected?: (selection: EpubSelectionSnapshot) => void;
}

export interface EpubSelectionSnapshot {
  cfiRange: string;
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
}

interface EpubLocationLike {
  href?: string;
  cfi?: string;
  percentage?: number;
}

const EPUB_THEME_NAME = "reader-theme";
const SELECTION_CONTEXT_LENGTH = 80;

export class EpubReaderAdapter implements ReaderAdapter<EpubLocator> {
  private readonly bookId: string;
  private readonly sourceUrl: string;
  private readonly container: HTMLElement;
  private readonly initialLocator?: EpubLocator;
  private readonly onRelocated?: (locator: EpubLocator, progress?: number) => void;
  private readonly onSelected?: (selection: EpubSelectionSnapshot) => void;
  private book: EpubBook | null = null;
  private rendition: Rendition | null = null;
  private theme: ReaderTheme;

  constructor(options: EpubReaderAdapterOptions) {
    this.bookId = options.bookId;
    this.sourceUrl = options.sourceUrl;
    this.container = options.container;
    this.initialLocator = options.initialLocator;
    this.theme = options.theme;
    this.onRelocated = options.onRelocated;
    this.onSelected = options.onSelected;
  }

  async open(bookId: string): Promise<void> {
    if (bookId !== this.bookId) {
      throw new Error(`EPUB adapter was initialized for ${this.bookId}, not ${bookId}.`);
    }

    await this.close();

    const { default: createEpub } = await import("epubjs");
    const book = createEpub(this.sourceUrl, {
      openAs: "epub",
      replacements: "blobUrl",
    });
    const rendition = book.renderTo(this.container, {
      allowScriptedContent: false,
      flow: "paginated",
      height: "100%",
      manager: "default",
      spread: "none",
      width: "100%",
    });

    this.book = book;
    this.rendition = rendition;
    this.registerRenditionEvents(rendition);
    await this.setTheme(this.theme);
    await rendition.display(this.initialLocator?.cfi ?? this.initialLocator?.href);
  }

  async close(): Promise<void> {
    if (this.rendition !== null) {
      this.rendition.destroy();
      this.rendition = null;
    }

    if (this.book !== null) {
      this.book.destroy();
      this.book = null;
    }

    this.container.replaceChildren();
  }

  async getToc(): Promise<TocItem[]> {
    const book = this.requireBook();
    const navigation = await book.loaded.navigation;

    return navigation.toc.map(mapNavItemToTocItem);
  }

  async goTo(locator: EpubLocator): Promise<void> {
    const rendition = this.requireRendition();

    await rendition.display(locator.cfi ?? locator.href);
  }

  async next(): Promise<void> {
    await this.requireRendition().next();
  }

  async previous(): Promise<void> {
    await this.requireRendition().prev();
  }

  async getCurrentLocator(): Promise<EpubLocator> {
    const rendition = this.requireRendition();
    const location = await Promise.resolve(rendition.currentLocation());

    return locationToLocator(location);
  }

  async setTheme(theme: ReaderTheme): Promise<void> {
    this.theme = theme;

    if (this.rendition === null) {
      return;
    }

    this.rendition.themes.register(EPUB_THEME_NAME, buildEpubThemeRules(theme));
    this.rendition.themes.select(EPUB_THEME_NAME);
    this.rendition.themes.font(theme.fontFamily);
    this.rendition.themes.fontSize(`${theme.fontSize}px`);
  }

  async search(query: string): Promise<SearchHit<EpubLocator>[]> {
    void query;

    return [];
  }

  addHighlight(cfiRange: string): void {
    const rendition = this.requireRendition();

    rendition.annotations.highlight(
      cfiRange,
      {},
      undefined,
      "reader-epub-highlight",
      {
        fill: "#f3bc55",
        "fill-opacity": "0.32",
        "mix-blend-mode": "multiply",
      },
    );
  }

  removeHighlight(cfiRange: string): void {
    const rendition = this.requireRendition();

    rendition.annotations.remove(cfiRange, "highlight");
  }

  private registerRenditionEvents(rendition: Rendition): void {
    rendition.on("relocated", (location: Location) => {
      const locator = locationToLocator(location);
      this.onRelocated?.(locator, locator.progression);
    });

    rendition.on("selected", (cfiRange: string, contents: { window?: Window }) => {
      void this.captureSelection(cfiRange, contents);
    });
  }

  private async captureSelection(
    cfiRange: string,
    contents: { window?: Window },
  ): Promise<void> {
    if (this.book === null) {
      return;
    }

    const range = await this.book.getRange(cfiRange);
    const selectedText = range?.toString() ?? undefined;
    this.onSelected?.({
      cfiRange,
      selectedText,
      ...getRangeContext(range),
    });
    contents.window?.getSelection()?.removeAllRanges();
  }

  private requireBook(): EpubBook {
    if (this.book === null) {
      throw new Error("EPUB book is not open.");
    }

    return this.book;
  }

  private requireRendition(): Rendition {
    if (this.rendition === null) {
      throw new Error("EPUB rendition is not open.");
    }

    return this.rendition;
  }
}

function mapNavItemToTocItem(item: NavItem): TocItem {
  return {
    id: item.id || item.href,
    title: item.label,
    href: item.href,
    locator: {
      kind: "epub",
      href: item.href,
    },
    children: item.subitems?.map(mapNavItemToTocItem),
  };
}

function locationToLocator(location: Location | EpubLocationLike): EpubLocator {
  const start = "start" in location ? location.start : location;
  const href = start.href ?? "";
  const progression = clampProgress(start.percentage);

  return {
    kind: "epub",
    href,
    cfi: start.cfi,
    progression,
  };
}

function clampProgress(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

export function buildEpubThemeRules(theme: ReaderTheme): Record<string, Record<string, string>> {
  return {
    html: {
      background: `${theme.backgroundColor} !important`,
      color: `${theme.textColor} !important`,
    },
    body: {
      background: `${theme.backgroundColor} !important`,
      color: `${theme.textColor} !important`,
      "font-family": `${theme.fontFamily} !important`,
      "font-size": `${theme.fontSize}px !important`,
      "line-height": `${theme.lineHeight} !important`,
      margin: "0 !important",
      padding: `0 ${theme.pageMargin}px !important`,
    },
    "body, p, div, section, article": {
      color: `${theme.textColor} !important`,
      "font-family": `${theme.fontFamily} !important`,
      "line-height": `${theme.lineHeight} !important`,
    },
    p: {
      "margin-top": "0 !important",
      "margin-bottom": `${theme.paragraphSpacing}px !important`,
    },
    "a, a:visited": {
      color: theme.mode === "dark" ? "#f3bc55" : "#2f5d62",
    },
    "::selection": {
      background: "rgba(243, 188, 85, 0.32)",
    },
    ".reader-epub-highlight": {
      fill: "#f3bc55",
      "fill-opacity": "0.32",
      "mix-blend-mode": "multiply",
    },
  };
}

function getRangeContext(range: Range | null): Pick<
  EpubSelectionSnapshot,
  "contextBefore" | "contextAfter"
> {
  if (range === null) {
    return {};
  }

  const containerText = range.commonAncestorContainer.textContent ?? "";
  const selectedText = range.toString();
  const selectedIndex = containerText.indexOf(selectedText);

  if (selectedIndex === -1) {
    return {};
  }

  return {
    contextBefore: containerText
      .slice(Math.max(0, selectedIndex - SELECTION_CONTEXT_LENGTH), selectedIndex)
      .trim(),
    contextAfter: containerText
      .slice(selectedIndex + selectedText.length, selectedIndex + selectedText.length + SELECTION_CONTEXT_LENGTH)
      .trim(),
  };
}
