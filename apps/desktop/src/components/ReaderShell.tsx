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
  type ReaderProgress,
  type ReaderTheme,
  type ReaderThemeMode,
  type TxtChapter,
  type TxtDocument,
  type TxtLocator,
} from "@reader/core";

import {
  getReaderTheme,
  getReadingProgress,
  openTxtBook,
  saveReaderTheme,
  saveReadingProgress,
} from "../tauri/reader";

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
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>(defaultReaderTheme);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [readingProgress, setReadingProgress] = useState<ReaderProgress<TxtLocator> | null>(null);
  const progressSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadDocument() {
      setIsLoading(true);
      setError(null);

      try {
        const [openedDocument, savedTheme, savedProgress] = await Promise.all([
          openTxtBook(bookId),
          getReaderTheme(),
          getReadingProgress(bookId),
        ]);

        if (isCurrent) {
          setDocument(openedDocument);
          setTheme(savedTheme);
          setReadingProgress(savedProgress);
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

  useEffect(
    () => () => {
      if (progressSaveTimerRef.current !== null) {
        window.clearTimeout(progressSaveTimerRef.current);
      }
    },
    [],
  );

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

  const handleProgressChange = useCallback(
    (locator: TxtLocator, progressValue?: number) => {
      setReadingProgress({
        bookId,
        locator,
        progress: progressValue,
        updatedAt: new Date().toISOString(),
      });

      if (progressSaveTimerRef.current !== null) {
        window.clearTimeout(progressSaveTimerRef.current);
      }

      progressSaveTimerRef.current = window.setTimeout(() => {
        void saveReadingProgress(bookId, locator, progressValue);
      }, 450);
    },
    [bookId],
  );

  const handleJumpToChapter = useCallback(
    (chapterId: string) => {
      const chapterElement = globalThis.document?.getElementById(getChapterElementId(chapterId));
      chapterElement?.scrollIntoView?.({ block: "start" });

      const chapter = document?.chapters.find((currentChapter) => currentChapter.id === chapterId);
      if (chapter !== undefined && document !== null) {
        handleProgressChange(
          {
            kind: "txt",
            chapterId: chapter.id,
            charOffset: chapter.startChar,
          },
          chapter.startChar / Math.max(document.charCount, 1),
        );
      }
    },
    [document, handleProgressChange],
  );

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
      }) as CSSProperties,
    [theme],
  );

  return (
    <main
      className={`reader-shell ${isSidebarOpen ? "reader-shell--toc-open" : ""} ${
        isChromeHidden ? "reader-shell--chrome-hidden" : ""
      }`}
      style={readerStyle}
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
        <ReaderContent
          blocks={blocks}
          document={document}
          error={error}
          initialProgress={readingProgress}
          isLoading={isLoading}
          onProgressChange={handleProgressChange}
          onBackToLibrary={onBackToLibrary}
        />
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
  initialProgress: ReaderProgress<TxtLocator> | null;
  isLoading: boolean;
  onProgressChange: (locator: TxtLocator, progress?: number) => void;
  onBackToLibrary: () => void;
}

function ReaderContent({
  blocks,
  document,
  error,
  initialProgress,
  isLoading,
  onProgressChange,
  onBackToLibrary,
}: ReaderContentProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const hasRestoredProgressRef = useRef(false);

  useEffect(() => {
    if (
      hasRestoredProgressRef.current ||
      isLoading ||
      document === null ||
      initialProgress === null ||
      blocks.length === 0
    ) {
      return;
    }

    const targetChapter = findProgressTargetChapter(blocks, initialProgress.locator);
    const chapterElement =
      targetChapter === null
        ? null
        : globalThis.document?.getElementById(getChapterElementId(targetChapter.id));

    chapterElement?.scrollIntoView?.({ block: "start" });
    hasRestoredProgressRef.current = true;
  }, [blocks, document, initialProgress, isLoading]);

  const handleScroll = useCallback(() => {
    if (document === null || viewportRef.current === null) {
      return;
    }

    const activeChapter = findActiveChapter(blocks, viewportRef.current);

    if (activeChapter === null) {
      return;
    }

    onProgressChange(
      {
        kind: "txt",
        chapterId: activeChapter.id,
        charOffset: activeChapter.startChar,
      },
      activeChapter.startChar / Math.max(document.charCount, 1),
    );
  }, [blocks, document, onProgressChange]);

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

function splitChapterParagraphs(chapter: TxtChapter): string[] {
  return chapter.text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && paragraph !== chapter.title);
}

function findProgressTargetChapter(blocks: ReaderBlock[], locator: TxtLocator): TxtChapter | null {
  if (locator.chapterId !== undefined) {
    const chapterById = blocks.find((block) => block.chapter.id === locator.chapterId);

    if (chapterById !== undefined) {
      return chapterById.chapter;
    }
  }

  let targetChapter = blocks[0]?.chapter ?? null;

  for (const block of blocks) {
    if (block.chapter.startChar <= locator.charOffset) {
      targetChapter = block.chapter;
    } else {
      break;
    }
  }

  return targetChapter;
}

function findActiveChapter(blocks: ReaderBlock[], viewport: HTMLElement): TxtChapter | null {
  const viewportTop = viewport.getBoundingClientRect().top + 120;
  let activeChapter = blocks[0]?.chapter ?? null;

  for (const block of blocks) {
    const chapterElement = globalThis.document?.getElementById(
      getChapterElementId(block.chapter.id),
    );

    if (chapterElement === null || chapterElement === undefined) {
      continue;
    }

    if (chapterElement.getBoundingClientRect().top <= viewportTop) {
      activeChapter = block.chapter;
    } else {
      break;
    }
  }

  return activeChapter;
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
