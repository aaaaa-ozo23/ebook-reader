import { memo, type CSSProperties } from "react";

export type ReaderSpreadMode = "single" | "double";

export interface PaginatedReaderControlsProps {
  ariaLabel: string;
  chapterTitle: string;
  isDraggingProgress: boolean;
  nextDisabled?: boolean;
  onNext: () => void;
  onPageInputChange: (value: string) => void;
  onPageInputCommit: () => void;
  onPrevious: () => void;
  onProgressChange: (value: string) => void;
  onProgressCommit: () => void;
  onProgressStart: () => void;
  onSpreadModeChange: (mode: ReaderSpreadMode) => void;
  pageFieldLabel: string;
  pageInputAriaLabel: string;
  pageInputDisabled: boolean;
  pageInputMax: number | null;
  pageInputValue: string;
  positionLabel: string;
  previousDisabled?: boolean;
  progressAriaLabel: string;
  progressDisabled: boolean;
  progressLabel: string;
  progressTooltip: string;
  progressValue: number;
  requestedSpreadMode: ReaderSpreadMode;
  spreadAriaLabel: string;
  spreadModeDescription?: string;
}

export const PaginatedReaderControls = memo(function PaginatedReaderControls({
  ariaLabel,
  chapterTitle,
  isDraggingProgress,
  nextDisabled = false,
  onNext,
  onPageInputChange,
  onPageInputCommit,
  onPrevious,
  onProgressChange,
  onProgressCommit,
  onProgressStart,
  onSpreadModeChange,
  pageFieldLabel,
  pageInputAriaLabel,
  pageInputDisabled,
  pageInputMax,
  pageInputValue,
  positionLabel,
  previousDisabled = false,
  progressAriaLabel,
  progressDisabled,
  progressLabel,
  progressTooltip,
  progressValue,
  requestedSpreadMode,
  spreadAriaLabel,
  spreadModeDescription,
}: PaginatedReaderControlsProps) {
  const normalizedProgressValue = Math.min(1000, Math.max(0, progressValue));
  const progressControlStyle = {
    "--epub-progress-percent": `${normalizedProgressValue / 10}%`,
  } as CSSProperties;

  return (
    <div className="reader-epub-controls" aria-label={ariaLabel}>
      <div className="reader-epub-control-row">
        <button
          type="button"
          className="reader-tool-button"
          disabled={previousDisabled}
          onClick={onPrevious}
        >
          Previous
        </button>
        <div className="reader-epub-status" aria-live="polite">
          <span>{chapterTitle}</span>
          <strong>{positionLabel}</strong>
          <span>{progressLabel}</span>
        </div>
        <button
          type="button"
          className="reader-tool-button"
          disabled={nextDisabled}
          onClick={onNext}
        >
          Next
        </button>
        <div
          className="reader-epub-mode-toggle"
          role="group"
          aria-label={spreadAriaLabel}
          title={spreadModeDescription}
        >
          <button
            type="button"
            aria-pressed={requestedSpreadMode === "single"}
            onClick={() => onSpreadModeChange("single")}
          >
            Single
          </button>
          <button
            type="button"
            aria-pressed={requestedSpreadMode === "double"}
            onClick={() => onSpreadModeChange("double")}
          >
            Double
          </button>
        </div>
        {spreadModeDescription === undefined ? null : (
          <span className="reader-spread-mode-note" role="status">
            {spreadModeDescription}
          </span>
        )}
      </div>
      <div className="reader-epub-progress" style={progressControlStyle}>
        <div className="reader-epub-progress__meta">
          <span>{chapterTitle}</span>
          <label className="reader-page-field reader-epub-page-field">
            <span>{pageFieldLabel}</span>
            <input
              aria-label={pageInputAriaLabel}
              disabled={pageInputDisabled}
              min={1}
              max={pageInputMax ?? 1}
              type="number"
              value={pageInputValue}
              onBlur={onPageInputCommit}
              onChange={(event) => onPageInputChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onPageInputCommit();
                }
              }}
            />
            <span>/ {pageInputMax ?? "-"}</span>
          </label>
        </div>
        <div className="reader-epub-progress__track">
          {progressDisabled ? null : (
            <span
              className={`reader-epub-progress__tooltip ${
                isDraggingProgress ? "reader-epub-progress__tooltip--visible" : ""
              }`}
              aria-hidden="true"
            >
              {progressTooltip}
            </span>
          )}
          <input
            aria-label={progressAriaLabel}
            className="reader-epub-progress__range"
            disabled={progressDisabled}
            max={1000}
            min={0}
            step={1}
            type="range"
            value={normalizedProgressValue}
            onBlur={onProgressCommit}
            onChange={(event) => onProgressChange(event.currentTarget.value)}
            onKeyUp={onProgressCommit}
            onPointerDown={onProgressStart}
            onPointerUp={onProgressCommit}
          />
        </div>
      </div>
    </div>
  );
});
