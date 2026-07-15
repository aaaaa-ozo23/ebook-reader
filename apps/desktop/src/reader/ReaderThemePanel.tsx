/* eslint-disable react-refresh/only-export-components -- theme tokens and their panel share one reader-only module */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PageTransitionMode, ReaderTheme, ReaderThemeMode } from "@reader/core";
import { Button } from "../components/ui/Button";
import { ReaderIcon } from "./ReaderIcons";

export const THEME_PRESETS: Record<
  ReaderThemeMode,
  Pick<ReaderTheme, "backgroundColor" | "textColor">
> = {
  light: { backgroundColor: "#fbfaf7", textColor: "#20262c" },
  sepia: { backgroundColor: "#f7f1e3", textColor: "#25211d" },
  green: { backgroundColor: "#eef4e8", textColor: "#1f3329" },
  dark: { backgroundColor: "#171a1d", textColor: "#f0e8d7" },
};

const FONT_OPTIONS = [
  {
    label: "Lora",
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
] as const;

const TRANSITION_LABELS: Record<PageTransitionMode, string> = {
  none: "None",
  "page-curl": "Realistic",
  cover: "Cover",
  slide: "Smooth",
};

export type TxtReadingModeOption = "continuous" | PageTransitionMode;
export type PdfReadingModeOption = "continuous" | PageTransitionMode;
const TXT_READING_MODE_LABELS: Record<TxtReadingModeOption, string> = {
  continuous: "Continuous",
  ...TRANSITION_LABELS,
};

export function getReaderThemeTokens(theme: ReaderTheme): Record<string, string> {
  const isDark = theme.mode === "dark";

  return {
    "--txt-reader-heading": theme.textColor,
    "--txt-reader-muted": isDark ? "rgba(240, 232, 215, 0.72)" : "#5f6870",
    "--txt-reader-chrome-background": isDark
      ? "rgba(24, 28, 31, 0.96)"
      : "rgba(249, 246, 239, 0.96)",
    "--txt-reader-chrome-border": isDark ? "rgba(240, 232, 215, 0.16)" : "#d9cfbd",
    "--txt-reader-link": isDark ? "#f3bc55" : "#2f5d62",
    "--txt-reader-meta-background": isDark
      ? "rgba(240, 232, 215, 0.08)"
      : "rgba(255, 255, 255, 0.54)",
    "--txt-reader-meta-border": isDark ? "rgba(240, 232, 215, 0.18)" : "#d8cebc",
    "--txt-reader-panel-background": isDark ? "#222a2e" : "#fbfaf7",
    "--txt-reader-panel-text": isDark ? "#f7f2e8" : "#243038",
    "--txt-reader-control-background": isDark ? "#151a1d" : "#ffffff",
  };
}

interface ReaderThemePanelProps {
  isOpen: boolean;
  onClose: () => void;
  pageViewDisabled?: boolean;
  pageViewDisabledMessage?: string;
  pageViewMode?: "single" | "double";
  pageTransition?: PageTransitionMode;
  pageTransitionError?: string | null;
  pageTransitionModes?: readonly PageTransitionMode[];
  pdfReadingMode?: PdfReadingModeOption;
  pdfReadingModeOptions?: readonly PdfReadingModeOption[];
  theme: ReaderTheme;
  themeError: string | null;
  txtReadingMode?: TxtReadingModeOption;
  txtReadingModeOptions?: readonly TxtReadingModeOption[];
  onPageTransitionChange?: (mode: PageTransitionMode) => void;
  onPageViewModeChange?: (mode: "single" | "double") => void;
  onPdfReadingModeChange?: (mode: PdfReadingModeOption) => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onTxtReadingModeChange?: (mode: TxtReadingModeOption) => void;
}

interface MobileSheetGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  lastY: number;
  lastTime: number;
  isVertical: boolean;
}

export function ReaderThemePanel({
  isOpen,
  onClose,
  pageViewDisabled = false,
  pageViewDisabledMessage,
  pageViewMode,
  pageTransition,
  pageTransitionError,
  pageTransitionModes,
  pdfReadingMode,
  pdfReadingModeOptions,
  theme,
  themeError,
  txtReadingMode,
  txtReadingModeOptions,
  onPageTransitionChange,
  onPageViewModeChange,
  onPdfReadingModeChange,
  onThemeChange,
  onTxtReadingModeChange,
}: ReaderThemePanelProps) {
  const closeTimerRef = useRef<number | null>(null);
  const sheetGestureRef = useRef<MobileSheetGesture | null>(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [sheetMotionMs, setSheetMotionMs] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const handleModeChange = useCallback(
    (mode: ReaderThemeMode) => {
      onThemeChange({ ...theme, mode, ...THEME_PRESETS[mode] });
    },
    [onThemeChange, theme],
  );
  const handleFontFamilyChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onThemeChange({ ...theme, fontFamily: event.currentTarget.value });
    },
    [onThemeChange, theme],
  );
  const handleNumberChange = useCallback(
    (field: "fontSize" | "lineHeight" | "paragraphSpacing" | "pageMargin") =>
      (value: number) => {
        onThemeChange({ ...theme, [field]: value });
      },
    [onThemeChange, theme],
  );

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const handleSheetPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        (event.pointerType !== "touch" && event.pointerType !== "pen") ||
        window.matchMedia("(min-width: 521px)").matches ||
        (event.target as HTMLElement).closest("button") !== null
      ) {
        return;
      }
      sheetGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: event.timeStamp,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        isVertical: false,
      };
      setSheetMotionMs(0);
    },
    [],
  );

  const handleSheetPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = sheetGestureRef.current;
      if (gesture === null || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (!gesture.isVertical) {
        if (Math.abs(dy) < 7) return;
        if (Math.abs(dy) <= Math.abs(dx)) {
          sheetGestureRef.current = null;
          return;
        }
        gesture.isVertical = true;
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic pointers and older webviews can reject capture; movement still tracks.
        }
        setIsSheetDragging(true);
      }
      gesture.lastY = event.clientY;
      gesture.lastTime = event.timeStamp;
      setSheetOffset(dy >= 0 ? dy : dy * 0.18);
      event.preventDefault();
    },
    [],
  );

  const finishSheetGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = sheetGestureRef.current;
      if (gesture === null || gesture.pointerId !== event.pointerId) return;
      sheetGestureRef.current = null;
      try {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        // The pointer may already have been cancelled by the host webview.
      }
      setIsSheetDragging(false);
      if (!gesture.isVertical) return;
      const elapsed = Math.max(1, gesture.lastTime - gesture.startTime);
      const velocity = (gesture.lastY - gesture.startY) / elapsed;
      const height =
        event.currentTarget.parentElement?.getBoundingClientRect().height ?? 0;
      const shouldClose = sheetOffset > height * 0.28 || velocity > 0.42;
      if (shouldClose) {
        const remaining = Math.max(0, height - sheetOffset);
        const duration = Math.round(Math.min(240, Math.max(110, remaining / 2.2)));
        setSheetMotionMs(duration);
        setSheetOffset(height + 2);
        closeTimerRef.current = window.setTimeout(() => {
          onClose();
          setSheetOffset(0);
          setSheetMotionMs(0);
        }, duration);
      } else {
        setSheetMotionMs(230);
        setSheetOffset(0);
      }
    },
    [onClose, sheetOffset],
  );

  return (
    <aside
      className={`reader-theme-panel${isSheetDragging ? " reader-theme-panel--dragging" : ""}`}
      aria-label="Reading settings"
      hidden={!isOpen}
      style={
        {
          "--reader-sheet-offset": `${sheetOffset}px`,
          "--reader-sheet-motion": `${sheetMotionMs}ms`,
        } as CSSProperties
      }
    >
      <header
        className="reader-theme-panel__header"
        onPointerCancel={finishSheetGesture}
        onPointerDown={handleSheetPointerDown}
        onPointerMove={handleSheetPointerMove}
        onPointerUp={finishSheetGesture}
      >
        <h2>Reading settings</h2>
        <button
          type="button"
          aria-label="Close reading settings"
          autoFocus={isOpen}
          onClick={onClose}
        >
          <ReaderIcon name="close" />
        </button>
      </header>
      <section className="reader-theme-section reader-theme-section--theme">
        <p className="reader-theme-panel__section-label">Theme</p>
        <div className="theme-mode-grid" role="group" aria-label="Theme mode">
          {(["light", "sepia", "green", "dark"] satisfies ReaderThemeMode[]).map(
            (mode) => (
              <Button
                key={mode}
                className="theme-mode-button"
                variant="ghost"
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
                  Aa
                </span>
                <span>{mode}</span>
              </Button>
            ),
          )}
        </div>
      </section>
      <section className="reader-theme-section reader-theme-section--typography">
        <div className="reader-theme-compact-fields">
          <label className="theme-field theme-field--font">
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
        </div>
        <TypographyChoice
          label="Line"
          value={theme.lineHeight}
          options={[1.5, 1.75, 2]}
          onChange={handleNumberChange("lineHeight")}
        />
        <TypographyChoice
          label="Spacing"
          value={theme.paragraphSpacing}
          options={[6, 12, 20]}
          onChange={handleNumberChange("paragraphSpacing")}
        />
        <TypographyChoice
          label="Margin"
          value={theme.pageMargin}
          options={[20, 32, 56]}
          onChange={handleNumberChange("pageMargin")}
        />
      </section>
      <section className="reader-theme-section reader-theme-section--capabilities">
        {txtReadingMode !== undefined &&
        txtReadingModeOptions !== undefined &&
        onTxtReadingModeChange !== undefined ? (
          <div className="theme-field theme-field--capability">
            <span>Reading mode</span>
            <div
              className="reader-theme-transition-options reader-theme-transition-options--txt"
              role="radiogroup"
              aria-label="TXT reading mode"
            >
              {txtReadingModeOptions.map((mode, index) => (
                <Button
                  key={mode}
                  className="reader-transition-option"
                  variant="ghost"
                  role="radio"
                  aria-checked={txtReadingMode === mode}
                  tabIndex={txtReadingMode === mode ? 0 : -1}
                  onClick={() => onTxtReadingModeChange(mode)}
                  onKeyDown={(event) =>
                    handleReadingModeKeyDown(
                      event,
                      index,
                      txtReadingModeOptions,
                      onTxtReadingModeChange,
                    )
                  }
                >
                  <TransitionPreview mode={mode} />
                  <span>{TXT_READING_MODE_LABELS[mode]}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {pdfReadingMode !== undefined &&
        pdfReadingModeOptions !== undefined &&
        onPdfReadingModeChange !== undefined ? (
          <div className="theme-field theme-field--capability">
            <span>Reading mode</span>
            <div
              className="reader-theme-transition-options reader-theme-transition-options--txt"
              role="radiogroup"
              aria-label="PDF reading mode"
            >
              {pdfReadingModeOptions.map((mode, index) => (
                <Button
                  key={mode}
                  className="reader-transition-option"
                  variant="ghost"
                  role="radio"
                  aria-checked={pdfReadingMode === mode}
                  tabIndex={pdfReadingMode === mode ? 0 : -1}
                  onClick={() => onPdfReadingModeChange(mode)}
                  onKeyDown={(event) =>
                    handleReadingModeKeyDown(
                      event,
                      index,
                      pdfReadingModeOptions,
                      onPdfReadingModeChange,
                    )
                  }
                >
                  <TransitionPreview mode={mode} />
                  <span>{TXT_READING_MODE_LABELS[mode]}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {pageTransition !== undefined &&
        pageTransitionModes !== undefined &&
        onPageTransitionChange !== undefined ? (
          <div className="theme-field theme-field--capability">
            <span>Page transition</span>
            <div
              className="reader-theme-transition-options"
              role="radiogroup"
              aria-label="EPUB page transition"
            >
              {pageTransitionModes.map((mode, index) => (
                <Button
                  key={mode}
                  className="reader-transition-option"
                  variant="ghost"
                  role="radio"
                  aria-checked={pageTransition === mode}
                  tabIndex={pageTransition === mode ? 0 : -1}
                  onClick={() => onPageTransitionChange(mode)}
                  onKeyDown={(event) =>
                    handleTransitionKeyDown(
                      event,
                      index,
                      pageTransitionModes,
                      onPageTransitionChange,
                    )
                  }
                >
                  <TransitionPreview mode={mode} />
                  <span>{TRANSITION_LABELS[mode]}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {pageViewMode !== undefined && onPageViewModeChange !== undefined ? (
          <div className="theme-field theme-field--capability theme-field--page-view">
            <span>Page view</span>
            <div
              className="reader-page-view-options"
              role="radiogroup"
              aria-label="Page view"
            >
              {(["single", "double"] as const).map((mode) => (
                <Button
                  key={mode}
                  className="reader-page-view-option"
                  variant="ghost"
                  role="radio"
                  aria-checked={pageViewMode === mode}
                  disabled={pageViewDisabled}
                  onClick={() => onPageViewModeChange(mode)}
                >
                  {mode}
                </Button>
              ))}
            </div>
            {pageViewDisabled && pageViewDisabledMessage !== undefined ? (
              <p className="reader-page-view-description">{pageViewDisabledMessage}</p>
            ) : null}
          </div>
        ) : null}
      </section>
      {themeError !== null ? <p className="theme-error">{themeError}</p> : null}
      {pageTransitionError !== null && pageTransitionError !== undefined ? (
        <p className="theme-error">{pageTransitionError}</p>
      ) : null}
    </aside>
  );
}

function TransitionPreview({ mode }: { mode: TxtReadingModeOption }) {
  return (
    <span
      className={`reader-transition-preview reader-transition-preview--${mode}`}
      aria-hidden="true"
    >
      <span className="reader-transition-preview__page reader-transition-preview__page--target" />
      <span className="reader-transition-preview__page reader-transition-preview__page--current" />
      <span className="reader-transition-preview__fold" />
    </span>
  );
}

function handleReadingModeKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  modes: readonly TxtReadingModeOption[],
  onChange: (mode: TxtReadingModeOption) => void,
) {
  handleRadioKeyDown(event, index, modes, onChange);
}

function handleTransitionKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  modes: readonly PageTransitionMode[],
  onChange: (mode: PageTransitionMode) => void,
) {
  handleRadioKeyDown(event, index, modes, onChange);
}

function handleRadioKeyDown<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  modes: readonly T[],
  onChange: (mode: T) => void,
) {
  let nextIndex: number | null = null;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (index + 1) % modes.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (index - 1 + modes.length) % modes.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = modes.length - 1;
  }

  if (nextIndex === null) return;

  event.preventDefault();
  const nextMode = modes[nextIndex];
  const buttons =
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    );
  buttons?.[nextIndex]?.focus();
  if (nextMode !== undefined) onChange(nextMode);
}

interface TypographyChoiceProps {
  label: "Line" | "Spacing" | "Margin";
  onChange: (value: number) => void;
  options: readonly number[];
  value: number;
}

function TypographyChoice({ label, onChange, options, value }: TypographyChoiceProps) {
  const selectedIndex = options.reduce(
    (closestIndex, option, index) =>
      Math.abs(option - value) < Math.abs((options[closestIndex] ?? option) - value)
        ? index
        : closestIndex,
    0,
  );

  return (
    <div className="theme-field theme-field--choice">
      <span>{label}</span>
      <div
        className="theme-typography-options"
        role="radiogroup"
        aria-label={`${label} preset`}
      >
        {options.map((option, index) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={index === selectedIndex}
            aria-label={`${label} ${index + 1}`}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                nextIndex = (index + 1) % options.length;
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                nextIndex = (index - 1 + options.length) % options.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = options.length - 1;
              }
              if (nextIndex === null) return;
              event.preventDefault();
              const nextValue = options[nextIndex];
              const radioButtons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="radio"]',
                );
              radioButtons?.[nextIndex]?.focus();
              if (nextValue !== undefined) onChange(nextValue);
            }}
          >
            <span
              className={`theme-typography-glyph theme-typography-glyph--${label.toLowerCase()} theme-typography-glyph--${index + 1}`}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ThemeSliderProps {
  label: string;
  max: number;
  min: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function ThemeSlider({ label, max, min, step, value, onChange }: ThemeSliderProps) {
  const displayValue = formatThemeControlValue(label, value);

  return (
    <div className="theme-field">
      <span>{label}</span>
      <div className="theme-stepper" role="group" aria-label={`${label} controls`}>
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
        >
          −
        </button>
        <output aria-live="polite">{displayValue}</output>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
        >
          +
        </button>
      </div>
      <input
        className="theme-stepper__range"
        aria-label={`${label} value`}
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

function formatThemeControlValue(label: string, value: number): string {
  if (label === "Size") return `${Math.round((value / 18) * 100)}%`;
  if (label === "Line") return value.toFixed(2);
  return `${Math.round(value)}px`;
}
