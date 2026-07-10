import type {
  EpubLocator,
  ReaderAdapter,
  ReaderTheme,
  SearchHit,
  TocItem,
} from "@reader/core";
import type { Book as EpubBook, Location, NavItem, Rendition } from "epubjs";

import {
  registerEpubImageBridge,
  type EpubImageActivateHandler,
} from "./EpubImageBridge";
import {
  findPublicationPageLabel,
  loadPublicationPageList,
  parseCachedPublicationPageList,
  serializePublicationPageList,
  type EpubCfiComparator,
  type PublicationPageBoundary,
} from "./EpubPageList";

export type EpubSpreadMode = "single" | "double";

export interface EpubPosition {
  locator: EpubLocator;
  progression: number | null;
  location: number | null;
  totalLocations: number | null;
  publicationPageLabel: string | null;
  displayedPage: number | null;
  displayedTotal: number | null;
  locationsReady: boolean;
}

export interface EpubProgressPreview {
  locator: EpubLocator;
  progression: number;
  location: number;
  totalLocations: number;
  publicationPageLabel: string | null;
  locationsReady: true;
}

export interface EpubSpreadState {
  requested: EpubSpreadMode;
  rendered: EpubSpreadMode;
  canRenderDouble: boolean;
}

export type EpubLayoutInvalidationReason = "resize" | "spread" | "theme";

interface EpubReaderAdapterOptions {
  bookId: string;
  cachedLocations?: string;
  cachedPublicationPageList?: string;
  sourceUrl: string;
  container: HTMLElement;
  initialLocator?: EpubLocator;
  theme: ReaderTheme;
  onRelocated?: (position: EpubPosition) => void;
  onKeyDown?: (event: globalThis.KeyboardEvent) => void;
  onImageActivate?: EpubImageActivateHandler;
  onLayoutInvalidated?: (reason: EpubLayoutInvalidationReason) => void;
  onLocationsGenerated?: (serializedLocations: string) => void;
  onPublicationPageListGenerated?: (serializedPageList: string) => void;
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
  element?: HTMLElement;
  iframe?: HTMLIFrameElement;
}

export class EpubReaderAdapter implements ReaderAdapter<EpubLocator> {
  private readonly bookId: string;
  private readonly cachedLocations?: string;
  private readonly cachedPublicationPageList?: string;
  private readonly sourceUrl: string;
  private readonly container: HTMLElement;
  private readonly initialLocator?: EpubLocator;
  private readonly onRelocated?: (position: EpubPosition) => void;
  private readonly onKeyDown?: (event: globalThis.KeyboardEvent) => void;
  private readonly onImageActivate?: EpubImageActivateHandler;
  private readonly onLayoutInvalidated?: (reason: EpubLayoutInvalidationReason) => void;
  private readonly onLocationsGenerated?: (serializedLocations: string) => void;
  private readonly onPublicationPageListGenerated?: (
    serializedPageList: string,
  ) => void;
  private readonly onSelected?: (selection: EpubSelectionSnapshot) => void;
  private readonly onSelectionCleared?: () => void;
  private readonly onSpreadChange?: (state: EpubSpreadState) => void;
  private book: EpubBook | null = null;
  private cfiComparator: EpubCfiComparator | null = null;
  private locationsPromise: Promise<void> | null = null;
  private locationsReady = false;
  private publicationPageList: PublicationPageBoundary[] = [];
  private publicationPageListPromise: Promise<void> | null = null;
  private lastPosition: EpubPosition | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rendition: Rendition | null = null;
  private reflowPromise: Promise<void> | null = null;
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
    this.cachedLocations = options.cachedLocations;
    this.cachedPublicationPageList = options.cachedPublicationPageList;
    this.sourceUrl = options.sourceUrl;
    this.container = options.container;
    this.initialLocator = options.initialLocator;
    this.theme = options.theme;
    this.onRelocated = options.onRelocated;
    this.onKeyDown = options.onKeyDown;
    this.onImageActivate = options.onImageActivate;
    this.onLayoutInvalidated = options.onLayoutInvalidated;
    this.onLocationsGenerated = options.onLocationsGenerated;
    this.onPublicationPageListGenerated = options.onPublicationPageListGenerated;
    this.onSelected = options.onSelected;
    this.onSelectionCleared = options.onSelectionCleared;
    this.onSpreadChange = options.onSpreadChange;
  }

  async open(bookId: string): Promise<void> {
    if (bookId !== this.bookId) {
      throw new Error(
        `EPUB adapter was initialized for ${this.bookId}, not ${bookId}.`,
      );
    }

    await this.close();
    this.locationsReady = false;
    this.lastPosition = null;
    this.reflowPromise = null;

    const { default: createEpub, EpubCFI } = await import("epubjs");
    const cfiComparator = new EpubCFI();
    const book = createEpub(this.sourceUrl, {
      openAs: "epub",
      replacements: "blobUrl",
    });
    await book.opened;
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
    this.cfiComparator = cfiComparator;
    this.rendition = rendition;
    this.registerRenditionEvents(rendition);
    this.startResizeObserver();
    await this.setTheme(this.theme);
    await rendition.display(this.initialLocator?.cfi ?? this.initialLocator?.href);
    await this.reportCurrentPosition();
    void this.generateLocations(book);
    void this.generatePublicationPageList(book, cfiComparator);
  }

  async close(): Promise<void> {
    this.stopResizeObserver();
    this.stopSelectionObservers();
    this.locationsPromise = null;
    this.locationsReady = false;
    this.publicationPageList = [];
    this.publicationPageListPromise = null;
    this.cfiComparator = null;
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
      const isFinalLocationBoundary =
        currentPosition.location !== null &&
        currentPosition.totalLocations !== null &&
        currentPosition.location >= currentPosition.totalLocations - 1;
      const nextLocationIndex = isFinalLocationBoundary
        ? nextEpubLocationIndex(
            currentPosition.location,
            currentPosition.totalLocations,
          )
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
    const totalLocations = this.getTotalLocations();

    if (!this.locationsReady || totalLocations === null) {
      throw new Error("EPUB locations are not ready.");
    }

    const nextProgression = clampProgressValue(progression);
    const cfi = book.locations.cfiFromPercentage(nextProgression);
    const location = progressionToEpubLocation(nextProgression, totalLocations);
    const href =
      getSectionHrefForCfi(book, cfi) ?? this.lastPosition?.locator.href ?? "";
    const publicationPageLabel = this.getPublicationPageLabel(href, cfi);

    return {
      locator: {
        kind: "epub",
        href,
        cfi,
        progression: nextProgression,
      },
      progression: nextProgression,
      location,
      totalLocations,
      publicationPageLabel,
      locationsReady: true,
    };
  }

  async goToProgress(progression: number): Promise<void> {
    const book = this.requireBook();
    const rendition = this.requireRendition();

    if (!this.locationsReady || this.getTotalLocations() === null) {
      throw new Error("EPUB locations are not ready.");
    }

    await rendition.display(
      book.locations.cfiFromPercentage(clampProgressValue(progression)),
    );
  }

  private async goToLocationIndex(locationIndex: number): Promise<void> {
    const book = this.requireBook();
    const rendition = this.requireRendition();
    const totalLocations = this.getTotalLocations();

    if (totalLocations === null) {
      return;
    }

    const clampedIndex = Math.min(
      totalLocations - 1,
      Math.max(0, Math.floor(locationIndex)),
    );
    const cfi = book.locations.cfiFromLocation(clampedIndex) as unknown;

    if (typeof cfi !== "string" || cfi.length === 0 || cfi === "-1") {
      return;
    }

    await rendition.display(cfi);
  }

  setSpreadMode(mode: EpubSpreadMode): EpubSpreadState {
    this.onLayoutInvalidated?.("spread");
    this.spreadMode = mode;
    const nextState = this.applySpreadMode(true);
    void this.restoreCurrentPositionAfterReflow();
    return nextState;
  }

  async setTheme(theme: ReaderTheme): Promise<void> {
    this.theme = theme;

    if (this.rendition === null) {
      return;
    }

    this.onLayoutInvalidated?.("theme");
    this.rendition.themes.register(EPUB_THEME_NAME, buildEpubThemeRules(theme));
    this.rendition.themes.select(EPUB_THEME_NAME);
    this.rendition.themes.font(theme.fontFamily);
    this.rendition.themes.fontSize(`${theme.fontSize}px`);
    await this.restoreCurrentPositionAfterReflow();
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

    rendition.annotations.highlight(cfiRange, {}, onClick, "reader-epub-highlight", {
      fill: color,
      "fill-opacity": "0.32",
      "mix-blend-mode": "multiply",
    });
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
      const contentDocument = view.document ?? view.contents?.document;
      this.labelRenderedFrame(view, contentDocument);
      this.observeSelectionDocument(contentDocument);
    });
  }

  private labelRenderedFrame(
    view: EpubRenderedView,
    contentDocument: Document | undefined,
  ): void {
    const frame =
      view.iframe ??
      (view.element?.querySelector("iframe") as HTMLIFrameElement | null) ??
      (contentDocument?.defaultView?.frameElement as HTMLIFrameElement | null);

    if (frame === null || frame === undefined) {
      return;
    }

    const documentTitle = contentDocument?.title.trim() ?? "";
    frame.title =
      documentTitle === "" ? "EPUB publication content" : `${documentTitle} content`;
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
    const cleanupImageBridge =
      this.onImageActivate === undefined
        ? null
        : registerEpubImageBridge(document, this.onImageActivate);
    this.selectionCleanupCallbacks.push(() => {
      document.removeEventListener("selectionchange", notifyIfSelectionEmpty);
      document.removeEventListener("pointerdown", deferredNotifyIfSelectionEmpty);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("keydown", handleKeyDown);
      cleanupImageBridge?.();
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

      if (this.cachedLocations !== undefined) {
        try {
          book.locations.load(this.cachedLocations);
        } catch {
          // A stale or malformed cache is regenerated below.
        }
      }

      if (book.locations.length() === 0) {
        await book.locations.generate(EPUB_LOCATION_CHARS);
        const serializedLocations = book.locations.save();

        if (serializedLocations.length > 0) {
          this.onLocationsGenerated?.(serializedLocations);
        }
      }

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

  private async generatePublicationPageList(
    book: EpubBook,
    comparator: EpubCfiComparator,
  ): Promise<void> {
    if (this.publicationPageListPromise !== null) {
      return this.publicationPageListPromise;
    }

    this.publicationPageListPromise = (async () => {
      const cached = parseCachedPublicationPageList(
        this.cachedPublicationPageList,
        comparator,
      );
      const boundaries = cached ?? (await loadPublicationPageList(book, comparator));

      if (this.book !== book) {
        return;
      }

      this.publicationPageList = boundaries;

      if (cached === null) {
        this.onPublicationPageListGenerated?.(serializePublicationPageList(boundaries));
      }

      await this.reportCurrentPosition();
    })().catch(() => {
      if (this.book === book) {
        this.publicationPageList = [];
      }
    });

    return this.publicationPageListPromise;
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

  private locationToPosition(
    renditionLocation: Location | EpubLocationLike,
  ): EpubPosition {
    const book = this.requireBook();
    const start = getLocationStart(renditionLocation);
    const totalLocations = this.getTotalLocations();
    const locationsReady = this.locationsReady && totalLocations !== null;
    const locationIndex = locationsReady ? getLocationIndex(book, start) : null;
    const location =
      locationsReady && totalLocations !== null && locationIndex !== null
        ? Math.min(totalLocations, Math.max(1, locationIndex + 1))
        : null;
    const progression = locationsReady
      ? resolveProgression(book, start, locationIndex, totalLocations)
      : null;
    const href = start.href ?? getSectionHrefForCfi(book, start.cfi) ?? "";
    const publicationPageLabel = this.getPublicationPageLabel(href, start.cfi);
    const locator: EpubLocator = {
      kind: "epub",
      href,
      cfi: start.cfi,
      progression: progression ?? undefined,
    };

    return {
      locator,
      progression,
      location,
      totalLocations: locationsReady ? totalLocations : null,
      publicationPageLabel,
      displayedPage: normalizePositiveInteger(start.displayed?.page),
      displayedTotal: normalizePositiveInteger(start.displayed?.total),
      locationsReady,
    };
  }

  private getPublicationPageLabel(
    href: string,
    cfi: string | undefined,
  ): string | null {
    if (
      this.book === null ||
      this.cfiComparator === null ||
      this.publicationPageList.length === 0
    ) {
      return null;
    }

    const section = getSpineSectionForTarget(this.book, cfi ?? href);

    return section === null
      ? null
      : findPublicationPageLabel(
          this.publicationPageList,
          { cfi, spineIndex: section.index },
          this.cfiComparator,
        );
  }

  private getTotalLocations(): number | null {
    if (this.book === null || !this.locationsReady) {
      return null;
    }

    const totalLocations = this.book.locations.length();

    return totalLocations > 0 ? totalLocations : null;
  }

  private getRenderedSpreadOption(): "none" | "auto" {
    return this.calculateSpreadState().rendered === "double" ? "auto" : "none";
  }

  private calculateSpreadState(): EpubSpreadState {
    const width =
      this.container.clientWidth || this.container.getBoundingClientRect().width || 0;
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
      this.rendition.spread(
        nextState.rendered === "double" ? "auto" : "none",
        EPUB_MIN_SPREAD_WIDTH,
      );
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
        this.onLayoutInvalidated?.("resize");
        this.applySpreadMode(false);
        void this.restoreCurrentPositionAfterReflow();
      });
      this.resizeObserver.observe(this.container);
      return;
    }

    this.windowResizeHandler = () => {
      this.onLayoutInvalidated?.("resize");
      this.applySpreadMode(false);
      void this.restoreCurrentPositionAfterReflow();
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

  private restoreCurrentPositionAfterReflow(): Promise<void> {
    if (this.reflowPromise !== null) {
      return this.reflowPromise;
    }

    const target = this.lastPosition?.locator.cfi ?? this.lastPosition?.locator.href;

    if (this.rendition === null || target === undefined || target.length === 0) {
      return Promise.resolve();
    }

    const rendition = this.rendition;
    this.reflowPromise = Promise.resolve(rendition.display(target)).finally(() => {
      if (this.rendition === rendition) {
        this.reflowPromise = null;
      }
    });

    return this.reflowPromise;
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
  return "start" in location && location.start !== undefined
    ? location.start
    : location;
}

function getLocationIndex(book: EpubBook, start: EpubLocationLike): number | null {
  if (typeof start.location === "number" && Number.isFinite(start.location)) {
    return Math.max(0, Math.floor(start.location));
  }

  if (start.cfi === undefined) {
    return null;
  }

  const index = book.locations.locationFromCfi(start.cfi) as unknown;

  return typeof index === "number" && Number.isFinite(index) && index >= 0
    ? index
    : null;
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

function getSpineSectionForTarget(
  book: EpubBook,
  target: string,
): { href: string; index: number } | null {
  try {
    const section = book.spine.get(target);
    return section === undefined ? null : { href: section.href, index: section.index };
  } catch {
    return null;
  }
}

function resolveProgression(
  book: EpubBook,
  start: EpubLocationLike,
  locationIndex: number | null,
  totalLocations: number | null,
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

  if (locationIndex !== null && totalLocations !== null && totalLocations > 1) {
    return clampProgressValue(locationIndex / (totalLocations - 1));
  }

  return null;
}

export function progressionToEpubLocation(
  progression: number,
  totalLocations: number,
): number {
  const normalizedTotalLocations = Math.max(1, Math.floor(totalLocations));
  const locationIndex = Math.ceil(
    (normalizedTotalLocations - 1) * clampProgressValue(progression),
  );

  return Math.min(normalizedTotalLocations, Math.max(1, locationIndex + 1));
}

export function nextEpubLocationIndex(
  location: number | null,
  totalLocations: number | null,
): number | null {
  if (
    location === null ||
    totalLocations === null ||
    !Number.isFinite(location) ||
    !Number.isFinite(totalLocations)
  ) {
    return null;
  }

  if (location < 1 || totalLocations < 2 || location >= totalLocations) {
    return null;
  }

  return Math.min(totalLocations - 1, Math.max(0, Math.floor(location)));
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

export function buildEpubThemeRules(
  theme: ReaderTheme,
): Record<string, Record<string, string>> {
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
    ".reader-epub-viewable-image": {
      cursor: "zoom-in !important",
    },
    ".reader-epub-viewable-image:focus-visible": {
      outline: "3px solid #f3bc55 !important",
      "outline-offset": "3px !important",
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

function getRangeContext(
  range: Range | null,
): Pick<EpubSelectionSnapshot, "contextBefore" | "contextAfter"> {
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
      .slice(
        selectedIndex + selectedText.length,
        selectedIndex + selectedText.length + SELECTION_CONTEXT_LENGTH,
      )
      .trim(),
  };
}

function getViewportRangeRect(
  range: Range | null,
): EpubSelectionSnapshot["anchorRect"] {
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
