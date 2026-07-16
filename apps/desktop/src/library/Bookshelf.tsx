import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { Book } from "@reader/core";

import defaultBookCover from "../assets/default-book-cover.jpg";
import { getBookCoverSource } from "../tauri/library";
import type { BookProgressSummary } from "./bookProgress";

export type FeedbackKind = "success" | "info" | "error";
export type LibraryView = "shelf" | "recent";
export type ViewMode = "grid" | "list";

export interface Feedback {
  actionLabel?: string;
  kind: FeedbackKind;
  title: string;
  message: string;
}

export interface BookActionMenuState {
  book: Book;
  trigger: HTMLElement | null;
  x: number;
  y: number;
}

interface BookshelfProps {
  activeLibraryView: LibraryView;
  bookActionMenu: BookActionMenuState | null;
  bookPendingRemoval: Book | null;
  books: Book[];
  feedback: Feedback | null;
  isImporting: boolean;
  isLoading: boolean;
  libraryError: string | null;
  openingBookId: string | null;
  progressByBookId: BookProgressSummary;
  removingBookId: string | null;
  viewMode: ViewMode;
  onCancelRemoval: () => void;
  onCloseBookMenu: () => void;
  onConfirmRemoval: () => void;
  onDismissFeedback: () => void;
  onImportBook: () => void;
  onOpenBook: (book: Book) => void;
  onOpenSettings: () => void;
  onRequestRemoval: (book: Book) => void;
  onRetryLibrary: () => void;
  onSelectLibraryView: (view: LibraryView) => void;
  onSetViewMode: (mode: ViewMode, animate: boolean) => void;
  onShowBookMenu: (
    book: Book,
    x: number,
    y: number,
    trigger: HTMLElement | null,
  ) => void;
}

export function Bookshelf({
  activeLibraryView,
  bookActionMenu,
  bookPendingRemoval,
  books,
  feedback,
  isImporting,
  isLoading,
  libraryError,
  openingBookId,
  progressByBookId,
  removingBookId,
  viewMode,
  onCancelRemoval,
  onCloseBookMenu,
  onConfirmRemoval,
  onDismissFeedback,
  onImportBook,
  onOpenBook,
  onOpenSettings,
  onRequestRemoval,
  onRetryLibrary,
  onSelectLibraryView,
  onSetViewMode,
  onShowBookMenu,
}: BookshelfProps) {
  const visibleBooks =
    activeLibraryView === "recent"
      ? books.filter((book) => book.lastOpenedAt !== undefined)
      : books;

  return (
    <main className="app-shell" aria-label="Ebook Reader bookshelf">
      <LibraryRail
        activeView={activeLibraryView}
        bookCount={books.length}
        onOpenSettings={onOpenSettings}
        onSelectView={onSelectLibraryView}
      />
      <section className="library-workspace" aria-labelledby="library-title">
        <LibraryHeader
          activeLibraryView={activeLibraryView}
          bookCount={visibleBooks.length}
          isImporting={isImporting}
          isLoading={isLoading}
          libraryError={libraryError}
          viewMode={viewMode}
          onImportBook={onImportBook}
          onOpenSettings={onOpenSettings}
          onSetViewMode={onSetViewMode}
        />
        <ShelfBody
          activeLibraryView={activeLibraryView}
          activeMenuBookId={bookActionMenu?.book.id ?? null}
          books={visibleBooks}
          isLoading={isLoading}
          libraryError={libraryError}
          openingBookId={openingBookId}
          progressByBookId={progressByBookId}
          removingBookId={removingBookId}
          viewMode={viewMode}
          onImportBook={onImportBook}
          onOpenBook={onOpenBook}
          onRetryLibrary={onRetryLibrary}
          onShowBookMenu={onShowBookMenu}
        />
        <FeedbackToast
          feedback={feedback}
          onAction={onImportBook}
          onDismiss={onDismissFeedback}
        />
        <BookActionMenu
          menu={bookActionMenu}
          onClose={onCloseBookMenu}
          onOpen={onOpenBook}
          onRemove={onRequestRemoval}
        />
        <RemoveBookDialog
          book={bookPendingRemoval}
          isRemoving={removingBookId === bookPendingRemoval?.id}
          onCancel={onCancelRemoval}
          onConfirm={onConfirmRemoval}
        />
      </section>
    </main>
  );
}

function LibraryRail({
  activeView,
  bookCount,
  onSelectView,
  onOpenSettings,
}: {
  activeView: LibraryView;
  bookCount: number;
  onSelectView: (view: LibraryView) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="library-rail" aria-label="Library navigation">
      <div className="rail-mark" aria-hidden="true">
        ER
      </div>
      <nav className="rail-nav" aria-label="Bookshelf views">
        <button
          type="button"
          className="rail-link"
          aria-current={activeView === "shelf" ? "page" : undefined}
          onClick={() => onSelectView("shelf")}
        >
          <span className="rail-link__icon" aria-hidden="true">
            <ShelfIcon />
          </span>
          <span>Shelf</span>
        </button>
        <button
          type="button"
          className="rail-link"
          aria-current={activeView === "recent" ? "page" : undefined}
          onClick={() => onSelectView("recent")}
        >
          <span className="rail-link__icon" aria-hidden="true">
            <RecentIcon />
          </span>
          <span>Recent</span>
        </button>
        <button type="button" className="rail-link" onClick={onOpenSettings}>
          <span className="rail-link__icon" aria-hidden="true">
            <SettingsIcon />
          </span>
          <span>Settings</span>
        </button>
      </nav>
      <p className="rail-count" aria-label={`${bookCount} books in library`}>
        {bookCount}
      </p>
    </aside>
  );
}

function LibraryHeader({
  activeLibraryView,
  bookCount,
  isImporting,
  isLoading,
  libraryError,
  viewMode,
  onImportBook,
  onOpenSettings,
  onSetViewMode,
}: {
  activeLibraryView: LibraryView;
  bookCount: number;
  isImporting: boolean;
  isLoading: boolean;
  libraryError: string | null;
  viewMode: ViewMode;
  onImportBook: () => void;
  onOpenSettings: () => void;
  onSetViewMode: (mode: ViewMode, animate: boolean) => void;
}) {
  const statusLabel = isLoading
    ? "Loading..."
    : libraryError === null
      ? bookCount === 1
        ? "1 book"
        : `${bookCount} books`
      : "Error";

  return (
    <header className="library-header">
      <div className="library-heading">
        <p className="library-eyebrow">Local library</p>
        <h1 id="library-title">Ebook Reader</h1>
        <div className="library-meta" aria-label="Library summary">
          <span className={libraryError === null ? undefined : "library-meta--error"}>
            {statusLabel}
          </span>
          <span className="library-sort">
            {activeLibraryView === "recent"
              ? "Recently opened"
              : "Sorted by Recent reading"}
            <ChevronDownIcon />
          </span>
        </div>
      </div>
      <div className="library-actions">
        <button
          type="button"
          className="library-settings-button"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </button>
        <div className="view-toggle" role="group" aria-label="View mode">
          {(["grid", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="view-toggle__button"
              aria-pressed={viewMode === mode}
              onClick={(event) => onSetViewMode(mode, event.detail > 0)}
            >
              {mode === "grid" ? "Grid" : "List"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="import-button"
          data-loading={isImporting || undefined}
          disabled={isImporting || isLoading}
          onClick={onImportBook}
        >
          {isImporting ? (
            <span className="import-button__spinner" aria-hidden="true" />
          ) : (
            <PlusIcon className="import-button__icon" />
          )}
          {isImporting ? "Importing..." : "Import book"}
        </button>
      </div>
    </header>
  );
}

function ShelfBody({
  activeLibraryView,
  activeMenuBookId,
  books,
  isLoading,
  libraryError,
  openingBookId,
  progressByBookId,
  removingBookId,
  viewMode,
  onImportBook,
  onOpenBook,
  onRetryLibrary,
  onShowBookMenu,
}: {
  activeLibraryView: LibraryView;
  activeMenuBookId: string | null;
  books: Book[];
  isLoading: boolean;
  libraryError: string | null;
  openingBookId: string | null;
  progressByBookId: BookProgressSummary;
  removingBookId: string | null;
  viewMode: ViewMode;
  onImportBook: () => void;
  onOpenBook: (book: Book) => void;
  onRetryLibrary: () => void;
  onShowBookMenu: BookshelfProps["onShowBookMenu"];
}) {
  if (isLoading) {
    return <LibrarySkeleton viewMode={viewMode} />;
  }

  if (libraryError !== null) {
    return (
      <section className="shelf-state shelf-state--error" role="alert">
        <span className="shelf-state__icon" aria-hidden="true">
          <ErrorIcon />
        </span>
        <h2>Library could not be loaded</h2>
        <p>There was a problem accessing your local library.</p>
        <p className="shelf-state__detail">{libraryError}</p>
        <button type="button" onClick={onRetryLibrary}>
          <RetryIcon />
          Retry
        </button>
      </section>
    );
  }

  if (books.length === 0) {
    return (
      <EmptyShelf
        isRecent={activeLibraryView === "recent"}
        onImportBook={onImportBook}
      />
    );
  }

  return (
    <section
      id="bookshelf"
      className={`book-shelf book-shelf--${viewMode}`}
      aria-label="Library books"
    >
      {books.map((book, index) => (
        <BookCard
          key={book.id}
          book={book}
          index={index}
          isMenuOpen={activeMenuBookId === book.id}
          isOpening={openingBookId === book.id}
          isRemoving={removingBookId === book.id}
          progress={progressByBookId[book.id]}
          onOpenBook={onOpenBook}
          onShowBookMenu={onShowBookMenu}
        />
      ))}
    </section>
  );
}

function LibrarySkeleton({ viewMode }: { viewMode: ViewMode }) {
  return (
    <section
      className={`book-shelf book-shelf--${viewMode} book-shelf--loading`}
      role="status"
      aria-live="polite"
      aria-label="Loading library"
    >
      <span className="sr-only">Loading library...</span>
      {Array.from({ length: 6 }, (_, index) => (
        <div className="book-skeleton" aria-hidden="true" key={index}>
          <span className="book-skeleton__cover" />
          <span className="book-skeleton__copy">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      ))}
      <p className="loading-library-label" aria-hidden="true">
        <span className="loading-library-spinner" />
        Loading library…
      </p>
    </section>
  );
}

function EmptyShelf({
  isRecent,
  onImportBook,
}: {
  isRecent: boolean;
  onImportBook: () => void;
}) {
  return (
    <section className="empty-shelf" aria-labelledby="empty-shelf-title">
      <BookshelfLineArt />
      <h2 id="empty-shelf-title">
        {isRecent ? "No recent books yet" : "Your library is empty"}
      </h2>
      <p>
        {isRecent
          ? "Books you open will appear here."
          : "No books in your local shelf yet."}
      </p>
      {isRecent ? null : (
        <button type="button" aria-label="Import first book" onClick={onImportBook}>
          <PlusIcon />
          Import book
        </button>
      )}
    </section>
  );
}

function BookCard({
  book,
  index,
  isMenuOpen,
  isOpening,
  isRemoving,
  progress,
  onOpenBook,
  onShowBookMenu,
}: {
  book: Book;
  index: number;
  isMenuOpen: boolean;
  isOpening: boolean;
  isRemoving: boolean;
  progress?: number;
  onOpenBook: (book: Book) => void;
  onShowBookMenu: BookshelfProps["onShowBookMenu"];
}) {
  const handleOpenBook = useCallback(() => onOpenBook(book), [book, onOpenBook]);
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
      onShowBookMenu(book, rect.right - 8, rect.bottom + 8, event.currentTarget);
    },
    [book, onShowBookMenu],
  );
  const progressPercent = progress === undefined ? 0 : Math.round(progress * 100);
  const activityLabel = getBookActivityLabel(book, progress);
  const cardStyle = {
    "--book-index": Math.min(index, 8),
    "--book-progress": `${progressPercent}%`,
    viewTransitionName: `book-${sanitizeViewTransitionName(book.id)}`,
  } as CSSProperties;

  return (
    <article
      className={`book-card${isMenuOpen ? " book-card--menu-open" : ""}`}
      style={cardStyle}
      aria-label={`${book.title} book`}
      onContextMenu={handleContextMenu}
    >
      <button
        type="button"
        className="book-card__cover-button"
        aria-label="Continue"
        disabled={isOpening || isRemoving}
        onClick={handleOpenBook}
      >
        <BookCover book={book} />
        {isOpening ? <span className="book-card__opening" aria-hidden="true" /> : null}
      </button>
      <div className="book-card__body">
        <div className="book-card__top">
          <div className="book-card__copy">
            <button
              type="button"
              className="book-card__title-button"
              disabled={isOpening || isRemoving}
              onClick={handleOpenBook}
            >
              <h2 className="book-card__title">{book.title}</h2>
            </button>
            <p className="book-card__author">{book.author ?? "Unknown author"}</p>
          </div>
          <button
            type="button"
            className="book-card__menu-button"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`More actions for ${book.title}`}
            onClick={handleMenuButtonClick}
          >
            <MoreIcon />
          </button>
        </div>
        <span className="book-card__format">{formatBookFormat(book.format)}</span>
        <div className="book-card__progress">
          <span>{activityLabel}</span>
          <span className="book-card__progress-track" aria-hidden="true">
            <i />
          </span>
        </div>
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
        if (isCurrent) setSource(nextSource);
      },
      () => {
        if (isCurrent) setSource(null);
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [book]);

  const showsExtractedCover = source !== null && source !== failedSource;
  const fallbackStyle = {
    backgroundImage: `linear-gradient(180deg, rgba(17, 31, 33, 0.02), rgba(17, 31, 33, 0.48)), url(${defaultBookCover})`,
  } as CSSProperties;

  return (
    <div className="book-card__cover-shell">
      <div
        className={`book-card__cover${showsExtractedCover ? " book-card__cover--image" : ""}`}
        style={showsExtractedCover ? undefined : fallbackStyle}
        aria-hidden="true"
      >
        {showsExtractedCover ? (
          <img src={source} alt="" onError={() => setFailedSource(source)} />
        ) : (
          <strong className="book-card__cover-title" title={book.title}>
            {book.title}
          </strong>
        )}
      </div>
      {!showsExtractedCover ? (
        <div className="book-card__cover-title-popover" aria-hidden="true">
          {book.title}
        </div>
      ) : null}
    </div>
  );
}

function FeedbackToast({
  feedback,
  onAction,
  onDismiss,
}: {
  feedback: Feedback | null;
  onAction: () => void;
  onDismiss: () => void;
}) {
  if (feedback === null) return null;

  return (
    <section
      className={`feedback feedback--${feedback.kind}`}
      role={feedback.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="feedback__icon" aria-hidden="true">
        {feedback.kind === "success" ? <CheckIcon /> : <FeedbackIcon />}
      </span>
      <span className="feedback__copy">
        <strong>{feedback.title}</strong>
        <span>{feedback.message}</span>
      </span>
      {feedback.actionLabel === undefined ? null : (
        <button className="feedback__action" type="button" onClick={onAction}>
          {feedback.actionLabel}
        </button>
      )}
      <button
        type="button"
        className="feedback__dismiss"
        aria-label={`Dismiss ${feedback.title}`}
        onClick={onDismiss}
      >
        <CloseIcon />
      </button>
    </section>
  );
}

function BookActionMenu({
  menu,
  onClose,
  onOpen,
  onRemove,
}: {
  menu: BookActionMenuState | null;
  onClose: () => void;
  onOpen: (book: Book) => void;
  onRemove: (book: Book) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (menu === null) return;

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
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, onClose]);

  if (menu === null) return null;

  const menuStyle = {
    left: `min(${menu.x}px, calc(100vw - 204px))`,
    top: `min(${menu.y}px, calc(100vh - 126px))`,
  } as CSSProperties;

  return (
    <div
      ref={menuRef}
      className="book-action-menu"
      role="menu"
      aria-label={`Actions for ${menu.book.title}`}
      style={menuStyle}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          onOpen(menu.book);
        }}
      >
        Open
      </button>
      <span className="book-action-menu__divider" aria-hidden="true" />
      <button
        type="button"
        className="book-action-menu__danger"
        role="menuitem"
        onClick={() => onRemove(menu.book)}
      >
        Remove from shelf
      </button>
    </div>
  );
}

function RemoveBookDialog({
  book,
  isRemoving,
  onCancel,
  onConfirm,
}: {
  book: Book | null;
  isRemoving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

  if (book === null) return null;

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !isRemoving) {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") return;

    const buttons = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
        [],
    );
    if (buttons.length === 0) return;

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
        <span className="remove-book-dialog__icon" aria-hidden="true">
          <WarningIcon />
        </span>
        <h2 id="remove-book-title">Remove from shelf?</h2>
        <p id="remove-book-description">
          This book will be removed from your shelf. Your original imported file will
          not be deleted.
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

function getBookActivityLabel(book: Book, progress?: number): string {
  if (progress !== undefined) {
    const percentage = Math.round(progress * 100);
    return percentage >= 100 ? "Finished" : `${percentage}% read`;
  }

  return book.lastOpenedAt === undefined ? "Not started" : "Recently read";
}

function formatBookFormat(format: Book["format"]): string {
  return format.toUpperCase();
}

function sanitizeViewTransitionName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function ShelfIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5.5 5.5h5v13h-5zM13.5 5.5h5v13h-5zM8 8v6M16 8v6" />
    </svg>
  );
}

function RecentIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 7v5l3 2M4.8 8.2A8 8 0 1 1 4 12M4 5v3.5h3.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A7 7 0 0 0 14.8 6L14.5 3h-5L9.2 6A7 7 0 0 0 7.6 7L5.1 6l-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.6l2 3.4 2.6-1a7 7 0 0 0 1.6 1l.3 3h5l.3-3a7 7 0 0 0 1.6-1l2.6 1 2-3.4-2.1-1.6c.1-.3.1-.7.1-1Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string } = {}) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="10" cy="4" r="1.3" />
      <circle cx="10" cy="10" r="1.3" />
      <circle cx="10" cy="16" r="1.3" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="13" />
      <path d="M16 9v9M16 23h.01" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M15.4 7.3A6 6 0 1 0 16 12M16 4v4h-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20">
      <path d="m5 10.5 3.2 3.2L15.5 6.5" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg viewBox="0 0 20 20">
      <path d="M10 5v6M10 14.5h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 36 36">
      <path d="M18 4.5 32 30H4z" />
      <path d="M18 13v8M18 26h.01" />
    </svg>
  );
}

function BookshelfLineArt() {
  return (
    <svg className="empty-shelf__art" aria-hidden="true" viewBox="0 0 190 125">
      <path d="M20 105h150v7H20zM47 40h24v65H47zM73 28h28v77H73zM105 36l24-6 18 72-24 3z" />
      <path d="M55 51h8M55 92h8M81 42h12M81 88h12M117 48l10-2M130 92l9-2" />
    </svg>
  );
}
