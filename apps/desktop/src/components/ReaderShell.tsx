import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  type Annotation,
  type Bookmark,
  defaultReaderTheme,
  type Book,
  type EpubLocator,
  type Locator,
  type PdfLocator,
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
  createAnnotation,
  createBookmark,
  deleteBookmark,
  getEpubBookSource,
  getPdfBookSource,
  getReaderTheme,
  getReadingProgress,
  listAnnotations,
  listBookmarks,
  openTxtBook,
  saveReaderTheme,
  saveReadingProgress,
} from "../tauri/reader";
import {
  EpubReaderAdapter,
  type EpubPosition,
  type EpubProgressPreview,
  type EpubSpreadMode,
  type EpubSpreadState,
} from "../epub/EpubReaderAdapter";
import {
  PdfReaderAdapter,
  type PdfPosition,
  type PdfViewMode,
} from "../pdf/PdfReaderAdapter";

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

const DEFAULT_HIGHLIGHT_COLOR = "#f3bc55";
const HIGHLIGHT_COLORS = [
  {
    label: "Yellow",
    value: DEFAULT_HIGHLIGHT_COLOR,
  },
  {
    label: "Green",
    value: "#7dbb78",
  },
  {
    label: "Blue",
    value: "#73a7d8",
  },
  {
    label: "Pink",
    value: "#df8bb4",
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
    "--txt-reader-meta-background": isDark
      ? "rgba(240, 232, 215, 0.08)"
      : "rgba(255, 255, 255, 0.54)",
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

type ReaderSidebarTab = "contents" | "bookmarks" | "notes" | "search";

interface TxtJumpRequest {
  locator: TxtLocator;
  requestId: number;
}

interface EpubJumpRequest {
  locator: EpubLocator;
  requestId: number;
}

interface PdfJumpRequest {
  locator: PdfLocator;
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

interface PendingPdfProgress {
  locator: PdfLocator;
  progress?: number;
}

interface PdfRenderedHighlight {
  id: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ReaderSelectionSnapshot {
  locator: Locator;
  selectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  menuX: number;
  menuY: number;
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
  const [bookmarks, setBookmarks] = useState<Array<Bookmark<Locator>>>([]);
  const [bookmarksBookId, setBookmarksBookId] = useState(book.id);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsBookId, setAnnotationsBookId] = useState(book.id);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [currentBookmarkPosition, setCurrentBookmarkPosition] = useState<{
    bookId: string;
    locator: Locator;
  } | null>(null);
  const [selectionSnapshot, setSelectionSnapshot] =
    useState<ReaderSelectionSnapshot | null>(null);
  const [sidebarTab, setSidebarTab] = useState<ReaderSidebarTab>("contents");
  const [activeTocItemId, setActiveTocItemId] = useState<string | null>(null);
  const [txtJumpRequest, setTxtJumpRequest] = useState<TxtJumpRequest | null>(null);
  const [epubJumpRequest, setEpubJumpRequest] = useState<EpubJumpRequest | null>(null);
  const [pdfJumpRequest, setPdfJumpRequest] = useState<PdfJumpRequest | null>(null);

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

    async function loadBookmarks() {
      try {
        const savedBookmarks = await listBookmarks(book.id);

        if (isCurrent) {
          setBookmarksBookId(book.id);
          setBookmarks(savedBookmarks);
          setBookmarkError(null);
        }
      } catch (bookmarkLoadError) {
        if (isCurrent) {
          setBookmarksBookId(book.id);
          setBookmarks([]);
          setBookmarkError(getErrorMessage(bookmarkLoadError));
        }
      }
    }

    void loadBookmarks();

    return () => {
      isCurrent = false;
    };
  }, [book.id]);

  useEffect(() => {
    let isCurrent = true;

    async function loadAnnotations() {
      try {
        const savedAnnotations = await listAnnotations(book.id);

        if (isCurrent) {
          setAnnotationsBookId(book.id);
          setAnnotations(savedAnnotations);
          setAnnotationError(null);
        }
      } catch (annotationLoadError) {
        if (isCurrent) {
          setAnnotationsBookId(book.id);
          setAnnotations([]);
          setAnnotationError(getErrorMessage(annotationLoadError));
        }
      }
    }

    void loadAnnotations();

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
          const initialLocator =
            savedProgress?.locator ??
            nextTocItems[0]?.locator ??
            ({
              kind: "txt",
              charOffset: 0,
            } satisfies TxtLocator);
          setDocument(openedDocument);
          setReadingProgress(savedProgress);
          setTocItems(nextTocItems);
          setActiveTocItemId(openedDocument.chapters[0]?.id ?? null);
          setCurrentBookmarkPosition({
            bookId: book.id,
            locator: initialLocator,
          });
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
  const visibleBookmarks = bookmarksBookId === book.id ? bookmarks : [];
  const visibleBookmarkError = bookmarksBookId === book.id ? bookmarkError : null;
  const visibleAnnotations = annotationsBookId === book.id ? annotations : [];
  const visibleAnnotationError =
    annotationsBookId === book.id ? annotationError : null;
  const currentBookmarkLocator =
    currentBookmarkPosition?.bookId === book.id ? currentBookmarkPosition.locator : null;

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
      setCurrentBookmarkPosition({
        bookId: book.id,
        locator,
      });
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
          const locator: TxtLocator = {
            kind: "txt",
            chapterId: chapter.id,
            charOffset: chapter.startChar,
          };
          setTxtJumpRequest((currentRequest) => ({
            locator,
            requestId: (currentRequest?.requestId ?? 0) + 1,
          }));
          setActiveTocItemId(chapter.id);
          handleTxtProgressChange(locator, chapter.startChar / Math.max(document.charCount, 1));
        }
        return;
      }

      if (book.format === "epub" && tocItem.locator?.kind === "epub") {
        setEpubJumpRequest((currentRequest) => ({
          locator: tocItem.locator as EpubLocator,
          requestId: (currentRequest?.requestId ?? 0) + 1,
        }));
        setActiveTocItemId(tocItem.id);
        return;
      }

      if (book.format === "pdf" && tocItem.locator?.kind === "pdf") {
        setPdfJumpRequest((currentRequest) => ({
          locator: tocItem.locator as PdfLocator,
          requestId: (currentRequest?.requestId ?? 0) + 1,
        }));
        setActiveTocItemId(tocItem.id);
      }
    },
    [book.format, chapterById, document, handleTxtProgressChange, tocItems],
  );

  const handleDocumentTocChange = useCallback((nextTocItems: TocItem[]) => {
    setTocItems(nextTocItems);
    setActiveTocItemId((currentId) => currentId ?? nextTocItems[0]?.id ?? null);
  }, []);

  const handleCurrentLocatorChange = useCallback(
    (locator: Locator) => {
      setCurrentBookmarkPosition({
        bookId: book.id,
        locator,
      });
    },
    [book.id],
  );

  const handleJumpToLocator = useCallback(
    (locator: Locator) => {
      if (locator.kind === "txt") {
        setTxtJumpRequest((currentRequest) => ({
          locator,
          requestId: (currentRequest?.requestId ?? 0) + 1,
        }));
        if (locator.chapterId !== undefined) {
          setActiveTocItemId(locator.chapterId);
        }
        if (document !== null) {
          handleTxtProgressChange(
            locator,
            locator.charOffset / Math.max(document.charCount, 1),
          );
        }
        return;
      }

      if (locator.kind === "epub") {
        setEpubJumpRequest((currentRequest) => ({
          locator,
          requestId: (currentRequest?.requestId ?? 0) + 1,
        }));
        const tocItemId = findTocItemIdByHref(tocItems, locator.href);
        setActiveTocItemId(tocItemId);
        return;
      }

      setPdfJumpRequest((currentRequest) => ({
        locator,
        requestId: (currentRequest?.requestId ?? 0) + 1,
      }));
      setActiveTocItemId(findTocItemByPdfPage(tocItems, locator.page)?.id ?? null);
    },
    [document, handleTxtProgressChange, tocItems],
  );

  const handleCreateBookmark = useCallback(() => {
    const locator = currentBookmarkLocator;

    if (locator === null) {
      return;
    }

    const label = getBookmarkLabel(book, tocItems, activeTocItemId, locator);
    setBookmarkError(null);

    void createBookmark(book.id, locator, label)
      .then((bookmark) => {
        setBookmarksBookId(book.id);
        setBookmarks((currentBookmarks) => [
          bookmark,
          ...currentBookmarks.filter(
            (currentBookmark) => currentBookmark.id !== bookmark.id,
          ),
        ]);
        setSidebarTab("bookmarks");
        setIsSidebarOpen(true);
      })
      .catch((bookmarkCreateError: unknown) => {
        setBookmarksBookId(book.id);
        setBookmarkError(getErrorMessage(bookmarkCreateError));
      });
  }, [activeTocItemId, book, currentBookmarkLocator, tocItems]);

  const handleJumpToBookmark = useCallback(
    (bookmark: Bookmark<Locator>) => {
      handleJumpToLocator(bookmark.locator);
      setSidebarTab("bookmarks");
    },
    [handleJumpToLocator],
  );

  const handleDeleteBookmark = useCallback((bookmarkId: string) => {
    setBookmarkError(null);

    void deleteBookmark(bookmarkId)
      .then(() => {
        setBookmarks((currentBookmarks) =>
          currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
        );
      })
      .catch((bookmarkDeleteError: unknown) => {
        setBookmarkError(getErrorMessage(bookmarkDeleteError));
      });
  }, []);

  const handleSelectionChange = useCallback(
    (snapshot: ReaderSelectionSnapshot | null) => {
      setSelectionSnapshot(snapshot);
    },
    [],
  );

  const handleCopySelection = useCallback(() => {
    const selectedText = selectionSnapshot?.selectedText;

    if (selectedText === undefined || selectedText.trim() === "") {
      return;
    }

    void navigator.clipboard?.writeText(selectedText).catch(() => undefined);
    setSelectionSnapshot(null);
  }, [selectionSnapshot]);

  const handlePendingHighlight = useCallback(
    (color = DEFAULT_HIGHLIGHT_COLOR) => {
      const snapshot = selectionSnapshot;

      if (snapshot === null) {
        return;
      }

      setAnnotationError(null);
      setSelectionSnapshot(null);

      void createAnnotation(
        book.id,
        "highlight",
        snapshot.locator,
        color,
        snapshot.selectedText,
      )
        .then((annotation) => {
          setAnnotationsBookId(book.id);
          setAnnotations((currentAnnotations) => [
            annotation,
            ...currentAnnotations.filter(
              (currentAnnotation) => currentAnnotation.id !== annotation.id,
            ),
          ]);
        })
        .catch((annotationCreateError: unknown) => {
          setAnnotationsBookId(book.id);
          setAnnotationError(getErrorMessage(annotationCreateError));
        });
    },
    [book.id, selectionSnapshot],
  );

  const handlePendingNote = useCallback(() => {
    setSelectionSnapshot(null);
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
      } ${isThemePanelOpen ? "reader-shell--theme-open" : ""}`}
      style={readerStyle}
      data-reader-theme={theme.mode}
      aria-label={`${formatBookFormat(book.format)} reader`}
    >
      <ReaderSidebar
        activeTocItemId={activeTocItemId}
        activeTab={sidebarTab}
        annotationError={visibleAnnotationError}
        bookmarks={visibleBookmarks}
        bookmarkError={visibleBookmarkError}
        items={tocItems}
        isOpen={isSidebarOpen}
        label={`${formatBookFormat(book.format)} contents`}
        onBackToLibrary={onBackToLibrary}
        onCreateBookmark={handleCreateBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onJumpToBookmark={handleJumpToBookmark}
        onJumpToItem={handleJumpToTocItem}
        onTabChange={setSidebarTab}
      />
      <section className="reader-main">
        <header className="reader-topbar">
          <div className="reader-title-group">
            <button
              type="button"
              className="reader-link-button"
              onClick={onBackToLibrary}
            >
              Shelf
            </button>
            <div>
              <p className="reader-kicker">{formatBookFormat(book.format)} reading</p>
              <h1>{book.title}</h1>
            </div>
          </div>
          <div className="reader-toolbar" aria-label="Reader tools">
            <button
              type="button"
              className="reader-tool-button"
              onClick={toggleSidebar}
            >
              {isSidebarOpen ? "Hide contents" : "Contents"}
            </button>
            <button
              type="button"
              className="reader-tool-button"
              disabled={currentBookmarkLocator === null}
              onClick={handleCreateBookmark}
            >
              Bookmark
            </button>
            <button
              type="button"
              className="reader-tool-button"
              onClick={toggleThemePanel}
            >
              Theme
            </button>
            <button
              type="button"
              className="reader-tool-button"
              onClick={enterFocusMode}
            >
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
            annotations={visibleAnnotations}
            blocks={blocks}
            document={document}
            error={error}
            initialProgress={readingProgress}
            isLoading={isLoading}
            jumpRequest={txtJumpRequest}
            onActiveChapterChange={setActiveTocItemId}
            onProgressChange={handleTxtProgressChange}
            onSelectionChange={handleSelectionChange}
            onBackToLibrary={onBackToLibrary}
          />
        ) : null}
        {book.format === "epub" ? (
          <EpubReaderContent
            annotations={visibleAnnotations}
            book={book}
            jumpRequest={epubJumpRequest}
            theme={theme}
            tocItems={tocItems}
            onActiveTocItemChange={setActiveTocItemId}
            onBackToLibrary={onBackToLibrary}
            onCurrentLocatorChange={handleCurrentLocatorChange}
            onSelectionChange={handleSelectionChange}
            onTocChange={handleDocumentTocChange}
          />
        ) : null}
        {book.format === "pdf" ? (
          <PdfReaderContent
            annotations={visibleAnnotations}
            book={book}
            jumpRequest={pdfJumpRequest}
            theme={theme}
            tocItems={tocItems}
            onActiveTocItemChange={setActiveTocItemId}
            onBackToLibrary={onBackToLibrary}
            onCurrentLocatorChange={handleCurrentLocatorChange}
            onSelectionChange={handleSelectionChange}
            onTocChange={handleDocumentTocChange}
          />
        ) : null}
        <ThemePanel
          isOpen={isThemePanelOpen}
          theme={theme}
          themeError={themeError}
          onThemeChange={handleThemeChange}
        />
        <SelectionMenu
          selection={selectionSnapshot}
          onCopy={handleCopySelection}
          onHighlight={handlePendingHighlight}
          onNote={handlePendingNote}
        />
      </section>
    </main>
  );
}

interface ReaderSidebarProps {
  activeTocItemId: string | null;
  activeTab: ReaderSidebarTab;
  annotationError: string | null;
  bookmarks: Array<Bookmark<Locator>>;
  bookmarkError: string | null;
  items: TocItem[];
  isOpen: boolean;
  label: string;
  onBackToLibrary: () => void;
  onCreateBookmark: () => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onJumpToBookmark: (bookmark: Bookmark<Locator>) => void;
  onJumpToItem: (itemId: string) => void;
  onTabChange: (tab: ReaderSidebarTab) => void;
}

function ReaderSidebar({
  activeTocItemId,
  activeTab,
  annotationError,
  bookmarks,
  bookmarkError,
  items,
  isOpen,
  label,
  onBackToLibrary,
  onCreateBookmark,
  onDeleteBookmark,
  onJumpToBookmark,
  onJumpToItem,
  onTabChange,
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
    <aside
      className="reader-sidebar"
      aria-label="Table of contents"
      aria-hidden={!isOpen}
    >
      <button type="button" className="reader-sidebar__back" onClick={onBackToLibrary}>
        Back to shelf
      </button>
      <div className="reader-sidebar-tabs" role="tablist" aria-label="Reader sidebar">
        {(["contents", "bookmarks", "notes", "search"] as ReaderSidebarTab[]).map(
          (tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => onTabChange(tab)}
            >
              {formatSidebarTab(tab)}
            </button>
          ),
        )}
      </div>
      {activeTab === "contents" ? (
        <>
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
                    className={`reader-toc__item ${
                      isActive ? "reader-toc__item--active" : ""
                    }`}
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
        </>
      ) : null}
      {activeTab === "bookmarks" ? (
        <section className="reader-sidebar-panel" aria-label="Bookmarks">
          <div className="reader-sidebar-panel__header">
            <h2>Bookmarks</h2>
            <button type="button" className="reader-sidebar__action" onClick={onCreateBookmark}>
              Add
            </button>
          </div>
          {bookmarkError !== null ? (
            <p className="reader-sidebar__error" role="alert">
              {bookmarkError}
            </p>
          ) : null}
          {bookmarks.length === 0 ? (
            <p className="reader-sidebar__empty">No bookmarks yet.</p>
          ) : (
            <div className="reader-bookmarks" role="list">
              {bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="reader-bookmark" role="listitem">
                  <button
                    type="button"
                    className="reader-bookmark__jump"
                    aria-label={`Go to bookmark ${bookmark.label ?? getLocatorLabel(bookmark.locator)}`}
                    onClick={() => onJumpToBookmark(bookmark)}
                  >
                    <span>{bookmark.label ?? getLocatorLabel(bookmark.locator)}</span>
                    <small>{getLocatorLabel(bookmark.locator)}</small>
                  </button>
                  <button
                    type="button"
                    className="reader-bookmark__delete"
                    aria-label={`Delete bookmark ${bookmark.label ?? getLocatorLabel(bookmark.locator)}`}
                    onClick={() => onDeleteBookmark(bookmark.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {activeTab === "notes" ? (
        <section className="reader-sidebar-panel" aria-label="Notes">
          <h2>Notes</h2>
          {annotationError !== null ? (
            <p className="reader-sidebar__error" role="alert">
              {annotationError}
            </p>
          ) : null}
          <p className="reader-sidebar__empty">No notes yet.</p>
        </section>
      ) : null}
      {activeTab === "search" ? (
        <section className="reader-sidebar-panel" aria-label="Search">
          <h2>Search</h2>
          <p className="reader-sidebar__empty">Search will be available in stage 5.5.</p>
        </section>
      ) : null}
    </aside>
  );
}

interface SelectionMenuProps {
  selection: ReaderSelectionSnapshot | null;
  onCopy: () => void;
  onHighlight: (color?: string) => void;
  onNote: () => void;
}

function SelectionMenu({
  selection,
  onCopy,
  onHighlight,
  onNote,
}: SelectionMenuProps) {
  if (selection === null) {
    return null;
  }

  return (
    <div
      className="reader-selection-menu"
      role="toolbar"
      aria-label="Selection actions"
      style={{
        left: `${selection.menuX}px`,
        top: `${selection.menuY}px`,
      }}
    >
      <button type="button" onClick={() => onHighlight()}>
        Highlight
      </button>
      <div className="reader-selection-menu__swatches" aria-label="Highlight colors">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            className="reader-selection-menu__swatch"
            aria-label={`Highlight ${color.label.toLowerCase()}`}
            style={{ "--reader-highlight-color": color.value } as CSSProperties}
            onClick={() => onHighlight(color.value)}
          />
        ))}
      </div>
      <button type="button" onClick={onNote}>
        Note
      </button>
      <button type="button" onClick={onCopy}>
        Copy
      </button>
    </div>
  );
}

interface TxtReaderContentProps {
  annotations: Annotation[];
  blocks: ReaderBlock[];
  document: TxtDocument | null;
  error: string | null;
  initialProgress: ReaderProgress<TxtLocator> | null;
  isLoading: boolean;
  jumpRequest: TxtJumpRequest | null;
  onActiveChapterChange: (chapterId: string) => void;
  onProgressChange: (locator: TxtLocator, progress?: number) => void;
  onSelectionChange: (snapshot: ReaderSelectionSnapshot | null) => void;
  onBackToLibrary: () => void;
}

function TxtReaderContent({
  annotations,
  blocks,
  document,
  error,
  initialProgress,
  isLoading,
  jumpRequest,
  onActiveChapterChange,
  onProgressChange,
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
                  <h2>{renderHighlightedText(block, annotations)}</h2>
                ) : (
                  <p>{renderHighlightedText(block, annotations)}</p>
                )}
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

interface EpubReaderContentProps {
  annotations: Annotation[];
  book: Book;
  jumpRequest: EpubJumpRequest | null;
  theme: ReaderTheme;
  tocItems: TocItem[];
  onActiveTocItemChange: (tocItemId: string) => void;
  onBackToLibrary: () => void;
  onCurrentLocatorChange: (locator: EpubLocator) => void;
  onSelectionChange: (snapshot: ReaderSelectionSnapshot | null) => void;
  onTocChange: (items: TocItem[]) => void;
}

function EpubReaderContent({
  annotations,
  book,
  jumpRequest,
  theme,
  tocItems,
  onActiveTocItemChange,
  onBackToLibrary,
  onCurrentLocatorChange,
  onSelectionChange,
  onTocChange,
}: EpubReaderContentProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<EpubReaderAdapter | null>(null);
  const isDraggingProgressRef = useRef(false);
  const pendingProgressRef = useRef<PendingEpubProgress | null>(null);
  const positionRef = useRef<EpubPosition | null>(null);
  const previewPositionRef = useRef<EpubProgressPreview | null>(null);
  const progressIdleTimerRef = useRef<number | null>(null);
  const appliedEpubHighlightCfisRef = useRef<Set<string>>(new Set());
  const themeRef = useRef(theme);
  const tocItemsRef = useRef(tocItems);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [isAdapterReadyForHighlights, setIsAdapterReadyForHighlights] =
    useState(false);
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
    void adapterRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    isDraggingProgressRef.current = isDraggingProgress;
  }, [isDraggingProgress]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    previewPositionRef.current = previewPosition;
  }, [previewPosition]);

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

  const updateActiveTocForHref = useCallback(
    (href: string) => {
      const activeTocItemId = findTocItemIdByHref(tocItemsRef.current, href);

      if (activeTocItemId !== null) {
        onActiveTocItemChange(activeTocItemId);
      }
    },
    [onActiveTocItemChange],
  );

  const handleRelocated = useCallback(
    (nextPosition: EpubPosition) => {
      positionRef.current = nextPosition;
      updateActiveTocForHref(nextPosition.locator.href);
      onCurrentLocatorChange(nextPosition.locator);
      setPosition(nextPosition);
      if (nextPosition.page !== null) {
        setPageInput(String(nextPosition.page));
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
      setIsAdapterReadyForHighlights(false);
      setPosition(null);
      setPreviewPosition(null);
      setPageInput("1");
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
              menuX: window.innerWidth / 2,
              menuY: 112,
            });
          },
          onSpreadChange: setSpreadState,
        });
        openedAdapter = adapter;
        adapterRef.current = adapter;

        await adapter.open(book.id);
        appliedEpubHighlightCfisRef.current = new Set();
        setIsAdapterReadyForHighlights(true);
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
      setIsAdapterReadyForHighlights(false);
      appliedEpubHighlightCfisRef.current = new Set();
    };
  }, [book, handleRelocated, onSelectionChange, onTocChange]);

  useEffect(() => {
    const adapter = adapterRef.current;

    if (!isAdapterReadyForHighlights || adapter === null) {
      return;
    }

    const nextHighlights = getEpubHighlightAnnotations(annotations);
    const nextCfis = new Set(nextHighlights.map((annotation) => annotation.locator.cfi));

    for (const cfi of appliedEpubHighlightCfisRef.current) {
      if (!nextCfis.has(cfi)) {
        adapter.removeHighlight(cfi);
      }
    }

    for (const annotation of nextHighlights) {
      const cfi = annotation.locator.cfi;

      if (appliedEpubHighlightCfisRef.current.has(cfi)) {
        continue;
      }

      adapter.addHighlight(cfi, annotation.color ?? DEFAULT_HIGHLIGHT_COLOR);
    }

    appliedEpubHighlightCfisRef.current = nextCfis;
  }, [annotations, isAdapterReadyForHighlights]);

  useEffect(() => {
    if (jumpRequest === null) {
      return;
    }

    void adapterRef.current?.goTo(jumpRequest.locator);
  }, [jumpRequest]);

  const handlePrevious = useCallback(() => {
    setPreviewPosition(null);
    void adapterRef.current?.previous();
  }, []);

  const handleNext = useCallback(() => {
    setPreviewPosition(null);
    void adapterRef.current?.next();
  }, []);

  const handleSpreadModeChange = useCallback((mode: EpubSpreadMode) => {
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

    void adapter.goToProgress(nextProgression).catch((progressError: unknown) => {
      setPreviewPosition(null);
      setError(getErrorMessage(progressError));
    });
  }, []);

  const commitPageInput = useCallback(() => {
    const adapter = adapterRef.current;
    const currentPosition = positionRef.current;
    const totalPages = currentPosition?.totalPages;
    const currentPage = currentPosition?.page ?? 1;
    const page = Number.parseInt(pageInput, 10);

    if (
      adapter === null ||
      currentPosition?.locationsReady !== true ||
      totalPages === null ||
      totalPages === undefined ||
      !Number.isFinite(page)
    ) {
      setPageInput(String(currentPage));
      return;
    }

    const nextPage = normalizeReaderPage(page, totalPages);
    const nextProgression = pageToProgression(nextPage, totalPages);
    setPageInput(String(nextPage));
    setPreviewPosition(null);
    isDraggingProgressRef.current = false;
    setIsDraggingProgress(false);

    void adapter.goToProgress(nextProgression).catch((pageError: unknown) => {
      setPageInput(String(positionRef.current?.page ?? currentPage));
      setError(getErrorMessage(pageError));
    });
  }, [pageInput]);

  const handlePageInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        commitPageInput();
      }
    },
    [commitPageInput],
  );

  const activeProgress = previewPosition ?? position;
  const locationsReady =
    position?.locationsReady === true && position.totalPages !== null;
  const activeProgression = locationsReady ? (activeProgress?.progression ?? 0) : 0;
  const sliderValue = Math.round(activeProgression * 1000);
  const progressPercent = Math.round(activeProgression * 100);
  const progressPage = activeProgress?.page ?? null;
  const totalPages = activeProgress?.totalPages ?? position?.totalPages ?? null;
  const pageLabel =
    progressPage !== null && totalPages !== null
      ? `Page ${progressPage} / ${totalPages}`
      : "Pages calculating";
  const progressLabel = locationsReady ? `${progressPercent}%` : "Calculating pages";
  const activeChapterTitle =
    activeProgress !== null
      ? (findTocItemByHref(tocItems, activeProgress.locator.href)?.title ?? book.title)
      : book.title;
  const progressControlStyle = {
    "--epub-progress-percent": `${activeProgression * 100}%`,
  } as CSSProperties;
  const spreadModeDescription =
    requestedSpreadMode === "double" && spreadState.rendered === "single"
      ? "Double view will resume when the window is wide enough."
      : undefined;

  return (
    <section
      className="reader-viewport reader-viewport--epub"
      aria-label={`${book.title} content`}
    >
      <article className="reader-page reader-page--epub">
        <div className="reader-epub-frame">
          {isLoading ? (
            <section
              className="reader-state reader-state--overlay"
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
              <button
                type="button"
                className="reader-tool-button"
                onClick={onBackToLibrary}
              >
                Back to shelf
              </button>
            </section>
          ) : null}
          <div
            ref={hostRef}
            className="reader-epub-host"
            aria-hidden={error !== null}
          />
        </div>
        <div className="reader-epub-controls" aria-label="EPUB navigation">
          <div className="reader-epub-control-row">
            <button
              type="button"
              className="reader-tool-button"
              onClick={handlePrevious}
            >
              Previous
            </button>
            <div className="reader-epub-status" aria-live="polite">
              <span>{activeChapterTitle}</span>
              <strong>{pageLabel}</strong>
              <span>{progressLabel}</span>
            </div>
            <button type="button" className="reader-tool-button" onClick={handleNext}>
              Next
            </button>
            <div
              className="reader-epub-mode-toggle"
              role="group"
              aria-label="EPUB page view"
              title={spreadModeDescription}
            >
              <button
                type="button"
                aria-pressed={requestedSpreadMode === "single"}
                onClick={() => handleSpreadModeChange("single")}
              >
                Single
              </button>
              <button
                type="button"
                aria-pressed={requestedSpreadMode === "double"}
                onClick={() => handleSpreadModeChange("double")}
              >
                Double
              </button>
            </div>
          </div>
          <div className="reader-epub-progress" style={progressControlStyle}>
            <div className="reader-epub-progress__meta">
              <span>{activeChapterTitle}</span>
              <label className="reader-page-field reader-epub-page-field">
                <span>Page</span>
                <input
                  aria-label="EPUB page number"
                  disabled={!locationsReady}
                  min={1}
                  max={totalPages ?? 1}
                  type="number"
                  value={pageInput}
                  onBlur={commitPageInput}
                  onChange={(event) => setPageInput(event.currentTarget.value)}
                  onKeyDown={handlePageInputKeyDown}
                />
                <span>/ {totalPages ?? "-"}</span>
              </label>
            </div>
            <div className="reader-epub-progress__track">
              {locationsReady ? (
                <span
                  className={`reader-epub-progress__tooltip ${
                    isDraggingProgress ? "reader-epub-progress__tooltip--visible" : ""
                  }`}
                  aria-hidden="true"
                >
                  {progressPage !== null ? `Page ${progressPage}` : pageLabel}
                </span>
              ) : null}
              <input
                aria-label="EPUB reading progress"
                className="reader-epub-progress__range"
                disabled={!locationsReady}
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

interface PdfReaderContentProps {
  annotations: Annotation[];
  book: Book;
  jumpRequest: PdfJumpRequest | null;
  theme: ReaderTheme;
  tocItems: TocItem[];
  onActiveTocItemChange: (tocItemId: string | null) => void;
  onBackToLibrary: () => void;
  onCurrentLocatorChange: (locator: PdfLocator) => void;
  onSelectionChange: (snapshot: ReaderSelectionSnapshot | null) => void;
  onTocChange: (items: TocItem[]) => void;
}

function PdfReaderContent({
  annotations,
  book,
  jumpRequest,
  theme,
  tocItems,
  onActiveTocItemChange,
  onBackToLibrary,
  onCurrentLocatorChange,
  onSelectionChange,
  onTocChange,
}: PdfReaderContentProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<PdfReaderAdapter | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const textLayerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const isDraggingProgressRef = useRef(false);
  const pendingProgressRef = useRef<PendingPdfProgress | null>(null);
  const positionRef = useRef<PdfPosition | null>(null);
  const previewPositionRef = useRef<PdfPosition | null>(null);
  const progressIdleTimerRef = useRef<number | null>(null);
  const renderSequenceRef = useRef(0);
  const requestedViewModeRef = useRef<PdfViewMode>("single");
  const annotationsRef = useRef(annotations);
  const themeRef = useRef(theme);
  const tocItemsRef = useRef(tocItems);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [pdfHighlightRectsByPage, setPdfHighlightRectsByPage] = useState<
    Record<number, PdfRenderedHighlight[]>
  >({});
  const [position, setPosition] = useState<PdfPosition | null>(null);
  const [previewPosition, setPreviewPosition] = useState<PdfPosition | null>(null);
  const [requestedViewMode, setRequestedViewMode] = useState<PdfViewMode>("single");

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
    const adapter = adapterRef.current;

    if (adapter === null) {
      return;
    }

    const renderSequence = renderSequenceRef.current + 1;
    renderSequenceRef.current = renderSequence;

    try {
      const visiblePages = adapter.getVisiblePages();
      const nextHighlightRectsByPage: Record<number, PdfRenderedHighlight[]> = {};

      for (const [index, pageNumber] of visiblePages.entries()) {
        const canvas = canvasRefs.current[index];

        if (canvas === undefined || canvas === null) {
          continue;
        }

        canvas.hidden = false;
        canvas.dataset.pageNumber = String(pageNumber);
        await adapter.renderPage(canvas, pageNumber);

        if (renderSequenceRef.current !== renderSequence) {
          return;
        }

        const textLayer = textLayerRefs.current[index];

        if (textLayer !== undefined && textLayer !== null) {
          textLayer.hidden = false;
          await adapter.renderTextLayer(textLayer, pageNumber);
        }

        if (renderSequenceRef.current !== renderSequence) {
          return;
        }

        const pageHighlights = getPdfHighlightAnnotations(
          annotationsRef.current,
          pageNumber,
        );
        const pageRects: PdfRenderedHighlight[] = [];

        for (const annotation of pageHighlights) {
          const rects = annotation.locator.rects;

          if (rects === undefined || rects.length === 0) {
            continue;
          }

          const viewportRects = await adapter.pdfRectsToViewportRects(
            pageNumber,
            rects,
            positionRef.current?.scale,
          );

          if (renderSequenceRef.current !== renderSequence) {
            return;
          }

          pageRects.push(
            ...viewportRects.map((rect, rectIndex) => ({
              id: `${annotation.id}-${rectIndex}`,
              color: annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
              ...rect,
            })),
          );
        }

        nextHighlightRectsByPage[pageNumber] = pageRects;
      }

      for (
        let index = visiblePages.length;
        index < canvasRefs.current.length;
        index += 1
      ) {
        const canvas = canvasRefs.current[index];

        if (canvas !== undefined && canvas !== null) {
          canvas.hidden = true;
          canvas.removeAttribute("data-page-number");
        }

        const textLayer = textLayerRefs.current[index];

        if (textLayer !== undefined && textLayer !== null) {
          textLayer.hidden = true;
          textLayer.replaceChildren();
          textLayer.removeAttribute("data-page-number");
        }
      }

      if (renderSequenceRef.current === renderSequence) {
        setPdfHighlightRectsByPage(nextHighlightRectsByPage);
      }
    } catch (renderError) {
      if (renderSequenceRef.current === renderSequence) {
        setError(getErrorMessage(renderError));
      }
    }
  }, []);

  useEffect(() => {
    annotationsRef.current = annotations;

    if (adapterRef.current === null) {
      return;
    }

    const frameHandle = window.requestAnimationFrame(() => {
      void renderVisiblePages();
    });

    return () => {
      window.cancelAnimationFrame(frameHandle);
    };
  }, [annotations, renderVisiblePages]);

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
    void adapterRef.current?.setTheme(theme).then(renderVisiblePages);
  }, [renderVisiblePages, theme]);

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
      setRequestedViewMode("single");
      requestedViewModeRef.current = "single";
      onTocChange([]);

      try {
        const [sourceUrl, savedProgress] = await Promise.all([
          getPdfBookSource(book),
          getReadingProgress<PdfLocator>(book.id),
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

        adapterRef.current = adapter;
        await adapter.setTheme(themeRef.current);
        const nextTocItems = await adapter.getToc();

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
      renderSequenceRef.current += 1;
      if (adapterRef.current === openedAdapter) {
        adapterRef.current = null;
      }
      void openedAdapter?.close();
    };
  }, [
    book,
    handlePositionChange,
    onActiveTocItemChange,
    onTocChange,
    renderVisiblePages,
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
        const nextPosition = adapter.setViewMode(
          requestedViewModeRef.current,
          frame.clientWidth,
        );
        positionRef.current = nextPosition;
        setPosition(nextPosition);
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

  useEffect(() => {
    if (jumpRequest === null) {
      return;
    }

    const adapter = adapterRef.current;

    if (adapter === null) {
      return;
    }

    void adapter
      .goTo(jumpRequest.locator)
      .then(renderVisiblePages)
      .catch((jumpError: unknown) => {
        setError(getErrorMessage(jumpError));
      });
  }, [jumpRequest, renderVisiblePages]);

  const runPdfAction = useCallback(
    (action: (adapter: PdfReaderAdapter) => Promise<unknown> | unknown) => {
      const adapter = adapterRef.current;

      if (adapter === null) {
        return;
      }

      void Promise.resolve(action(adapter))
        .then(renderVisiblePages)
        .catch((actionError: unknown) => {
          setError(getErrorMessage(actionError));
        });
    },
    [renderVisiblePages],
  );

  const handlePrevious = useCallback(() => {
    runPdfAction((adapter) => adapter.previous());
  }, [runPdfAction]);

  const handleNext = useCallback(() => {
    runPdfAction((adapter) => adapter.next());
  }, [runPdfAction]);

  const handleViewModeChange = useCallback(
    (mode: PdfViewMode) => {
      setRequestedViewMode(mode);
      requestedViewModeRef.current = mode;
      runPdfAction((adapter) =>
        adapter.setViewMode(mode, frameRef.current?.clientWidth),
      );
    },
    [runPdfAction],
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

    runPdfAction((adapter) =>
      adapter.goTo({
        kind: "pdf",
        page,
        scale: positionRef.current?.scale,
        zoomMode: positionRef.current?.zoomMode,
      }),
    );
  }, [pageInput, runPdfAction]);

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

    void adapter
      .goToProgress(nextProgression)
      .then(renderVisiblePages)
      .catch((progressError: unknown) => {
        setPreviewPosition(null);
        setError(getErrorMessage(progressError));
      });
  }, [renderVisiblePages]);

  const activeProgress = previewPosition ?? position;
  const visiblePageNumbers =
    position === null ? [] : getPdfVisiblePageNumbers(position);
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
    requestedViewMode === "double" && position?.renderedMode === "single"
      ? "Double view will resume when the window is wide enough."
      : undefined;

  return (
    <section
      className="reader-viewport reader-viewport--pdf"
      aria-label={`${book.title} content`}
    >
      <article className="reader-page reader-page--pdf">
        <div ref={frameRef} className="reader-pdf-frame">
          {isLoading ? (
            <section
              className="reader-state reader-state--overlay"
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
              <button
                type="button"
                className="reader-tool-button"
                onClick={onBackToLibrary}
              >
                Back to shelf
              </button>
            </section>
          ) : null}
          <div
            className={`reader-pdf-stage reader-pdf-stage--${position?.renderedMode ?? "single"}`}
            aria-hidden={error !== null}
          >
            {[0, 1].map((index) => (
              <div
                key={index}
                className="reader-pdf-sheet"
                hidden={visiblePageNumbers[index] === undefined}
                onKeyUp={capturePdfSelection}
                onMouseUp={capturePdfSelection}
              >
                <canvas
                  ref={(canvas) => {
                    canvasRefs.current[index] = canvas;
                  }}
                  className="reader-pdf-canvas"
                  aria-label={
                    visiblePageNumbers[index] === undefined
                      ? undefined
                      : `PDF page ${visiblePageNumbers[index]}`
                  }
                />
                <div
                  ref={(textLayer) => {
                    textLayerRefs.current[index] = textLayer;
                  }}
                  className="reader-pdf-text-layer"
                  aria-hidden="true"
                />
                <div className="reader-pdf-highlight-layer" aria-hidden="true">
                  {(pdfHighlightRectsByPage[visiblePageNumbers[index] ?? -1] ?? []).map(
                    (highlight) => (
                      <span
                        key={highlight.id}
                        className="reader-pdf-highlight-rect"
                        style={
                          {
                            "--reader-highlight-color": highlight.color,
                            height: `${highlight.height}px`,
                            left: `${highlight.x}px`,
                            top: `${highlight.y}px`,
                            width: `${highlight.width}px`,
                          } as CSSProperties
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
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
                aria-pressed={requestedViewMode === "single"}
                onClick={() => handleViewModeChange("single")}
              >
                Single
              </button>
              <button
                type="button"
                aria-pressed={requestedViewMode === "double"}
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
        {(["light", "sepia", "green", "dark"] satisfies ReaderThemeMode[]).map(
          (mode) => (
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
          ),
        )}
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
      <input
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={onChange}
      />
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

function formatSidebarTab(tab: ReaderSidebarTab): string {
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

function getBookmarkLabel(
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

function getLocatorLabel(locator: Locator): string {
  if (locator.kind === "txt") {
    return `TXT ${locator.charOffset}`;
  }

  if (locator.kind === "epub") {
    return "EPUB location";
  }

  return `Page ${locator.page}`;
}

function renderHighlightedText(
  block: ReaderVirtualBlock,
  annotations: Annotation[],
): ReactNode {
  const ranges = getTxtHighlightRanges(block, annotations);

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
      fragments.push(
        <mark
          key={`${range.id}-${index}`}
          className="reader-highlight"
          style={{ "--reader-highlight-color": range.color } as CSSProperties}
        >
          {block.text.slice(start, end)}
        </mark>,
      );
    }

    cursor = Math.max(cursor, end);
  });

  if (cursor < block.text.length) {
    fragments.push(block.text.slice(cursor));
  }

  return fragments;
}

function getTxtHighlightRanges(
  block: ReaderVirtualBlock,
  annotations: Annotation[],
): Array<{ id: string; start: number; end: number; color: string }> {
  const blockStart = block.charOffset;
  const blockEnd = block.charOffset + block.text.length;

  return annotations
    .filter(isActiveHighlightAnnotation)
    .flatMap((annotation) => {
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
          start: highlightStart - blockStart,
          end: highlightEnd - blockStart,
          color: annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
        },
      ];
    })
    .sort((firstRange, secondRange) => firstRange.start - secondRange.start);
}

function getEpubHighlightAnnotations(
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

function getPdfHighlightAnnotations(
  annotations: Annotation[],
  page: number,
): Array<Annotation & { locator: PdfLocator }> {
  return annotations.filter(
    (annotation): annotation is Annotation & { locator: PdfLocator } =>
      isActiveHighlightAnnotation(annotation) &&
      annotation.locator.kind === "pdf" &&
      annotation.locator.page === page,
  );
}

function isActiveHighlightAnnotation(annotation: Annotation): boolean {
  return annotation.type === "highlight" && annotation.deletedAt === undefined;
}

function captureTxtSelection(): ReaderSelectionSnapshot | null {
  const selection = window.getSelection();

  if (selection === null || selection.rangeCount === 0) {
    return null;
  }

  const selectedText = selection.toString().trim();

  if (selectedText === "") {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startRow = getSelectionRow(range.startContainer);
  const endRow = getSelectionRow(range.endContainer);

  if (startRow === null || endRow === null || startRow !== endRow) {
    return null;
  }

  const blockText = startRow.dataset.readerBlockText ?? "";
  const selectedIndex = blockText.indexOf(selectedText);
  const blockCharOffset = Number.parseInt(startRow.dataset.charOffset ?? "0", 10);

  if (selectedIndex === -1 || !Number.isFinite(blockCharOffset)) {
    return null;
  }

  const charOffset = blockCharOffset + selectedIndex;
  const endCharOffset = charOffset + selectedText.length;
  const rect = range.getBoundingClientRect();

  return {
    locator: {
      kind: "txt",
      chapterId: startRow.dataset.chapterId,
      charOffset,
      endCharOffset,
      selectedText,
      contextBefore: blockText.slice(Math.max(0, selectedIndex - 80), selectedIndex),
      contextAfter: blockText.slice(selectedIndex + selectedText.length, selectedIndex + selectedText.length + 80),
    },
    selectedText,
    contextBefore: blockText.slice(Math.max(0, selectedIndex - 80), selectedIndex),
    contextAfter: blockText.slice(selectedIndex + selectedText.length, selectedIndex + selectedText.length + 80),
    menuX: rect.left + rect.width / 2,
    menuY: Math.max(72, rect.top - 48),
  };
}

function getSelectionRow(node: Node): HTMLElement | null {
  const element =
    node instanceof Element
      ? node
      : node.parentNode instanceof Element
        ? node.parentNode
        : null;
  return element?.closest<HTMLElement>(".reader-virtual-row") ?? null;
}

function getPdfTextLayer(node: Node): HTMLElement | null {
  const element =
    node instanceof Element
      ? node
      : node.parentNode instanceof Element
        ? node.parentNode
        : null;
  return element?.closest<HTMLElement>(".reader-pdf-text-layer") ?? null;
}

function flattenTocItems(
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
  return findTocItemByHref(items, href)?.id ?? null;
}

function findTocItemByHref(items: TocItem[], href: string): TocItem | null {
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

function findTocItemIdByPdfPage(items: TocItem[], page: number): string | null {
  return findTocItemByPdfPage(items, page)?.id ?? null;
}

function findTocItemByPdfPage(items: TocItem[], page: number): TocItem | null {
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

function epubHrefsMatch(firstHref: string, secondHref: string): boolean {
  const first = normalizeEpubHref(firstHref);
  const second = normalizeEpubHref(secondHref);

  if (first.length === 0 || second.length === 0) {
    return false;
  }

  return (
    first === second || first.endsWith(`/${second}`) || second.endsWith(`/${first}`)
  );
}

function normalizeEpubHref(href: string): string {
  return (href.split("#")[0] ?? href).replaceAll("\\", "/").replace(/^\/+/, "");
}

function getPdfVisiblePageNumbers(position: PdfPosition): number[] {
  if (position.renderedMode === "single") {
    return [position.page];
  }

  return [position.page, position.page + 1].filter(
    (page) => page <= position.totalPages,
  );
}

function getPdfPageLabel(position: PdfPosition): string {
  const visiblePages = getPdfVisiblePageNumbers(position);

  if (visiblePages.length === 2) {
    return `Pages ${visiblePages[0]}-${visiblePages[1]} / ${position.totalPages}`;
  }

  return `Page ${position.page} / ${position.totalPages}`;
}

function normalizeReaderPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.floor(totalPages)));
}

function pageToProgression(page: number, totalPages: number): number {
  const normalizedTotalPages = Math.max(1, Math.floor(totalPages));

  if (normalizedTotalPages <= 1) {
    return 0;
  }

  return (
    (normalizeReaderPage(page, normalizedTotalPages) - 1) / (normalizedTotalPages - 1)
  );
}

function getPdfPageSlotWidth(
  frame: HTMLDivElement | null,
  position: PdfPosition | null,
): number {
  const frameWidth = frame?.clientWidth ?? 760;
  const renderedPages = position?.renderedMode === "double" ? 2 : 1;
  const totalGap = renderedPages === 2 ? 18 : 0;
  const horizontalPadding = 32;

  return Math.max(260, (frameWidth - horizontalPadding - totalGap) / renderedPages);
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

function findProgressTargetIndex(
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

function buildEstimatedVirtualItems(
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

function findEstimatedIndexAtOffset(
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

function estimateTotalSize(blocks: ReaderVirtualBlock[]): number {
  return blocks.reduce(
    (totalSize, block) => totalSize + estimateVirtualBlockSize(block),
    0,
  );
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
