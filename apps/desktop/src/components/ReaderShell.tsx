import { useCallback, useEffect, useMemo, useState } from "react";
import type { TxtChapter, TxtDocument } from "@reader/core";

import { openTxtBook } from "../tauri/reader";

interface ReaderShellProps {
  bookId: string;
  onBackToLibrary: () => void;
}

interface ReaderBlock {
  chapter: TxtChapter;
  paragraphs: string[];
}

export function ReaderShell({ bookId, onBackToLibrary }: ReaderShellProps) {
  const [document, setDocument] = useState<TxtDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChromeHidden, setIsChromeHidden] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadDocument() {
      setIsLoading(true);
      setError(null);

      try {
        const openedDocument = await openTxtBook(bookId);

        if (isCurrent) {
          setDocument(openedDocument);
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

    void loadDocument();

    return () => {
      isCurrent = false;
    };
  }, [bookId]);

  const blocks = useMemo(() => {
    if (document === null) {
      return [];
    }

    return document.chapters.map((chapter) => ({
      chapter,
      paragraphs: splitChapterParagraphs(chapter),
    }));
  }, [document]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((currentValue) => !currentValue);
  }, []);

  const enterFocusMode = useCallback(() => {
    setIsChromeHidden(true);
    setIsSidebarOpen(false);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsChromeHidden(false);
  }, []);

  const handleJumpToChapter = useCallback((chapterId: string) => {
    const chapterElement = globalThis.document?.getElementById(getChapterElementId(chapterId));
    chapterElement?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <main
      className={`reader-shell ${isSidebarOpen ? "reader-shell--toc-open" : ""} ${
        isChromeHidden ? "reader-shell--chrome-hidden" : ""
      }`}
      aria-label="TXT reader"
    >
      <ReaderSidebar
        chapters={document?.chapters ?? []}
        isOpen={isSidebarOpen}
        onBackToLibrary={onBackToLibrary}
        onJumpToChapter={handleJumpToChapter}
      />
      <section className="reader-main">
        <header className="reader-topbar">
          <div className="reader-title-group">
            <button type="button" className="reader-link-button" onClick={onBackToLibrary}>
              Shelf
            </button>
            <div>
              <p className="reader-kicker">TXT reading</p>
              <h1>{document?.book.title ?? "Opening book"}</h1>
            </div>
          </div>
          <div className="reader-toolbar" aria-label="Reader tools">
            <button type="button" className="reader-tool-button" onClick={toggleSidebar}>
              {isSidebarOpen ? "Hide contents" : "Contents"}
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
        <ReaderContent
          blocks={blocks}
          document={document}
          error={error}
          isLoading={isLoading}
          onBackToLibrary={onBackToLibrary}
        />
      </section>
    </main>
  );
}

interface ReaderSidebarProps {
  chapters: TxtChapter[];
  isOpen: boolean;
  onBackToLibrary: () => void;
  onJumpToChapter: (chapterId: string) => void;
}

function ReaderSidebar({
  chapters,
  isOpen,
  onBackToLibrary,
  onJumpToChapter,
}: ReaderSidebarProps) {
  const handleJump = useCallback(
    (chapterId: string) => {
      onJumpToChapter(chapterId);
    },
    [onJumpToChapter],
  );

  return (
    <aside className="reader-sidebar" aria-label="Table of contents" aria-hidden={!isOpen}>
      <button type="button" className="reader-sidebar__back" onClick={onBackToLibrary}>
        Back to shelf
      </button>
      <h2>Contents</h2>
      <nav className="reader-toc" aria-label="TXT chapters">
        {chapters.length === 0 ? (
          <p className="reader-sidebar__empty">Loading chapters...</p>
        ) : (
          chapters.map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              className="reader-toc__item"
              onClick={() => handleJump(chapter.id)}
            >
              {chapter.title}
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}

interface ReaderContentProps {
  blocks: ReaderBlock[];
  document: TxtDocument | null;
  error: string | null;
  isLoading: boolean;
  onBackToLibrary: () => void;
}

function ReaderContent({
  blocks,
  document,
  error,
  isLoading,
  onBackToLibrary,
}: ReaderContentProps) {
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
    <section className="reader-viewport" aria-label={`${document.book.title} content`}>
      <article className="reader-page">
        <ReaderMeta document={document} />
        {blocks.map((block) => (
          <section
            key={block.chapter.id}
            id={getChapterElementId(block.chapter.id)}
            className="reader-chapter"
            aria-labelledby={`${getChapterElementId(block.chapter.id)}-title`}
          >
            <h2 id={`${getChapterElementId(block.chapter.id)}-title`}>{block.chapter.title}</h2>
            {block.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={`${block.chapter.id}-${paragraphIndex}`}>{paragraph}</p>
            ))}
          </section>
        ))}
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

function splitChapterParagraphs(chapter: TxtChapter): string[] {
  return chapter.text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && paragraph !== chapter.title);
}

function getChapterElementId(chapterId: string): string {
  return `reader-chapter-${chapterId}`;
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
