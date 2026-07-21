import { memo, type CSSProperties } from "react";
import { ReaderPageButton } from "./ReaderPageButton";

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
  pageFieldLabel: string;
  pageInputAriaLabel: string;
  pageInputDisabled: boolean;
  pageInputMax: number | null;
  pageInputTotalLabel?: string;
  pageInputValue: string;
  positionLabel: string;
  previousDisabled?: boolean;
  progressAriaLabel: string;
  progressDisabled: boolean;
  progressLabel: string;
  progressTooltip: string;
  progressValue: number;
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
  pageFieldLabel,
  pageInputAriaLabel,
  pageInputDisabled,
  pageInputMax,
  pageInputTotalLabel,
  pageInputValue,
  positionLabel,
  previousDisabled = false,
  progressAriaLabel,
  progressDisabled,
  progressLabel,
  progressTooltip,
  progressValue,
}: PaginatedReaderControlsProps) {
  const normalizedProgressValue = Math.min(1000, Math.max(0, progressValue));
  const progressControlStyle = {
    "--epub-progress-percent": `${normalizedProgressValue / 10}%`,
  } as CSSProperties;

  return (
    <div className="reader-epub-controls" aria-label={ariaLabel}>
      <div className="reader-epub-control-row">
        <div className="reader-page-navigation">
          <ReaderPageButton
            direction="previous"
            disabled={previousDisabled}
            onClick={onPrevious}
          />
          <div className="reader-epub-status" aria-live="polite">
            <span>{chapterTitle}</span>
            <strong>{positionLabel}</strong>
            <span>{progressLabel}</span>
          </div>
          <ReaderPageButton direction="next" disabled={nextDisabled} onClick={onNext} />
        </div>
      </div>
      <div className="reader-epub-progress" style={progressControlStyle}>
        <div className="reader-epub-progress__meta">
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
            <span>/ {pageInputTotalLabel ?? pageInputMax ?? "-"}</span>
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
