import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ReadingBookStatistic,
  ReadingDailyStatistic,
  ReadingStatistics,
} from "@reader/core";

import {
  getReadingStatistics,
  saveReadingHistoryPreferences,
} from "../tauri/readingHistory";
import { ReaderIcon } from "../reader/ReaderIcons";

import "./ReadingInsights.css";

export function ReadingInsights({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const [statistics, setStatistics] = useState<ReadingStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEnabling, setIsEnabling] = useState(false);

  const load = useCallback(
    () =>
      getReadingStatistics().then(
        (nextStatistics) => {
          setStatistics(nextStatistics);
          setError(null);
        },
        (loadError: unknown) => setError(errorMessage(loadError)),
      ),
    [],
  );

  useEffect(() => {
    backRef.current?.focus();
    void load();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [load, onClose]);

  const days = useMemo(() => completeRecentDays(statistics?.daily ?? []), [statistics]);
  const maxSeconds = Math.max(1, ...days.map((day) => day.activeSeconds));
  const activeDays = days.filter((day) => day.activeSeconds > 0).length;
  const booksReadToday = statistics?.books.filter((book) =>
    isToday(book.lastReadAt),
  ).length;

  const enableHistory = useCallback(async () => {
    setIsEnabling(true);
    setError(null);
    try {
      await saveReadingHistoryPreferences(true);
      await load();
    } catch (enableError) {
      setError(errorMessage(enableError));
    } finally {
      setIsEnabling(false);
    }
  }, [load]);

  return (
    <main className="insights-shell" aria-label="Reading insights">
      <aside className="insights-rail" aria-label="Insights navigation">
        <div className="insights-rail__mark" aria-hidden="true">
          ER
        </div>
        <button ref={backRef} type="button" onClick={onClose}>
          <ReaderIcon name="back" />
          <span>Shelf</span>
        </button>
        <button type="button" aria-current="page">
          <InsightsIcon />
          <span>Insights</span>
        </button>
        <button type="button" onClick={onOpenSettings}>
          <SettingsIcon />
          <span>Settings</span>
        </button>
      </aside>

      <section className="insights-workspace">
        <header className="insights-mobile-header">
          <button type="button" aria-label="Back to shelf" onClick={onClose}>
            <ReaderIcon name="back" />
          </button>
          <strong>Insights</strong>
          <button type="button" aria-label="Close insights" onClick={onClose}>
            <ReaderIcon name="close" />
          </button>
        </header>

        <div className="insights-heading">
          <p>Reading insights · on this device</p>
          <h1>Your reading, quietly remembered.</h1>
          <span>
            Effective reading time only. Background, sleep and inactive windows are
            excluded, and nothing leaves this computer.
          </span>
        </div>

        {error !== null ? (
          <section className="insights-state" role="alert">
            <InsightsIcon />
            <h2>Insights could not be loaded</h2>
            <p>{error}</p>
            <button type="button" onClick={() => void load()}>
              Try again
            </button>
          </section>
        ) : statistics === null ? (
          <section className="insights-state" role="status" aria-live="polite">
            <span className="insights-spinner" aria-hidden="true" />
            <h2>Preparing local insights</h2>
          </section>
        ) : !statistics.enabled ? (
          <section className="insights-state">
            <PauseIcon />
            <h2>History is off</h2>
            <p>
              No new sessions or heartbeats are recorded. Existing local history remains
              available until you clear it.
            </p>
            <button
              type="button"
              disabled={isEnabling}
              onClick={() => void enableHistory()}
            >
              {isEnabling ? "Turning on…" : "Turn on history"}
            </button>
          </section>
        ) : (
          <>
            {statistics.activeSession ? (
              <div className="insights-active" role="status">
                Reading now · time counts only while this window is active
              </div>
            ) : null}
            <div className="insights-summary" aria-label="Reading time summary">
              <Summary label="Today" value={formatDuration(statistics.todaySeconds)}>
                Across {booksReadToday} {booksReadToday === 1 ? "book" : "books"}
              </Summary>
              <Summary
                label="Last 7 days"
                value={formatDuration(statistics.last7DaysSeconds)}
              >
                {activeDays} active {activeDays === 1 ? "day" : "days"}
              </Summary>
              <Summary label="All time" value={formatDuration(statistics.totalSeconds)}>
                Since history was enabled
              </Summary>
            </div>

            {statistics.books.length === 0 ? (
              <section className="insights-state insights-state--empty">
                <InsightsIcon />
                <h2>No reading history yet.</h2>
                <p>
                  Open a book and read while the window is visible and focused. Your
                  effective time will appear here.
                </p>
              </section>
            ) : (
              <div className="insights-dashboard">
                <section
                  className="insights-panel"
                  aria-labelledby="daily-reading-title"
                >
                  <header>
                    <div>
                      <h2 id="daily-reading-title">Daily reading</h2>
                      <p>Effective minutes · recent 7 days</p>
                    </div>
                    <span>Local only</span>
                  </header>
                  <div
                    className="insights-chart"
                    aria-label="Daily effective reading time"
                  >
                    {days.map((day, index) => (
                      <div className="insights-chart__day" key={day.date}>
                        <i
                          className={index === days.length - 1 ? "is-today" : undefined}
                          style={{
                            height: `${Math.max(
                              day.activeSeconds > 0 ? 8 : 2,
                              Math.round((day.activeSeconds / maxSeconds) * 100),
                            )}%`,
                          }}
                          title={`${dayLabel(day.date)}: ${formatDuration(day.activeSeconds)}`}
                        />
                        <span>
                          {index === days.length - 1 ? "Today" : shortDay(day.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="insights-panel" aria-labelledby="by-book-title">
                  <header>
                    <div>
                      <h2 id="by-book-title">By book</h2>
                      <p>Time and saved completion</p>
                    </div>
                  </header>
                  <div className="insights-books">
                    {statistics.books.map((book, index) => (
                      <BookRow book={book} colorIndex={index} key={book.bookId} />
                    ))}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
        <div className="insights-mobile-sticky">
          <button type="button" onClick={onOpenSettings}>
            History &amp; Privacy
          </button>
        </div>
      </section>
    </main>
  );
}

function Summary({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{children}</small>
    </article>
  );
}

function BookRow({
  book,
  colorIndex,
}: {
  book: ReadingBookStatistic;
  colorIndex: number;
}) {
  return (
    <article className="insights-book-row">
      <div className={`insights-book-mark insights-book-mark--${colorIndex % 3}`} />
      <div>
        <strong>{book.title}</strong>
        <small>
          {book.format.toLocaleUpperCase()} · {formatProgress(book.progress)}
        </small>
      </div>
      <div>
        <strong>{formatDuration(book.activeSeconds)}</strong>
        <small>{book.sessionCount} local sessions</small>
      </div>
    </article>
  );
}

function completeRecentDays(records: ReadingDailyStatistic[]): ReadingDailyStatistic[] {
  const byDate = new Map(records.map((record) => [record.date, record.activeSeconds]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    return { date: key, activeSeconds: byDate.get(key) ?? 0 };
  });
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function shortDay(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function isToday(timestamp?: string): boolean {
  if (timestamp === undefined) return false;
  return localDateKey(new Date(timestamp)) === localDateKey(new Date());
}

function formatProgress(progress?: number): string {
  return progress === undefined
    ? "No saved progress"
    : `${Math.round(progress * 100)}% complete`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return seconds <= 0 ? "0 min" : "< 1 min";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours === 0
    ? `${minutes} min`
    : `${hours} h ${String(remainder).padStart(2, "0")} min`;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return error instanceof Error ? error.message : String(error);
}

function InsightsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18V9M10 18V5M16 18v-7M22 18V3" />
      <path d="M2 21h21" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.4v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H1V9.4h.9A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 3.2l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V1h4.2v.9A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.9v4.2h-.9a1.7 1.7 0 0 0-1.7 1.4Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14M16 5v14" />
    </svg>
  );
}
