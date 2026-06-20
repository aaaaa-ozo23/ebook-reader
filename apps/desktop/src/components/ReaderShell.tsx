import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import {
  defaultReaderTheme,
  type Book,
  type EpubLocator,
  type ReaderProgress,
  type ReaderTheme,
  type ReaderThemeMode,
  type TocItem,
  type TxtChapter,
  type TxtDocument,
  type TxtLocator,
} from "@reader/core";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  getEpubBookSource,
  getReaderTheme,
  getReadingProgress,
  openTxtBook,
  saveReaderTheme,
  saveReadingProgress,
} from "../tauri/reader";
import { EpubReaderAdapter } from "../epub/EpubReaderAdapter";

const THEME_PRESETS: Record<
  ReaderThemeMode,
  Pick<ReaderTheme, "backgroundColor" | "textColor">
> = {
  light: {
    backgroundColor: "#fbfaf7",
    textColor: "#20262c",
  },
  sepia: {
    backgroundColor: "#f7f1e3",
    textColor: "#25211d",
  },
  green: {
    backgroundColor: "#eef4e8",
    textColor: "#1f3329",
  },
  dark: {
    backgroundColor: "#171a1d",
    textColor: "#f0e8d7",
  },
};

const FONT_OPTIONS = [
  {
    label: "Serif",
    value: '"Noto Serif SC", "Songti SC", "Microsoft YaHei", Georgia, serif',
  },
  {
    label: "Sans",
    value:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    label: "System",
    value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
];

function getReaderThemeTokens(theme: ReaderTheme): Record<string, string> {
  const isDark = theme.mode === "dark";

  return {
    "--txt-reader-heading": theme.textColor,
    "--txt-reader-muted": isDark ? "rgba(240, 232, 215, 0.72)" : "#5f6870",
    "--txt-reader-chrome-background": isDark
      ? "rgba(24, 28, 31, 0.96)"
      : "rgba(249, 246, 239, 0.96)",
    "--txt-reader-chrome-border": isDark ? "rgba(240, 232, 215, 0.16)" : "#d9cfbd",
    "--txt-reader-link": isDark ? "#f3bc55" : "#2f5d62",
    "--txt-reader-meta-background": isDark ? "rgba(240, 232, 215, 0.08)" : "rgba(255, 255, 255, 0.54)",
    "--txt-reader-meta-border": isDark ? "rgba(240, 232, 215, 0.18)" : "#d8cebc",
    "--txt-reader-panel-background": isDark ? "#222a2e" : "#fbfaf7",
    "--txt-reader-panel-text": isDark ? "#f7f2e8" : "#243038",
    "--txt-reader-control-background": isDark ? "#151a1d" : "#ffffff",
  };
}

interface ReaderShellProps {
  book: Book;
  onBackToLibrary: () => void;
}

interface ReaderBlock {
  chapter: TxtChapter;
  paragraphs: ReaderParagraph[];
}

interface ReaderParagraph {
  text: string;
  charOffset: number;
}

interface ReaderVirtualBlock {
  id: string;
  kind: "heading" | "paragraph";
  chapterId: string;
  chapterTitle: string;
  charOffset: number;
  text: string;
}

interface ChapterJumpRequest {
  chapterId: string;
  requestId: number;
}

interface EpubJumpRequest {
  locator: EpubLocator;
  requestId: number;
}

interface RenderedVirtualItem {
  index: number;
  start: number;
}

interface ReaderVirtualIndex {
  chapterHeadingIndexById: Map<string, number>;
  charOffsetEntriesByChapterId: Map<string, ReaderVirtualIndexEntry[]>;
  charOffsetEntries: ReaderVirtualIndexEntry[];
}

interface ReaderVirtualIndexEntry {
  charOffset: number;
  chapterId: string;
  index: number;
}

interface PendingTxtProgress {
  locator: TxtLocator;
  progress?: number;
}

interface PendingEpubProgress {
  locator: EpubLocator;
  progress?: number;
}

export function ReaderShell({ book, onBackToLibrary }: ReaderShellProps) {
  const [document, setDocument] = useState<TxtDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(book.format === "txt");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChromeHidden, setIsChromeHidden] = useState(false);
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>(defaultReaderTheme);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [readingProgress, setReadingProgress] =
    useState<ReaderProgress<TxtLocator> | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeTocItemId, setActiveTocItemId] = useState<string | null>(null);
  const [chapterJumpRequest, setChapterJumpRequest] = useState<ChapterJumpRequest | null>(null);
  const [epubJumpRequest, setEpubJumpRequest] = useState<EpubJumpRequest | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadTheme() {
      try {
        const savedTheme = await getReaderTheme();

        if (isCurrent) {
          setTheme(savedTheme);
        }
      } catch (themeLoadError) {
        if (isCurrent) {
          setThemeError(getErrorMessage(themeLoadError));
        }
      }
    }

    void loadTheme();

    return () => {
      isCurrent = false;
    };
  }, [book.id]);

  useEffect(() => {
    let isCurrent = true;

    if (book.format !== "txt") {
      return () => {
        isCurrent = false;
      };
    }

    async function loadTxtDocument() {
      setIsLoading(true);
      setError(null);
      setActiveTocItemId(null);
      setTocItems([]);

      try {
        const [openedDocument, savedProgress] = await Promise.all([
          openTxtBook(book.id),
          getReadingProgress<TxtLocator>(book.id),
        ]);

        if (isCurrent) {
          const nextTocItems = openedDocument.chapters.map(mapTxtChapterToTocItem);
          setDocument(openedDocument);
          setReadingProgress(savedProgress);
          setTocItems(nextTocItems);
          setActiveTocItemId(openedDocument.chapters[0]?.id ?? null);
        }
      } catch (openError) {
        if (isCurrent) {
          setError(getErrorMessage(openError));
          setActiveTocItemId(null);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadTxtDocument();

    return () => {
      isCurrent = false;
    };
  }, [book.format, book.id]);

  const blocks = useMemo(() => {
    if (document === null) {
      return [];
    }

    return document.chapters.map((chapter) => ({
      chapter,
      paragraphs: splitChapterParagraphs(chapter),
    }));
  }, [document]);

  const chapterById = useMemo(() => {
    const chapters = document?.chapters ?? [];
    return new Map(chapters.map((chapter) => [chapter.id, chapter]));
  }, [document]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((currentValue) => !currentValue);
  }, []);

  const toggleThemePanel = useCallback(() => {
    setIsThemePanelOpen((currentValue) => !currentValue);
  }, []);

  const enterFocusMode = useCallback(() => {
    setIsChromeHidden(true);
    setIsSidebarOpen(false);
    setIsThemePanelOpen(false);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsChromeHidden(false);
  }, []);

  const handleThemeChange = useCallback((nextTheme: ReaderTheme) => {
    setTheme(nextTheme);
    setThemeError(null);

    void saveReaderTheme(nextTheme).catch((saveError: unknown) => {
      setThemeError(getErrorMessage(saveError));
    });
  }, []);

  const handleTxtProgressChange = useCallback(
    (locator: TxtLocator, progressValue?: number) => {
      setReadingProgress({
        bookId: book.id,
        locator,
        progress: progressValue,
        updatedAt: new Date().toISOString(),
      });

      void saveReadingProgress(book.id, locator, progressValue);
    },
    [book.id],
  );

  const handleJumpToTocItem = useCallback(
    (tocItemId: string) => {
      const tocItem = findTocItemById(tocItems, tocItemId);

      if (tocItem === null) {
        return;
      }

      if (book.format === "txt") {
        const chapter = chapterById.get(tocItem.id);

        if (chapter !== undefined && document !== null) {
          setChapterJumpRequest((currentRequest) => ({
            chapterId: chapter.id,
            requestId: (currentRequest?.requestId ?? 0) + 1,
          }));
          setActiveTocItemId(chapter.id);
          handleTxtProgressChange(
            {
              kind: "txt",
              chapterId: chapter.id,
              charOffset: chapter.startChar,
            },
            chapter.startChar / Math.max(document.charCount, 1),
          );
        }
        return;
      }

      if (book.format === "epub" && tocItem.locator?.kind === "epub") {
        setEpubJumpRequest((currentRequest) => ({
          locator: tocItem.locator as EpubLocator,
          requestId: (currentRequest?.requestId ?? 0) + 1,
        }));
        setActiveTocItemId(tocItem.id);
      }
    },
    [book.format, chapterById, document, handleTxtProgressChange, tocItems],
  );

  const handleEpubTocChange = useCallback((nextTocItems: TocItem[]) => {
    setTocItems(nextTocItems);
    setActiveTocItemId((currentId) => currentId ?? nextTocItems[0]?.id ?? null);
  }, []);

  const readerStyle = useMemo(
    () =>
      ({
        "--txt-reader-background": theme.backgroundColor,
        "--txt-reader-text": theme.textColor,
        "--txt-reader-font-family": theme.fontFamily,
        "--txt-reader-font-size": `${theme.fontSize}px`,
        "--txt-reader-line-height": theme.lineHeight,
        "--txt-reader-paragraph-spacing": `${theme.paragraphSpacing}px`,
        "--txt-reader-page-margin": `${theme.pageMargin}px`,
        ...getReaderThemeTokens(theme),
      }) as CSSProperties,
    [theme],
  );

  return (
    <main
      className={`reader-shell ${isSidebarOpen ? "reader-shell--toc-open" : ""} ${
        isChromeHidden ? "reader-shell--chrome-hidden" : ""
      }`}
      style={readerStyle}
      data-reader-theme={theme.mode}
      aria-label={`${formatBookFormat(book.format)} reader`}
    >
      <ReaderSidebar
        activeTocItemId={activeTocItemId}
        items={tocItems}
        isOpen={isSidebarOpen}
        label={`${formatBookFormat(book.format)} contents`}
        onBackToLibrary={onBackToLibrary}
        onJumpToItem={handleJumpToTocItem}
      />
      <section className="reader-main">
        <header className="reader-topbar">
          <div className="reader-title-group">
            <button type="button" className="reader-link-button" onClick={onBackToLibrary}>
              Shelf
            </button>
            <div>
              <p className="reader-kicker">{formatBookFormat(book.format)} reading</p>
              <h1>{book.title}</h1>
            </div>
          </div>
          <div className="reader-toolbar" aria-label="Reader tools">
            <button type="button" className="reader-tool-button" onClick={toggleSidebar}>
              {isSidebarOpen ? "Hide contents" : "Contents"}
            </button>
            <button type="button" className="reader-tool-button" onClick={toggleThemePanel}>
              Theme
            </button>
            <button type="button" className="reader-tool-button" onClick={enterFocusMode}>
              Focus
            </button>
          </div>
        </header>
        {isChromeHidden ? (
          <button type="button" className="reader-focus-exit" onClick={exitFocusMode}>
            Exit focus
          </button>
        ) : null}
        {book.format === "txt" ? (
          <TxtReaderContent
            blocks={blocks}
            document={document}
            error={error}
            initialProgress={readingProgress}
            isLoading={isLoading}
            jumpRequest={chapterJumpRequest}
            onActiveChapterChange={setActiveTocItemId}
            onProgressChange={handleTxtProgressChange}
            onBackToLibrary={onBackToLibrary}
          />
        ) : null}
        {book.format === "epub" ? (
          <EpubReaderContent
            book={book}
            jumpRequest={epubJumpRequest}
            theme={theme}
            tocItems={tocItems}
            onActiveTocItemChange={setActiveTocItemId}
            onBackToLibrary={onBackToLibrary}
            onTocChange={handleEpubTocChange}
          />
        ) : null}
        <ThemePanel
          isOpen={isThemePanelOpen}
          theme={theme}
          themeError={themeError}
          onThemeChange={handleThemeChange}
        />
      </section>
    </main>
  );
}

interface ReaderSidebarProps {
  activeTocItemId: string | null;
  items: TocItem[];
  isOpen: boolean;
  label: string;
  onBackToLibrary: () => void;
  onJumpToItem: (itemId: string) => void;
}

function ReaderSidebar({
  activeTocItemId,
  items,
  isOpen,
  label,
  onBackToLibrary,
  onJumpToItem,
}: ReaderSidebarProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const flattenedItems = useMemo(() => flattenTocItems(items), [items]);

  const handleJump = useCallback(
    (itemId: string) => {
      onJumpToItem(itemId);
    },
    [onJumpToItem],
  );

  useEffect(() => {
    if (typeof activeItemRef.current?.scrollIntoView === "function") {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeTocItemId]);

  return (
    <aside className="reader-sidebar" aria-label="Table of contents" aria-hidden={!isOpen}>
      <button type="button" className="reader-sidebar__back" onClick={onBackToLibrary}>
        Back to shelf
      </button>
      <h2>Contents</h2>
      <nav className="reader-toc" aria-label={label}>
        {flattenedItems.length === 0 ? (
          <p className="reader-sidebar__empty">Loading chapters...</p>
        ) : (
          flattenedItems.map((item) => {
            const isActive = item.id === activeTocItemId;

            return (
              <button
                key={item.id}
                ref={isActive ? activeItemRef : undefined}
                type="button"
                className={`reader-toc__item ${isActive ? "reader-toc__item--active" : ""}`}
                style={{ paddingLeft: `${12 + item.depth * 14}px` }}
                aria-current={isActive ? "location" : undefined}
                onClick={() => handleJump(item.id)}
              >
                {item.title}
              </button>
            );
          })
        )}
      </nav>
    </aside>
  );
}

interface TxtReaderContentProps {
  blocks: ReaderBlock[];
  document: TxtDocument | null;
  error: string | null;
  initialProgress: ReaderProgress<TxtLocator> | null;
  isLoading: boolean;
  jumpRequest: ChapterJumpRequest | null;
  onActiveChapterChange: (chapterId: string) => void;
  onProgressChange: (locator: TxtLocator, progress?: number) => void;
  onBackToLibrary: () => void;
}

function TxtReaderContent({
  blocks,
  document,
  error,
  initialProgress,
  isLoading,
  jumpRequest,
  onActiveChapterChange,
  onProgressChange,
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
  const virtualIndex = useMemo(() => buildVirtualBlockIndex(virtualBlocks), [virtualBlocks]);
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
  const totalVirtualSize = Math.max(virtualizer.getTotalSize(), estimateTotalSize(virtualBlocks));

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
  }, [document, initialProgress, isLoading, scrollToVirtualIndex, virtualBlocks, virtualIndex]);

  useEffect(() => {
    if (jumpRequest === null || virtualBlocks.length === 0) {
      return;
    }

    const targetIndex = virtualIndex.chapterHeadingIndexById.get(jumpRequest.chapterId) ?? -1;

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

        if (nextChapterId !== null && nextChapterId !== lastActiveChapterIdRef.current) {
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
  }, [document, flushPendingProgress, getActiveVirtualBlock, scheduleActiveChapterChange]);

  if (isLoading) {
    return (
      <section className="reader-state" aria-label="Loading TXT book">
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
        <button type="button" className="reader-tool-button" onClick={onBackToLibrary}>
          Back to shelf
        </button>
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
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {block.kind === "heading" ? <h2>{block.text}</h2> : <p>{block.text}</p>}
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

interface EpubReaderContentProps {
  book: Book;
  jumpRequest: EpubJumpRequest | null;
  theme: ReaderTheme;
  tocItems: TocItem[];
  onActiveTocItemChange: (tocItemId: string) => void;
  onBackToLibrary: () => void;
  onTocChange: (items: TocItem[]) => void;
}

function EpubReaderContent({
  book,
  jumpRequest,
  theme,
  tocItems,
  onActiveTocItemChange,
  onBackToLibrary,
  onTocChange,
}: EpubReaderContentProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<EpubReaderAdapter | null>(null);
  const pendingProgressRef = useRef<PendingEpubProgress | null>(null);
  const progressIdleTimerRef = useRef<number | null>(null);
  const themeRef = useRef(theme);
  const tocItemsRef = useRef(tocItems);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleProgression, setVisibleProgression] = useState<number | null>(null);

  useEffect(() => {
    tocItemsRef.current = tocItems;
  }, [tocItems]);

  useEffect(() => {
    themeRef.current = theme;
    void adapterRef.current?.setTheme(theme);
  }, [theme]);

  const flushPendingProgress = useCallback(() => {
    const pendingProgress = pendingProgressRef.current;

    if (pendingProgress === null) {
      return;
    }

    pendingProgressRef.current = null;
    void saveReadingProgress(book.id, pendingProgress.locator, pendingProgress.progress).catch(
      () => undefined,
    );
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

  const handleRelocated = useCallback(
    (locator: EpubLocator, progress?: number) => {
      const activeTocItemId = findTocItemIdByHref(tocItemsRef.current, locator.href);

      if (activeTocItemId !== null) {
        onActiveTocItemChange(activeTocItemId);
      }

      setVisibleProgression(progress ?? locator.progression ?? null);
      pendingProgressRef.current = {
        locator,
        progress,
      };

      if (progressIdleTimerRef.current !== null) {
        window.clearTimeout(progressIdleTimerRef.current);
      }

      progressIdleTimerRef.current = window.setTimeout(() => {
        progressIdleTimerRef.current = null;
        flushPendingProgress();
      }, 750);
    },
    [flushPendingProgress, onActiveTocItemChange],
  );

  useEffect(() => {
    let isCurrent = true;
    let openedAdapter: EpubReaderAdapter | null = null;

    async function openEpub() {
      setIsLoading(true);
      setError(null);
      onTocChange([]);

      try {
        if (hostRef.current === null) {
          throw new Error("EPUB reader viewport is unavailable.");
        }

        const [sourceUrl, savedProgress] = await Promise.all([
          getEpubBookSource(book),
          getReadingProgress<EpubLocator>(book.id),
        ]);

        if (!isCurrent || hostRef.current === null) {
          return;
        }

        const adapter = new EpubReaderAdapter({
          bookId: book.id,
          sourceUrl,
          container: hostRef.current,
          initialLocator: savedProgress?.locator,
          theme: themeRef.current,
          onRelocated: handleRelocated,
        });
        openedAdapter = adapter;
        adapterRef.current = adapter;

        await adapter.open(book.id);
        const nextTocItems = await adapter.getToc();

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
      void openedAdapter?.close();
      if (adapterRef.current === openedAdapter) {
        adapterRef.current = null;
      }
    };
  }, [book, handleRelocated, onTocChange]);

  useEffect(() => {
    if (jumpRequest === null) {
      return;
    }

    void adapterRef.current?.goTo(jumpRequest.locator);
  }, [jumpRequest]);

  const handlePrevious = useCallback(() => {
    void adapterRef.current?.previous();
  }, []);

  const handleNext = useCallback(() => {
    void adapterRef.current?.next();
  }, []);

  const progressLabel =
    visibleProgression === null ? "Progress unavailable" : `${Math.round(visibleProgression * 100)}%`;

  return (
    <section className="reader-viewport reader-viewport--epub" aria-label={`${book.title} content`}>
      <article className="reader-page reader-page--epub">
        <div className="reader-epub-toolbar" aria-label="EPUB navigation">
          <button type="button" className="reader-tool-button" onClick={handlePrevious}>
            Previous
          </button>
          <span>{progressLabel}</span>
          <button type="button" className="reader-tool-button" onClick={handleNext}>
            Next
          </button>
        </div>
        <div className="reader-epub-frame">
          {isLoading ? (
            <section className="reader-state reader-state--overlay" aria-label="Loading EPUB book">
              <div className="loading-line" aria-hidden="true" />
              <p>Opening EPUB book...</p>
            </section>
          ) : null}
          {error !== null ? (
            <section className="reader-state reader-state--error reader-state--overlay" role="alert">
              <h2>Book could not be opened</h2>
              <p>{error}</p>
              <button type="button" className="reader-tool-button" onClick={onBackToLibrary}>
                Back to shelf
              </button>
            </section>
          ) : null}
          <div ref={hostRef} className="reader-epub-host" aria-hidden={error !== null} />
        </div>
      </article>
    </section>
  );
}

interface ReaderMetaProps {
  document: TxtDocument;
}

function ReaderMeta({ document }: ReaderMetaProps) {
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

interface ThemePanelProps {
  isOpen: boolean;
  theme: ReaderTheme;
  themeError: string | null;
  onThemeChange: (theme: ReaderTheme) => void;
}

function ThemePanel({ isOpen, theme, themeError, onThemeChange }: ThemePanelProps) {
  const handleModeChange = useCallback(
    (mode: ReaderThemeMode) => {
      onThemeChange({
        ...theme,
        mode,
        ...THEME_PRESETS[mode],
      });
    },
    [onThemeChange, theme],
  );

  const handleFontFamilyChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onThemeChange({
        ...theme,
        fontFamily: event.currentTarget.value,
      });
    },
    [onThemeChange, theme],
  );

  const handleNumberChange = useCallback(
    (field: "fontSize" | "lineHeight" | "paragraphSpacing" | "pageMargin") =>
      (event: ChangeEvent<HTMLInputElement>) => {
        onThemeChange({
          ...theme,
          [field]: Number(event.currentTarget.value),
        });
      },
    [onThemeChange, theme],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="reader-theme-panel" aria-label="Reader theme">
      <div className="theme-mode-grid" role="group" aria-label="Theme mode">
        {(["light", "sepia", "green", "dark"] satisfies ReaderThemeMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className="theme-mode-button"
            aria-pressed={theme.mode === mode}
            onClick={() => handleModeChange(mode)}
          >
            <span
              className="theme-mode-button__swatch"
              style={{
                background: THEME_PRESETS[mode].backgroundColor,
                color: THEME_PRESETS[mode].textColor,
              }}
              aria-hidden="true"
            >
              A
            </span>
            {mode}
          </button>
        ))}
      </div>
      <label className="theme-field">
        <span>Font</span>
        <select value={theme.fontFamily} onChange={handleFontFamilyChange}>
          {FONT_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <ThemeSlider
        label="Size"
        max={30}
        min={14}
        step={1}
        value={theme.fontSize}
        onChange={handleNumberChange("fontSize")}
      />
      <ThemeSlider
        label="Line"
        max={2.4}
        min={1.35}
        step={0.05}
        value={theme.lineHeight}
        onChange={handleNumberChange("lineHeight")}
      />
      <ThemeSlider
        label="Spacing"
        max={36}
        min={0}
        step={1}
        value={theme.paragraphSpacing}
        onChange={handleNumberChange("paragraphSpacing")}
      />
      <ThemeSlider
        label="Margin"
        max={96}
        min={12}
        step={2}
        value={theme.pageMargin}
        onChange={handleNumberChange("pageMargin")}
      />
      {themeError !== null ? <p className="theme-error">{themeError}</p> : null}
    </aside>
  );
}

interface ThemeSliderProps {
  label: string;
  max: number;
  min: number;
  step: number;
  value: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function ThemeSlider({ label, max, min, step, value, onChange }: ThemeSliderProps) {
  return (
    <label className="theme-field">
      <span>
        {label}
        <strong>{Number.isInteger(value) ? value : value.toFixed(2)}</strong>
      </span>
      <input max={max} min={min} step={step} type="range" value={value} onChange={onChange} />
    </label>
  );
}

function mapTxtChapterToTocItem(chapter: TxtChapter): TocItem {
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

function flattenTocItems(items: TocItem[], depth = 0): Array<TocItem & { depth: number }> {
  return items.flatMap((item) => [
    {
      ...item,
      depth,
    },
    ...flattenTocItems(item.children ?? [], depth + 1),
  ]);
}

function findTocItemById(items: TocItem[], itemId: string): TocItem | null {
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

function findTocItemIdByHref(items: TocItem[], href: string): string | null {
  const normalizedHref = normalizeEpubHref(href);

  for (const item of items) {
    if (item.href !== undefined && normalizeEpubHref(item.href) === normalizedHref) {
      return item.id;
    }

    const childItemId = findTocItemIdByHref(item.children ?? [], href);

    if (childItemId !== null) {
      return childItemId;
    }
  }

  return null;
}

function normalizeEpubHref(href: string): string {
  return href.split("#")[0] ?? href;
}

function splitChapterParagraphs(chapter: TxtChapter): ReaderParagraph[] {
  const paragraphs: ReaderParagraph[] = [];
  let localCharOffset = 0;

  for (const line of chapter.text.split("\n")) {
    const paragraph = line.trim();

    if (paragraph.length > 0 && paragraph !== chapter.title) {
      paragraphs.push({
        text: paragraph,
        charOffset: chapter.startChar + localCharOffset,
      });
    }

    localCharOffset += Array.from(line).length + 1;
  }

  return paragraphs;
}

function flattenReaderBlocks(blocks: ReaderBlock[]): ReaderVirtualBlock[] {
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

function buildVirtualBlockIndex(blocks: ReaderVirtualBlock[]): ReaderVirtualIndex {
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

function findProgressTargetIndex(index: ReaderVirtualIndex, locator: TxtLocator): number {
  let targetIndex = findIndexAtOrBeforeCharOffset(index.charOffsetEntries, locator.charOffset);

  if (locator.chapterId !== undefined) {
    const chapterEntries = index.charOffsetEntriesByChapterId.get(locator.chapterId) ?? [];
    const sameChapterIndex = findIndexAtOrBeforeCharOffset(chapterEntries, locator.charOffset);

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

function findIndexAtOrBeforeCharOffset(
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

function buildEstimatedVirtualItems(blocks: ReaderVirtualBlock[]): RenderedVirtualItem[] {
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

function findEstimatedIndexAtOffset(blocks: ReaderVirtualBlock[], targetOffset: number): number {
  let estimatedOffset = 0;

  for (const [index, block] of blocks.entries()) {
    if (estimatedOffset > targetOffset) {
      return Math.max(0, index - 1);
    }

    estimatedOffset += estimateVirtualBlockSize(block);
  }

  return Math.max(0, blocks.length - 1);
}

function estimateTotalSize(blocks: ReaderVirtualBlock[]): number {
  return blocks.reduce((totalSize, block) => totalSize + estimateVirtualBlockSize(block), 0);
}

function estimateVirtualBlockSize(block: ReaderVirtualBlock | undefined): number {
  if (block === undefined) {
    return 68;
  }

  if (block.kind === "heading") {
    return 96;
  }

  return Math.max(68, Math.ceil(block.text.length / 34) * 34);
}

function formatBookFormat(format: Book["format"]): string {
  return format.toUpperCase();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unexpected error occurred.";
}
