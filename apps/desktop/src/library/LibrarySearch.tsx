import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  LibrarySearchHit,
  LibrarySearchResult,
  LibrarySearchStatus,
  OperationProgress,
} from "@reader/core";

import { cancelDataOperation, listenForDataOperationProgress } from "../tauri/backup";
import {
  getLibrarySearchStatus,
  rebuildLibrarySearchIndex,
  searchLibrary,
} from "../tauri/librarySearch";
import { ReaderIcon } from "../reader/ReaderIcons";

import "./LibrarySearch.css";

type SearchFilter = "all" | "titles" | "book-text";

interface LibrarySearchProps {
  onClose: () => void;
  onOpenHit: (hit: LibrarySearchHit) => void;
  onOpenSettings: () => void;
}

export function LibrarySearch({
  onClose,
  onOpenHit,
  onOpenSettings,
}: LibrarySearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const autoRebuildStartedRef = useRef(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [result, setResult] = useState<LibrarySearchResult | null>(null);
  const [status, setStatus] = useState<LibrarySearchStatus | null>(null);
  const [progress, setProgress] = useState<OperationProgress | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await getLibrarySearchStatus();
    setStatus(nextStatus);
    return nextStatus;
  }, []);

  const startRebuild = useCallback(async () => {
    if (isRebuilding) return;
    const nextOperationId = crypto.randomUUID();
    setOperationId(nextOperationId);
    setIsRebuilding(true);
    setError(null);
    let stopListening: () => void = () => undefined;

    try {
      stopListening = await listenForDataOperationProgress((nextProgress) => {
        if (
          nextProgress.operationId === nextOperationId &&
          nextProgress.kind === "library-search-index"
        ) {
          setProgress(nextProgress);
        }
      });
      await rebuildLibrarySearchIndex(nextOperationId);
      await refreshStatus();
    } catch (rebuildError) {
      setError(getErrorMessage(rebuildError));
      await refreshStatus().catch(() => undefined);
    } finally {
      stopListening();
      setOperationId(null);
      setIsRebuilding(false);
    }
  }, [isRebuilding, refreshStatus]);

  useEffect(() => {
    let active = true;
    void getLibrarySearchStatus()
      .then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        if (nextStatus.state === "needs-index" && !autoRebuildStartedRef.current) {
          autoRebuildStartedRef.current = true;
          void startRebuild();
        }
      })
      .catch((statusError: unknown) => {
        if (active) setError(getErrorMessage(statusError));
      });
    return () => {
      active = false;
    };
  }, [startRebuild]);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const submitSearch = useCallback(async () => {
    const trimmedQuery = query.trim();
    const requestId = ++requestIdRef.current;
    if (trimmedQuery === "") {
      setResult(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError(null);
    try {
      const nextResult = await searchLibrary(trimmedQuery);
      if (requestId === requestIdRef.current) setResult(nextResult);
    } catch (searchError) {
      if (requestId === requestIdRef.current) {
        setResult({ query: trimmedQuery, hits: [], truncated: false });
        setError(getErrorMessage(searchError));
      }
    } finally {
      if (requestId === requestIdRef.current) setIsSearching(false);
    }
  }, [query]);

  const visibleHits = useMemo(() => {
    const hits = result?.hits ?? [];
    if (filter === "titles")
      return hits.filter((hit) => hit.target.kind === "metadata");
    if (filter === "book-text")
      return hits.filter((hit) => hit.target.kind !== "metadata");
    return hits;
  }, [filter, result]);

  const groups = useMemo(() => groupSearchHits(visibleHits), [visibleHits]);
  const readySummary = getReadySummary(status, isRebuilding);

  return (
    <main className="library-search-page" aria-label="Library search">
      <SearchRail onClose={onClose} onOpenSettings={onOpenSettings} />
      <section className="library-search-workspace">
        <header className="library-search-mobile-bar">
          <button type="button" aria-label="Back to shelf" onClick={onClose}>
            <ReaderIcon name="back" />
          </button>
          <strong>Library search</strong>
          <button type="button" aria-label="Close library search" onClick={onClose}>
            <ReaderIcon name="close" />
          </button>
        </header>

        <div className="library-search-content">
          <p className="library-search-eyebrow">Your library · on this device</p>
          <h1>Search every page.</h1>
          <p className="library-search-intro">
            Find a title, author, or exact passage across TXT, EPUB, PDF, MOBI and AZW3.
            Book content never leaves this device.
          </p>

          <form
            className="library-search-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submitSearch();
            }}
          >
            <ReaderIcon name="search" />
            <input
              ref={inputRef}
              aria-label="Search the entire library"
              placeholder="Title, author, or exact passage"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                requestIdRef.current += 1;
              }}
            />
            <kbd>Ctrl Shift F</kbd>
            <button type="submit" disabled={isSearching || query.trim() === ""}>
              {isSearching ? "Searching…" : "Search"}
            </button>
          </form>

          <div className="library-search-filters" aria-label="Search result type">
            {(["all", "titles", "book-text"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : value === "titles" ? "Titles" : "Book text"}
              </button>
            ))}
          </div>

          <div className="library-search-summary">
            <span>
              <strong>{visibleHits.length} matches</strong>
              {groups.length > 0 ? ` in ${groups.length} books` : ""}
              {result?.truncated === true ? " · showing the first 100" : ""}
            </span>
            <button
              type="button"
              onClick={() => void startRebuild()}
              disabled={isRebuilding}
            >
              <span className="library-search-ready-dot" aria-hidden="true" />
              {readySummary}
            </button>
          </div>

          {isRebuilding ? (
            <SearchIndexProgress
              progress={progress}
              status={status}
              onCancel={() => {
                if (operationId !== null) void cancelDataOperation(operationId);
              }}
            />
          ) : null}

          {error !== null ? (
            <div className="library-search-error" role="alert">
              <strong>Search needs attention</strong>
              <span>{error}</span>
            </div>
          ) : null}

          {result !== null && !isSearching && visibleHits.length === 0 ? (
            <div className="library-search-empty" role="status">
              <ReaderIcon name="search" />
              <div>
                <strong>No results</strong>
                <span>
                  Try fewer words, another spelling, or rebuild the local index.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResult(null);
                  setError(null);
                  requestIdRef.current += 1;
                  inputRef.current?.focus();
                }}
              >
                Clear
              </button>
            </div>
          ) : null}

          <div className="library-search-groups" aria-live="polite">
            {groups.map((group) => (
              <SearchResultGroup
                key={group.bookId}
                group={group}
                onOpenHit={onOpenHit}
              />
            ))}
          </div>
        </div>

        {visibleHits[0] !== undefined ? (
          <div className="library-search-mobile-action">
            <button
              type="button"
              disabled={visibleHits[0].availability === "missing"}
              onClick={() => onOpenHit(visibleHits[0])}
            >
              <span aria-hidden="true">→</span> Open first result
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SearchRail({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="library-search-rail" aria-label="Library navigation">
      <div className="library-search-rail__mark">ER</div>
      <button type="button" onClick={onClose}>
        <ReaderIcon name="book" />
        <span>Shelf</span>
      </button>
      <button type="button" aria-current="page">
        <ReaderIcon name="search" />
        <span>Search</span>
      </button>
      <button
        type="button"
        className="library-search-rail__settings"
        onClick={onOpenSettings}
      >
        <ReaderIcon name="theme" />
        <span>Settings</span>
      </button>
    </aside>
  );
}

function SearchIndexProgress({
  progress,
  status,
  onCancel,
}: {
  progress: OperationProgress | null;
  status: LibrarySearchStatus | null;
  onCancel: () => void;
}) {
  const total = progress?.total ?? status?.totalBooks ?? 0;
  const completed = progress?.completed ?? status?.indexedBooks ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <section
      className="library-search-index-progress"
      aria-label="Search index progress"
    >
      <div>
        <strong>Rebuilding library search</strong>
        <span>{progress?.message ?? "Preparing local book text"}</span>
      </div>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <div className="library-search-index-progress__track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>
        {completed} of {total} books ready
      </small>
    </section>
  );
}

interface SearchHitGroup {
  bookId: string;
  title: string;
  author?: string;
  format: LibrarySearchHit["format"];
  hits: LibrarySearchHit[];
}

function SearchResultGroup({
  group,
  onOpenHit,
}: {
  group: SearchHitGroup;
  onOpenHit: (hit: LibrarySearchHit) => void;
}) {
  return (
    <article className="library-search-group">
      <header>
        <span>{group.format.toUpperCase()}</span>
        <strong>{group.title}</strong>
        <small>
          {group.author ?? "Unknown author"} · {group.hits.length} matches
        </small>
      </header>
      <div>
        {group.hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            disabled={hit.availability === "missing"}
            onClick={() => onOpenHit(hit)}
          >
            <span>{renderHitExcerpt(hit)}</span>
            <small>
              {hit.availability === "missing" ? "File needed" : hit.locationLabel}
            </small>
            <span className="library-search-result-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}

function renderHitExcerpt(hit: LibrarySearchHit): ReactNode {
  if (hit.excerptMatchEnd <= hit.excerptMatchStart) return hit.excerpt;
  return (
    <>
      {hit.excerpt.slice(0, hit.excerptMatchStart)}
      <mark>{hit.excerpt.slice(hit.excerptMatchStart, hit.excerptMatchEnd)}</mark>
      {hit.excerpt.slice(hit.excerptMatchEnd)}
    </>
  );
}

function groupSearchHits(hits: LibrarySearchHit[]): SearchHitGroup[] {
  const groups = new Map<string, SearchHitGroup>();
  for (const hit of hits) {
    const current = groups.get(hit.bookId);
    if (current !== undefined) {
      current.hits.push(hit);
    } else {
      groups.set(hit.bookId, {
        bookId: hit.bookId,
        title: hit.title,
        author: hit.author,
        format: hit.format,
        hits: [hit],
      });
    }
  }
  return [...groups.values()];
}

function getReadySummary(
  status: LibrarySearchStatus | null,
  isRebuilding: boolean,
): string {
  if (status === null) return "Checking local index";
  if (isRebuilding) return `${status.indexedBooks} of ${status.totalBooks} indexed`;
  if (status.state === "empty") return "No books to index";
  if (status.failedBooks > 0)
    return `${status.indexedBooks} indexed · ${status.failedBooks} skipped`;
  return `Library ready · ${status.indexedBooks} books indexed`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
