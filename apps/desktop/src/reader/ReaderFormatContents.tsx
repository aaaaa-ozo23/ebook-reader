/* eslint-disable react-refresh/only-export-components -- format helpers stay with the isolated async reader chunk */
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  type Annotation,
  type Book,
  type EpubLocator,
  type Locator,
  type PdfLocator,
  type PdfPaginatedViewMode,
  type PageTransitionMode,
  type ReaderProgress,
  type ReaderTheme,
  type SearchHit,
  type TocItem,
  type TxtChapter,
  type TxtDocument,
  type TxtLocator,
  type TxtPaginatedViewMode,
  type TxtViewMode,
} from "@reader/core";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  getEpubBookSource,
  getPdfBookSource,
  getReaderCache,
  getReadingProgress,
  saveReadingProgress,
  saveReaderCache,
} from "../tauri/reader";
import type { EpubImageResource } from "../epub/EpubImageBridge";
import { EpubImageViewer } from "../epub/EpubImageViewer";
import {
  EpubReaderAdapter,
  type EpubPosition,
  type EpubProgressPreview,
  type EpubSpreadMode,
  type EpubSpreadState,
} from "../epub/EpubReaderAdapter";
import {
  nextPdfSpreadStart,
  PdfReaderAdapter,
  previousPdfSpreadStart,
  type PdfPosition,
  type PdfViewMode,
} from "../pdf/PdfReaderAdapter";
import { PdfContinuousView } from "../pdf/PdfContinuousView";
import { resolvePdfLocatorAnchorKind } from "../pdf/PdfContinuousPosition";
import { PdfPaginatedView } from "../pdf/PdfPaginatedView";

import {
  DEFAULT_HIGHLIGHT_COLOR,
  getLocatorLabel,
} from "./readerAnnotationPresentation";
import type { ReaderMenuAnchor, ReaderSelectionSnapshot } from "./readerUiTypes";
import { PaginatedReaderControls } from "./PaginatedReaderControls";
import { TxtPageWindow } from "./TxtPageWindow";
import {
  createTxtDomPageMeasurer,
  createTxtPaginationCacheEnvelope,
  findTxtPageIndex,
  getTxtSpreadStart,
  paginateTxtBlocks,
  parseTxtPaginationCache,
  reconstructTxtPages,
  TXT_PAGINATION_CACHE_KEY,
  TxtPaginationSessionCache,
  type TxtPage,
  type TxtPageFragment,
  type TxtPaginationLayoutSignature,
  type TxtSpreadMode,
} from "./TxtPaginator";
import {
  PageTransitionController,
  resolvePageTransitionMode,
  type PageDirection,
} from "./transitions/PageTransitionController";
import {
  animateIsolatedPageTransition,
  captureEpubRenditionSnapshotAfterLayout,
  capturePdfSpreadSnapshot,
  capturePdfSpreadSnapshotAfterRender,
  captureTxtSpreadSnapshot,
  type PageSnapshot,
} from "./transitions/PageTransitionLayer";

const EPUB_LOCATIONS_CACHE_KEY = "epub_locations_v1";
const EPUB_PAGE_LIST_CACHE_KEY = "epub_page_list_v1";
const EPUB_TOC_CACHE_KEY = "epub_toc_v1";
const PDF_TOC_CACHE_KEY = "pdf_toc_v1";
const TXT_DOUBLE_MIN_PAGE_WIDTH = 320;
const TXT_SPREAD_GAP = 18;
const txtSessionPaginationCache = new TxtPaginationSessionCache(2);
let pendingFocusTimerId: number | null = null;
export interface ReaderBlock {
  chapter: TxtChapter;
  paragraphs: ReaderParagraph[];
}

export interface ReaderParagraph {
  text: string;
  charOffset: number;
}

export interface ReaderVirtualBlock {
  id: string;
  kind: "heading" | "paragraph";
  chapterId: string;
  chapterTitle: string;
  charOffset: number;
  text: string;
}

export type ReaderSidebarTab = "contents" | "bookmarks" | "notes" | "search";
export type ReaderSearchProvider = (
  query: string,
) => Promise<Array<SearchHit<Locator>>>;

export interface TxtJumpRequest {
  locator: TxtLocator;
  requestId: number;
}

export interface EpubJumpRequest {
  locator: EpubLocator;
  requestId: number;
}

export interface PdfJumpRequest {
  locator: PdfLocator;
  requestId: number;
}

export interface RenderedVirtualItem {
  index: number;
  start: number;
}

export interface ReaderVirtualIndex {
  chapterHeadingIndexById: Map<string, number>;
  charOffsetEntriesByChapterId: Map<string, ReaderVirtualIndexEntry[]>;
  charOffsetEntries: ReaderVirtualIndexEntry[];
}

export interface ReaderVirtualIndexEntry {
  charOffset: number;
  chapterId: string;
  index: number;
}

export interface PendingTxtProgress {
  locator: TxtLocator;
  progress?: number;
}

export interface PendingEpubProgress {
  locator: EpubLocator;
  progress?: number;
}

export interface PendingPdfProgress {
  locator: PdfLocator;
  progress?: number;
}

export interface ReaderNavigationActions {
  next: () => void;
  previous: () => void;
}

export type ReaderNavigationRegistration = (
  actions: ReaderNavigationActions | null,
) => void;

export interface TxtReaderContentProps {
  annotations: Annotation[];
  blocks: ReaderBlock[];
  document: TxtDocument | null;
  error: string | null;
  initialProgress: ReaderProgress<TxtLocator> | null;
  isPageCurlBlocked: boolean;
  isLoading: boolean;
  jumpRequest: TxtJumpRequest | null;
  theme: ReaderTheme;
  transition: PageTransitionMode;
  paginatedViewMode: TxtPaginatedViewMode;
  viewMode: TxtViewMode;
  onActiveChapterChange: (chapterId: string) => void;
  onAnnotationActivate: (annotation: Annotation, anchor: ReaderMenuAnchor) => void;
  onNavigationActionsChange: ReaderNavigationRegistration;
  onPaginatedViewModeChange: (mode: TxtPaginatedViewMode) => void;
  onProgressChange: (locator: TxtLocator, progress?: number) => void;
  onRetry: () => void;
  onSelectionChange: (snapshot: ReaderSelectionSnapshot | null) => void;
  onBackToLibrary: () => void;
}

export function TxtReaderContent({ viewMode, ...props }: TxtReaderContentProps) {
  return viewMode === "paginated" ? (
    <TxtPaginatedReaderContent {...props} viewMode={viewMode} />
  ) : (
    <TxtScrollReaderContent {...props} viewMode={viewMode} />
  );
}

function TxtScrollReaderContent({
  annotations,
  blocks,
  document,
  error,
  initialProgress,
  isLoading,
  jumpRequest,
  onActiveChapterChange,
  onAnnotationActivate,
  onNavigationActionsChange,
  onProgressChange,
  onRetry,
  onSelectionChange,
  onBackToLibrary,
}: TxtReaderContentProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const hasRestoredProgressRef = useRef(false);
  const ignoreScrollSaveUntilRef = useRef(0);
  const lastActiveChapterIdRef = useRef<string | null>(null);
  const pendingActiveChapterIdRef = useRef<string | null>(null);
  const pendingProgressRef = useRef<PendingTxtProgress | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const virtualBlocks = useMemo(() => flattenReaderBlocks(blocks), [blocks]);
  const virtualIndex = useMemo(
    () => buildVirtualBlockIndex(virtualBlocks),
    [virtualBlocks],
  );
  // TanStack Virtual owns imperative scroll state for this reader surface.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualBlocks.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: (index) => (virtualBlocks[index]?.kind === "heading" ? 96 : 68),
    initialRect: {
      width: 780,
      height: 720,
    },
    overscan: 12,
  });
  const measuredVirtualItems = virtualizer.getVirtualItems();
  const renderedVirtualItems =
    measuredVirtualItems.length > 0
      ? measuredVirtualItems.map((item) => ({
          index: item.index,
          start: item.start,
        }))
      : buildEstimatedVirtualItems(virtualBlocks);
  const totalVirtualSize = Math.max(
    virtualizer.getTotalSize(),
    estimateTotalSize(virtualBlocks),
  );

  useEffect(() => {
    hasRestoredProgressRef.current = false;
    ignoreScrollSaveUntilRef.current = 0;
    lastActiveChapterIdRef.current = null;
    pendingActiveChapterIdRef.current = null;
    pendingProgressRef.current = null;
  }, [document?.book.id]);

  const flushPendingProgress = useCallback(() => {
    const pendingProgress = pendingProgressRef.current;

    if (pendingProgress === null) {
      return;
    }

    pendingProgressRef.current = null;
    onProgressChange(pendingProgress.locator, pendingProgress.progress);
  }, [onProgressChange]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const viewport = viewportRef.current;

    if (viewport === null) {
      return;
    }

    const delta = Math.max(viewport.clientHeight * 0.9, 1) * direction;
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";

    if (typeof viewport.scrollBy === "function") {
      viewport.scrollBy({
        behavior,
        top: delta,
      });
      return;
    }

    viewport.scrollTop += delta;
  }, []);

  useEffect(() => {
    onNavigationActionsChange({
      next: () => scrollByPage(1),
      previous: () => scrollByPage(-1),
    });

    return () => {
      onNavigationActionsChange(null);
    };
  }, [onNavigationActionsChange, scrollByPage]);

  useEffect(
    () => () => {
      if (rafHandleRef.current !== null) {
        window.cancelAnimationFrame(rafHandleRef.current);
      }

      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }

      flushPendingProgress();
    },
    [flushPendingProgress],
  );

  const scrollToVirtualIndex = useCallback(
    (targetIndex: number) => {
      ignoreScrollSaveUntilRef.current = performance.now() + 350;
      virtualizer.scrollToIndex(targetIndex, {
        align: "start",
        behavior: "auto",
      });
    },
    [virtualizer],
  );

  useEffect(() => {
    if (
      hasRestoredProgressRef.current ||
      isLoading ||
      document === null ||
      initialProgress === null ||
      virtualBlocks.length === 0
    ) {
      return;
    }

    const targetIndex = findProgressTargetIndex(virtualIndex, initialProgress.locator);

    if (targetIndex !== -1) {
      scrollToVirtualIndex(targetIndex);
    }
    hasRestoredProgressRef.current = true;
  }, [
    document,
    initialProgress,
    isLoading,
    scrollToVirtualIndex,
    virtualBlocks,
    virtualIndex,
  ]);

  useEffect(() => {
    if (jumpRequest === null || virtualBlocks.length === 0) {
      return;
    }

    const targetIndex = findProgressTargetIndex(virtualIndex, jumpRequest.locator);

    if (targetIndex !== -1) {
      scrollToVirtualIndex(targetIndex);
    }
  }, [jumpRequest, scrollToVirtualIndex, virtualBlocks.length, virtualIndex]);

  const getActiveVirtualBlock = useCallback(() => {
    const viewport = viewportRef.current;

    if (viewport === null || virtualBlocks.length === 0) {
      return null;
    }

    const targetOffset = viewport.scrollTop + viewport.clientHeight * 0.42;
    let activeIndex: number | null = null;

    for (const virtualItem of virtualizer.getVirtualItems()) {
      if (virtualItem.start <= targetOffset) {
        activeIndex = virtualItem.index;
      } else {
        break;
      }
    }

    if (activeIndex === null) {
      activeIndex = findEstimatedIndexAtOffset(virtualBlocks, targetOffset);
    }

    return virtualBlocks[activeIndex] ?? null;
  }, [virtualBlocks, virtualizer]);

  const scheduleActiveChapterChange = useCallback(
    (chapterId: string) => {
      pendingActiveChapterIdRef.current = chapterId;

      if (rafHandleRef.current !== null) {
        return;
      }

      rafHandleRef.current = window.requestAnimationFrame(() => {
        rafHandleRef.current = null;
        const nextChapterId = pendingActiveChapterIdRef.current;

        if (
          nextChapterId !== null &&
          nextChapterId !== lastActiveChapterIdRef.current
        ) {
          lastActiveChapterIdRef.current = nextChapterId;
          onActiveChapterChange(nextChapterId);
        }
      });
    },
    [onActiveChapterChange],
  );

  const handleScroll = useCallback(() => {
    if (document === null) {
      return;
    }

    const block = getActiveVirtualBlock();

    if (block === null) {
      return;
    }

    scheduleActiveChapterChange(block.chapterId);

    if (performance.now() < ignoreScrollSaveUntilRef.current) {
      return;
    }

    pendingProgressRef.current = {
      locator: {
        kind: "txt",
        chapterId: block.chapterId,
        charOffset: block.charOffset,
      },
      progress: block.charOffset / Math.max(document.charCount, 1),
    };

    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current);
    }

    scrollIdleTimerRef.current = window.setTimeout(() => {
      scrollIdleTimerRef.current = null;
      flushPendingProgress();
    }, 750);
  }, [
    document,
    flushPendingProgress,
    getActiveVirtualBlock,
    scheduleActiveChapterChange,
  ]);

  const handleTextSelection = useCallback(() => {
    onSelectionChange(captureTxtSelection());
  }, [onSelectionChange]);

  if (isLoading) {
    return (
      <section
        className="reader-state"
        role="status"
        aria-live="polite"
        aria-label="Loading TXT book"
      >
        <div className="loading-line" aria-hidden="true" />
        <p>Opening TXT book...</p>
      </section>
    );
  }

  if (error !== null) {
    return (
      <section className="reader-state reader-state--error" role="alert">
        <h2>Book could not be opened</h2>
        <p>{error}</p>
        <div className="reader-state__actions">
          <button type="button" className="reader-tool-button" onClick={onRetry}>
            Retry
          </button>
          <button
            type="button"
            className="reader-tool-button"
            onClick={onBackToLibrary}
          >
            Back to shelf
          </button>
        </div>
      </section>
    );
  }

  if (document === null) {
    return null;
  }

  return (
    <section
      ref={viewportRef}
      className="reader-viewport"
      aria-label={`${document.book.title} content`}
      tabIndex={0}
      onKeyUp={handleTextSelection}
      onMouseUp={handleTextSelection}
      onScroll={handleScroll}
    >
      <article className="reader-page reader-page--virtual">
        <ReaderMeta document={document} />
        <div
          className="reader-virtual-canvas"
          style={{
            height: `${totalVirtualSize}px`,
          }}
        >
          {renderedVirtualItems.map((virtualItem) => {
            const block = virtualBlocks[virtualItem.index];

            if (block === undefined) {
              return null;
            }

            return (
              <div
                key={block.id}
                ref={virtualizer.measureElement}
                className={`reader-virtual-row reader-virtual-row--${block.kind}`}
                data-index={virtualItem.index}
                data-chapter-id={block.chapterId}
                data-char-offset={block.charOffset}
                data-reader-block-text={block.text}
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {block.kind === "heading" ? (
                  <h2>
                    {renderAnnotatedText(block, annotations, onAnnotationActivate)}
                  </h2>
                ) : (
                  <p>{renderAnnotatedText(block, annotations, onAnnotationActivate)}</p>
                )}
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function TxtPaginatedReaderContent({
  annotations,
  blocks,
  document: txtDocument,
  error,
  initialProgress,
  isPageCurlBlocked,
  isLoading,
  jumpRequest,
  paginatedViewMode,
  theme,
  transition,
  onActiveChapterChange,
  onAnnotationActivate,
  onNavigationActionsChange,
  onPaginatedViewModeChange,
  onProgressChange,
  onRetry,
  onSelectionChange,
  onBackToLibrary,
}: TxtReaderContentProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const paginationAbortRef = useRef<AbortController | null>(null);
  const transitionControllerRef = useRef<PageTransitionController<PageSnapshot> | null>(
    null,
  );
  const pendingTransitionPageRef = useRef<TxtPage | null>(null);
  const pendingTargetSnapshotRef = useRef<PageSnapshot | null>(null);
  const pendingProgressTimerRef = useRef<number | null>(null);
  const scheduledProgressPageRef = useRef<TxtPage | null>(null);
  const previewPageIndexRef = useRef<number | null>(null);
  const currentAnchorRef = useRef(initialProgress?.locator.charOffset ?? 0);
  const committedPageIndexRef = useRef(0);
  const paginationInteractionVersionRef = useRef(0);
  const [pages, setPages] = useState<TxtPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [previewPageIndex, setPreviewPageIndex] = useState<number | null>(null);
  const [previewProgressValue, setPreviewProgressValue] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [isPaginating, setIsPaginating] = useState(true);
  const requestedSpreadMode: TxtSpreadMode = paginatedViewMode;
  const [frameSize, setFrameSize] = useState<{
    bookId: string | null;
    height: number;
    width: number;
  }>({ bookId: null, height: 588, width: 780 });
  const [devicePixelRatio, setDevicePixelRatio] = useState(
    () => window.devicePixelRatio || 1,
  );
  const virtualBlocks = useMemo(() => flattenReaderBlocks(blocks), [blocks]);
  const hasMeasuredFrame =
    txtDocument !== null && frameSize.bookId === txtDocument.book.id;
  const canRenderDouble =
    frameSize.width >= TXT_DOUBLE_MIN_PAGE_WIDTH * 2 + TXT_SPREAD_GAP;
  const renderedSpreadMode: TxtSpreadMode =
    requestedSpreadMode === "double" && canRenderDouble ? "double" : "single";
  const spreadSize = renderedSpreadMode === "double" ? 2 : 1;
  const pagesRef = useRef(pages);
  const renderedSpreadModeRef = useRef(renderedSpreadMode);
  const transitionModeRef = useRef(transition);
  const isPageCurlBlockedRef = useRef(isPageCurlBlocked);
  const documentRef = useRef(txtDocument);
  const pageWidth =
    renderedSpreadMode === "double"
      ? Math.max(TXT_DOUBLE_MIN_PAGE_WIDTH, (frameSize.width - TXT_SPREAD_GAP) / 2)
      : Math.max(1, Math.min(780, frameSize.width));
  const pageHeight = Math.max(260, frameSize.height);
  const layoutSignature = useMemo<TxtPaginationLayoutSignature>(
    () => ({
      devicePixelRatio,
      pageHeight,
      pageWidth,
      spreadMode: renderedSpreadMode,
      themeFingerprint: [
        theme.fontFamily,
        theme.fontSize,
        theme.lineHeight,
        theme.paragraphSpacing,
        theme.pageMargin,
      ].join("|"),
    }),
    [devicePixelRatio, pageHeight, pageWidth, renderedSpreadMode, theme],
  );
  const sessionCacheKey = useMemo(
    () =>
      [
        txtDocument?.book.id,
        txtDocument?.book.fileHash,
        txtDocument?.charCount,
        JSON.stringify(layoutSignature),
      ].join("|"),
    [layoutSignature, txtDocument],
  );

  useEffect(() => {
    pagesRef.current = pages;
    renderedSpreadModeRef.current = renderedSpreadMode;
    transitionModeRef.current = transition;
    isPageCurlBlockedRef.current = isPageCurlBlocked;
    documentRef.current = txtDocument;
  }, [isPageCurlBlocked, pages, renderedSpreadMode, transition, txtDocument]);

  useLayoutEffect(() => {
    if (isLoading || txtDocument === null) return;
    const frame = frameRef.current;
    if (frame === null) {
      return;
    }
    const bookId = txtDocument.book.id;
    const updateSize = () => {
      const nextSize = {
        bookId,
        height: Math.max(260, frame.clientHeight || 588),
        width: Math.max(1, frame.clientWidth || 780),
      };
      setDevicePixelRatio(window.devicePixelRatio || 1);
      setFrameSize((currentSize) =>
        currentSize.bookId === nextSize.bookId &&
        currentSize.height === nextSize.height &&
        currentSize.width === nextSize.width
          ? currentSize
          : nextSize,
      );
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    if (typeof ResizeObserver !== "function") {
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [isLoading, txtDocument]);

  useLayoutEffect(() => {
    const restoredOffset = initialProgress?.locator.charOffset;
    if (restoredOffset === undefined) return;
    currentAnchorRef.current = restoredOffset;
  }, [initialProgress?.locator.charOffset, txtDocument?.book.id]);

  useEffect(() => {
    if (
      isLoading ||
      txtDocument === null ||
      virtualBlocks.length === 0 ||
      !hasMeasuredFrame
    ) {
      return;
    }
    pendingTransitionPageRef.current = null;
    pendingTargetSnapshotRef.current = null;
    if (pendingProgressTimerRef.current !== null) {
      window.clearTimeout(pendingProgressTimerRef.current);
      pendingProgressTimerRef.current = null;
      scheduledProgressPageRef.current = null;
    }
    transitionControllerRef.current?.cancel();
    paginationAbortRef.current?.abort();
    const controller = new AbortController();
    paginationAbortRef.current = controller;
    const interactionVersionAtStart = paginationInteractionVersionRef.current;
    let hasPublishedPages = false;
    let hasRestoredAnchor = false;
    const restorePages = (nextPages: readonly TxtPage[], isComplete: boolean) => {
      if (controller.signal.aborted || nextPages.length === 0) return;
      if (!isComplete && nextPages.length < spreadSize) return;

      const userHasNavigated =
        paginationInteractionVersionRef.current !== interactionVersionAtStart;
      const anchorIsAvailable =
        isComplete || currentAnchorRef.current < (nextPages.at(-1)?.endCharOffset ?? 0);
      const shouldRestoreAnchor =
        !userHasNavigated && !hasRestoredAnchor && anchorIsAvailable;
      const nextPageIndex = shouldRestoreAnchor
        ? getTxtSpreadStart(
            Math.max(0, findTxtPageIndex(nextPages, currentAnchorRef.current)),
            renderedSpreadMode,
          )
        : getTxtSpreadStart(
            Math.min(
              Math.max(0, nextPages.length - 1),
              hasPublishedPages ? committedPageIndexRef.current : 0,
            ),
            renderedSpreadMode,
          );
      hasPublishedPages = true;
      if (shouldRestoreAnchor) hasRestoredAnchor = true;
      committedPageIndexRef.current = nextPageIndex;
      const restoredFragment = nextPages[nextPageIndex]?.fragments[0];
      if (restoredFragment !== undefined) {
        onActiveChapterChange(restoredFragment.chapterId);
      }
      startTransition(() => {
        setPages([...nextPages]);
        setActivePageIndex(nextPageIndex);
        setPageInput(String(nextPageIndex + 1));
      });
    };
    const paginate = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setIsPaginating(true);
      setPaginationError(null);
      setPreviewPageIndex(null);
      setPreviewProgressValue(null);

      const sessionBoundaries = txtSessionPaginationCache.get(sessionCacheKey);
      if (sessionBoundaries !== null) {
        restorePages(reconstructTxtPages(virtualBlocks, sessionBoundaries), true);
        setIsPaginating(false);
        return;
      }

      const cachedValue = await getReaderCache(
        txtDocument.book,
        TXT_PAGINATION_CACHE_KEY,
      ).catch(() => null);
      const cached = parseTxtPaginationCache(
        cachedValue,
        layoutSignature,
        txtDocument.charCount,
      );
      if (controller.signal.aborted) return;
      let nextPages: TxtPage[];
      if (cached !== null) {
        nextPages = reconstructTxtPages(virtualBlocks, cached);
        txtSessionPaginationCache.set(sessionCacheKey, cached);
      } else {
        setPages([]);
        await (document.fonts?.ready ?? Promise.resolve());
        if (controller.signal.aborted) return;
        const frame = frameRef.current;
        if (frame === null) return;
        const measurer = createTxtDomPageMeasurer(frame, pageWidth);
        try {
          const measuredPages = await paginateTxtBlocks(virtualBlocks, {
            maxPageHeight: pageHeight,
            measurePage: measurer.measurePage,
            onPages: (partialPages) => restorePages(partialPages, false),
            progressEveryPages: Math.max(4, spreadSize * 4),
            signal: controller.signal,
          });
          const envelope = createTxtPaginationCacheEnvelope(
            measuredPages,
            layoutSignature,
            txtDocument.charCount,
          );
          nextPages = reconstructTxtPages(virtualBlocks, envelope.boundaries);
          txtSessionPaginationCache.set(sessionCacheKey, envelope.boundaries);
          if (controller.signal.aborted) return;
          restorePages(nextPages, true);
          setIsPaginating(false);
          void saveReaderCache(
            txtDocument.book,
            TXT_PAGINATION_CACHE_KEY,
            JSON.stringify(envelope),
          ).catch(() => undefined);
          return;
        } finally {
          measurer.dispose();
        }
      }
      if (controller.signal.aborted) return;
      restorePages(nextPages, true);
      setIsPaginating(false);
    };
    void paginate().catch((paginationFailure: unknown) => {
      if (controller.signal.aborted) return;
      setPaginationError(getErrorMessage(paginationFailure));
      setIsPaginating(false);
    });
    return () => controller.abort();
  }, [
    isLoading,
    hasMeasuredFrame,
    layoutSignature,
    onActiveChapterChange,
    pageHeight,
    pageWidth,
    renderedSpreadMode,
    sessionCacheKey,
    spreadSize,
    txtDocument,
    virtualBlocks,
  ]);

  useEffect(() => {
    if (jumpRequest === null || pages.length === 0) return;
    pendingTransitionPageRef.current = null;
    pendingTargetSnapshotRef.current = null;
    if (pendingProgressTimerRef.current !== null) {
      window.clearTimeout(pendingProgressTimerRef.current);
      pendingProgressTimerRef.current = null;
      scheduledProgressPageRef.current = null;
    }
    transitionControllerRef.current?.cancel();
    currentAnchorRef.current = jumpRequest.locator.charOffset;
    const frame = window.requestAnimationFrame(() => {
      const targetPageIndex = getTxtSpreadStart(
        Math.max(0, findTxtPageIndex(pages, jumpRequest.locator.charOffset)),
        renderedSpreadMode,
      );
      setPreviewPageIndex(null);
      setPreviewProgressValue(null);
      committedPageIndexRef.current = targetPageIndex;
      setActivePageIndex(targetPageIndex);
      setPageInput(String(targetPageIndex + 1));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [jumpRequest, pages, renderedSpreadMode]);

  const savePageProgress = useCallback(
    (page: TxtPage) => {
      const activeDocument = documentRef.current;
      if (activeDocument === null) return;
      currentAnchorRef.current = page.startCharOffset;
      const firstFragment = page.fragments[0];
      if (firstFragment !== undefined) {
        onActiveChapterChange(firstFragment.chapterId);
      }
      onProgressChange(
        {
          kind: "txt",
          chapterId: firstFragment?.chapterId,
          charOffset: page.startCharOffset,
        },
        page.startCharOffset / Math.max(activeDocument.charCount, 1),
      );
    },
    [onActiveChapterChange, onProgressChange],
  );
  const schedulePageProgress = useCallback(
    (page: TxtPage) => {
      if (pendingProgressTimerRef.current !== null) {
        window.clearTimeout(pendingProgressTimerRef.current);
      }
      scheduledProgressPageRef.current = page;
      pendingProgressTimerRef.current = window.setTimeout(() => {
        pendingProgressTimerRef.current = null;
        scheduledProgressPageRef.current = null;
        savePageProgress(page);
      }, 0);
    },
    [savePageProgress],
  );
  useEffect(
    () => () => {
      if (pendingProgressTimerRef.current !== null) {
        window.clearTimeout(pendingProgressTimerRef.current);
      }
      const pendingPage =
        pendingTransitionPageRef.current ?? scheduledProgressPageRef.current;
      scheduledProgressPageRef.current = null;
      if (pendingPage !== null) savePageProgress(pendingPage);
    },
    [savePageProgress],
  );
  const commitPageIndex = useCallback(
    (requestedIndex: number) => {
      if (txtDocument === null || pages.length === 0) return;
      pendingTransitionPageRef.current = null;
      pendingTargetSnapshotRef.current = null;
      if (pendingProgressTimerRef.current !== null) {
        window.clearTimeout(pendingProgressTimerRef.current);
        pendingProgressTimerRef.current = null;
        scheduledProgressPageRef.current = null;
      }
      transitionControllerRef.current?.cancel();
      const nextIndex = getTxtSpreadStart(
        Math.min(pages.length - 1, Math.max(0, requestedIndex)),
        renderedSpreadMode,
      );
      setPreviewPageIndex(null);
      previewPageIndexRef.current = null;
      setPreviewProgressValue(null);
      setIsDraggingProgress(false);
      setPageInput(String(nextIndex + 1));
      if (nextIndex === committedPageIndexRef.current) return;
      const nextPage = pages[nextIndex];
      if (nextPage === undefined) return;
      committedPageIndexRef.current = nextIndex;
      paginationInteractionVersionRef.current += 1;
      setActivePageIndex(nextIndex);
      savePageProgress(nextPage);
    },
    [pages, renderedSpreadMode, savePageProgress, txtDocument],
  );

  useEffect(() => {
    const controller = new PageTransitionController<PageSnapshot>({
      animate: (frames, mode, signal) => {
        const frame = frameRef.current;
        return frame === null
          ? Promise.resolve()
          : animateIsolatedPageTransition(frame, frames, mode, signal);
      },
      captureCurrent: () =>
        captureTxtSpreadSnapshot(
          frameRef.current,
          committedPageIndexRef.current,
          renderedSpreadModeRef.current,
        ),
      captureTarget: () => pendingTargetSnapshotRef.current,
      commit: () => {
        const page = pendingTransitionPageRef.current;
        pendingTransitionPageRef.current = null;
        pendingTargetSnapshotRef.current = null;
        if (page !== null) schedulePageProgress(page);
      },
      getMode: () =>
        resolvePageTransitionMode(
          transitionModeRef.current,
          isPageCurlBlockedRef.current,
        ),
      navigate: async (direction) => {
        if (pendingProgressTimerRef.current !== null) {
          window.clearTimeout(pendingProgressTimerRef.current);
          pendingProgressTimerRef.current = null;
          scheduledProgressPageRef.current = null;
        }
        const activePages = pagesRef.current;
        const activeSpreadSize = renderedSpreadModeRef.current === "double" ? 2 : 1;
        const delta = direction === "next" ? activeSpreadSize : -activeSpreadSize;
        const nextIndex = getTxtSpreadStart(
          Math.min(
            Math.max(0, activePages.length - 1),
            Math.max(0, committedPageIndexRef.current + delta),
          ),
          renderedSpreadModeRef.current,
        );
        const page = activePages[nextIndex];
        if (page === undefined || nextIndex === committedPageIndexRef.current) return;
        pendingTargetSnapshotRef.current = captureTxtSpreadSnapshot(
          frameRef.current,
          nextIndex,
          renderedSpreadModeRef.current,
        );
        pendingTransitionPageRef.current = page;
        committedPageIndexRef.current = nextIndex;
        paginationInteractionVersionRef.current += 1;
        currentAnchorRef.current = page.startCharOffset;
        setPreviewPageIndex(null);
        previewPageIndexRef.current = null;
        setPreviewProgressValue(null);
        setPageInput(String(nextIndex + 1));
        setActivePageIndex(nextIndex);
      },
      prefersReducedMotion: () =>
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    });
    transitionControllerRef.current = controller;
    return () => {
      controller.cancel();
      pendingTransitionPageRef.current = null;
      pendingTargetSnapshotRef.current = null;
      if (pendingProgressTimerRef.current !== null) {
        window.clearTimeout(pendingProgressTimerRef.current);
        pendingProgressTimerRef.current = null;
        scheduledProgressPageRef.current = null;
      }
      if (transitionControllerRef.current === controller) {
        transitionControllerRef.current = null;
      }
    };
  }, [schedulePageProgress]);

  const movePage = useCallback(
    (direction: -1 | 1) => {
      const delta = direction * spreadSize;
      const targetIndex = committedPageIndexRef.current + delta;
      if (targetIndex < 0 || targetIndex >= pages.length) return;
      void transitionControllerRef.current?.request(
        direction === 1 ? "next" : "previous",
      );
    },
    [pages.length, spreadSize],
  );

  useEffect(() => {
    onNavigationActionsChange({
      next: () => movePage(1),
      previous: () => movePage(-1),
    });
    return () => onNavigationActionsChange(null);
  }, [movePage, onNavigationActionsChange]);

  const handleSpreadModeChange = useCallback(
    (mode: TxtSpreadMode) => {
      pendingTransitionPageRef.current = null;
      pendingTargetSnapshotRef.current = null;
      if (pendingProgressTimerRef.current !== null) {
        window.clearTimeout(pendingProgressTimerRef.current);
        pendingProgressTimerRef.current = null;
        scheduledProgressPageRef.current = null;
      }
      transitionControllerRef.current?.cancel();
      const activePage = pages[committedPageIndexRef.current];
      if (activePage !== undefined) {
        currentAnchorRef.current = activePage.startCharOffset;
      }
      onPaginatedViewModeChange(mode);
    },
    [onPaginatedViewModeChange, pages],
  );
  const commitPageInput = useCallback(() => {
    const pageNumber = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(pageNumber) || pages.length === 0) {
      setPageInput(String(committedPageIndexRef.current + 1));
      return;
    }
    const normalizedPage = normalizeReaderPage(pageNumber, pages.length);
    setPageInput(String(normalizedPage));
    commitPageIndex(normalizedPage - 1);
  }, [commitPageIndex, pageInput, pages.length]);
  const handleProgressPreview = useCallback(
    (value: string) => {
      if (txtDocument === null || pages.length === 0 || isPaginating) return;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      const normalizedValue = Math.min(1000, Math.max(0, numericValue));
      const targetOffset = Math.round((normalizedValue / 1000) * txtDocument.charCount);
      const targetPageIndex = getTxtSpreadStart(
        findTxtPageIndex(pages, targetOffset),
        renderedSpreadMode,
      );
      previewPageIndexRef.current = targetPageIndex;
      setPreviewPageIndex(targetPageIndex);
      setPreviewProgressValue(normalizedValue);
      setIsDraggingProgress(true);
    },
    [isPaginating, pages, renderedSpreadMode, txtDocument],
  );
  const commitProgress = useCallback(() => {
    const targetPageIndex = previewPageIndexRef.current;
    setIsDraggingProgress(false);
    if (targetPageIndex === null) return;
    commitPageIndex(targetPageIndex);
  }, [commitPageIndex]);
  const handleTextSelection = useCallback(() => {
    onSelectionChange(captureTxtSelection());
  }, [onSelectionChange]);
  const handlePageEdgeClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(
          'button, a, input, select, textarea, [role="button"], [contenteditable="true"]',
        ) !== null ||
        window.getSelection()?.isCollapsed === false
      ) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      if (ratio <= 0.2) movePage(-1);
      else if (ratio >= 0.8) movePage(1);
    },
    [movePage],
  );
  const renderFragment = useCallback(
    (fragment: TxtPageFragment) =>
      renderAnnotatedText(fragment, annotations, onAnnotationActivate),
    [annotations, onAnnotationActivate],
  );

  if (isLoading) {
    return (
      <section className="reader-state" role="status" aria-live="polite">
        <div className="loading-line" aria-hidden="true" />
        <p>Opening TXT book...</p>
      </section>
    );
  }
  if (error !== null || paginationError !== null) {
    return (
      <section className="reader-state reader-state--error" role="alert">
        <h2>Book could not be opened</h2>
        <p>{error ?? paginationError}</p>
        <div className="reader-state__actions">
          <button type="button" className="reader-tool-button" onClick={onRetry}>
            Retry
          </button>
          <button
            type="button"
            className="reader-tool-button"
            onClick={onBackToLibrary}
          >
            Back to shelf
          </button>
        </div>
      </section>
    );
  }
  if (txtDocument === null) return null;

  const displayedPageIndex = previewPageIndex ?? activePageIndex;
  const spreadStart = getTxtSpreadStart(displayedPageIndex, renderedSpreadMode);
  const spreadEnd = Math.min(pages.length, spreadStart + spreadSize);
  const visiblePage = pages[spreadStart];
  const activeChapterTitle =
    visiblePage?.fragments[0]?.chapterTitle ?? txtDocument.book.title;
  const progressValue =
    previewProgressValue ??
    Math.round(
      ((visiblePage?.startCharOffset ?? 0) / Math.max(txtDocument.charCount, 1)) * 1000,
    );
  const progressPercent = Math.round(progressValue / 10);
  const pageTotalLabel =
    pages.length === 0 ? "-" : isPaginating ? `${pages.length}+` : String(pages.length);
  const calculationLabel = isPaginating ? " · Calculating" : "";
  const positionLabel =
    pages.length === 0
      ? "Pages calculating"
      : spreadSize === 2 && spreadEnd > spreadStart + 1
        ? `Pages ${spreadStart + 1}-${spreadEnd} / ${pageTotalLabel}${calculationLabel}`
        : `Page ${spreadStart + 1} / ${pageTotalLabel}${calculationLabel}`;
  const spreadDescription =
    requestedSpreadMode === "double" && renderedSpreadMode === "single"
      ? "Double view will resume when the window is wide enough."
      : undefined;

  return (
    <section
      ref={viewportRef}
      className="reader-viewport reader-viewport--txt-paginated"
      data-page-transition={transition}
      data-page-curl-blocked={isPageCurlBlocked ? "true" : "false"}
      data-pagination-state={isPaginating ? "calculating" : "ready"}
      aria-label={`${txtDocument.book.title} content`}
      tabIndex={0}
      onKeyUp={handleTextSelection}
      onMouseUp={handleTextSelection}
      onClick={handlePageEdgeClick}
    >
      <div ref={frameRef} className="reader-txt-paginated-frame reader-transition-host">
        {pages.length === 0 ? (
          <section className="reader-state" role="status" aria-live="polite">
            <div className="loading-line" aria-hidden="true" />
            <p>Pages calculating</p>
          </section>
        ) : (
          <TxtPageWindow
            currentPageIndex={displayedPageIndex}
            pages={pages}
            renderFragment={renderFragment}
            spreadMode={renderedSpreadMode}
          />
        )}
      </div>
      <PaginatedReaderControls
        ariaLabel="TXT navigation"
        chapterTitle={activeChapterTitle}
        isDraggingProgress={isDraggingProgress}
        nextDisabled={pages.length === 0 || spreadEnd >= pages.length}
        onNext={() => movePage(1)}
        onPageInputChange={setPageInput}
        onPageInputCommit={commitPageInput}
        onPrevious={() => movePage(-1)}
        onProgressChange={handleProgressPreview}
        onProgressCommit={commitProgress}
        onProgressStart={() => setIsDraggingProgress(true)}
        onSpreadModeChange={handleSpreadModeChange}
        pageFieldLabel="Page"
        pageInputAriaLabel="TXT page number"
        pageInputDisabled={pages.length === 0}
        pageInputMax={pages.length || null}
        pageInputTotalLabel={pageTotalLabel}
        pageInputValue={pageInput}
        positionLabel={positionLabel}
        previousDisabled={pages.length === 0 || spreadStart === 0}
        progressAriaLabel="TXT reading progress"
        progressDisabled={isPaginating || pages.length <= 1}
        progressLabel={`${progressPercent}%`}
        progressTooltip={`${positionLabel} · ${progressPercent}%`}
        progressValue={progressValue}
        requestedSpreadMode={requestedSpreadMode}
        spreadAriaLabel="TXT page view"
        spreadModeDescription={spreadDescription}
      />
    </section>
  );
}

export interface EpubReaderContentProps {
  annotations: Annotation[];
  book: Book;
  isPageCurlBlocked: boolean;
  jumpRequest: EpubJumpRequest | null;
  theme: ReaderTheme;
  transition: PageTransitionMode;
  tocItems: TocItem[];
  onActiveTocItemChange: (tocItemId: string) => void;
  onAnnotationActivate: (annotation: Annotation, anchor: ReaderMenuAnchor) => void;
  onBackToLibrary: () => void;
  onBlockingOverlayChange: (isOpen: boolean) => void;
  onCurrentLocatorChange: (locator: EpubLocator) => void;
  onNavigationActionsChange: ReaderNavigationRegistration;
  onReaderKeyDown: (event: globalThis.KeyboardEvent) => void;
  onSelectionCleared: () => void;
  onSelectionChange: (snapshot: ReaderSelectionSnapshot | null) => void;
  onSearchProviderChange: (provider: ReaderSearchProvider | null) => void;
  onTocChange: (items: TocItem[]) => void;
}

export function EpubReaderContent({
  annotations,
  book,
  isPageCurlBlocked,
  jumpRequest,
  theme,
  transition,
  tocItems,
  onActiveTocItemChange,
  onAnnotationActivate,
  onBackToLibrary,
  onBlockingOverlayChange,
  onCurrentLocatorChange,
  onNavigationActionsChange,
  onReaderKeyDown,
  onSelectionCleared,
  onSelectionChange,
  onSearchProviderChange,
  onTocChange,
}: EpubReaderContentProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<EpubReaderAdapter | null>(null);
  const transitionControllerRef = useRef<PageTransitionController<PageSnapshot> | null>(
    null,
  );
  const isDraggingProgressRef = useRef(false);
  const pendingProgressRef = useRef<PendingEpubProgress | null>(null);
  const positionRef = useRef<EpubPosition | null>(null);
  const previewPositionRef = useRef<EpubProgressPreview | null>(null);
  const progressIdleTimerRef = useRef<number | null>(null);
  const appliedEpubHighlightSignaturesRef = useRef<Map<string, string>>(new Map());
  const appliedEpubUnderlineSignaturesRef = useRef<Map<string, string>>(new Map());
  const isPageCurlBlockedRef = useRef(isPageCurlBlocked);
  const themeRef = useRef(theme);
  const transitionModeRef = useRef(transition);
  const tocItemsRef = useRef(tocItems);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<EpubImageResource | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [locationInput, setLocationInput] = useState("1");
  const [isAdapterReadyForHighlights, setIsAdapterReadyForHighlights] = useState(false);
  const [position, setPosition] = useState<EpubPosition | null>(null);
  const [previewPosition, setPreviewPosition] = useState<EpubProgressPreview | null>(
    null,
  );
  const [requestedSpreadMode, setRequestedSpreadMode] =
    useState<EpubSpreadMode>("single");
  const [spreadState, setSpreadState] = useState<EpubSpreadState>({
    requested: "single",
    rendered: "single",
    canRenderDouble: false,
  });

  useEffect(() => {
    tocItemsRef.current = tocItems;
  }, [tocItems]);

  useEffect(() => {
    themeRef.current = theme;
    transitionControllerRef.current?.cancel();
    void adapterRef.current?.setTheme(theme);
  }, [theme]);

  useLayoutEffect(() => {
    transitionModeRef.current = transition;
  }, [transition]);

  useLayoutEffect(() => {
    isPageCurlBlockedRef.current = isPageCurlBlocked;
  }, [isPageCurlBlocked]);

  useEffect(() => {
    isDraggingProgressRef.current = isDraggingProgress;
  }, [isDraggingProgress]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    previewPositionRef.current = previewPosition;
  }, [previewPosition]);

  const flushPendingProgress = useCallback(async () => {
    const pendingProgress = pendingProgressRef.current;

    if (pendingProgress === null) {
      return;
    }

    pendingProgressRef.current = null;
    await saveReadingProgress(
      book.id,
      pendingProgress.locator,
      pendingProgress.progress,
    ).catch(() => undefined);
  }, [book.id]);

  useEffect(() => {
    const transitionController = new PageTransitionController<PageSnapshot>({
      animate: (frames, mode, signal) => {
        const host = hostRef.current;

        return host === null
          ? Promise.resolve()
          : animateIsolatedPageTransition(host, frames, mode, signal);
      },
      captureCurrent: () => captureEpubRenditionSnapshotAfterLayout(hostRef.current),
      captureTarget: () => captureEpubRenditionSnapshotAfterLayout(hostRef.current),
      commit: async () => {
        if (progressIdleTimerRef.current !== null) {
          window.clearTimeout(progressIdleTimerRef.current);
          progressIdleTimerRef.current = null;
        }

        await flushPendingProgress();
      },
      getMode: () =>
        resolvePageTransitionMode(
          transitionModeRef.current,
          isPageCurlBlockedRef.current,
        ),
      navigate: async (direction) => {
        const adapter = adapterRef.current;

        if (adapter === null) {
          throw new Error("EPUB reader is not ready for navigation.");
        }

        await (direction === "next" ? adapter.next() : adapter.previous());
      },
      prefersReducedMotion: () =>
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    });
    transitionControllerRef.current = transitionController;

    return () => {
      transitionController.cancel();
      if (transitionControllerRef.current === transitionController) {
        transitionControllerRef.current = null;
      }
    };
  }, [flushPendingProgress]);

  useEffect(
    () => () => {
      if (progressIdleTimerRef.current !== null) {
        window.clearTimeout(progressIdleTimerRef.current);
      }

      void flushPendingProgress();
    },
    [flushPendingProgress],
  );

  const updateActiveTocForHref = useCallback(
    (href: string) => {
      const activeTocItemId = findTocItemIdByHref(tocItemsRef.current, href);

      if (activeTocItemId !== null) {
        onActiveTocItemChange(activeTocItemId);
      }
    },
    [onActiveTocItemChange],
  );

  const handleImageActivate = useCallback(
    (resource: EpubImageResource) => {
      onSelectionCleared();
      onSelectionChange(null);
      setActiveImage(resource);
      onBlockingOverlayChange(true);
    },
    [onBlockingOverlayChange, onSelectionChange, onSelectionCleared],
  );

  const handleImageViewerClose = useCallback(() => {
    const trigger = activeImage?.trigger;
    setActiveImage(null);
    onBlockingOverlayChange(false);
    window.requestAnimationFrame(() => {
      const ownerFrame =
        trigger?.isConnected === true
          ? (trigger.ownerDocument.defaultView?.frameElement as HTMLElement | null)
          : null;
      const canRestoreTrigger =
        trigger?.ownerDocument === document || ownerFrame?.isConnected === true;
      const focusTarget = canRestoreTrigger ? trigger : hostRef.current;
      const focusableTarget = focusTarget as Element & {
        focus?: (options?: FocusOptions) => void;
      };
      if (ownerFrame?.isConnected === true) {
        ownerFrame.focus({ preventScroll: true });
      }
      focusableTarget?.focus?.({ preventScroll: true });
      if (ownerFrame?.isConnected === true && trigger !== undefined) {
        window.requestAnimationFrame(() => {
          const triggerOwnsFocus =
            ownerFrame.ownerDocument.activeElement === ownerFrame &&
            trigger.ownerDocument.activeElement === trigger;

          if (!triggerOwnsFocus) {
            hostRef.current?.focus({ preventScroll: true });
          }
        });
      }
    });
  }, [activeImage, onBlockingOverlayChange]);

  useEffect(
    () => () => {
      onBlockingOverlayChange(false);
    },
    [onBlockingOverlayChange],
  );

  const handleRelocated = useCallback(
    (nextPosition: EpubPosition) => {
      positionRef.current = nextPosition;
      updateActiveTocForHref(nextPosition.locator.href);
      onCurrentLocatorChange(nextPosition.locator);
      setPosition(nextPosition);
      if (nextPosition.location !== null) {
        setLocationInput(String(nextPosition.location));
      }

      if (!isDraggingProgressRef.current) {
        setPreviewPosition(null);
      }

      pendingProgressRef.current = {
        locator: nextPosition.locator,
        progress: nextPosition.progression ?? undefined,
      };

      if (progressIdleTimerRef.current !== null) {
        window.clearTimeout(progressIdleTimerRef.current);
      }

      progressIdleTimerRef.current = window.setTimeout(() => {
        progressIdleTimerRef.current = null;
        flushPendingProgress();
      }, 750);
    },
    [flushPendingProgress, onCurrentLocatorChange, updateActiveTocForHref],
  );

  useEffect(() => {
    let isCurrent = true;
    let openedAdapter: EpubReaderAdapter | null = null;

    async function openEpub() {
      setIsLoading(true);
      setError(null);
      setActiveImage(null);
      onBlockingOverlayChange(false);
      setIsAdapterReadyForHighlights(false);
      setPosition(null);
      setPreviewPosition(null);
      setLocationInput("1");
      setRequestedSpreadMode("single");
      setSpreadState({
        requested: "single",
        rendered: "single",
        canRenderDouble: false,
      });
      onTocChange([]);

      try {
        if (hostRef.current === null) {
          throw new Error("EPUB reader viewport is unavailable.");
        }

        const [
          sourceUrl,
          savedProgress,
          cachedLocations,
          cachedPublicationPageList,
          cachedToc,
        ] = await Promise.all([
          getEpubBookSource(book),
          getReadingProgress<EpubLocator>(book.id),
          getReaderCache(book, EPUB_LOCATIONS_CACHE_KEY).catch(() => null),
          getReaderCache(book, EPUB_PAGE_LIST_CACHE_KEY).catch(() => null),
          getReaderCache(book, EPUB_TOC_CACHE_KEY).catch(() => null),
        ]);

        if (!isCurrent || hostRef.current === null) {
          return;
        }

        const adapter = new EpubReaderAdapter({
          bookId: book.id,
          cachedLocations: cachedLocations ?? undefined,
          cachedPublicationPageList: cachedPublicationPageList ?? undefined,
          sourceUrl,
          container: hostRef.current,
          initialLocator: savedProgress?.locator,
          theme: themeRef.current,
          onRelocated: handleRelocated,
          onKeyDown: onReaderKeyDown,
          onImageActivate: handleImageActivate,
          onLayoutInvalidated: () => {
            transitionControllerRef.current?.cancel();
          },
          onLocationsGenerated: (serializedLocations) => {
            void saveReaderCache(
              book,
              EPUB_LOCATIONS_CACHE_KEY,
              serializedLocations,
            ).catch(() => undefined);
          },
          onPublicationPageListGenerated: (serializedPageList) => {
            void saveReaderCache(
              book,
              EPUB_PAGE_LIST_CACHE_KEY,
              serializedPageList,
            ).catch(() => undefined);
          },
          onSelectionCleared,
          onSelected: (selection) => {
            const currentPosition = positionRef.current;
            const selectedText = selection.selectedText?.trim() ?? "";

            if (currentPosition === null || selectedText === "") {
              onSelectionChange(null);
              return;
            }

            onSelectionChange({
              locator: {
                kind: "epub",
                href: currentPosition.locator.href,
                cfi: selection.cfiRange,
                progression: currentPosition.progression ?? undefined,
                selectedText,
                contextBefore: selection.contextBefore,
                contextAfter: selection.contextAfter,
              },
              selectedText,
              contextBefore: selection.contextBefore,
              contextAfter: selection.contextAfter,
              ...getSelectionMenuAnchor(selection.anchorRect),
            });
          },
          onSpreadChange: setSpreadState,
        });
        openedAdapter = adapter;
        adapterRef.current = adapter;

        await adapter.open(book.id);
        onSearchProviderChange(
          (searchQuery) =>
            adapter.search(searchQuery) as Promise<Array<SearchHit<Locator>>>,
        );
        appliedEpubHighlightSignaturesRef.current = new Map();
        appliedEpubUnderlineSignaturesRef.current = new Map();
        setIsAdapterReadyForHighlights(true);
        const cachedTocItems = parseCachedToc(cachedToc);
        const nextTocItems = cachedTocItems ?? (await adapter.getToc());

        if (cachedTocItems === null) {
          void saveReaderCache(
            book,
            EPUB_TOC_CACHE_KEY,
            JSON.stringify(nextTocItems),
          ).catch(() => undefined);
        }

        if (isCurrent) {
          onTocChange(nextTocItems);
        }
      } catch (openError) {
        if (isCurrent) {
          setError(getErrorMessage(openError));
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void openEpub();

    return () => {
      isCurrent = false;
      transitionControllerRef.current?.cancel();
      void openedAdapter?.close();
      if (adapterRef.current === openedAdapter) {
        adapterRef.current = null;
      }
      onSearchProviderChange(null);
      setIsAdapterReadyForHighlights(false);
      appliedEpubHighlightSignaturesRef.current = new Map();
      appliedEpubUnderlineSignaturesRef.current = new Map();
    };
  }, [
    book,
    handleRelocated,
    handleImageActivate,
    onBlockingOverlayChange,
    onSearchProviderChange,
    onReaderKeyDown,
    onSelectionChange,
    onSelectionCleared,
    onTocChange,
    retryVersion,
  ]);

  useEffect(() => {
    const adapter = adapterRef.current;

    if (!isAdapterReadyForHighlights || adapter === null) {
      return;
    }

    const nextHighlights = getEpubHighlightAnnotations(annotations);
    const nextHighlightSignatures = new Map(
      nextHighlights.map((annotation) => [
        annotation.locator.cfi,
        getEpubAnnotationSignature(annotation),
      ]),
    );

    for (const [cfi, signature] of appliedEpubHighlightSignaturesRef.current) {
      if (nextHighlightSignatures.get(cfi) !== signature) {
        adapter.removeHighlight(cfi);
      }
    }

    for (const annotation of nextHighlights) {
      const cfi = annotation.locator.cfi;
      const signature = nextHighlightSignatures.get(cfi);

      if (
        signature === undefined ||
        appliedEpubHighlightSignaturesRef.current.get(cfi) === signature
      ) {
        continue;
      }

      adapter.addHighlight(cfi, annotation.color ?? DEFAULT_HIGHLIGHT_COLOR);
    }

    appliedEpubHighlightSignaturesRef.current = nextHighlightSignatures;

    const nextUnderlines = getEpubUnderlineAnnotations(annotations);
    const nextUnderlineSignatures = new Map(
      nextUnderlines.map((annotation) => [
        annotation.locator.cfi,
        getEpubAnnotationSignature(annotation),
      ]),
    );

    for (const [cfi, signature] of appliedEpubUnderlineSignaturesRef.current) {
      if (nextUnderlineSignatures.get(cfi) !== signature) {
        adapter.removeUnderline(cfi);
      }
    }

    for (const annotation of nextUnderlines) {
      const cfi = annotation.locator.cfi;
      const signature = nextUnderlineSignatures.get(cfi);

      if (
        signature === undefined ||
        appliedEpubUnderlineSignaturesRef.current.get(cfi) === signature
      ) {
        continue;
      }

      adapter.addUnderline(
        cfi,
        annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
        (event) => {
          onAnnotationActivate(annotation, getEventMenuAnchor(event));
        },
      );
    }

    appliedEpubUnderlineSignaturesRef.current = nextUnderlineSignatures;
  }, [annotations, isAdapterReadyForHighlights, onAnnotationActivate]);

  useEffect(() => {
    if (jumpRequest === null) {
      return;
    }

    transitionControllerRef.current?.cancel();
    void adapterRef.current?.goTo(jumpRequest.locator);
  }, [jumpRequest]);

  const requestPageTransition = useCallback(
    (direction: PageDirection) => {
      if (activeImage !== null) {
        return;
      }

      setPreviewPosition(null);
      const transitionController = transitionControllerRef.current;
      const navigation =
        transitionController === null
          ? direction === "next"
            ? adapterRef.current?.next()
            : adapterRef.current?.previous()
          : transitionController.request(direction);
      void navigation?.catch((navigationError: unknown) => {
        setError(getErrorMessage(navigationError));
      });
    },
    [activeImage],
  );

  const handlePrevious = useCallback(() => {
    setPreviewPosition(null);
    requestPageTransition("previous");
  }, [requestPageTransition]);

  const handleNext = useCallback(() => {
    setPreviewPosition(null);
    requestPageTransition("next");
  }, [requestPageTransition]);

  useEffect(() => {
    onNavigationActionsChange({
      next: handleNext,
      previous: handlePrevious,
    });

    return () => {
      onNavigationActionsChange(null);
    };
  }, [handleNext, handlePrevious, onNavigationActionsChange]);

  const handleSpreadModeChange = useCallback((mode: EpubSpreadMode) => {
    transitionControllerRef.current?.cancel();
    setRequestedSpreadMode(mode);
    const nextSpreadState = adapterRef.current?.setSpreadMode(mode);

    if (nextSpreadState !== undefined) {
      setSpreadState(nextSpreadState);
    }
  }, []);

  const handleProgressPreview = useCallback(
    (value: string) => {
      const adapter = adapterRef.current;

      if (adapter === null) {
        return;
      }

      try {
        const nextPreview = adapter.previewProgress(Number(value) / 1000);
        previewPositionRef.current = nextPreview;
        setPreviewPosition(nextPreview);
        updateActiveTocForHref(nextPreview.locator.href);
      } catch {
        setPreviewPosition(null);
      }
    },
    [updateActiveTocForHref],
  );

  const handleProgressChange = useCallback(
    (value: string) => {
      isDraggingProgressRef.current = true;
      setIsDraggingProgress(true);
      handleProgressPreview(value);
    },
    [handleProgressPreview],
  );

  const commitProgress = useCallback(() => {
    transitionControllerRef.current?.cancel();
    const adapter = adapterRef.current;
    const nextProgression =
      previewPositionRef.current?.progression ?? positionRef.current?.progression ?? 0;

    isDraggingProgressRef.current = false;
    setIsDraggingProgress(false);

    if (adapter === null) {
      setPreviewPosition(null);
      return;
    }

    void adapter.goToProgress(nextProgression).catch((progressError: unknown) => {
      setPreviewPosition(null);
      setError(getErrorMessage(progressError));
    });
  }, []);

  const commitLocationInput = useCallback(() => {
    transitionControllerRef.current?.cancel();
    const adapter = adapterRef.current;
    const currentPosition = positionRef.current;
    const totalLocations = currentPosition?.totalLocations;
    const currentLocation = currentPosition?.location ?? 1;
    const location = Number.parseInt(locationInput, 10);

    if (
      adapter === null ||
      currentPosition?.locationsReady !== true ||
      totalLocations === null ||
      totalLocations === undefined ||
      !Number.isFinite(location)
    ) {
      setLocationInput(String(currentLocation));
      return;
    }

    const nextLocation = normalizeReaderPage(location, totalLocations);
    const nextProgression = pageToProgression(nextLocation, totalLocations);
    setLocationInput(String(nextLocation));
    setPreviewPosition(null);
    isDraggingProgressRef.current = false;
    setIsDraggingProgress(false);

    void adapter.goToProgress(nextProgression).catch((locationError: unknown) => {
      setLocationInput(String(positionRef.current?.location ?? currentLocation));
      setError(getErrorMessage(locationError));
    });
  }, [locationInput]);

  const activeProgress = previewPosition ?? position;
  const locationsReady =
    position?.locationsReady === true && position.totalLocations !== null;
  const activeProgression = locationsReady ? (activeProgress?.progression ?? 0) : 0;
  const sliderValue = Math.round(activeProgression * 1000);
  const progressPercent = Math.round(activeProgression * 100);
  const activeLocation = activeProgress?.location ?? null;
  const totalLocations =
    activeProgress?.totalLocations ?? position?.totalLocations ?? null;
  const locationLabel =
    activeLocation !== null && totalLocations !== null
      ? `Location ${activeLocation} / ${totalLocations}`
      : "Locations calculating";
  const positionLabel =
    activeProgress?.publicationPageLabel === null ||
    activeProgress?.publicationPageLabel === undefined
      ? locationLabel
      : `Page ${activeProgress.publicationPageLabel}`;
  const progressLabel = locationsReady
    ? `${progressPercent}%`
    : "Calculating locations";
  const activeChapterTitle =
    activeProgress !== null
      ? (findTocItemByHref(tocItems, activeProgress.locator.href)?.title ?? book.title)
      : book.title;
  const spreadModeDescription =
    requestedSpreadMode === "double" && spreadState.rendered === "single"
      ? "Double view will resume when the window is wide enough."
      : undefined;

  return (
    <section
      className="reader-viewport reader-viewport--epub"
      data-page-curl-blocked={isPageCurlBlocked ? "true" : "false"}
      data-page-transition={transition}
      aria-label={`${book.title} content`}
    >
      <article className="reader-page reader-page--epub">
        <div className="reader-epub-frame">
          {isLoading ? (
            <section
              className="reader-state reader-state--overlay"
              role="status"
              aria-live="polite"
              aria-label="Loading EPUB book"
            >
              <div className="loading-line" aria-hidden="true" />
              <p>Opening EPUB book...</p>
            </section>
          ) : null}
          {error !== null ? (
            <section
              className="reader-state reader-state--error reader-state--overlay"
              role="alert"
            >
              <h2>Book could not be opened</h2>
              <p>{error}</p>
              <div className="reader-state__actions">
                <button
                  type="button"
                  className="reader-tool-button"
                  onClick={() => setRetryVersion((version) => version + 1)}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="reader-tool-button"
                  onClick={onBackToLibrary}
                >
                  Back to shelf
                </button>
              </div>
            </section>
          ) : null}
          <div
            ref={hostRef}
            className="reader-epub-host reader-transition-host"
            aria-hidden={error !== null}
            tabIndex={-1}
          />
        </div>
        <PaginatedReaderControls
          ariaLabel="EPUB navigation"
          chapterTitle={activeChapterTitle}
          isDraggingProgress={isDraggingProgress}
          onNext={handleNext}
          onPageInputChange={setLocationInput}
          onPageInputCommit={commitLocationInput}
          onPrevious={handlePrevious}
          onProgressChange={handleProgressChange}
          onProgressCommit={commitProgress}
          onProgressStart={() => {
            isDraggingProgressRef.current = true;
            setIsDraggingProgress(true);
          }}
          onSpreadModeChange={handleSpreadModeChange}
          pageFieldLabel="Location"
          pageInputAriaLabel="EPUB location number"
          pageInputDisabled={!locationsReady}
          pageInputMax={totalLocations}
          pageInputValue={locationInput}
          positionLabel={positionLabel}
          progressAriaLabel="EPUB reading progress"
          progressDisabled={!locationsReady}
          progressLabel={progressLabel}
          progressTooltip={
            activeProgress?.publicationPageLabel === null ||
            activeProgress?.publicationPageLabel === undefined
              ? activeLocation === null
                ? locationLabel
                : `Location ${activeLocation}`
              : `Page ${activeProgress.publicationPageLabel}`
          }
          progressValue={sliderValue}
          requestedSpreadMode={requestedSpreadMode}
          spreadAriaLabel="EPUB page view"
          spreadModeDescription={spreadModeDescription}
        />
      </article>
      <EpubImageViewer
        key={activeImage?.sourceUrl ?? "closed"}
        isOpen={activeImage !== null}
        onClose={handleImageViewerClose}
        resource={activeImage}
      />
    </section>
  );
}

export interface PdfReaderContentProps {
  annotations: Annotation[];
  book: Book;
  isPageCurlBlocked: boolean;
  jumpRequest: PdfJumpRequest | null;
  paginatedViewMode: PdfPaginatedViewMode;
  theme: ReaderTheme;
  tocItems: TocItem[];
  transition: PageTransitionMode;
  viewMode: PdfViewMode;
  onActiveTocItemChange: (tocItemId: string | null) => void;
  onAnnotationActivate: (annotation: Annotation, anchor: ReaderMenuAnchor) => void;
  onBackToLibrary: () => void;
  onCurrentLocatorChange: (locator: PdfLocator) => void;
  onNavigationActionsChange: ReaderNavigationRegistration;
  onPaginatedViewModeChange: (mode: PdfPaginatedViewMode) => void;
  onSelectionChange: (snapshot: ReaderSelectionSnapshot | null) => void;
  onSearchProviderChange: (provider: ReaderSearchProvider | null) => void;
  onTocChange: (items: TocItem[]) => void;
}

export function PdfReaderContent({
  annotations,
  book,
  isPageCurlBlocked,
  jumpRequest,
  paginatedViewMode,
  theme,
  tocItems,
  transition,
  viewMode,
  onActiveTocItemChange,
  onAnnotationActivate,
  onBackToLibrary,
  onCurrentLocatorChange,
  onNavigationActionsChange,
  onPaginatedViewModeChange,
  onSelectionChange,
  onSearchProviderChange,
  onTocChange,
}: PdfReaderContentProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<PdfReaderAdapter | null>(null);
  const isDraggingProgressRef = useRef(false);
  const pendingProgressRef = useRef<PendingPdfProgress | null>(null);
  const positionRef = useRef<PdfPosition | null>(null);
  const previewPositionRef = useRef<PdfPosition | null>(null);
  const progressIdleTimerRef = useRef<number | null>(null);
  const requestedViewModeRef = useRef<PdfViewMode>(viewMode);
  const pdfTransitionControllerRef =
    useRef<PageTransitionController<PageSnapshot> | null>(null);
  const pendingPdfTargetSnapshotRef = useRef<PageSnapshot | null>(null);
  const themeRef = useRef(theme);
  const tocItemsRef = useRef(tocItems);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [frameWidth, setFrameWidth] = useState(1000);
  const [pdfNavigationVersion, setPdfNavigationVersion] = useState(0);
  const [pdfRenderVersion, setPdfRenderVersion] = useState(0);
  const [isPdfTransitioning, setIsPdfTransitioning] = useState(false);
  const [pdfAdapter, setPdfAdapter] = useState<PdfReaderAdapter | null>(null);
  const [position, setPosition] = useState<PdfPosition | null>(null);
  const [previewPosition, setPreviewPosition] = useState<PdfPosition | null>(null);

  useLayoutEffect(() => {
    if (position?.renderedMode === "continuous") {
      return;
    }

    const frame = frameRef.current;
    if (frame !== null) {
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
    }
  }, [position?.page, position?.renderedMode]);

  useEffect(() => {
    tocItemsRef.current = tocItems;
  }, [tocItems]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    previewPositionRef.current = previewPosition;
  }, [previewPosition]);

  useEffect(() => {
    isDraggingProgressRef.current = isDraggingProgress;
  }, [isDraggingProgress]);

  useEffect(() => {
    requestedViewModeRef.current = viewMode;

    const adapter = adapterRef.current;
    if (adapter !== null) {
      adapter.setViewMode(viewMode, frameRef.current?.clientWidth);
    }
  }, [viewMode]);

  const flushPendingProgress = useCallback(() => {
    const pendingProgress = pendingProgressRef.current;

    if (pendingProgress === null) {
      return;
    }

    pendingProgressRef.current = null;
    void saveReadingProgress(
      book.id,
      pendingProgress.locator,
      pendingProgress.progress,
    ).catch(() => undefined);
  }, [book.id]);

  useEffect(
    () => () => {
      if (progressIdleTimerRef.current !== null) {
        window.clearTimeout(progressIdleTimerRef.current);
      }

      flushPendingProgress();
    },
    [flushPendingProgress],
  );

  const renderVisiblePages = useCallback(async () => {
    setPdfRenderVersion((version) => version + 1);
  }, []);

  const handlePositionChange = useCallback(
    (nextPosition: PdfPosition) => {
      positionRef.current = nextPosition;
      onCurrentLocatorChange(nextPosition.locator);
      setPosition(nextPosition);
      setPageInput(String(nextPosition.page));

      if (!isDraggingProgressRef.current) {
        setPreviewPosition(null);
      }

      const activeTocItemId = findTocItemIdByPdfPage(
        tocItemsRef.current,
        nextPosition.page,
      );
      onActiveTocItemChange(activeTocItemId);

      pendingProgressRef.current = {
        locator: nextPosition.locator,
        progress: nextPosition.progression,
      };

      if (progressIdleTimerRef.current !== null) {
        window.clearTimeout(progressIdleTimerRef.current);
      }

      progressIdleTimerRef.current = window.setTimeout(() => {
        progressIdleTimerRef.current = null;
        flushPendingProgress();
      }, 750);
    },
    [flushPendingProgress, onActiveTocItemChange, onCurrentLocatorChange],
  );

  const capturePdfSelection = useCallback(() => {
    const selection = window.getSelection();
    const adapter = adapterRef.current;
    const currentPosition = positionRef.current;

    if (
      selection === null ||
      selection.rangeCount === 0 ||
      adapter === null ||
      currentPosition === null
    ) {
      onSelectionChange(null);
      return;
    }

    const selectedText = selection.toString().trim();

    if (selectedText === "") {
      onSelectionChange(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startLayer = getPdfTextLayer(range.startContainer);
    const endLayer = getPdfTextLayer(range.endContainer);

    if (startLayer === null || endLayer === null || startLayer !== endLayer) {
      onSelectionChange(null);
      return;
    }

    const page = Number.parseInt(startLayer.dataset.pageNumber ?? "", 10);

    if (!Number.isFinite(page)) {
      onSelectionChange(null);
      return;
    }

    const layerRect = startLayer.getBoundingClientRect();
    const viewportRects = Array.from(range.getClientRects())
      .map((rect) => ({
        x: rect.left - layerRect.left,
        y: rect.top - layerRect.top,
        width: rect.width,
        height: rect.height,
      }))
      .filter((rect) => rect.width > 0 && rect.height > 0);

    if (viewportRects.length === 0) {
      onSelectionChange(null);
      return;
    }

    void adapter
      .viewportRectsToPdfRects(page, viewportRects, currentPosition.scale)
      .then((rects) => {
        if (rects === undefined || rects.length === 0) {
          onSelectionChange(null);
          return;
        }

        const menuRect = range.getBoundingClientRect();
        onSelectionChange({
          locator: {
            kind: "pdf",
            page,
            rects,
            scale: currentPosition.scale,
            zoomMode: currentPosition.zoomMode,
            selectedText,
          },
          selectedText,
          menuX: menuRect.left + menuRect.width / 2,
          menuY: Math.max(72, menuRect.top - 48),
        });
      })
      .catch(() => {
        onSelectionChange(null);
      });
  }, [onSelectionChange]);

  useEffect(() => {
    themeRef.current = theme;
    pdfTransitionControllerRef.current?.cancel();
    void adapterRef.current?.setTheme(theme).then(() => {
      setPdfNavigationVersion((version) => version + 1);
      return renderVisiblePages();
    });
  }, [renderVisiblePages, theme]);

  useEffect(() => {
    let devicePixelRatio = window.devicePixelRatio || 1;
    const handleWindowResize = () => {
      const nextDevicePixelRatio = window.devicePixelRatio || 1;
      if (nextDevicePixelRatio === devicePixelRatio) {
        return;
      }
      devicePixelRatio = nextDevicePixelRatio;
      pdfTransitionControllerRef.current?.cancel();
      setPdfNavigationVersion((version) => version + 1);
      void renderVisiblePages();
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [renderVisiblePages]);

  useEffect(() => {
    let isCurrent = true;
    let openedAdapter: PdfReaderAdapter | null = null;

    async function openPdf() {
      setIsLoading(true);
      setError(null);
      setPosition(null);
      setPreviewPosition(null);
      setIsDraggingProgress(false);
      setPageInput("1");
      setPdfAdapter(null);
      onTocChange([]);

      try {
        const [sourceUrl, savedProgress, cachedToc] = await Promise.all([
          getPdfBookSource(book),
          getReadingProgress<PdfLocator>(book.id),
          getReaderCache(book, PDF_TOC_CACHE_KEY).catch(() => null),
        ]);

        if (!isCurrent) {
          return;
        }

        const adapter = new PdfReaderAdapter({
          bookId: book.id,
          sourceUrl,
          initialLocator: savedProgress?.locator,
          theme: themeRef.current,
          viewMode: requestedViewModeRef.current,
          onPositionChange: handlePositionChange,
        });
        openedAdapter = adapter;

        await adapter.open(book.id);

        if (!isCurrent) {
          return;
        }

        adapter.setViewMode(
          requestedViewModeRef.current,
          frameRef.current?.clientWidth,
        );
        adapterRef.current = adapter;
        setPdfAdapter(adapter);
        onSearchProviderChange(
          (searchQuery) =>
            adapter.search(searchQuery) as Promise<Array<SearchHit<Locator>>>,
        );
        await adapter.setTheme(themeRef.current);
        const cachedTocItems = parseCachedToc(cachedToc);
        const nextTocItems = cachedTocItems ?? (await adapter.getToc());

        if (cachedTocItems === null) {
          void saveReaderCache(
            book,
            PDF_TOC_CACHE_KEY,
            JSON.stringify(nextTocItems),
          ).catch(() => undefined);
        }

        if (!isCurrent) {
          return;
        }

        onTocChange(nextTocItems);
        onActiveTocItemChange(
          findTocItemIdByPdfPage(nextTocItems, adapter.getPosition().page),
        );
        await renderVisiblePages();
      } catch (openError) {
        if (isCurrent) {
          setError(getErrorMessage(openError));
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void openPdf();

    return () => {
      isCurrent = false;
      if (adapterRef.current === openedAdapter) {
        adapterRef.current = null;
      }
      onSearchProviderChange(null);
      void openedAdapter?.close();
    };
  }, [
    book,
    handlePositionChange,
    onActiveTocItemChange,
    onSearchProviderChange,
    onTocChange,
    renderVisiblePages,
    retryVersion,
  ]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const frame = frameRef.current;

    if (frame === null) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      const adapter = adapterRef.current;

      if (adapter === null) {
        return;
      }

      try {
        pdfTransitionControllerRef.current?.cancel();
        setFrameWidth(Math.max(1, frame.clientWidth));
        const nextPosition = adapter.setViewMode(
          requestedViewModeRef.current,
          frame.clientWidth,
        );
        positionRef.current = nextPosition;
        setPosition(nextPosition);
        setPdfNavigationVersion((version) => version + 1);
        void renderVisiblePages();
      } catch (resizeError) {
        if (adapterRef.current === adapter) {
          setError(getErrorMessage(resizeError));
        }
      }
    });

    resizeObserver.observe(frame);

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderVisiblePages]);

  const goToPdfLocator = useCallback(
    async (locator: PdfLocator) => {
      const adapter = adapterRef.current;
      if (adapter === null) {
        return;
      }

      onSelectionChange(null);
      window.getSelection()?.removeAllRanges();

      try {
        pdfTransitionControllerRef.current?.cancel();
        await adapter.goTo(locator);
        setPdfNavigationVersion((version) => version + 1);
        await renderVisiblePages();

        if (resolvePdfLocatorAnchorKind(locator) === "rect") {
          await scrollPdfRectIntoView(
            frameRef.current,
            adapter,
            locator,
            positionRef.current,
          );
        }
      } catch (jumpError) {
        setPreviewPosition(null);
        setError(getErrorMessage(jumpError));
      }
    },
    [onSelectionChange, renderVisiblePages],
  );

  useEffect(() => {
    if (jumpRequest === null) {
      return;
    }

    const adapter = adapterRef.current;

    if (adapter === null) {
      return;
    }

    void goToPdfLocator(jumpRequest.locator);
  }, [goToPdfLocator, jumpRequest]);

  const runPdfAction = useCallback(
    (action: (adapter: PdfReaderAdapter) => Promise<unknown> | unknown) => {
      const adapter = adapterRef.current;

      if (adapter === null) {
        return;
      }

      pdfTransitionControllerRef.current?.cancel();

      void Promise.resolve(action(adapter))
        .then(() => {
          setPdfNavigationVersion((version) => version + 1);
          return renderVisiblePages();
        })
        .catch((actionError: unknown) => {
          setError(getErrorMessage(actionError));
        });
    },
    [renderVisiblePages],
  );

  useEffect(() => {
    const controller = new PageTransitionController<PageSnapshot>({
      animate: async (frames, mode, signal) => {
        const frame = frameRef.current;
        if (frame === null) {
          return;
        }
        setIsPdfTransitioning(true);
        try {
          await animateIsolatedPageTransition(frame, frames, mode, signal);
        } finally {
          setIsPdfTransitioning(false);
        }
      },
      captureCurrent: (signal) => {
        const currentPosition = positionRef.current;
        if (currentPosition === null) return null;
        return currentPosition.renderedMode === "double"
          ? capturePdfSpreadSnapshotAfterRender(
              frameRef.current,
              currentPosition.page,
              signal,
            )
          : capturePdfSpreadSnapshot(frameRef.current, currentPosition.page);
      },
      captureTarget: () => pendingPdfTargetSnapshotRef.current,
      commit: () => {
        pendingPdfTargetSnapshotRef.current = null;
      },
      getMode: () => resolvePageTransitionMode(transition, isPageCurlBlocked),
      navigate: async (direction, signal, shouldCaptureTarget) => {
        const adapter = adapterRef.current;
        const currentPosition = positionRef.current;
        if (adapter === null || currentPosition === null) {
          return;
        }
        const targetSpread =
          currentPosition.renderedMode === "double"
            ? direction === "next"
              ? nextPdfSpreadStart(currentPosition.page, currentPosition.totalPages)
              : previousPdfSpreadStart(currentPosition.page, currentPosition.totalPages)
            : normalizeReaderPage(
                currentPosition.page + (direction === "next" ? 1 : -1),
                currentPosition.totalPages,
              );
        if (targetSpread === currentPosition.page) {
          pendingPdfTargetSnapshotRef.current = null;
          return;
        }
        pendingPdfTargetSnapshotRef.current = shouldCaptureTarget
          ? currentPosition.renderedMode === "double"
            ? await capturePdfSpreadSnapshotAfterRender(
                frameRef.current,
                targetSpread,
                signal,
              )
            : capturePdfSpreadSnapshot(frameRef.current, targetSpread)
          : null;
        if (signal.aborted) return;
        if (direction === "next") {
          await adapter.next();
        } else {
          await adapter.previous();
        }
      },
      prefersReducedMotion: () =>
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    });
    pdfTransitionControllerRef.current = controller;

    return () => {
      controller.cancel();
      pendingPdfTargetSnapshotRef.current = null;
      if (pdfTransitionControllerRef.current === controller) {
        pdfTransitionControllerRef.current = null;
      }
    };
  }, [isPageCurlBlocked, transition]);

  const requestPdfPageMove = useCallback(
    (direction: PageDirection) => {
      if (positionRef.current?.renderedMode === "continuous") {
        runPdfAction((adapter) =>
          direction === "next" ? adapter.next() : adapter.previous(),
        );
        return;
      }
      void pdfTransitionControllerRef.current?.request(direction);
    },
    [runPdfAction],
  );

  const handlePrevious = useCallback(() => {
    requestPdfPageMove("previous");
  }, [requestPdfPageMove]);

  const handleNext = useCallback(() => {
    requestPdfPageMove("next");
  }, [requestPdfPageMove]);

  const handlePdfFrameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      requestPdfPageMove(event.key === "ArrowRight" ? "next" : "previous");
    },
    [requestPdfPageMove],
  );

  const handlePdfFrameClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(
          "button, input, a, [role='button'], .reader-pdf-text-layer, .reader-transition-layer",
        ) !== null ||
        window.getSelection()?.toString().trim()
      ) {
        return;
      }
      const frameRect = event.currentTarget.getBoundingClientRect();
      const relativeX = event.clientX - frameRect.left;
      if (relativeX <= frameRect.width * 0.2) {
        requestPdfPageMove("previous");
      } else if (relativeX >= frameRect.width * 0.8) {
        requestPdfPageMove("next");
      }
    },
    [requestPdfPageMove],
  );

  useEffect(() => {
    onNavigationActionsChange({
      next: handleNext,
      previous: handlePrevious,
    });

    return () => {
      onNavigationActionsChange(null);
    };
  }, [handleNext, handlePrevious, onNavigationActionsChange]);

  const handleViewModeChange = useCallback(
    (mode: PdfPaginatedViewMode) => {
      requestedViewModeRef.current = mode;
      onPaginatedViewModeChange(mode);
      runPdfAction((adapter) =>
        adapter.setViewMode(mode, frameRef.current?.clientWidth),
      );
    },
    [onPaginatedViewModeChange, runPdfAction],
  );

  const handleZoomOut = useCallback(() => {
    runPdfAction((adapter) => adapter.setZoom((positionRef.current?.scale ?? 1) - 0.1));
  }, [runPdfAction]);

  const handleZoomIn = useCallback(() => {
    runPdfAction((adapter) => adapter.setZoom((positionRef.current?.scale ?? 1) + 0.1));
  }, [runPdfAction]);

  const handleFitWidth = useCallback(() => {
    runPdfAction((adapter) =>
      adapter.fitWidth(getPdfPageSlotWidth(frameRef.current, positionRef.current)),
    );
  }, [runPdfAction]);

  const commitPageInput = useCallback(() => {
    const page = Number.parseInt(pageInput, 10);

    if (!Number.isFinite(page)) {
      setPageInput(String(positionRef.current?.page ?? 1));
      return;
    }

    void goToPdfLocator({
      kind: "pdf",
      page,
      scale: positionRef.current?.scale,
      zoomMode: positionRef.current?.zoomMode,
    });
  }, [goToPdfLocator, pageInput]);

  const handlePageInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        commitPageInput();
      }
    },
    [commitPageInput],
  );

  const handleProgressPreview = useCallback(
    (value: string) => {
      const adapter = adapterRef.current;

      if (adapter === null) {
        return;
      }

      try {
        const nextPreview = adapter.previewProgress(Number(value) / 1000);
        previewPositionRef.current = nextPreview;
        setPreviewPosition(nextPreview);
        setPageInput(String(nextPreview.page));
        onActiveTocItemChange(
          findTocItemIdByPdfPage(tocItemsRef.current, nextPreview.page),
        );
      } catch {
        setPreviewPosition(null);
      }
    },
    [onActiveTocItemChange],
  );

  const handleProgressChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      isDraggingProgressRef.current = true;
      setIsDraggingProgress(true);
      handleProgressPreview(event.currentTarget.value);
    },
    [handleProgressPreview],
  );

  const commitProgress = useCallback(() => {
    const adapter = adapterRef.current;
    const nextProgression =
      previewPositionRef.current?.progression ?? positionRef.current?.progression ?? 0;

    isDraggingProgressRef.current = false;
    setIsDraggingProgress(false);

    if (adapter === null) {
      setPreviewPosition(null);
      return;
    }

    try {
      const target = adapter.previewProgress(nextProgression);
      void goToPdfLocator(target.locator);
    } catch (progressError) {
      setPreviewPosition(null);
      setError(getErrorMessage(progressError));
    }
  }, [goToPdfLocator]);

  const activeProgress = previewPosition ?? position;
  const pageLabel =
    activeProgress === null ? "Pages loading" : getPdfPageLabel(activeProgress);
  const zoomLabel = position === null ? "100%" : `${Math.round(position.scale * 100)}%`;
  const progressLabel =
    activeProgress === null
      ? "0%"
      : `${Math.round(Math.min(Math.max(activeProgress.progression, 0), 1) * 100)}%`;
  const activeSectionTitle =
    activeProgress === null
      ? book.title
      : (findTocItemByPdfPage(tocItems, activeProgress.page)?.title ?? book.title);
  const sliderValue = Math.round((activeProgress?.progression ?? 0) * 1000);
  const progressControlStyle = {
    "--epub-progress-percent": `${(activeProgress?.progression ?? 0) * 100}%`,
  } as CSSProperties;
  const renderedModeDescription =
    viewMode === "double" && position?.renderedMode === "single"
      ? "Double view will resume when the window is wide enough."
      : undefined;

  return (
    <section
      className="reader-viewport reader-viewport--pdf"
      aria-label={`${book.title} content`}
      data-page-curl-blocked={isPageCurlBlocked ? "true" : "false"}
      data-page-transition={transition}
    >
      <article className="reader-page reader-page--pdf">
        <div
          ref={frameRef}
          className="reader-pdf-frame"
          aria-label="PDF pages"
          onClick={handlePdfFrameClick}
          onKeyDown={handlePdfFrameKeyDown}
          tabIndex={0}
        >
          {isLoading ? (
            <section
              className="reader-state reader-state--overlay"
              role="status"
              aria-live="polite"
              aria-label="Loading PDF book"
            >
              <div className="loading-line" aria-hidden="true" />
              <p>Opening PDF book...</p>
            </section>
          ) : null}
          {error !== null ? (
            <section
              className="reader-state reader-state--error reader-state--overlay"
              role="alert"
            >
              <h2>Book could not be opened</h2>
              <p>{error}</p>
              <div className="reader-state__actions">
                <button
                  type="button"
                  className="reader-tool-button"
                  onClick={() => setRetryVersion((version) => version + 1)}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="reader-tool-button"
                  onClick={onBackToLibrary}
                >
                  Back to shelf
                </button>
              </div>
            </section>
          ) : null}
          {position?.renderedMode === "continuous" && pdfAdapter !== null ? (
            <PdfContinuousView
              adapter={pdfAdapter}
              annotations={annotations}
              availableWidth={frameWidth}
              frameRef={frameRef}
              navigationVersion={pdfNavigationVersion}
              onAnnotationActivate={(annotation, element) =>
                onAnnotationActivate(annotation, getElementMenuAnchor(element))
              }
              onSelectionEnd={capturePdfSelection}
              position={position}
              renderVersion={pdfRenderVersion}
            />
          ) : position !== null && pdfAdapter !== null ? (
            <PdfPaginatedView
              adapter={pdfAdapter}
              annotations={annotations}
              availableWidth={frameWidth}
              isTransitioning={isPdfTransitioning}
              onAnnotationActivate={(annotation, element) =>
                onAnnotationActivate(annotation, getElementMenuAnchor(element))
              }
              onSelectionEnd={capturePdfSelection}
              position={position}
              renderVersion={pdfRenderVersion}
            />
          ) : null}
        </div>
        <div
          className="reader-epub-controls reader-pdf-controls"
          aria-label="PDF navigation"
        >
          <div className="reader-epub-control-row reader-pdf-control-row">
            <button
              type="button"
              className="reader-tool-button"
              onClick={handlePrevious}
            >
              Previous
            </button>
            <div className="reader-epub-status reader-pdf-status" aria-live="polite">
              <span>{activeSectionTitle}</span>
              <strong>{pageLabel}</strong>
              <span>{progressLabel}</span>
            </div>
            <button type="button" className="reader-tool-button" onClick={handleNext}>
              Next
            </button>
            <div
              className="reader-epub-mode-toggle reader-pdf-mode-toggle"
              role="group"
              aria-label="PDF page view"
              title={renderedModeDescription}
            >
              <button
                type="button"
                aria-pressed={
                  viewMode !== "continuous" && paginatedViewMode === "single"
                }
                onClick={() => handleViewModeChange("single")}
              >
                Single
              </button>
              <button
                type="button"
                aria-pressed={
                  viewMode !== "continuous" && paginatedViewMode === "double"
                }
                onClick={() => handleViewModeChange("double")}
              >
                Double
              </button>
            </div>
          </div>
          <div className="reader-pdf-control-row reader-pdf-control-row--secondary">
            <div className="reader-pdf-zoom-group" role="group" aria-label="PDF zoom">
              <button
                type="button"
                className="reader-tool-button"
                onClick={handleZoomOut}
              >
                -
              </button>
              <strong>{zoomLabel}</strong>
              <button
                type="button"
                className="reader-tool-button"
                onClick={handleZoomIn}
              >
                +
              </button>
              <button
                type="button"
                className="reader-tool-button"
                onClick={handleFitWidth}
              >
                Fit width
              </button>
            </div>
          </div>
          <div
            className="reader-epub-progress reader-pdf-progress"
            style={progressControlStyle}
          >
            <div className="reader-epub-progress__meta">
              <span>{activeSectionTitle}</span>
              <label className="reader-page-field reader-pdf-page-field">
                <span>Page</span>
                <input
                  aria-label="PDF page number"
                  min={1}
                  max={activeProgress?.totalPages ?? 1}
                  type="number"
                  value={pageInput}
                  onBlur={commitPageInput}
                  onChange={(event) => setPageInput(event.currentTarget.value)}
                  onKeyDown={handlePageInputKeyDown}
                />
                <span>/ {activeProgress?.totalPages ?? "-"}</span>
              </label>
            </div>
            <div className="reader-epub-progress__track">
              {activeProgress !== null ? (
                <span
                  className={`reader-epub-progress__tooltip ${
                    isDraggingProgress ? "reader-epub-progress__tooltip--visible" : ""
                  }`}
                  aria-hidden="true"
                >
                  Page {activeProgress.page}
                </span>
              ) : null}
              <input
                aria-label="PDF reading progress"
                className="reader-epub-progress__range"
                disabled={position === null}
                max={1000}
                min={0}
                step={1}
                type="range"
                value={sliderValue}
                onChange={handleProgressChange}
                onKeyUp={commitProgress}
                onPointerDown={() => {
                  isDraggingProgressRef.current = true;
                  setIsDraggingProgress(true);
                }}
                onPointerUp={commitProgress}
              />
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

export interface ReaderMetaProps {
  document: TxtDocument;
}

export function ReaderMeta({ document }: ReaderMetaProps) {
  return (
    <dl className="reader-meta" aria-label="TXT document details">
      <div>
        <dt>Encoding</dt>
        <dd>{document.encoding}</dd>
      </div>
      <div>
        <dt>Chapters</dt>
        <dd>{document.chapters.length}</dd>
      </div>
      <div>
        <dt>Characters</dt>
        <dd>{document.charCount.toLocaleString()}</dd>
      </div>
    </dl>
  );
}

export function mapTxtChapterToTocItem(chapter: TxtChapter): TocItem {
  return {
    id: chapter.id,
    title: chapter.title,
    locator: {
      kind: "txt",
      chapterId: chapter.id,
      charOffset: chapter.startChar,
    },
  };
}

export function formatSidebarTab(tab: ReaderSidebarTab): string {
  switch (tab) {
    case "contents":
      return "Contents";
    case "bookmarks":
      return "Bookmarks";
    case "notes":
      return "Notes";
    case "search":
      return "Search";
  }
}

export function getBookmarkLabel(
  book: Book,
  tocItems: TocItem[],
  activeTocItemId: string | null,
  locator: Locator,
): string {
  if (activeTocItemId !== null) {
    const activeTocItem = findTocItemById(tocItems, activeTocItemId);

    if (activeTocItem !== null) {
      return activeTocItem.title;
    }
  }

  if (locator.kind === "txt" && locator.chapterId !== undefined) {
    const tocItem = findTocItemById(tocItems, locator.chapterId);

    if (tocItem !== null) {
      return tocItem.title;
    }
  }

  if (locator.kind === "pdf") {
    return `Page ${locator.page}`;
  }

  return book.title;
}

export function searchTxtDocument(
  document: TxtDocument,
  query: string,
): Array<SearchHit<TxtLocator>> {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return [];
  }

  const hits: Array<SearchHit<TxtLocator>> = [];

  for (const chapter of document.chapters) {
    const normalizedText = chapter.text.toLocaleLowerCase();
    let matchIndex = normalizedText.indexOf(normalizedQuery);

    while (matchIndex !== -1 && hits.length < 100) {
      const charOffset = chapter.startChar + matchIndex;
      const selectedText = chapter.text.slice(matchIndex, matchIndex + query.length);

      hits.push({
        id: `txt-search-${chapter.id}-${matchIndex}`,
        locator: {
          kind: "txt",
          chapterId: chapter.id,
          charOffset,
          endCharOffset: charOffset + query.length,
          selectedText,
          contextBefore: chapter.text.slice(Math.max(0, matchIndex - 80), matchIndex),
          contextAfter: chapter.text.slice(
            matchIndex + query.length,
            matchIndex + query.length + 80,
          ),
        },
        excerpt: buildSearchExcerpt(chapter.text, matchIndex, query.length),
      });

      matchIndex = normalizedText.indexOf(
        normalizedQuery,
        matchIndex + Math.max(1, normalizedQuery.length),
      );
    }

    if (hits.length >= 100) {
      break;
    }
  }

  return hits;
}

export function buildSearchExcerpt(
  text: string,
  matchIndex: number,
  queryLength: number,
): string {
  const excerptStart = Math.max(0, matchIndex - 28);
  const excerptEnd = Math.min(text.length, matchIndex + queryLength + 48);
  const prefix = excerptStart > 0 ? "..." : "";
  const suffix = excerptEnd < text.length ? "..." : "";

  return `${prefix}${text.slice(excerptStart, excerptEnd).trim()}${suffix}`;
}

export function renderAnnotatedText(
  block: ReaderVirtualBlock,
  annotations: Annotation[],
  onAnnotationActivate: (annotation: Annotation, anchor: ReaderMenuAnchor) => void,
): ReactNode {
  const ranges = getTxtAnnotationSegments(block, annotations);

  if (ranges.length === 0) {
    return block.text;
  }

  const fragments: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    const start = Math.max(cursor, range.start);
    const end = Math.max(start, range.end);

    if (start > cursor) {
      fragments.push(block.text.slice(cursor, start));
    }

    if (end > start) {
      const TagName = range.hasHighlight ? "mark" : "span";
      const interactiveAnnotation = range.noteAnnotations[0];
      const className = [
        interactiveAnnotation === undefined ? "" : "reader-annotation-target",
        range.hasHighlight ? "reader-highlight" : "",
        range.hasNote ? "reader-note-target" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const commonProps = {
        className,
        style: { "--reader-highlight-color": range.color } as CSSProperties,
      };

      if (interactiveAnnotation === undefined) {
        fragments.push(
          <TagName key={`${range.id}-${index}`} {...commonProps}>
            {block.text.slice(start, end)}
          </TagName>,
        );
        cursor = Math.max(cursor, end);
        return;
      }

      fragments.push(
        <TagName
          key={`${range.id}-${index}`}
          {...commonProps}
          role="button"
          tabIndex={0}
          aria-label={`Edit note for ${
            interactiveAnnotation.selectedText ??
            interactiveAnnotation.locator.selectedText ??
            getLocatorLabel(interactiveAnnotation.locator)
          }`}
          onClick={(event) => {
            onAnnotationActivate(
              interactiveAnnotation,
              getElementMenuAnchor(event.currentTarget),
            );
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            onAnnotationActivate(
              interactiveAnnotation,
              getElementMenuAnchor(event.currentTarget),
            );
          }}
        >
          {block.text.slice(start, end)}
        </TagName>,
      );
    }

    cursor = Math.max(cursor, end);
  });

  if (cursor < block.text.length) {
    fragments.push(block.text.slice(cursor));
  }

  return fragments;
}

export function getTxtAnnotationSegments(
  block: ReaderVirtualBlock,
  annotations: Annotation[],
): Array<{
  color: string;
  hasHighlight: boolean;
  hasNote: boolean;
  id: string;
  noteAnnotations: Annotation[];
  start: number;
  end: number;
}> {
  const blockStart = block.charOffset;
  const blockEnd = block.charOffset + block.text.length;

  const coverages = annotations.filter(isVisibleAnnotation).flatMap((annotation) => {
    const locator = annotation.locator;

    if (locator.kind !== "txt" || locator.endCharOffset === undefined) {
      return [];
    }

    const highlightStart = Math.max(blockStart, locator.charOffset);
    const highlightEnd = Math.min(blockEnd, locator.endCharOffset);

    if (highlightEnd <= highlightStart) {
      return [];
    }

    return [
      {
        id: annotation.id,
        annotation,
        start: highlightStart - blockStart,
        end: highlightEnd - blockStart,
        color: annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
        hasHighlight: annotation.type === "highlight",
        hasNote: annotationHasNote(annotation),
      },
    ];
  });

  if (coverages.length === 0) {
    return [];
  }

  const boundaries = Array.from(
    new Set(coverages.flatMap((coverage) => [coverage.start, coverage.end])),
  ).sort((firstBoundary, secondBoundary) => firstBoundary - secondBoundary);
  const segments: Array<{
    color: string;
    hasHighlight: boolean;
    hasNote: boolean;
    id: string;
    noteAnnotations: Annotation[];
    start: number;
    end: number;
  }> = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];

    if (start === undefined || end === undefined || end <= start) {
      continue;
    }

    const coveringRanges = coverages.filter(
      (coverage) => coverage.start < end && coverage.end > start,
    );

    if (coveringRanges.length === 0) {
      continue;
    }

    const highlightRange = coveringRanges.find((coverage) => coverage.hasHighlight);
    const noteAnnotations = coveringRanges
      .filter((coverage) => coverage.hasNote)
      .map((coverage) => coverage.annotation)
      .filter(
        (annotation, annotationIndex, allAnnotations) =>
          allAnnotations.findIndex(
            (currentAnnotation) => currentAnnotation.id === annotation.id,
          ) === annotationIndex,
      );

    segments.push({
      color:
        highlightRange?.color ?? noteAnnotations[0]?.color ?? DEFAULT_HIGHLIGHT_COLOR,
      hasHighlight: highlightRange !== undefined,
      hasNote: noteAnnotations.length > 0,
      id: coveringRanges.map((coverage) => coverage.id).join("-"),
      noteAnnotations,
      start,
      end,
    });
  }

  return segments;
}

export function getEpubHighlightAnnotations(
  annotations: Annotation[],
): Array<Annotation & { locator: EpubLocator & { cfi: string } }> {
  return annotations.filter(
    (
      annotation,
    ): annotation is Annotation & { locator: EpubLocator & { cfi: string } } =>
      isActiveHighlightAnnotation(annotation) &&
      annotation.locator.kind === "epub" &&
      annotation.locator.cfi !== undefined &&
      annotation.locator.cfi.trim() !== "",
  );
}

export function getEpubUnderlineAnnotations(
  annotations: Annotation[],
): Array<Annotation & { locator: EpubLocator & { cfi: string } }> {
  return annotations.filter(
    (
      annotation,
    ): annotation is Annotation & { locator: EpubLocator & { cfi: string } } =>
      isVisibleAnnotation(annotation) &&
      annotationHasNote(annotation) &&
      annotation.locator.kind === "epub" &&
      annotation.locator.cfi !== undefined &&
      annotation.locator.cfi.trim() !== "",
  );
}

export function getPdfVisibleAnnotations(
  annotations: Annotation[],
  page: number,
): Array<Annotation & { locator: PdfLocator }> {
  return annotations.filter(
    (annotation): annotation is Annotation & { locator: PdfLocator } =>
      isVisibleAnnotation(annotation) &&
      annotation.locator.kind === "pdf" &&
      annotation.locator.page === page,
  );
}

export function isActiveHighlightAnnotation(annotation: Annotation): boolean {
  return annotation.type === "highlight" && annotation.deletedAt === undefined;
}

export function isVisibleAnnotation(annotation: Annotation): boolean {
  return (
    annotation.deletedAt === undefined &&
    (annotation.type === "highlight" || annotationHasNote(annotation))
  );
}

export function annotationHasNote(annotation: Annotation): boolean {
  return annotation.note !== undefined && annotation.note.trim() !== "";
}

export function findMatchingHighlightAnnotations(
  annotations: Annotation[],
  selection: ReaderSelectionSnapshot,
): Annotation[] {
  return annotations.filter(
    (annotation) =>
      isActiveHighlightAnnotation(annotation) &&
      locatorsMatchSelection(annotation.locator, selection),
  );
}

export function findMatchingNoteAnnotations(
  annotations: Annotation[],
  referenceAnnotation: Annotation,
): Annotation[] {
  return annotations.filter(
    (annotation) =>
      annotation.deletedAt === undefined &&
      annotationHasNote(annotation) &&
      locatorsMatchAnnotation(annotation, referenceAnnotation),
  );
}

export function locatorsMatchSelection(
  locator: Locator,
  selection: ReaderSelectionSnapshot,
): boolean {
  const selectionLocator = selection.locator;

  if (locator.kind !== selectionLocator.kind) {
    return false;
  }

  if (locator.kind === "txt" && selectionLocator.kind === "txt") {
    return txtLocatorsOverlap(locator, selectionLocator);
  }

  if (locator.kind === "epub" && selectionLocator.kind === "epub") {
    return epubLocatorsMatch(locator, selectionLocator, selection);
  }

  if (locator.kind === "pdf" && selectionLocator.kind === "pdf") {
    return pdfLocatorsOverlap(locator, selectionLocator);
  }

  return false;
}

export function locatorsMatchAnnotation(
  annotation: Annotation,
  referenceAnnotation: Annotation,
): boolean {
  const locator = annotation.locator;
  const referenceLocator = referenceAnnotation.locator;

  if (locator.kind !== referenceLocator.kind) {
    return false;
  }

  if (locator.kind === "txt" && referenceLocator.kind === "txt") {
    return txtLocatorsOverlap(locator, referenceLocator);
  }

  if (locator.kind === "epub" && referenceLocator.kind === "epub") {
    return epubLocatorsMatchAnnotation(annotation, referenceAnnotation);
  }

  if (locator.kind === "pdf" && referenceLocator.kind === "pdf") {
    return pdfLocatorsOverlap(locator, referenceLocator);
  }

  return false;
}

export function txtLocatorsOverlap(
  firstLocator: TxtLocator,
  secondLocator: TxtLocator,
): boolean {
  if (
    firstLocator.endCharOffset === undefined ||
    secondLocator.endCharOffset === undefined
  ) {
    return firstLocator.charOffset === secondLocator.charOffset;
  }

  return (
    Math.max(firstLocator.charOffset, secondLocator.charOffset) <
    Math.min(firstLocator.endCharOffset, secondLocator.endCharOffset)
  );
}

export function epubLocatorsMatch(
  locator: EpubLocator,
  selectionLocator: EpubLocator,
  selection: ReaderSelectionSnapshot,
): boolean {
  if (
    locator.cfi !== undefined &&
    selectionLocator.cfi !== undefined &&
    locator.cfi === selectionLocator.cfi
  ) {
    return true;
  }

  return (
    locator.href === selectionLocator.href &&
    normalizeComparableText(locator.selectedText) ===
      normalizeComparableText(selection.selectedText) &&
    normalizeComparableText(locator.contextBefore) ===
      normalizeComparableText(selection.contextBefore) &&
    normalizeComparableText(locator.contextAfter) ===
      normalizeComparableText(selection.contextAfter)
  );
}

export function epubLocatorsMatchAnnotation(
  annotation: Annotation,
  referenceAnnotation: Annotation,
): boolean {
  const locator = annotation.locator;
  const referenceLocator = referenceAnnotation.locator;

  if (locator.kind !== "epub" || referenceLocator.kind !== "epub") {
    return false;
  }

  if (
    locator.cfi !== undefined &&
    referenceLocator.cfi !== undefined &&
    locator.cfi === referenceLocator.cfi
  ) {
    return true;
  }

  return (
    locator.href === referenceLocator.href &&
    normalizeComparableText(annotation.selectedText ?? locator.selectedText) ===
      normalizeComparableText(
        referenceAnnotation.selectedText ?? referenceLocator.selectedText,
      ) &&
    normalizeComparableText(locator.contextBefore) ===
      normalizeComparableText(referenceLocator.contextBefore) &&
    normalizeComparableText(locator.contextAfter) ===
      normalizeComparableText(referenceLocator.contextAfter)
  );
}

export function pdfLocatorsOverlap(
  firstLocator: PdfLocator,
  secondLocator: PdfLocator,
): boolean {
  if (firstLocator.page !== secondLocator.page) {
    return false;
  }

  const firstRects = firstLocator.rects ?? [];
  const secondRects = secondLocator.rects ?? [];

  return firstRects.some((firstRect) =>
    secondRects.some((secondRect) =>
      rectsOverlap(
        firstRect.x,
        firstRect.y,
        firstRect.width,
        firstRect.height,
        secondRect.x,
        secondRect.y,
        secondRect.width,
        secondRect.height,
      ),
    ),
  );
}

export function rectsOverlap(
  firstX: number,
  firstY: number,
  firstWidth: number,
  firstHeight: number,
  secondX: number,
  secondY: number,
  secondWidth: number,
  secondHeight: number,
): boolean {
  return (
    Math.max(firstX, secondX) < Math.min(firstX + firstWidth, secondX + secondWidth) &&
    Math.max(firstY, secondY) < Math.min(firstY + firstHeight, secondY + secondHeight)
  );
}

export function normalizeComparableText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function mergeUpdatedAnnotations(
  currentAnnotations: Annotation[],
  updatedAnnotations: Annotation[],
): Annotation[] {
  const updatedById = new Map(
    updatedAnnotations.map((annotation) => [annotation.id, annotation]),
  );

  return currentAnnotations.map(
    (annotation) => updatedById.get(annotation.id) ?? annotation,
  );
}

export function getEpubAnnotationSignature(annotation: Annotation): string {
  return [
    annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
    annotation.note ?? "",
    annotation.updatedAt,
    annotation.type,
  ].join("|");
}

export function getSelectionMenuAnchor(
  rect: Pick<DOMRect, "height" | "left" | "top" | "width"> | undefined,
): ReaderMenuAnchor {
  if (rect === undefined) {
    return {
      menuX: window.innerWidth / 2,
      menuY: 112,
    };
  }

  return {
    menuX: clampViewportCoordinate(rect.left + rect.width / 2, 24, 24),
    menuY: clampViewportCoordinate(rect.top, 72, 24, "height"),
  };
}

export function getNoteEditorAnchor(anchor: ReaderMenuAnchor): ReaderMenuAnchor {
  const noteEditorWidth = Math.min(340, Math.max(0, window.innerWidth - 28));
  const horizontalPadding = 14;
  const halfWidth = noteEditorWidth / 2;

  return {
    menuX: clampViewportCoordinate(
      anchor.menuX,
      horizontalPadding + halfWidth,
      horizontalPadding + halfWidth,
    ),
    menuY: anchor.menuY,
  };
}

export function getElementMenuAnchor(element: Element): ReaderMenuAnchor {
  return getSelectionMenuAnchor(element.getBoundingClientRect());
}

export function getEventMenuAnchor(event: globalThis.MouseEvent): ReaderMenuAnchor {
  const target =
    event.currentTarget instanceof Element
      ? event.currentTarget
      : event.target instanceof Element
        ? event.target
        : null;

  if (target !== null) {
    return getElementMenuAnchor(target);
  }

  return getSelectionMenuAnchor({
    height: 0,
    left: event.clientX,
    top: event.clientY,
    width: 0,
  });
}

export function clampViewportCoordinate(
  value: number,
  min: number,
  trailingPadding: number,
  axis: "width" | "height" = "width",
): number {
  const viewportSize = axis === "width" ? window.innerWidth : window.innerHeight;

  return Math.min(Math.max(value, min), Math.max(min, viewportSize - trailingPadding));
}

export function captureTxtSelection(): ReaderSelectionSnapshot | null {
  const selection = window.getSelection();

  if (selection === null || selection.rangeCount === 0) {
    return null;
  }

  const selectedText = selection.toString().trim();

  if (selectedText === "") {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rowSegments = getTxtSelectionRowSegments(range);

  if (rowSegments.length === 0) {
    return null;
  }

  const firstSegment = rowSegments[0];
  const lastSegment = rowSegments[rowSegments.length - 1];
  const charOffset = firstSegment.blockCharOffset + firstSegment.start;
  const endCharOffset = lastSegment.blockCharOffset + lastSegment.end;

  if (endCharOffset <= charOffset) {
    return null;
  }

  const rect =
    typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : firstSegment.row.getBoundingClientRect();

  return {
    locator: {
      kind: "txt",
      chapterId: firstSegment.chapterId,
      charOffset,
      endCharOffset,
      selectedText,
      contextBefore: firstSegment.blockText.slice(
        Math.max(0, firstSegment.start - 80),
        firstSegment.start,
      ),
      contextAfter: lastSegment.blockText.slice(lastSegment.end, lastSegment.end + 80),
    },
    selectedText,
    contextBefore: firstSegment.blockText.slice(
      Math.max(0, firstSegment.start - 80),
      firstSegment.start,
    ),
    contextAfter: lastSegment.blockText.slice(lastSegment.end, lastSegment.end + 80),
    ...getSelectionMenuAnchor(rect),
  };
}

export function getTxtSelectionRowSegments(range: Range): Array<{
  blockCharOffset: number;
  blockText: string;
  chapterId?: string;
  end: number;
  row: HTMLElement;
  start: number;
}> {
  const ancestor =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  const viewport = ancestor?.closest(".reader-viewport") ?? document;
  const rows = Array.from(
    viewport.querySelectorAll<HTMLElement>(".reader-virtual-row"),
  );
  const segments: Array<{
    blockCharOffset: number;
    blockText: string;
    chapterId?: string;
    end: number;
    row: HTMLElement;
    start: number;
  }> = [];

  for (const row of rows) {
    if (!range.intersectsNode(row)) {
      continue;
    }

    const segment = getTxtSelectionRowSegment(range, row);

    if (segment !== null) {
      segments.push(segment);
    }
  }

  return segments;
}

export function getTxtSelectionRowSegment(
  selectionRange: Range,
  row: HTMLElement,
): {
  blockCharOffset: number;
  blockText: string;
  chapterId?: string;
  end: number;
  row: HTMLElement;
  start: number;
} | null {
  const blockText = row.dataset.readerBlockText ?? "";
  const blockCharOffset = Number.parseInt(row.dataset.charOffset ?? "0", 10);

  if (!Number.isFinite(blockCharOffset)) {
    return null;
  }

  const rowRange = document.createRange();
  rowRange.selectNodeContents(row);

  const intersectionRange = selectionRange.cloneRange();

  if (selectionRange.compareBoundaryPoints(Range.START_TO_START, rowRange) < 0) {
    intersectionRange.setStart(rowRange.startContainer, rowRange.startOffset);
  }

  if (selectionRange.compareBoundaryPoints(Range.END_TO_END, rowRange) > 0) {
    intersectionRange.setEnd(rowRange.endContainer, rowRange.endOffset);
  }

  const selectedRowText = intersectionRange.toString();

  if (selectedRowText.length === 0) {
    return null;
  }

  const beforeRange = document.createRange();
  beforeRange.setStart(row, 0);
  beforeRange.setEnd(intersectionRange.startContainer, intersectionRange.startOffset);
  const start = Math.min(blockText.length, beforeRange.toString().length);
  const end = Math.min(blockText.length, start + selectedRowText.length);

  if (end <= start) {
    return null;
  }

  return {
    blockCharOffset,
    blockText,
    chapterId: row.dataset.chapterId,
    end,
    row,
    start,
  };
}

export function getPdfTextLayer(node: Node): HTMLElement | null {
  const element =
    node instanceof Element
      ? node
      : node.parentNode instanceof Element
        ? node.parentNode
        : null;
  return element?.closest<HTMLElement>(".reader-pdf-text-layer") ?? null;
}

export function flattenTocItems(
  items: TocItem[],
  depth = 0,
): Array<TocItem & { depth: number }> {
  return items.flatMap((item) => [
    {
      ...item,
      depth,
    },
    ...flattenTocItems(item.children ?? [], depth + 1),
  ]);
}

export function findTocItemById(items: TocItem[], itemId: string): TocItem | null {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }

    const childItem = findTocItemById(item.children ?? [], itemId);

    if (childItem !== null) {
      return childItem;
    }
  }

  return null;
}

export function findTocItemIdByHref(items: TocItem[], href: string): string | null {
  return findTocItemByHref(items, href)?.id ?? null;
}

export function findTocItemByHref(items: TocItem[], href: string): TocItem | null {
  for (const item of items) {
    if (item.href !== undefined && epubHrefsMatch(item.href, href)) {
      return item;
    }

    const childItem = findTocItemByHref(item.children ?? [], href);

    if (childItem !== null) {
      return childItem;
    }
  }

  return null;
}

export function findTocItemIdByPdfPage(items: TocItem[], page: number): string | null {
  return findTocItemByPdfPage(items, page)?.id ?? null;
}

export function findTocItemByPdfPage(items: TocItem[], page: number): TocItem | null {
  let closestItem: TocItem | null = null;
  let closestPage = 0;

  for (const item of flattenTocItems(items)) {
    const locator = item.locator;

    if (locator?.kind !== "pdf") {
      continue;
    }

    if (locator.page === page) {
      return item;
    }

    if (locator.page < page && locator.page > closestPage) {
      closestItem = item;
      closestPage = locator.page;
    }
  }

  return closestItem;
}

export function epubHrefsMatch(firstHref: string, secondHref: string): boolean {
  const first = normalizeEpubHref(firstHref);
  const second = normalizeEpubHref(secondHref);

  if (first.length === 0 || second.length === 0) {
    return false;
  }

  return (
    first === second || first.endsWith(`/${second}`) || second.endsWith(`/${first}`)
  );
}

export function normalizeEpubHref(href: string): string {
  return (href.split("#")[0] ?? href).replaceAll("\\", "/").replace(/^\/+/, "");
}

export function getPdfVisiblePageNumbers(position: PdfPosition): number[] {
  if (position.renderedMode !== "double") {
    return [position.page];
  }

  if (position.page === 1) {
    return [1];
  }

  return [position.page, position.page + 1].filter(
    (page) => page <= position.totalPages,
  );
}

export function getPdfPageLabel(position: PdfPosition): string {
  const visiblePages = getPdfVisiblePageNumbers(position);

  if (visiblePages.length === 2) {
    return `Pages ${visiblePages[0]}-${visiblePages[1]} / ${position.totalPages}`;
  }

  return `Page ${position.page} / ${position.totalPages}`;
}

export function normalizeReaderPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.floor(totalPages)));
}

export function pageToProgression(page: number, totalPages: number): number {
  const normalizedTotalPages = Math.max(1, Math.floor(totalPages));

  if (normalizedTotalPages <= 1) {
    return 0;
  }

  return (
    (normalizeReaderPage(page, normalizedTotalPages) - 1) / (normalizedTotalPages - 1)
  );
}

export function getPdfPageSlotWidth(
  frame: HTMLDivElement | null,
  position: PdfPosition | null,
): number {
  const frameWidth = frame?.clientWidth ?? 760;
  const renderedPages = position?.renderedMode === "double" ? 2 : 1;
  const totalGap = renderedPages === 2 ? 18 : 0;
  const horizontalPadding = 32;

  return Math.max(260, (frameWidth - horizontalPadding - totalGap) / renderedPages);
}

async function scrollPdfRectIntoView(
  frame: HTMLDivElement | null,
  adapter: PdfReaderAdapter,
  locator: PdfLocator,
  position: PdfPosition | null,
): Promise<void> {
  if (
    frame === null ||
    position === null ||
    locator.rects === undefined ||
    locator.rects.length === 0
  ) {
    return;
  }

  const pageElement = await waitForPdfPageElement(frame, locator.page);
  if (pageElement === null) {
    return;
  }

  const metrics = await adapter.getPageMetrics(locator.page);
  const scale =
    position.renderedMode === "continuous" && position.zoomMode === "fit-width"
      ? Math.max(0.1, Math.max(240, frame.clientWidth - 28) / metrics.width)
      : position.scale;
  const [firstRect] = await adapter.pdfRectsToViewportRects(
    locator.page,
    [locator.rects[0]],
    scale,
  );
  if (firstRect === undefined) {
    return;
  }

  const frameRect = frame.getBoundingClientRect();
  const pageRect = pageElement.getBoundingClientRect();
  const readableInset = Math.min(96, Math.max(32, frame.clientHeight * 0.14));
  frame.scrollTo({
    behavior: "auto",
    left: Math.max(0, frame.scrollLeft + pageRect.left - frameRect.left - 14),
    top: Math.max(
      0,
      frame.scrollTop + pageRect.top - frameRect.top + firstRect.y - readableInset,
    ),
  });
}

async function waitForPdfPageElement(
  frame: HTMLDivElement,
  pageNumber: number,
): Promise<HTMLElement | null> {
  const selector =
    `.reader-pdf-page-surface[data-page-number="${pageNumber}"], ` +
    `.reader-pdf-canvas[data-page-number="${pageNumber}"]`;

  for (let frameIndex = 0; frameIndex < 18; frameIndex += 1) {
    const element = frame.querySelector<HTMLElement>(selector);
    if (element !== null) {
      return element;
    }
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  return null;
}

export function splitChapterParagraphs(chapter: TxtChapter): ReaderParagraph[] {
  const paragraphs: ReaderParagraph[] = [];
  let localCharOffset = 0;
  const lines = chapter.text.split("\n");

  for (const [lineIndex, line] of lines.entries()) {
    const paragraph = line.trim();
    const leadingWhitespace = line.length - line.trimStart().length;

    if (paragraph !== chapter.title) {
      paragraphs.push({
        text: paragraph,
        charOffset: chapter.startChar + localCharOffset + leadingWhitespace,
      });
    }

    localCharOffset += line.length + (lineIndex < lines.length - 1 ? 1 : 0);
  }

  return paragraphs;
}

export function flattenReaderBlocks(blocks: ReaderBlock[]): ReaderVirtualBlock[] {
  return blocks.flatMap((block) => [
    {
      id: `heading-${block.chapter.id}`,
      kind: "heading" as const,
      chapterId: block.chapter.id,
      chapterTitle: block.chapter.title,
      charOffset: block.chapter.startChar,
      text: block.chapter.title,
    },
    ...block.paragraphs.map((paragraph, paragraphIndex) => ({
      id: `paragraph-${block.chapter.id}-${paragraphIndex}`,
      kind: "paragraph" as const,
      chapterId: block.chapter.id,
      chapterTitle: block.chapter.title,
      charOffset: paragraph.charOffset,
      text: paragraph.text,
    })),
  ]);
}

export function buildVirtualBlockIndex(
  blocks: ReaderVirtualBlock[],
): ReaderVirtualIndex {
  const chapterHeadingIndexById = new Map<string, number>();
  const charOffsetEntriesByChapterId = new Map<string, ReaderVirtualIndexEntry[]>();
  const charOffsetEntries: ReaderVirtualIndexEntry[] = [];

  for (const [index, block] of blocks.entries()) {
    if (block.kind === "heading") {
      chapterHeadingIndexById.set(block.chapterId, index);
    }

    charOffsetEntries.push({
      charOffset: block.charOffset,
      chapterId: block.chapterId,
      index,
    });
    const chapterEntries = charOffsetEntriesByChapterId.get(block.chapterId) ?? [];
    chapterEntries.push(charOffsetEntries[charOffsetEntries.length - 1]);
    charOffsetEntriesByChapterId.set(block.chapterId, chapterEntries);
  }

  return {
    chapterHeadingIndexById,
    charOffsetEntriesByChapterId,
    charOffsetEntries,
  };
}

export function findProgressTargetIndex(
  index: ReaderVirtualIndex,
  locator: TxtLocator,
): number {
  let targetIndex = findIndexAtOrBeforeCharOffset(
    index.charOffsetEntries,
    locator.charOffset,
  );

  if (locator.chapterId !== undefined) {
    const chapterEntries =
      index.charOffsetEntriesByChapterId.get(locator.chapterId) ?? [];
    const sameChapterIndex = findIndexAtOrBeforeCharOffset(
      chapterEntries,
      locator.charOffset,
    );

    if (sameChapterIndex !== -1) {
      return sameChapterIndex;
    }

    const chapterHeadingIndex = index.chapterHeadingIndexById.get(locator.chapterId);

    if (chapterHeadingIndex !== undefined) {
      targetIndex = chapterHeadingIndex;
    }
  }

  return targetIndex;
}

export function findIndexAtOrBeforeCharOffset(
  entries: ReaderVirtualIndexEntry[],
  charOffset: number,
): number {
  if (entries.length === 0) {
    return -1;
  }

  let low = 0;
  let high = entries.length - 1;
  let targetIndex = entries[0].index;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const entry = entries[middle];

    if (entry.charOffset <= charOffset) {
      targetIndex = entry.index;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return targetIndex;
}

export function buildEstimatedVirtualItems(
  blocks: ReaderVirtualBlock[],
): RenderedVirtualItem[] {
  const visibleCount = Math.min(blocks.length, 24);
  const items: RenderedVirtualItem[] = [];
  let offset = 0;

  for (let index = 0; index < visibleCount; index += 1) {
    items.push({
      index,
      start: offset,
    });
    offset += estimateVirtualBlockSize(blocks[index]);
  }

  return items;
}

export function findEstimatedIndexAtOffset(
  blocks: ReaderVirtualBlock[],
  targetOffset: number,
): number {
  let estimatedOffset = 0;

  for (const [index, block] of blocks.entries()) {
    if (estimatedOffset > targetOffset) {
      return Math.max(0, index - 1);
    }

    estimatedOffset += estimateVirtualBlockSize(block);
  }

  return Math.max(0, blocks.length - 1);
}

export function estimateTotalSize(blocks: ReaderVirtualBlock[]): number {
  return blocks.reduce(
    (totalSize, block) => totalSize + estimateVirtualBlockSize(block),
    0,
  );
}

export function estimateVirtualBlockSize(
  block: ReaderVirtualBlock | undefined,
): number {
  if (block === undefined) {
    return 68;
  }

  if (block.kind === "heading") {
    return 96;
  }

  return Math.max(68, Math.ceil(block.text.length / 34) * 34);
}

export function formatBookFormat(format: Book["format"]): string {
  return format.toUpperCase();
}

export function focusElementSoon<TElement extends HTMLElement>(
  ref: RefObject<TElement | null>,
): void {
  if (pendingFocusTimerId !== null) {
    window.clearTimeout(pendingFocusTimerId);
  }

  const tryFocus = (remainingAttempts: number) => {
    pendingFocusTimerId = window.setTimeout(() => {
      const element = ref.current;

      if (element !== null) {
        pendingFocusTimerId = null;
        element.focus();
        return;
      }

      if (remainingAttempts > 0) {
        tryFocus(remainingAttempts - 1);
      } else {
        pendingFocusTimerId = null;
      }
    }, 0);
  };

  tryFocus(2);
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") {
    return false;
  }

  const element = target as {
    closest?: (selector: string) => Element | null;
    isContentEditable?: boolean;
    tagName?: string;
  };
  const tagName = element.tagName?.toLocaleLowerCase();

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    tagName === "a" ||
    element.isContentEditable === true
  ) {
    return true;
  }

  return typeof element.closest === "function"
    ? element.closest("[contenteditable='true']") !== null
    : false;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unexpected error occurred.";
}

export function parseCachedToc(serializedToc: string | null): TocItem[] | null {
  if (serializedToc === null) {
    return null;
  }

  try {
    const value = JSON.parse(serializedToc) as unknown;
    return Array.isArray(value) && value.every(isCachedTocItem) ? value : null;
  } catch {
    return null;
  }
}

export function isCachedTocItem(value: unknown): value is TocItem {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<TocItem>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    (item.href === undefined || typeof item.href === "string") &&
    (item.children === undefined ||
      (Array.isArray(item.children) && item.children.every(isCachedTocItem)))
  );
}

export const MemoizedTxtReaderContent = memo(TxtReaderContent);
export const MemoizedEpubReaderContent = memo(EpubReaderContent);
export const MemoizedPdfReaderContent = memo(PdfReaderContent);
