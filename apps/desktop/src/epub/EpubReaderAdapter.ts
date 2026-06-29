import type {
  EpubLocator,
  ReaderAdapter,
  ReaderTheme,
  SearchHit,
  TocItem,
} from "@reader/core";
import type { Book as EpubBook, Location, NavItem, Rendition } from "epubjs";

export type EpubSpreadMode = "single" | "double";

export interface EpubPosition {
  locator: EpubLocator;
  progression: number | null;
  page: number | null;
  totalPages: number | null;
  displayedPage: number | null;
  displayedTotal: number | null;
  locationsReady: boolean;
}

export interface EpubProgressPreview {
  locator: EpubLocator;
  progression: number;
  page: number;
  totalPages: number;
  locationsReady: true;
}

export interface EpubSpreadState {
  requested: EpubSpreadMode;
  rendered: EpubSpreadMode;
  canRenderDouble: boolean;
}

interface EpubReaderAdapterOptions {
  bookId: string;
  sourceUrl: string;
  container: HTMLElement;
  initialLocator?: EpubLocator;
  theme: ReaderTheme;
  onRelocated?: (position: EpubPosition) => void;
  onKeyDown?: (event: globalThis.KeyboardEvent) => void;
  onSelected?: (selection: EpubSelectionSnapshot) => void;
  onSelectionCleared?: () => void;
  onSpreadChange?: (state: EpubSpreadState) => void;
}

export interface EpubSelectionSnapshot {
  cfiRange: string;
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorRect?: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
}

interface EpubLocationLike {
  href?: string;
  cfi?: string;
  percentage?: number;
  location?: number;
  displayed?: {
    page?: number;
    total?: number;
  };
  start?: EpubLocationLike;
}

interface EpubSearchSection {
  href?: string;
  load?: (loader?: unknown) => Promise<unknown> | unknown;
  find?: (query: string) => Array<{ cfi?: string; excerpt?: string }>;
  unload?: () => void;
}

interface EpubSearchableBook {
  load?: unknown;
  spine?: {
    each?: (callback: (section: EpubSearchSection) => void) => void;
    spineItems?: EpubSearchSection[];
  };
}

const EPUB_THEME_NAME = "reader-theme";
const EPUB_LOCATION_CHARS = 1500;
const EPUB_MIN_SPREAD_WIDTH = 860;
const SELECTION_CONTEXT_LENGTH = 80;

type RenderedRendition = Rendition & {
  manager?: {
    resize?: (width: number, height: number) => void;
  };
};

type EpubAnnotationClickHandler = (event: MouseEvent) => void;

interface EpubRenderedView {
  contents?: {
    document?: Document;
  };
  document?: Document;
}

export class EpubReaderAdapter implements ReaderAdapter<EpubLocator> {
  private readonly bookId: string;
  private readonly sourceUrl: string;
  private readonly container: HTMLElement;
  private readonly initialLocator?: EpubLocator;
  private readonly onRelocated?: (position: EpubPosition) => void;
  private readonly onKeyDown?: (event: globalThis.KeyboardEvent) => void;
  private readonly onSelected?: (selection: EpubSelectionSnapshot) => void;
  private readonly onSelectionCleared?: () => void;
  private readonly onSpreadChange?: (state: EpubSpreadState) => void;
  private book: EpubBook | null = null;
  private locationsPromise: Promise<void> | null = null;
  private locationsReady = false;
  private lastPosition: EpubPosition | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rendition: Rendition | null = null;
  private selectionCleanupCallbacks: Array<() => void> = [];
  private selectionDocuments = new WeakSet<Document>();
  private spreadMode: EpubSpreadMode = "single";
  private spreadState: EpubSpreadState = {
    requested: "single",
    rendered: "single",
    canRenderDouble: false,
  };
  private theme: ReaderTheme;
  private windowResizeHandler: (() => void) | null = null;

  constructor(options: EpubReaderAdapterOptions) {
    this.bookId = options.bookId;
    this.sourceUrl = options.sourceUrl;
    this.container = options.container;
    this.initialLocator = options.initialLocator;
    this.theme = options.theme;
    this.onRelocated = options.onRelocated;
    this.onKeyDown = options.onKeyDown;
    this.onSelected = options.onSelected;
    this.onSelectionCleared = options.onSelectionCleared;
    this.onSpreadChange = options.onSpreadChange;
  }

  async open(bookId: string): Promise<void> {
    if (bookId !== this.bookId) {
      throw new Error(`EPUB adapter was initialized for ${this.bookId}, not ${bookId}.`);
    }

    await this.close();
    this.locationsReady = false;
    this.lastPosition = null;

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
      minSpreadWidth: EPUB_MIN_SPREAD_WIDTH,
      spread: this.getRenderedSpreadOption(),
      width: "100%",
    });

    this.book = book;
    this.rendition = rendition;
    this.registerRenditionEvents(rendition);
    this.startResizeObserver();
    await this.setTheme(this.theme);
    await rendition.display(this.initialLocator?.cfi ?? this.initialLocator?.href);
    await this.reportCurrentPosition();
    void this.generateLocations(book);
  }

  async close(): Promise<void> {
    this.stopResizeObserver();
    this.stopSelectionObservers();
    this.locationsPromise = null;
    this.locationsReady = false;
    this.lastPosition = null;

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
    if (this.locationsReady) {
      const currentPosition = this.lastPosition ?? (await this.getCurrentPosition());
      const isFinalPageBoundary =
        currentPosition.page !== null &&
        currentPosition.totalPages !== null &&
        currentPosition.page >= currentPosition.totalPages - 1;
      const nextLocationIndex = isFinalPageBoundary
        ? nextEpubLocationIndex(currentPosition.page, currentPosition.totalPages)
        : null;

      if (nextLocationIndex !== null) {
        await this.goToLocationIndex(nextLocationIndex);
        return;
      }
    }

    await this.requireRendition().next();
  }

  async previous(): Promise<void> {
    await this.requireRendition().prev();
  }

  async getCurrentLocator(): Promise<EpubLocator> {
    const position = await this.getCurrentPosition();

    return position.locator;
  }

  async getCurrentPosition(): Promise<EpubPosition> {
    const rendition = this.requireRendition();
    const location = await Promise.resolve(rendition.currentLocation());

    return this.locationToPosition(location);
  }

  previewProgress(progression: number): EpubProgressPreview {
    const book = this.requireBook();
    const totalPages = this.getTotalPages();

    if (!this.locationsReady || totalPages === null) {
      throw new Error("EPUB locations are not ready.");
    }

    const nextProgression = clampProgressValue(progression);
    const cfi = book.locations.cfiFromPercentage(nextProgression);
    const page = progressionToEpubPage(nextProgression, totalPages);
    const href = getSectionHrefForCfi(book, cfi) ?? this.lastPosition?.locator.href ?? "";

    return {
      locator: {
        kind: "epub",
        href,
        cfi,
        progression: nextProgression,
      },
      progression: nextProgression,
      page,
      totalPages,
      locationsReady: true,
    };
  }

  async goToProgress(progression: number): Promise<void> {
    const book = this.requireBook();
    const rendition = this.requireRendition();

    if (!this.locationsReady || this.getTotalPages() === null) {
      throw new Error("EPUB locations are not ready.");
    }

    await rendition.display(book.locations.cfiFromPercentage(clampProgressValue(progression)));
  }

  private async goToLocationIndex(locationIndex: number): Promise<void> {
    const book = this.requireBook();
    const rendition = this.requireRendition();
    const totalPages = this.getTotalPages();

    if (totalPages === null) {
      return;
    }

    const clampedIndex = Math.min(totalPages - 1, Math.max(0, Math.floor(locationIndex)));
    const cfi = book.locations.cfiFromLocation(clampedIndex) as unknown;

    if (typeof cfi !== "string" || cfi.length === 0 || cfi === "-1") {
      return;
    }

    await rendition.display(cfi);
  }

  setSpreadMode(mode: EpubSpreadMode): EpubSpreadState {
    this.spreadMode = mode;
    return this.applySpreadMode(true);
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
    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
      return [];
    }

    const book = this.requireBook();
    const sections = getEpubSearchSections(book);
    const hits: SearchHit<EpubLocator>[] = [];

    for (const section of sections) {
      if (hits.length >= 100) {
        break;
      }

      try {
        await Promise.resolve(section.load?.((book as EpubSearchableBook).load));
        const sectionHits = section.find?.(normalizedQuery) ?? [];

        for (const [index, sectionHit] of sectionHits.entries()) {
          if (hits.length >= 100) {
            break;
          }

          const href = section.href ?? "";
          const excerpt = sectionHit.excerpt?.trim() ?? normalizedQuery;

          hits.push({
            id: `epub-search-${href}-${index}`,
            locator: {
              kind: "epub",
              href,
              cfi: sectionHit.cfi,
              selectedText: normalizedQuery,
            },
            excerpt,
          });
        }
      } catch {
        continue;
      } finally {
        section.unload?.();
      }
    }

    return hits;
  }

  addHighlight(
    cfiRange: string,
    color = "#f3bc55",
    onClick?: EpubAnnotationClickHandler,
  ): void {
    const rendition = this.requireRendition();

    rendition.annotations.highlight(
      cfiRange,
      {},
      onClick,
      "reader-epub-highlight",
      {
        fill: color,
        "fill-opacity": "0.32",
        "mix-blend-mode": "multiply",
      },
    );
  }

  removeHighlight(cfiRange: string): void {
    const rendition = this.requireRendition();

    rendition.annotations.remove(cfiRange, "highlight");
  }

  addUnderline(
    cfiRange: string,
    color = "#f3bc55",
    onClick?: EpubAnnotationClickHandler,
  ): void {
    const rendition = this.requireRendition();

    rendition.annotations.underline(
      cfiRange,
      {},
      onClick,
      "reader-epub-note-underline",
      {
        stroke: color,
        "stroke-dasharray": "3 3",
        "stroke-opacity": "0.95",
        // marks-pane draws both a transparent rect and a bottom line. Keep the
        // rect available for hit testing without painting its four edges.
        "stroke-width": "0",
      },
    );
  }

  removeUnderline(cfiRange: string): void {
    const rendition = this.requireRendition();

    rendition.annotations.remove(cfiRange, "underline");
  }

  private registerRenditionEvents(rendition: Rendition): void {
    rendition.on("relocated", (location: Location) => {
      const position = this.locationToPosition(location);
      this.lastPosition = position;
      this.onRelocated?.(position);
      this.onSelectionCleared?.();
    });

    rendition.on("selected", (cfiRange: string) => {
      void this.captureSelection(cfiRange);
    });

    rendition.on("rendered", (_section: unknown, view: EpubRenderedView) => {
      this.observeSelectionDocument(view.document ?? view.contents?.document);
    });
  }

  private async captureSelection(cfiRange: string): Promise<void> {
    if (this.book === null) {
      return;
    }

    const visibleRange = this.rendition?.getRange(cfiRange) ?? null;
    const range = visibleRange ?? (await this.book.getRange(cfiRange));
    const selectedText = range?.toString() ?? undefined;
    this.onSelected?.({
      cfiRange,
      selectedText,
      anchorRect: getViewportRangeRect(visibleRange),
      ...getRangeContext(range),
    });
  }

  private observeSelectionDocument(document: Document | undefined): void {
    if (document === undefined || this.selectionDocuments.has(document)) {
      return;
    }

    this.selectionDocuments.add(document);

    const notifyIfSelectionEmpty = () => {
      const selection = document.getSelection();

      if (
        selection === null ||
        selection.rangeCount === 0 ||
        selection.toString().trim() === ""
      ) {
        this.onSelectionCleared?.();
      }
    };

    const deferredNotifyIfSelectionEmpty = () => {
      window.setTimeout(notifyIfSelectionEmpty, 0);
    };

    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        this.onSelectionCleared?.();
        return;
      }

      notifyIfSelectionEmpty();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      this.onKeyDown?.(event);
    };

    document.addEventListener("selectionchange", notifyIfSelectionEmpty);
    document.addEventListener("pointerdown", deferredNotifyIfSelectionEmpty);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("keydown", handleKeyDown);
    this.selectionCleanupCallbacks.push(() => {
      document.removeEventListener("selectionchange", notifyIfSelectionEmpty);
      document.removeEventListener("pointerdown", deferredNotifyIfSelectionEmpty);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("keydown", handleKeyDown);
    });
  }

  private stopSelectionObservers(): void {
    for (const cleanup of this.selectionCleanupCallbacks) {
      cleanup();
    }

    this.selectionCleanupCallbacks = [];
    this.selectionDocuments = new WeakSet<Document>();
  }

  private async generateLocations(book: EpubBook): Promise<void> {
    if (this.locationsPromise !== null) {
      return this.locationsPromise;
    }

    this.locationsPromise = (async () => {
      await book.ready;
      await book.locations.generate(EPUB_LOCATION_CHARS);

      if (this.book !== book) {
        return;
      }

      this.locationsReady = book.locations.length() > 0;
      await this.reportCurrentPosition();
    })()
      .catch(() => {
        if (this.book === book) {
          this.locationsReady = false;
        }
      })
      .finally(() => {
        if (this.book === book) {
          this.locationsPromise = null;
        }
      });

    return this.locationsPromise;
  }

  private async reportCurrentPosition(): Promise<void> {
    if (this.rendition === null) {
      return;
    }

    const location = await Promise.resolve(this.rendition.currentLocation());
    const position = this.locationToPosition(location);
    this.lastPosition = position;
    this.onRelocated?.(position);
  }

  private locationToPosition(location: Location | EpubLocationLike): EpubPosition {
    const book = this.requireBook();
    const start = getLocationStart(location);
    const totalPages = this.getTotalPages();
    const locationsReady = this.locationsReady && totalPages !== null;
    const pageIndex = locationsReady ? getLocationIndex(book, start) : null;
    const page =
      locationsReady && totalPages !== null && pageIndex !== null
        ? Math.min(totalPages, Math.max(1, pageIndex + 1))
        : null;
    const progression = locationsReady
      ? resolveProgression(book, start, pageIndex, totalPages)
      : null;
    const href = start.href ?? getSectionHrefForCfi(book, start.cfi) ?? "";
    const locator: EpubLocator = {
      kind: "epub",
      href,
      cfi: start.cfi,
      progression: progression ?? undefined,
    };

    return {
      locator,
      progression,
      page,
      totalPages: locationsReady ? totalPages : null,
      displayedPage: normalizePositiveInteger(start.displayed?.page),
      displayedTotal: normalizePositiveInteger(start.displayed?.total),
      locationsReady,
    };
  }

  private getTotalPages(): number | null {
    if (this.book === null || !this.locationsReady) {
      return null;
    }

    const totalPages = this.book.locations.length();

    return totalPages > 0 ? totalPages : null;
  }

  private getRenderedSpreadOption(): "none" | "auto" {
    return this.calculateSpreadState().rendered === "double" ? "auto" : "none";
  }

  private calculateSpreadState(): EpubSpreadState {
    const width = this.container.clientWidth || this.container.getBoundingClientRect().width || 0;
    const canRenderDouble = width >= EPUB_MIN_SPREAD_WIDTH;

    return {
      requested: this.spreadMode,
      rendered: this.spreadMode === "double" && canRenderDouble ? "double" : "single",
      canRenderDouble,
    };
  }

  private applySpreadMode(notify: boolean): EpubSpreadState {
    const nextState = this.calculateSpreadState();
    const didChange =
      nextState.requested !== this.spreadState.requested ||
      nextState.rendered !== this.spreadState.rendered ||
      nextState.canRenderDouble !== this.spreadState.canRenderDouble;
    this.spreadState = nextState;

    if (this.rendition !== null) {
      this.rendition.spread(nextState.rendered === "double" ? "auto" : "none", EPUB_MIN_SPREAD_WIDTH);
      const width = Math.floor(this.container.clientWidth);
      const height = Math.floor(this.container.clientHeight);
      const renderedRendition = this.rendition as RenderedRendition;

      if (width > 0 && height > 0 && renderedRendition.manager?.resize !== undefined) {
        this.rendition.resize(width, height);
      }

      if ((notify || didChange) && this.lastPosition !== null) {
        void this.reportCurrentPosition();
      }
    }

    if (notify || didChange) {
      this.onSpreadChange?.(nextState);
    }

    return nextState;
  }

  private startResizeObserver(): void {
    this.stopResizeObserver();
    this.spreadState = this.applySpreadMode(true);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.applySpreadMode(false);
      });
      this.resizeObserver.observe(this.container);
      return;
    }

    this.windowResizeHandler = () => {
      this.applySpreadMode(false);
    };
    window.addEventListener("resize", this.windowResizeHandler);
  }

  private stopResizeObserver(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.windowResizeHandler !== null) {
      window.removeEventListener("resize", this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
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

function getEpubSearchSections(book: EpubBook): EpubSearchSection[] {
  const searchableBook = book as EpubSearchableBook;
  const sections: EpubSearchSection[] = [];

  if (typeof searchableBook.spine?.each === "function") {
    searchableBook.spine.each((section) => {
      sections.push(section);
    });
  }

  if (sections.length === 0 && Array.isArray(searchableBook.spine?.spineItems)) {
    sections.push(...searchableBook.spine.spineItems);
  }

  return sections;
}

function getLocationStart(location: Location | EpubLocationLike): EpubLocationLike {
  return "start" in location && location.start !== undefined ? location.start : location;
}

function getLocationIndex(book: EpubBook, start: EpubLocationLike): number | null {
  if (typeof start.location === "number" && Number.isFinite(start.location)) {
    return Math.max(0, Math.floor(start.location));
  }

  if (start.cfi === undefined) {
    return null;
  }

  const index = book.locations.locationFromCfi(start.cfi) as unknown;

  return typeof index === "number" && Number.isFinite(index) && index >= 0 ? index : null;
}

function getSectionHrefForCfi(book: EpubBook, cfi: string | undefined): string | null {
  if (cfi === undefined) {
    return null;
  }

  try {
    return book.spine.get(cfi)?.href ?? null;
  } catch {
    return null;
  }
}

function resolveProgression(
  book: EpubBook,
  start: EpubLocationLike,
  pageIndex: number | null,
  totalPages: number | null,
): number | null {
  const percentage = clampProgress(start.percentage);

  if (percentage !== undefined) {
    return percentage;
  }

  if (start.cfi !== undefined) {
    const cfiPercentage = book.locations.percentageFromCfi(start.cfi) as unknown;

    if (typeof cfiPercentage === "number" && Number.isFinite(cfiPercentage)) {
      return clampProgressValue(cfiPercentage);
    }
  }

  if (pageIndex !== null && totalPages !== null && totalPages > 1) {
    return clampProgressValue(pageIndex / (totalPages - 1));
  }

  return null;
}

export function progressionToEpubPage(progression: number, totalPages: number): number {
  const normalizedTotalPages = Math.max(1, Math.floor(totalPages));
  const pageIndex = Math.ceil((normalizedTotalPages - 1) * clampProgressValue(progression));

  return Math.min(normalizedTotalPages, Math.max(1, pageIndex + 1));
}

export function nextEpubLocationIndex(page: number | null, totalPages: number | null): number | null {
  if (page === null || totalPages === null || !Number.isFinite(page) || !Number.isFinite(totalPages)) {
    return null;
  }

  if (page < 1 || totalPages < 2 || page >= totalPages) {
    return null;
  }

  return Math.min(totalPages - 1, Math.max(0, Math.floor(page)));
}

function normalizePositiveInteger(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return null;
  }

  return Math.floor(value);
}

function clampProgress(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }

  return clampProgressValue(value);
}

function clampProgressValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function buildEpubThemeRules(theme: ReaderTheme): Record<string, Record<string, string>> {
  return {
    html: {
      background: `${theme.backgroundColor} !important`,
      color: `${theme.textColor} !important`,
      "-webkit-user-select": "text !important",
      "user-select": "text !important",
    },
    body: {
      background: `${theme.backgroundColor} !important`,
      color: `${theme.textColor} !important`,
      "font-family": `${theme.fontFamily} !important`,
      "font-size": `${theme.fontSize}px !important`,
      "line-height": `${theme.lineHeight} !important`,
      margin: "0 !important",
      padding: `0 ${theme.pageMargin}px !important`,
      "-webkit-user-select": "text !important",
      "user-select": "text !important",
    },
    "body, p, div, section, article": {
      color: `${theme.textColor} !important`,
      "font-family": `${theme.fontFamily} !important`,
      "line-height": `${theme.lineHeight} !important`,
      "-webkit-user-select": "text !important",
      "user-select": "text !important",
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

function getViewportRangeRect(range: Range | null): EpubSelectionSnapshot["anchorRect"] {
  if (range === null) {
    return undefined;
  }

  const rect =
    Array.from(range.getClientRects()).find(
      (clientRect) => clientRect.width > 0 && clientRect.height > 0,
    ) ?? range.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }

  const frameElement = range.startContainer.ownerDocument?.defaultView?.frameElement;
  const frameRect = frameElement?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
  };

  return {
    height: rect.height,
    left: frameRect.left + rect.left,
    top: frameRect.top + rect.top,
    width: rect.width,
  };
}
