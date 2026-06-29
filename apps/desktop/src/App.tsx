import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { defaultReaderTheme, type Book, type ImportBookResult } from "@reader/core";

import "./App.css";
import defaultBookCover from "./assets/default-book-cover.jpg";
import { prepareBookCover } from "./covers/bookCovers";
import {
  getBookCoverSource,
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

type FeedbackKind = "success" | "info" | "error";
type ViewMode = "grid" | "list";

interface Feedback {
  actionLabel?: string;
  kind: FeedbackKind;
  title: string;
  message: string;
}

interface BookActionMenuState {
  book: Book;
  trigger: HTMLElement | null;
  x: number;
  y: number;
}

const readerThemeStyle = {
  "--reader-background": defaultReaderTheme.backgroundColor,
  "--reader-foreground": defaultReaderTheme.textColor,
  "--reader-font-family":
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as CSSProperties;

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [readerBook, setReaderBook] = useState<Book | null>(null);
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
    const timeoutId = window.setTimeout(() => {
      void loadLibrary();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadLibrary]);

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

  const showGridView = useCallback(() => {
    setViewMode("grid");
  }, []);

  const showListView = useCallback(() => {
    setViewMode("list");
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

  return (
    <main
      className="app-shell"
      style={readerThemeStyle}
      aria-label="Ebook Reader bookshelf"
    >
      <LibraryRail bookCount={sortedBooks.length} />
      <section className="library-workspace" aria-labelledby="library-title">
        <LibraryHeader
          bookCount={sortedBooks.length}
          isImporting={isImporting}
          viewMode={viewMode}
          onImportBook={handleImportBook}
          onShowGridView={showGridView}
          onShowListView={showListView}
        />
        <FeedbackBanner feedback={feedback} onAction={handleImportBook} />
        <ShelfBody
          books={sortedBooks}
          isLoading={isLoading}
          libraryError={libraryError}
          openingBookId={openingBookId}
          activeMenuBookId={bookActionMenu?.book.id ?? null}
          removingBookId={removingBookId}
          viewMode={viewMode}
          onOpenBook={handleOpenBook}
          onImportBook={handleImportBook}
          onRetryLibrary={loadLibrary}
          onShowBookMenu={showBookActionMenu}
        />
        <BookActionMenu
          menu={bookActionMenu}
          onClose={closeBookActionMenu}
          onRemove={requestBookRemoval}
        />
        <RemoveBookDialog
          book={bookPendingRemoval}
          isRemoving={removingBookId === bookPendingRemoval?.id}
          onCancel={cancelBookRemoval}
          onConfirm={confirmBookRemoval}
        />
      </section>
    </main>
  );
}

interface LibraryRailProps {
  bookCount: number;
}

function LibraryRail({ bookCount }: LibraryRailProps) {
  return (
    <aside className="library-rail" aria-label="Library navigation">
      <div className="rail-mark" aria-hidden="true">
        ER
      </div>
      <nav className="rail-nav" aria-label="Bookshelf views">
        <a className="rail-link rail-link--active" href="#bookshelf">
          <span className="rail-link__icon" aria-hidden="true">
            B
          </span>
          <span>Shelf</span>
        </a>
        <a className="rail-link" href="#bookshelf">
          <span className="rail-link__icon" aria-hidden="true">
            R
          </span>
          <span>Recent</span>
        </a>
      </nav>
      <p className="rail-count" aria-label={`${bookCount} books in library`}>
        {bookCount}
      </p>
    </aside>
  );
}

interface LibraryHeaderProps {
  bookCount: number;
  isImporting: boolean;
  viewMode: ViewMode;
  onImportBook: () => void;
  onShowGridView: () => void;
  onShowListView: () => void;
}

function LibraryHeader({
  bookCount,
  isImporting,
  viewMode,
  onImportBook,
  onShowGridView,
  onShowListView,
}: LibraryHeaderProps) {
  return (
    <header className="library-header">
      <div className="library-heading">
        <p className="library-eyebrow">Local library</p>
        <h1 id="library-title">Ebook Reader</h1>
        <p className="library-meta">
          <span>{bookCount === 1 ? "1 book" : `${bookCount} books`}</span>
          <span>Sorted by Recent reading</span>
        </p>
      </div>
      <div className="library-actions">
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className="view-toggle__button"
            aria-pressed={viewMode === "grid"}
            onClick={onShowGridView}
          >
            Grid
          </button>
          <button
            type="button"
            className="view-toggle__button"
            aria-pressed={viewMode === "list"}
            onClick={onShowListView}
          >
            List
          </button>
        </div>
        <button
          type="button"
          className="import-button"
          disabled={isImporting}
          onClick={onImportBook}
        >
          <span className="import-button__icon" aria-hidden="true" />
          {isImporting ? "Importing..." : "Import book"}
        </button>
      </div>
    </header>
  );
}

interface FeedbackBannerProps {
  feedback: Feedback | null;
  onAction: () => void;
}

function FeedbackBanner({ feedback, onAction }: FeedbackBannerProps) {
  if (feedback === null) {
    return null;
  }

  return (
    <section
      className={`feedback feedback--${feedback.kind}`}
      role={feedback.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <strong>{feedback.title}</strong>
      <span>{feedback.message}</span>
      {feedback.actionLabel !== undefined ? (
        <button type="button" onClick={onAction}>
          {feedback.actionLabel}
        </button>
      ) : null}
    </section>
  );
}

interface ShelfBodyProps {
  books: Book[];
  isLoading: boolean;
  libraryError: string | null;
  openingBookId: string | null;
  activeMenuBookId: string | null;
  removingBookId: string | null;
  viewMode: ViewMode;
  onOpenBook: (book: Book) => void;
  onImportBook: () => void;
  onRetryLibrary: () => void;
  onShowBookMenu: (
    book: Book,
    x: number,
    y: number,
    trigger: HTMLElement | null,
  ) => void;
}

function ShelfBody({
  books,
  isLoading,
  libraryError,
  openingBookId,
  activeMenuBookId,
  removingBookId,
  viewMode,
  onOpenBook,
  onImportBook,
  onRetryLibrary,
  onShowBookMenu,
}: ShelfBodyProps) {
  if (isLoading) {
    return (
      <section
        className="shelf-state"
        role="status"
        aria-live="polite"
        aria-label="Loading library"
      >
        <div className="loading-line" aria-hidden="true" />
        <p>Loading library...</p>
      </section>
    );
  }

  if (libraryError !== null) {
    return (
      <section className="shelf-state shelf-state--error" role="alert">
        <h2>Library could not be loaded</h2>
        <p>{libraryError}</p>
        <button type="button" onClick={onRetryLibrary}>
          Retry
        </button>
      </section>
    );
  }

  if (books.length === 0) {
    return <EmptyShelf onImportBook={onImportBook} />;
  }

  return (
    <section
      id="bookshelf"
      className={`book-shelf book-shelf--${viewMode}`}
      aria-label="Library books"
    >
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          isOpening={openingBookId === book.id}
          isMenuOpen={activeMenuBookId === book.id}
          isRemoving={removingBookId === book.id}
          onOpenBook={onOpenBook}
          onShowBookMenu={onShowBookMenu}
        />
      ))}
    </section>
  );
}

function EmptyShelf({ onImportBook }: { onImportBook: () => void }) {
  return (
    <section className="empty-shelf" aria-labelledby="empty-shelf-title">
      <div className="empty-shelf__mark" aria-hidden="true">
        +
      </div>
      <h2 id="empty-shelf-title">Your library is empty</h2>
      <p>No books in your local shelf yet.</p>
      <button type="button" onClick={onImportBook}>
        Choose a book
      </button>
    </section>
  );
}

interface BookCardProps {
  book: Book;
  isMenuOpen: boolean;
  isOpening: boolean;
  isRemoving: boolean;
  onOpenBook: (book: Book) => void;
  onShowBookMenu: (
    book: Book,
    x: number,
    y: number,
    trigger: HTMLElement | null,
  ) => void;
}

function BookCard({
  book,
  isMenuOpen,
  isOpening,
  isRemoving,
  onOpenBook,
  onShowBookMenu,
}: BookCardProps) {
  const handleOpenBook = useCallback(() => {
    onOpenBook(book);
  }, [book, onOpenBook]);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      onShowBookMenu(book, event.clientX, event.clientY, event.currentTarget);
    },
    [book, onShowBookMenu],
  );

  const handleMenuButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onShowBookMenu(book, rect.left, rect.bottom + 8, event.currentTarget);
    },
    [book, onShowBookMenu],
  );

  return (
    <article
      className="book-card"
      aria-label={`${book.title} book`}
      onContextMenu={handleContextMenu}
    >
      <BookCover book={book} />
      <div className="book-card__body">
        <div className="book-card__top">
          <div className="book-card__copy">
            <p className="book-card__activity">{getBookActivityLabel(book)}</p>
            <h2>{book.title}</h2>
            <p>{book.author ?? "Unknown author"}</p>
          </div>
          <button
            type="button"
            className="book-card__menu-button"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`More actions for ${book.title}`}
            onClick={handleMenuButtonClick}
          >
            <span aria-hidden="true">...</span>
          </button>
        </div>
        <button
          type="button"
          className="book-card__action"
          disabled={isOpening || isRemoving}
          onClick={handleOpenBook}
        >
          {isRemoving ? "Removing..." : isOpening ? "Opening..." : "Continue"}
        </button>
      </div>
    </article>
  );
}

function BookCover({ book }: { book: Book }) {
  const [source, setSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    void getBookCoverSource(book).then(
      (nextSource) => {
        if (isCurrent) {
          setSource(nextSource);
        }
      },
      () => {
        if (isCurrent) {
          setSource(null);
        }
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [book]);

  const showsExtractedCover = source !== null && source !== failedSource;
  const fallbackStyle = {
    backgroundImage: `linear-gradient(180deg, rgba(17, 31, 33, 0.04), rgba(17, 31, 33, 0.5)), url(${defaultBookCover})`,
  } as CSSProperties;

  return (
    <div
      className={`book-card__cover${showsExtractedCover ? " book-card__cover--image" : ""}`}
      style={showsExtractedCover ? undefined : fallbackStyle}
      aria-hidden="true"
    >
      {showsExtractedCover ? (
        <img src={source} alt="" onError={() => setFailedSource(source)} />
      ) : (
        <strong title={book.title}>{book.title}</strong>
      )}
      <span>{formatBookFormat(book.format)}</span>
    </div>
  );
}

interface BookActionMenuProps {
  menu: BookActionMenuState | null;
  onClose: () => void;
  onRemove: (book: Book) => void;
}

function BookActionMenu({ menu, onClose, onRemove }: BookActionMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (menu === null) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        menuRef.current !== null &&
        !menuRef.current.contains(event.target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, onClose]);

  if (menu === null) {
    return null;
  }

  const menuStyle = {
    left: `min(${menu.x}px, calc(100vw - 220px))`,
    top: `min(${menu.y}px, calc(100vh - 80px))`,
  } as CSSProperties;

  return (
    <div
      ref={menuRef}
      className="book-action-menu"
      role="menu"
      aria-label={`Actions for ${menu.book.title}`}
      style={menuStyle}
    >
      <button type="button" role="menuitem" onClick={() => onRemove(menu.book)}>
        Remove from shelf
      </button>
    </div>
  );
}

interface RemoveBookDialogProps {
  book: Book | null;
  isRemoving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function RemoveBookDialog({
  book,
  isRemoving,
  onCancel,
  onConfirm,
}: RemoveBookDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);

  if (book === null) {
    return null;
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !isRemoving) {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const buttons = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
        [],
    );

    if (buttons.length === 0) {
      return;
    }

    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];

    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault();
      lastButton?.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      firstButton?.focus();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="remove-book-dialog"
        role="alertdialog"
        aria-labelledby="remove-book-title"
        aria-describedby="remove-book-description"
        onKeyDown={handleDialogKeyDown}
      >
        <h2 id="remove-book-title">Remove from shelf?</h2>
        <p id="remove-book-description">
          This removes {book.title} from this app and deletes its library copy. The
          original file you imported will not be deleted.
        </p>
        <div className="remove-book-dialog__actions">
          <button
            type="button"
            className="dialog-button dialog-button--secondary"
            autoFocus
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-button dialog-button--danger"
            disabled={isRemoving}
            onClick={onConfirm}
          >
            {isRemoving ? "Removing..." : "Remove"}
          </button>
        </div>
      </section>
    </div>
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

function getBookActivityLabel(book: Book): string {
  const activityDate = dateFormatter.format(
    new Date(book.lastOpenedAt ?? book.createdAt),
  );

  return book.lastOpenedAt === undefined
    ? `Added ${activityDate}`
    : `Opened ${activityDate}`;
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

function focusElementSoon(element: HTMLElement | null): void {
  if (element === null) {
    return;
  }

  window.requestAnimationFrame(() => {
    element.focus();
  });
}

export default App;
