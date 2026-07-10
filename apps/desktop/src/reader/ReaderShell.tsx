import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  type Annotation,
  type Bookmark,
  defaultReaderLayoutPreferences,
  defaultReaderTheme,
  type Book,
  type EpubLocator,
  type Locator,
  type PdfLocator,
  type ReaderProgress,
  type ReaderLayoutPreferences,
  type ReaderTheme,
  type SearchHit,
  type TocItem,
  type TxtDocument,
  type TxtLocator,
} from "@reader/core";
import "../components/ReaderShell.css";

import {
  createAnnotation,
  createBookmark,
  deleteAnnotation,
  deleteBookmark,
  getReaderLayoutPreferences,
  getReaderTheme,
  getReadingProgress,
  listAnnotations,
  listBookmarks,
  openTxtBook,
  saveReaderTheme,
  saveReadingProgress,
  saveReaderLayoutPreferences,
  updateAnnotation,
} from "../tauri/reader";
import {
  findMatchingHighlightAnnotations,
  findMatchingNoteAnnotations,
  findTocItemById,
  findTocItemByPdfPage,
  findTocItemIdByHref,
  focusElementSoon,
  formatBookFormat,
  getBookmarkLabel,
  getErrorMessage,
  getNoteEditorAnchor,
  isEditableKeyboardTarget,
  mapTxtChapterToTocItem,
  MemoizedEpubReaderContent,
  MemoizedPdfReaderContent,
  MemoizedTxtReaderContent,
  mergeUpdatedAnnotations,
  searchTxtDocument,
  splitChapterParagraphs,
} from "./ReaderFormatContents";
import { NoteEditor, NotePopover, SelectionMenu } from "./ReaderOverlays";
import {
  clampSidebarWidth,
  MemoizedReaderSidebar,
  type ReaderSidebarTab,
} from "./ReaderSidebar";
import { ReaderThemePanel } from "./ReaderThemePanel";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  getLocatorLabel,
} from "./readerAnnotationPresentation";
import type {
  ReaderMenuAnchor,
  ReaderNoteEditorState,
  ReaderNotePopoverState,
  ReaderSelectionSnapshot,
} from "./readerUiTypes";
import { useReaderNavigationController } from "./useReaderNavigationController";

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

export interface ReaderShellProps {
  book: Book;
  onBackToLibrary: () => void;
}

type ReaderSearchProvider = (query: string) => Promise<Array<SearchHit<Locator>>>;

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

export function ReaderShell({ book, onBackToLibrary }: ReaderShellProps) {
  const searchProviderRef = useRef<ReaderSearchProvider | null>(null);
  const [document, setDocument] = useState<TxtDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(book.format === "txt");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChromeHidden, setIsChromeHidden] = useState(false);
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [isFormatOverlayOpen, setIsFormatOverlayOpen] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>(defaultReaderTheme);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [layoutPreferences, setLayoutPreferences] = useState<ReaderLayoutPreferences>(
    defaultReaderLayoutPreferences,
  );
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [readingProgress, setReadingProgress] =
    useState<ReaderProgress<TxtLocator> | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Array<Bookmark<Locator>>>([]);
  const [bookmarksBookId, setBookmarksBookId] = useState(book.id);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsBookId, setAnnotationsBookId] = useState(book.id);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [noteSaveError, setNoteSaveError] = useState<string | null>(null);
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<SearchHit<Locator>>>([]);
  const [currentBookmarkPosition, setCurrentBookmarkPosition] = useState<{
    bookId: string;
    locator: Locator;
  } | null>(null);
  const [selectionSnapshot, setSelectionSnapshot] =
    useState<ReaderSelectionSnapshot | null>(null);
  const [noteEditor, setNoteEditor] = useState<ReaderNoteEditorState | null>(null);
  const [notePopover, setNotePopover] = useState<ReaderNotePopoverState | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement | null>(null);
  const noteEditorRef = useRef<HTMLFormElement | null>(null);
  const notePopoverRef = useRef<HTMLDivElement | null>(null);
  const { navigate, register: handleNavigationActionsChange } =
    useReaderNavigationController();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const focusButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const layoutSaveTimerRef = useRef<number | null>(null);
  const [sidebarTab, setSidebarTab] = useState<ReaderSidebarTab>("contents");
  const [activeTocItemId, setActiveTocItemId] = useState<string | null>(null);
  const [txtJumpRequest, setTxtJumpRequest] = useState<TxtJumpRequest | null>(null);
  const [epubJumpRequest, setEpubJumpRequest] = useState<EpubJumpRequest | null>(null);
  const [pdfJumpRequest, setPdfJumpRequest] = useState<PdfJumpRequest | null>(null);
  const [txtRetryVersion, setTxtRetryVersion] = useState(0);
  const shortcutStateRef = useRef({
    isChromeHidden,
    isSidebarOpen,
    isThemePanelOpen,
    isFormatOverlayOpen,
    noteEditor,
    notePopover,
    selectionSnapshot,
  });

  useEffect(() => {
    shortcutStateRef.current = {
      isChromeHidden,
      isSidebarOpen,
      isThemePanelOpen,
      isFormatOverlayOpen,
      noteEditor,
      notePopover,
      selectionSnapshot,
    };
  }, [
    isChromeHidden,
    isSidebarOpen,
    isThemePanelOpen,
    isFormatOverlayOpen,
    noteEditor,
    notePopover,
    selectionSnapshot,
  ]);

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

    void getReaderLayoutPreferences()
      .then((savedPreferences) => {
        if (isCurrent) {
          setLayoutPreferences(savedPreferences);
          setLayoutError(null);
        }
      })
      .catch((layoutLoadError: unknown) => {
        if (isCurrent) {
          setLayoutError(getErrorMessage(layoutLoadError));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [book.id]);

  useEffect(
    () => () => {
      if (layoutSaveTimerRef.current !== null) {
        window.clearTimeout(layoutSaveTimerRef.current);
      }
    },
    [],
  );

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
  }, [book.format, book.id, txtRetryVersion]);

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
  const visibleAnnotations = useMemo(
    () => (annotationsBookId === book.id ? annotations : []),
    [annotations, annotationsBookId, book.id],
  );
  const visibleAnnotationError = annotationsBookId === book.id ? annotationError : null;
  const currentBookmarkLocator =
    currentBookmarkPosition?.bookId === book.id
      ? currentBookmarkPosition.locator
      : null;

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    focusElementSoon(sidebarToggleRef);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isSidebarOpen) {
      closeSidebar();
      return;
    }

    setIsSidebarOpen(true);
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      focusElementSoon(sidebarCloseButtonRef);
    }
  }, [closeSidebar, isSidebarOpen]);

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
    focusElementSoon(focusButtonRef);
  }, []);

  const handleThemeChange = useCallback((nextTheme: ReaderTheme) => {
    setTheme(nextTheme);
    setThemeError(null);

    void saveReaderTheme(nextTheme).catch((saveError: unknown) => {
      setThemeError(getErrorMessage(saveError));
    });
  }, []);

  const handleSidebarWidthChange = useCallback((sidebarWidth: number) => {
    const nextPreferences = {
      sidebarWidth: clampSidebarWidth(sidebarWidth),
    };
    setLayoutPreferences(nextPreferences);
    setLayoutError(null);

    if (layoutSaveTimerRef.current !== null) {
      window.clearTimeout(layoutSaveTimerRef.current);
    }

    layoutSaveTimerRef.current = window.setTimeout(() => {
      layoutSaveTimerRef.current = null;
      void saveReaderLayoutPreferences(nextPreferences).catch(
        (layoutSaveError: unknown) => {
          setLayoutError(getErrorMessage(layoutSaveError));
        },
      );
    }, 250);
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
          handleTxtProgressChange(
            locator,
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

  const handleSearchProviderChange = useCallback(
    (provider: ReaderSearchProvider | null) => {
      searchProviderRef.current = provider;
    },
    [],
  );

  const handleSearchSubmit = useCallback(
    (query: string) => {
      const trimmedQuery = query.trim();
      setSearchQuery(query);
      setSearchError(null);

      if (trimmedQuery === "") {
        setSearchResults([]);
        setIsSearchLoading(false);
        return;
      }

      if (book.format === "txt") {
        if (document === null) {
          setSearchResults([]);
          setSearchError("Search is still loading.");
          setIsSearchLoading(false);
          return;
        }

        setSearchResults(searchTxtDocument(document, trimmedQuery));
        setIsSearchLoading(false);
        return;
      }

      const searchProvider = searchProviderRef.current;

      if (searchProvider === null) {
        setSearchResults([]);
        setSearchError("Search is still loading.");
        setIsSearchLoading(false);
        return;
      }

      setIsSearchLoading(true);
      void searchProvider(trimmedQuery)
        .then((hits) => {
          setSearchResults(hits.slice(0, 100));
          setSearchError(null);
        })
        .catch((searchFailure: unknown) => {
          setSearchResults([]);
          setSearchError(getErrorMessage(searchFailure));
        })
        .finally(() => {
          setIsSearchLoading(false);
        });
    },
    [book.format, document],
  );

  const handleJumpToSearchResult = useCallback(
    (hit: SearchHit<Locator>) => {
      handleJumpToLocator(hit.locator);
      setSidebarTab("search");
    },
    [handleJumpToLocator],
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

  const handleJumpToAnnotation = useCallback(
    (annotation: Annotation) => {
      handleJumpToLocator(annotation.locator);
      setSidebarTab("notes");
    },
    [handleJumpToLocator],
  );

  const handleDeleteAnnotation = useCallback((annotationId: string) => {
    setAnnotationError(null);

    void deleteAnnotation(annotationId)
      .then(() => {
        setAnnotations((currentAnnotations) =>
          currentAnnotations.filter((annotation) => annotation.id !== annotationId),
        );
      })
      .catch((annotationDeleteError: unknown) => {
        setAnnotationError(getErrorMessage(annotationDeleteError));
      });
  }, []);

  const handleSelectionChange = useCallback(
    (snapshot: ReaderSelectionSnapshot | null) => {
      setSelectionSnapshot(snapshot);
      if (snapshot !== null) {
        setNoteEditor(null);
        setNotePopover(null);
      }
    },
    [],
  );

  const handleClearSelectionUi = useCallback(() => {
    setSelectionSnapshot(null);
    setNoteEditor(null);
    setNotePopover(null);
  }, []);

  const handleBlockingOverlayChange = useCallback(
    (isOpen: boolean) => {
      setIsFormatOverlayOpen(isOpen);

      if (isOpen) {
        setIsThemePanelOpen(false);
        handleClearSelectionUi();
      }
    },
    [handleClearSelectionUi],
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        selectionMenuRef.current?.contains(target) === true ||
        noteEditorRef.current?.contains(target) === true ||
        notePopoverRef.current?.contains(target) === true
      ) {
        return;
      }

      setSelectionSnapshot(null);
      setNoteEditor(null);
      setNotePopover(null);
    };

    window.document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const handleReaderKeyDown = useCallback(
    (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const shortcutState = shortcutStateRef.current;
      const normalizedKey = event.key.toLocaleLowerCase();

      if (shortcutState.isFormatOverlayOpen) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && normalizedKey === "f") {
        event.preventDefault();
        setIsChromeHidden(false);
        setIsThemePanelOpen(false);
        setIsSidebarOpen(true);
        setSidebarTab("search");
        focusElementSoon(searchInputRef);
        return;
      }

      if (event.key === "Escape") {
        if (
          shortcutState.selectionSnapshot !== null ||
          shortcutState.noteEditor !== null ||
          shortcutState.notePopover !== null
        ) {
          event.preventDefault();
          setSelectionSnapshot(null);
          setNoteEditor(null);
          setNotePopover(null);
          return;
        }

        if (shortcutState.isThemePanelOpen) {
          event.preventDefault();
          setIsThemePanelOpen(false);
          return;
        }

        if (shortcutState.isSidebarOpen) {
          event.preventDefault();
          setIsSidebarOpen(false);
          focusElementSoon(sidebarToggleRef);
          return;
        }

        if (shortcutState.isChromeHidden) {
          event.preventDefault();
          setIsChromeHidden(false);
          focusElementSoon(focusButtonRef);
        }
        return;
      }

      if (
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      if (!navigate(event.key === "ArrowLeft" ? "previous" : "next")) return;
      event.preventDefault();
      setSelectionSnapshot(null);
      setNoteEditor(null);
      setNotePopover(null);
    },
    [navigate],
  );

  useEffect(() => {
    window.document.addEventListener("keydown", handleReaderKeyDown);

    return () => {
      window.document.removeEventListener("keydown", handleReaderKeyDown);
    };
  }, [handleReaderKeyDown]);

  const handleCopySelection = useCallback(() => {
    const selectedText = selectionSnapshot?.selectedText;

    if (selectedText === undefined || selectedText.trim() === "") {
      return;
    }

    void navigator.clipboard?.writeText(selectedText).catch(() => undefined);
    setSelectionSnapshot(null);
    setNotePopover(null);
  }, [selectionSnapshot]);

  const handlePendingHighlight = useCallback(
    (color = DEFAULT_HIGHLIGHT_COLOR) => {
      const snapshot = selectionSnapshot;

      if (snapshot === null) {
        return;
      }

      setAnnotationError(null);
      setSelectionSnapshot(null);
      setNotePopover(null);

      const matchingHighlights = findMatchingHighlightAnnotations(
        visibleAnnotations,
        snapshot,
      );

      if (matchingHighlights.length > 0) {
        void Promise.all(
          matchingHighlights.map((annotation) =>
            updateAnnotation(annotation.id, color, annotation.note),
          ),
        )
          .then((updatedAnnotations) => {
            setAnnotations((currentAnnotations) =>
              mergeUpdatedAnnotations(currentAnnotations, updatedAnnotations),
            );
          })
          .catch((annotationUpdateError: unknown) => {
            setAnnotationsBookId(book.id);
            setAnnotationError(getErrorMessage(annotationUpdateError));
          });
        return;
      }

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
    [book.id, selectionSnapshot, visibleAnnotations],
  );

  const handlePendingNote = useCallback(() => {
    const snapshot = selectionSnapshot;

    if (snapshot === null) {
      return;
    }

    setSelectionSnapshot(null);
    setNotePopover(null);
    const noteAnchor = getNoteEditorAnchor(snapshot);

    setNoteEditor({
      color: DEFAULT_HIGHLIGHT_COLOR,
      contextAfter: snapshot.contextAfter,
      contextBefore: snapshot.contextBefore,
      draft: "",
      locator: snapshot.locator,
      menuX: noteAnchor.menuX,
      menuY: noteAnchor.menuY,
      selectedText: snapshot.selectedText,
    });
  }, [selectionSnapshot]);

  const openNoteEditorForAnnotation = useCallback(
    (annotation: Annotation, anchor: ReaderMenuAnchor) => {
      const noteAnchor = getNoteEditorAnchor(anchor);
      const selectedText =
        annotation.selectedText ??
        annotation.locator.selectedText ??
        getLocatorLabel(annotation.locator);

      setSelectionSnapshot(null);
      setNotePopover(null);
      setNoteEditor({
        annotationId: annotation.id,
        color: annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
        contextAfter: annotation.locator.contextAfter,
        contextBefore: annotation.locator.contextBefore,
        draft: annotation.note ?? "",
        locator: annotation.locator,
        menuX: noteAnchor.menuX,
        menuY: noteAnchor.menuY,
        selectedText,
      });
    },
    [],
  );

  const handleAnnotationNotesActivate = useCallback(
    (annotation: Annotation, anchor: ReaderMenuAnchor) => {
      const matchingNotes = findMatchingNoteAnnotations(visibleAnnotations, annotation);

      if (matchingNotes.length === 0) {
        return;
      }

      const popoverAnchor = getNoteEditorAnchor(anchor);
      const selectedText =
        annotation.selectedText ??
        annotation.locator.selectedText ??
        getLocatorLabel(annotation.locator);

      setSelectionSnapshot(null);
      setNoteEditor(null);
      setNotePopover({
        annotations: matchingNotes,
        color: annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
        contextAfter: annotation.locator.contextAfter,
        contextBefore: annotation.locator.contextBefore,
        locator: annotation.locator,
        menuX: popoverAnchor.menuX,
        menuY: popoverAnchor.menuY,
        selectedText,
      });
    },
    [visibleAnnotations],
  );

  const handleEditPopoverAnnotation = useCallback(
    (annotation: Annotation) => {
      const currentPopover = notePopover;

      if (currentPopover === null) {
        return;
      }

      openNoteEditorForAnnotation(annotation, {
        menuX: currentPopover.menuX,
        menuY: currentPopover.menuY,
      });
    },
    [notePopover, openNoteEditorForAnnotation],
  );

  const handleAddNoteFromPopover = useCallback(() => {
    const currentPopover = notePopover;

    if (currentPopover === null) {
      return;
    }

    setNotePopover(null);
    setNoteEditor({
      color: currentPopover.color ?? DEFAULT_HIGHLIGHT_COLOR,
      contextAfter: currentPopover.contextAfter,
      contextBefore: currentPopover.contextBefore,
      draft: "",
      locator: currentPopover.locator,
      menuX: currentPopover.menuX,
      menuY: currentPopover.menuY,
      selectedText: currentPopover.selectedText,
    });
  }, [notePopover]);

  const handleCloseNotePopover = useCallback(() => {
    setNotePopover(null);
  }, []);

  const handleNoteDraftChange = useCallback((draft: string) => {
    setNoteSaveError(null);
    setNoteEditor((currentEditor) =>
      currentEditor === null
        ? null
        : {
            ...currentEditor,
            draft,
          },
    );
  }, []);

  const handleCancelNoteEditor = useCallback(() => {
    setNoteSaveError(null);
    setNoteEditor(null);
  }, []);

  const handleSaveNoteEditor = useCallback(() => {
    const editor = noteEditor;

    if (editor === null || isNoteSaving) {
      return;
    }

    setAnnotationError(null);
    setNoteSaveError(null);
    setIsNoteSaving(true);

    if (editor.annotationId !== undefined) {
      void updateAnnotation(editor.annotationId, editor.color, editor.draft)
        .then((updatedAnnotation) => {
          setAnnotations((currentAnnotations) =>
            mergeUpdatedAnnotations(currentAnnotations, [updatedAnnotation]),
          );
          setNoteSaveError(null);
          setNoteEditor(null);
        })
        .catch((annotationUpdateError: unknown) => {
          const message = getErrorMessage(annotationUpdateError);
          setAnnotationError(message);
          setNoteSaveError(message);
        })
        .finally(() => setIsNoteSaving(false));
      return;
    }

    void createAnnotation(
      book.id,
      "note",
      editor.locator,
      editor.color ?? DEFAULT_HIGHLIGHT_COLOR,
      editor.selectedText,
      editor.draft,
    )
      .then((annotation) => {
        setAnnotationsBookId(book.id);
        setAnnotations((currentAnnotations) => [
          annotation,
          ...currentAnnotations.filter(
            (currentAnnotation) => currentAnnotation.id !== annotation.id,
          ),
        ]);
        setNoteSaveError(null);
        setNoteEditor(null);
      })
      .catch((annotationCreateError: unknown) => {
        setAnnotationsBookId(book.id);
        const message = getErrorMessage(annotationCreateError);
        setAnnotationError(message);
        setNoteSaveError(message);
      })
      .finally(() => setIsNoteSaving(false));
  }, [book.id, isNoteSaving, noteEditor]);

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
        "--reader-sidebar-width": `${layoutPreferences.sidebarWidth}px`,
        ...getReaderThemeTokens(theme),
      }) as CSSProperties,
    [layoutPreferences.sidebarWidth, theme],
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
      {isSidebarOpen ? (
        <button
          type="button"
          className="reader-sidebar-backdrop"
          aria-label="Close contents"
          onClick={closeSidebar}
        />
      ) : null}
      <MemoizedReaderSidebar
        activeTocItemId={activeTocItemId}
        activeTab={sidebarTab}
        annotationError={visibleAnnotationError}
        annotations={visibleAnnotations}
        bookmarks={visibleBookmarks}
        bookmarkError={visibleBookmarkError}
        items={tocItems}
        isOpen={isSidebarOpen}
        layoutError={layoutError}
        label={`${formatBookFormat(book.format)} contents`}
        isSearchLoading={isSearchLoading}
        onBackToLibrary={onBackToLibrary}
        onCreateBookmark={handleCreateBookmark}
        onDeleteAnnotation={handleDeleteAnnotation}
        onDeleteBookmark={handleDeleteBookmark}
        onJumpToAnnotation={handleJumpToAnnotation}
        onJumpToBookmark={handleJumpToBookmark}
        onJumpToItem={handleJumpToTocItem}
        onJumpToSearchResult={handleJumpToSearchResult}
        onSearchQueryChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onClose={closeSidebar}
        onSidebarWidthChange={handleSidebarWidthChange}
        onTabChange={setSidebarTab}
        sidebarCloseButtonRef={sidebarCloseButtonRef}
        sidebarWidth={layoutPreferences.sidebarWidth}
        searchError={searchError}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        searchResults={searchResults}
      />
      <section className="reader-main">
        <header className="reader-topbar">
          <div className="reader-title-group">
            <button
              ref={sidebarToggleRef}
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
              aria-expanded={isSidebarOpen}
              onClick={toggleSidebar}
            >
              Contents
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
              ref={focusButtonRef}
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
          <MemoizedTxtReaderContent
            annotations={visibleAnnotations}
            blocks={blocks}
            document={document}
            error={error}
            initialProgress={readingProgress}
            isLoading={isLoading}
            jumpRequest={txtJumpRequest}
            onActiveChapterChange={setActiveTocItemId}
            onAnnotationActivate={handleAnnotationNotesActivate}
            onProgressChange={handleTxtProgressChange}
            onRetry={() => setTxtRetryVersion((version) => version + 1)}
            onNavigationActionsChange={handleNavigationActionsChange}
            onSelectionChange={handleSelectionChange}
            onBackToLibrary={onBackToLibrary}
          />
        ) : null}
        {book.format === "epub" ? (
          <MemoizedEpubReaderContent
            annotations={visibleAnnotations}
            book={book}
            jumpRequest={epubJumpRequest}
            theme={theme}
            tocItems={tocItems}
            onActiveTocItemChange={setActiveTocItemId}
            onBackToLibrary={onBackToLibrary}
            onBlockingOverlayChange={handleBlockingOverlayChange}
            onAnnotationActivate={handleAnnotationNotesActivate}
            onCurrentLocatorChange={handleCurrentLocatorChange}
            onNavigationActionsChange={handleNavigationActionsChange}
            onReaderKeyDown={handleReaderKeyDown}
            onSelectionCleared={handleClearSelectionUi}
            onSelectionChange={handleSelectionChange}
            onSearchProviderChange={handleSearchProviderChange}
            onTocChange={handleDocumentTocChange}
          />
        ) : null}
        {book.format === "pdf" ? (
          <MemoizedPdfReaderContent
            annotations={visibleAnnotations}
            book={book}
            jumpRequest={pdfJumpRequest}
            theme={theme}
            tocItems={tocItems}
            onActiveTocItemChange={setActiveTocItemId}
            onBackToLibrary={onBackToLibrary}
            onAnnotationActivate={handleAnnotationNotesActivate}
            onCurrentLocatorChange={handleCurrentLocatorChange}
            onNavigationActionsChange={handleNavigationActionsChange}
            onSelectionChange={handleSelectionChange}
            onSearchProviderChange={handleSearchProviderChange}
            onTocChange={handleDocumentTocChange}
          />
        ) : null}
        <ReaderThemePanel
          isOpen={isThemePanelOpen}
          theme={theme}
          themeError={themeError}
          onThemeChange={handleThemeChange}
        />
        <SelectionMenu
          menuRef={selectionMenuRef}
          selection={selectionSnapshot}
          onCopy={handleCopySelection}
          onHighlight={handlePendingHighlight}
          onNote={handlePendingNote}
        />
        <NoteEditor
          editor={noteEditor}
          editorRef={noteEditorRef}
          error={noteSaveError}
          isSaving={isNoteSaving}
          onCancel={handleCancelNoteEditor}
          onDraftChange={handleNoteDraftChange}
          onSave={handleSaveNoteEditor}
        />
        <NotePopover
          popover={notePopover}
          popoverRef={notePopoverRef}
          onAddNote={handleAddNoteFromPopover}
          onClose={handleCloseNotePopover}
          onEditAnnotation={handleEditPopoverAnnotation}
        />
      </section>
    </main>
  );
}
