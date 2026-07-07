/* eslint-disable react-refresh/only-export-components -- the shell imports the memoized sidebar and its width normalizer together */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Annotation, Bookmark, Locator, SearchHit, TocItem } from "@reader/core";

import {
  flattenTocItems,
  formatSidebarTab,
  isVisibleAnnotation,
} from "./ReaderFormatContents";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  formatAnnotationTimestamp,
  getLocatorLabel,
} from "./readerAnnotationPresentation";

export type ReaderSidebarTab = "contents" | "bookmarks" | "notes" | "search";

const SIDEBAR_WIDTH_MIN = 240;
const SIDEBAR_WIDTH_MAX = 480;
const SIDEBAR_WIDTH_KEYBOARD_STEP = 8;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}
interface ReaderSidebarProps {
  activeTocItemId: string | null;
  activeTab: ReaderSidebarTab;
  annotationError: string | null;
  annotations: Annotation[];
  bookmarks: Array<Bookmark<Locator>>;
  bookmarkError: string | null;
  items: TocItem[];
  isOpen: boolean;
  isSearchLoading: boolean;
  layoutError: string | null;
  label: string;
  onBackToLibrary: () => void;
  onClose: () => void;
  onCreateBookmark: () => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onJumpToAnnotation: (annotation: Annotation) => void;
  onJumpToBookmark: (bookmark: Bookmark<Locator>) => void;
  onJumpToItem: (itemId: string) => void;
  onJumpToSearchResult: (hit: SearchHit<Locator>) => void;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onSidebarWidthChange: (width: number) => void;
  onTabChange: (tab: ReaderSidebarTab) => void;
  searchError: string | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  searchResults: Array<SearchHit<Locator>>;
  sidebarCloseButtonRef: RefObject<HTMLButtonElement | null>;
  sidebarWidth: number;
}

function ReaderSidebar({
  activeTocItemId,
  activeTab,
  annotationError,
  annotations,
  bookmarks,
  bookmarkError,
  items,
  isOpen,
  isSearchLoading,
  layoutError,
  label,
  onBackToLibrary,
  onClose,
  onCreateBookmark,
  onDeleteAnnotation,
  onDeleteBookmark,
  onJumpToAnnotation,
  onJumpToBookmark,
  onJumpToItem,
  onJumpToSearchResult,
  onSearchQueryChange,
  onSearchSubmit,
  onSidebarWidthChange,
  onTabChange,
  searchError,
  searchInputRef,
  searchQuery,
  searchResults,
  sidebarCloseButtonRef,
  sidebarWidth,
}: ReaderSidebarProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const flattenedItems = useMemo(() => flattenTocItems(items), [items]);
  const noteAnnotations = useMemo(
    () => annotations.filter(isVisibleAnnotation),
    [annotations],
  );

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
      <div className="reader-sidebar__actions">
        <button
          type="button"
          className="reader-sidebar__back"
          onClick={onBackToLibrary}
        >
          Back to shelf
        </button>
        <button
          ref={sidebarCloseButtonRef}
          type="button"
          className="reader-sidebar__close"
          aria-label="Close contents"
          onClick={onClose}
        >
          Close
        </button>
      </div>
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
      <ReaderSidebarResizer
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={onSidebarWidthChange}
      />
      {layoutError !== null ? (
        <p className="reader-sidebar__error" role="alert">
          Layout preference could not be saved. {layoutError}
        </p>
      ) : null}
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
                    style={{ paddingLeft: `${12 + Math.min(item.depth, 4) * 14}px` }}
                    aria-label={item.title}
                    aria-current={isActive ? "location" : undefined}
                    title={item.title}
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
            <button
              type="button"
              className="reader-sidebar__action"
              onClick={onCreateBookmark}
            >
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
          {noteAnnotations.length === 0 ? (
            <p className="reader-sidebar__empty">No notes yet.</p>
          ) : (
            <div className="reader-notes" role="list">
              {noteAnnotations.map((annotation) => (
                <ReaderNoteItem
                  key={annotation.id}
                  annotation={annotation}
                  onDelete={onDeleteAnnotation}
                  onJump={onJumpToAnnotation}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
      {activeTab === "search" ? (
        <section className="reader-sidebar-panel" aria-label="Search">
          <h2>Search</h2>
          <form
            className="reader-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSearchSubmit(searchQuery);
            }}
          >
            <label>
              <span>Search in book</span>
              <input
                ref={searchInputRef}
                aria-label="Search in book"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
              />
            </label>
            <button type="submit" disabled={isSearchLoading}>
              {isSearchLoading ? "Searching..." : "Search"}
            </button>
          </form>
          {searchError !== null ? (
            <p className="reader-sidebar__error" role="alert">
              {searchError}
            </p>
          ) : null}
          {searchQuery.trim() !== "" &&
          !isSearchLoading &&
          searchResults.length === 0 ? (
            <p className="reader-sidebar__empty">No results.</p>
          ) : null}
          {searchResults.length > 0 ? (
            <div className="reader-search-results" role="list">
              {searchResults.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="reader-search-result"
                  role="listitem"
                  aria-label={`Go to search result ${hit.excerpt}`}
                  onClick={() => onJumpToSearchResult(hit)}
                >
                  <span>{hit.excerpt}</span>
                  <small>{getLocatorLabel(hit.locator)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}

interface ReaderSidebarResizerProps {
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
}

interface SidebarDragState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

function ReaderSidebarResizer({
  sidebarWidth,
  onSidebarWidthChange,
}: ReaderSidebarResizerProps) {
  const dragStateRef = useRef<SidebarDragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const measuredWidth =
        event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: measuredWidth > 0 ? measuredWidth : sidebarWidth,
      };
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setIsDragging(true);
      event.preventDefault();
    },
    [sidebarWidth],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;

      if (dragState === null || dragState.pointerId !== event.pointerId) {
        return;
      }

      onSidebarWidthChange(dragState.startWidth + event.clientX - dragState.startX);
      event.preventDefault();
    },
    [onSidebarWidthChange],
  );

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (dragState === null || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let nextWidth: number | null = null;

      if (event.key === "ArrowLeft") {
        nextWidth = sidebarWidth - SIDEBAR_WIDTH_KEYBOARD_STEP;
      } else if (event.key === "ArrowRight") {
        nextWidth = sidebarWidth + SIDEBAR_WIDTH_KEYBOARD_STEP;
      } else if (event.key === "Home") {
        nextWidth = SIDEBAR_WIDTH_MIN;
      } else if (event.key === "End") {
        nextWidth = SIDEBAR_WIDTH_MAX;
      }

      if (nextWidth === null) {
        return;
      }

      event.preventDefault();
      onSidebarWidthChange(nextWidth);
    },
    [onSidebarWidthChange, sidebarWidth],
  );

  return (
    <div
      className={`reader-sidebar-resizer${isDragging ? " reader-sidebar-resizer--dragging" : ""}`}
      role="separator"
      tabIndex={0}
      aria-label="Resize contents panel"
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      aria-valuenow={sidebarWidth}
      aria-valuetext={`${sidebarWidth} pixels`}
      onKeyDown={handleKeyDown}
      onPointerCancel={stopDragging}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
    >
      <span className="reader-sidebar-resizer__grip" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

interface ReaderNoteItemProps {
  annotation: Annotation;
  onDelete: (annotationId: string) => void;
  onJump: (annotation: Annotation) => void;
}

function ReaderNoteItem({ annotation, onDelete, onJump }: ReaderNoteItemProps) {
  const excerpt =
    annotation.selectedText ??
    annotation.locator.selectedText ??
    getLocatorLabel(annotation.locator);
  const noteLabel = `${annotation.type === "note" ? "Note" : "Highlight"} ${excerpt}`;

  return (
    <article className="reader-note" role="listitem">
      <div className="reader-note__header">
        <span
          className="reader-note__swatch"
          style={
            {
              "--reader-highlight-color": annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
            } as CSSProperties
          }
          aria-hidden="true"
        />
        <button
          type="button"
          className="reader-note__jump"
          aria-label={`Go to ${noteLabel}`}
          onClick={() => onJump(annotation)}
        >
          <span>{excerpt}</span>
          <small>{formatAnnotationTimestamp(annotation.updatedAt)}</small>
        </button>
      </div>
      {annotation.note !== undefined && annotation.note.trim() !== "" ? (
        <p className="reader-note__preview">{annotation.note}</p>
      ) : null}
      <div className="reader-note__actions">
        <button type="button" onClick={() => onDelete(annotation.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}

export const MemoizedReaderSidebar = memo(ReaderSidebar);
