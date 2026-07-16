import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Book, type ImportBookResult } from "@reader/core";

import "./App.css";
import {
  Bookshelf,
  type BookActionMenuState,
  type Feedback,
  type LibraryView,
  type ViewMode,
} from "./library/Bookshelf";
import {
  loadBookProgressSummaries,
  type BookProgressSummary,
} from "./library/bookProgress";
import { listenForOpenBookFiles, takePendingOpenFiles } from "./tauri/fileOpen";
import {
  importBook,
  listBooks,
  markBookOpened,
  pickBookFile,
  removeBook,
} from "./tauri/library";

const LazyReaderShell = lazy(() =>
  import("./components/ReaderShell").then((module) => ({
    default: module.ReaderShell,
  })),
);

const LazySettingsCenter = lazy(() =>
  import("./settings/DataBackupSettings").then((module) => ({
    default: module.SettingsCenter,
  })),
);

function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [libraryView, setLibraryView] = useState<LibraryView>("shelf");
  const [progressByBookId, setProgressByBookId] = useState<BookProgressSummary>({});
  const [readerBook, setReaderBook] = useState<Book | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bookActionMenu, setBookActionMenu] = useState<BookActionMenuState | null>(
    null,
  );
  const [bookPendingRemoval, setBookPendingRemoval] = useState<Book | null>(null);
  const [removingBookId, setRemovingBookId] = useState<string | null>(null);
  const lastBookActionTriggerRef = useRef<HTMLElement | null>(null);
  const coverQueueRef = useRef<Book[]>([]);
  const queuedCoverIdsRef = useRef(new Set<string>());
  const isCoverWorkerActiveRef = useRef(false);
  const isAppMountedRef = useRef(true);
  const libraryRequestIdRef = useRef(0);

  const processCoverQueue = useCallback(async () => {
    if (isCoverWorkerActiveRef.current) {
      return;
    }

    isCoverWorkerActiveRef.current = true;

    try {
      const { prepareBookCover } = await import("./covers/bookCovers");

      while (coverQueueRef.current.length > 0) {
        const queuedBook = coverQueueRef.current.shift();

        if (queuedBook === undefined) {
          continue;
        }

        try {
          const updatedBook = await prepareBookCover(queuedBook);

          if (isAppMountedRef.current) {
            setBooks((currentBooks) =>
              currentBooks.some((book) => book.id === updatedBook.id)
                ? upsertBook(currentBooks, updatedBook)
                : currentBooks,
            );
          }
        } finally {
          queuedCoverIdsRef.current.delete(queuedBook.id);
        }
      }
    } finally {
      isCoverWorkerActiveRef.current = false;
    }
  }, []);

  useEffect(() => {
    isAppMountedRef.current = true;

    return () => {
      isAppMountedRef.current = false;
    };
  }, []);

  const loadLibrary = useCallback(async () => {
    const requestId = libraryRequestIdRef.current + 1;
    libraryRequestIdRef.current = requestId;
    setIsLoading(true);
    setLibraryError(null);

    try {
      const loadedBooks = await listBooks();

      if (isAppMountedRef.current && libraryRequestIdRef.current === requestId) {
        setBooks(sortBooksForShelf(loadedBooks));
      }
    } catch (error) {
      if (isAppMountedRef.current && libraryRequestIdRef.current === requestId) {
        setLibraryError(getErrorMessage(error));
      }
    } finally {
      if (isAppMountedRef.current && libraryRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    for (const book of books) {
      if (book.coverStatus !== "pending" || queuedCoverIdsRef.current.has(book.id)) {
        continue;
      }

      queuedCoverIdsRef.current.add(book.id);
      coverQueueRef.current.push(book);
    }

    if (coverQueueRef.current.length > 0) {
      const timeoutId = window.setTimeout(() => {
        void processCoverQueue();
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [books, processCoverQueue]);

  const sortedBooks = useMemo(() => sortBooksForShelf(books), [books]);

  useEffect(() => {
    if (readerBook !== null) {
      return;
    }

    let isCurrent = true;

    void loadBookProgressSummaries(sortedBooks.map((book) => book.id)).then(
      (nextSummaries) => {
        if (isCurrent) {
          setProgressByBookId(nextSummaries);
        }
      },
      () => {
        if (isCurrent) {
          setProgressByBookId({});
        }
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [readerBook, sortedBooks]);

  const handleImportBook = useCallback(async () => {
    setFeedback(null);
    setIsImporting(true);

    try {
      const selectedPath = await pickBookFile();

      if (selectedPath === null) {
        setFeedback({
          kind: "info",
          title: "Import canceled",
          message: "No file was selected.",
        });
        return;
      }

      const result = await importBook(selectedPath);
      setBooks((currentBooks) => upsertBook(currentBooks, result.book));
      setFeedback(getImportFeedback(result));
    } catch (error) {
      setFeedback({
        actionLabel: "Choose another file",
        kind: "error",
        title: "Import failed",
        message: getErrorMessage(error),
      });
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handleOpenBook = useCallback(async (book: Book) => {
    setBookActionMenu(null);
    setFeedback(null);

    setOpeningBookId(book.id);

    try {
      const openedBook = await markBookOpened(book.id);
      setBooks((currentBooks) => upsertBook(currentBooks, openedBook));
      setReaderBook(openedBook);
    } catch (error) {
      setFeedback({
        actionLabel: "Choose file to repair",
        kind: "error",
        title: "Book could not be opened",
        message: getErrorMessage(error),
      });
    } finally {
      setOpeningBookId(null);
    }
  }, []);

  const handleAssociatedBookFiles = useCallback(
    async (paths: string[]) => {
      const uniquePaths = [...new Set(paths)];

      if (uniquePaths.length === 0) {
        return;
      }

      setFeedback(null);
      setIsImporting(true);
      let firstBook: Book | null = null;
      let firstError: unknown = null;

      try {
        for (const path of uniquePaths) {
          try {
            const result = await importBook(path);
            firstBook ??= result.book;
            setBooks((currentBooks) => upsertBook(currentBooks, result.book));
          } catch (error) {
            firstError ??= error;
          }
        }
      } finally {
        setIsImporting(false);
      }

      if (firstBook !== null) {
        await handleOpenBook(firstBook);
        return;
      }

      setFeedback({
        actionLabel: "Choose another file",
        kind: "error",
        title: "Associated file could not be opened",
        message: getErrorMessage(firstError),
      });
    },
    [handleOpenBook],
  );

  useEffect(() => {
    let canceled = false;
    let stopListening: (() => void) | undefined;
    let listenerReady = false;
    const earlyPaths: string[] = [];

    const receivePaths = (paths: string[]) => {
      if (!listenerReady) {
        earlyPaths.push(...paths);
        return;
      }

      void handleAssociatedBookFiles(paths);
    };

    const initialize = async () => {
      try {
        stopListening = await listenForOpenBookFiles(receivePaths);
      } catch (error) {
        if (!canceled) {
          setFeedback({
            kind: "error",
            title: "File opening is unavailable",
            message: getErrorMessage(error),
          });
        }
      }

      if (canceled) {
        stopListening?.();
        return;
      }

      await loadLibrary();

      if (canceled) {
        return;
      }

      let pendingPaths: string[] = [];

      try {
        pendingPaths = await takePendingOpenFiles();
      } catch (error) {
        setFeedback({
          kind: "error",
          title: "Associated file could not be opened",
          message: getErrorMessage(error),
        });
      }

      if (canceled) {
        return;
      }

      listenerReady = true;
      const queuedPaths = [...pendingPaths, ...earlyPaths];
      earlyPaths.length = 0;

      if (queuedPaths.length > 0) {
        await handleAssociatedBookFiles(queuedPaths);
      }
    };

    const timeoutId = window.setTimeout(() => {
      void initialize();
    }, 0);

    return () => {
      canceled = true;
      window.clearTimeout(timeoutId);
      stopListening?.();
    };
  }, [handleAssociatedBookFiles, loadLibrary]);

  const closeBookActionMenu = useCallback(() => {
    const trigger = bookActionMenu?.trigger ?? null;
    setBookActionMenu(null);
    focusElementSoon(trigger);
  }, [bookActionMenu]);

  const showBookActionMenu = useCallback(
    (book: Book, x: number, y: number, trigger: HTMLElement | null) => {
      lastBookActionTriggerRef.current = trigger;
      setBookActionMenu({
        book,
        trigger,
        x,
        y,
      });
    },
    [],
  );

  const requestBookRemoval = useCallback((book: Book) => {
    setBookActionMenu(null);
    setBookPendingRemoval(book);
  }, []);

  const cancelBookRemoval = useCallback(() => {
    setBookPendingRemoval(null);
    focusElementSoon(lastBookActionTriggerRef.current);
  }, []);

  const confirmBookRemoval = useCallback(async () => {
    if (bookPendingRemoval === null) {
      return;
    }

    setFeedback(null);
    setRemovingBookId(bookPendingRemoval.id);

    try {
      await removeBook(bookPendingRemoval.id);
      setBooks((currentBooks) =>
        currentBooks.filter((currentBook) => currentBook.id !== bookPendingRemoval.id),
      );
      setFeedback({
        kind: "success",
        title: "Book removed",
        message: `${bookPendingRemoval.title} was removed from this shelf.`,
      });
      setBookPendingRemoval(null);
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Remove failed",
        message: getErrorMessage(error),
      });
    } finally {
      setRemovingBookId(null);
    }
  }, [bookPendingRemoval]);

  const handleBackToLibrary = useCallback(() => {
    setReaderBook(null);
  }, []);

  const handleSetViewMode = useCallback(
    (mode: ViewMode, animate: boolean) => {
      if (mode === viewMode) {
        return;
      }

      const documentWithTransitions = document as Document & {
        startViewTransition?: (update: () => void) => { finished: Promise<void> };
      };
      const shouldReduceMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

      if (
        !animate ||
        shouldReduceMotion ||
        documentWithTransitions.startViewTransition === undefined
      ) {
        setViewMode(mode);
        return;
      }

      documentWithTransitions.startViewTransition(() => setViewMode(mode));
    },
    [viewMode],
  );

  const handleSelectLibraryView = useCallback((view: LibraryView) => {
    setLibraryView(view);
    setBookActionMenu(null);
  }, []);

  const handleDismissFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  if (readerBook !== null) {
    return (
      <Suspense
        fallback={
          <main className="reader-loading-state" role="status" aria-live="polite">
            Loading reader...
          </main>
        }
      >
        <LazyReaderShell book={readerBook} onBackToLibrary={handleBackToLibrary} />
      </Suspense>
    );
  }

  if (isSettingsOpen) {
    return (
      <Suspense
        fallback={
          <main className="reader-loading-state" role="status" aria-live="polite">
            Loading settings...
          </main>
        }
      >
        <LazySettingsCenter onClose={() => setIsSettingsOpen(false)} />
      </Suspense>
    );
  }

  return (
    <Bookshelf
      activeLibraryView={libraryView}
      bookActionMenu={bookActionMenu}
      bookPendingRemoval={bookPendingRemoval}
      books={sortedBooks}
      feedback={feedback}
      isImporting={isImporting}
      isLoading={isLoading}
      libraryError={libraryError}
      openingBookId={openingBookId}
      progressByBookId={progressByBookId}
      removingBookId={removingBookId}
      viewMode={viewMode}
      onCancelRemoval={cancelBookRemoval}
      onCloseBookMenu={closeBookActionMenu}
      onConfirmRemoval={confirmBookRemoval}
      onDismissFeedback={handleDismissFeedback}
      onImportBook={handleImportBook}
      onOpenBook={handleOpenBook}
      onOpenSettings={() => setIsSettingsOpen(true)}
      onRequestRemoval={requestBookRemoval}
      onRetryLibrary={loadLibrary}
      onSelectLibraryView={handleSelectLibraryView}
      onSetViewMode={handleSetViewMode}
      onShowBookMenu={showBookActionMenu}
    />
  );
}

function getImportFeedback(result: ImportBookResult): Feedback {
  if (result.status === "duplicate") {
    return {
      kind: "info",
      title: "Already in library",
      message: `${result.book.title} is already on this shelf.`,
    };
  }

  if (result.status === "repaired") {
    return {
      kind: "success",
      title: "Library copy repaired",
      message: `${result.book.title} is available again.`,
    };
  }

  return {
    kind: "success",
    title: "Import complete",
    message: `Imported ${result.book.title}.`,
  };
}

function upsertBook(books: Book[], book: Book): Book[] {
  const existingIndex = books.findIndex((currentBook) => currentBook.id === book.id);

  if (existingIndex === -1) {
    return sortBooksForShelf([book, ...books]);
  }

  const nextBooks = books.slice();
  nextBooks[existingIndex] = book;
  return sortBooksForShelf(nextBooks);
}

function sortBooksForShelf(books: Book[]): Book[] {
  return books.slice().sort((first, second) => {
    const firstTime = getRecentTime(first);
    const secondTime = getRecentTime(second);

    if (firstTime !== secondTime) {
      return secondTime - firstTime;
    }

    return first.title.localeCompare(second.title);
  });
}

function getRecentTime(book: Book): number {
  return Date.parse(book.lastOpenedAt ?? book.createdAt);
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

function focusElementSoon(element: HTMLElement | null): void {
  if (element === null) {
    return;
  }

  window.requestAnimationFrame(() => {
    element.focus();
  });
}

export default App;
