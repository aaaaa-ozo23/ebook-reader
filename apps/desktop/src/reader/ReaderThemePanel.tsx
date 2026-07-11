/* eslint-disable react-refresh/only-export-components -- theme tokens and their panel share one reader-only module */
import { useCallback, type ChangeEvent, type KeyboardEvent } from "react";
import type { PageTransitionMode, ReaderTheme, ReaderThemeMode } from "@reader/core";
import { Button } from "../components/ui/Button";

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
] as const;

const TRANSITION_LABELS: Record<PageTransitionMode, string> = {
  none: "None",
  "page-curl": "Realistic",
  cover: "Cover",
  slide: "Smooth",
};

export type TxtReadingModeOption = "continuous" | PageTransitionMode;
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
  pageTransition?: PageTransitionMode;
  pageTransitionError?: string | null;
  pageTransitionModes?: readonly PageTransitionMode[];
  theme: ReaderTheme;
  themeError: string | null;
  txtReadingMode?: TxtReadingModeOption;
  txtReadingModeOptions?: readonly TxtReadingModeOption[];
  onPageTransitionChange?: (mode: PageTransitionMode) => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onTxtReadingModeChange?: (mode: TxtReadingModeOption) => void;
}

export function ReaderThemePanel({
  isOpen,
  pageTransition,
  pageTransitionError,
  pageTransitionModes,
  theme,
  themeError,
  txtReadingMode,
  txtReadingModeOptions,
  onPageTransitionChange,
  onThemeChange,
  onTxtReadingModeChange,
}: ReaderThemePanelProps) {
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
      (event: ChangeEvent<HTMLInputElement>) => {
        onThemeChange({ ...theme, [field]: Number(event.currentTarget.value) });
      },
    [onThemeChange, theme],
  );

  if (!isOpen) return null;

  return (
    <aside className="reader-theme-panel" aria-label="Reader theme">
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
                A
              </span>
              {mode}
            </Button>
          ),
        )}
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
      {txtReadingMode !== undefined &&
      txtReadingModeOptions !== undefined &&
      onTxtReadingModeChange !== undefined ? (
        <div className="theme-field">
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
      {pageTransition !== undefined &&
      pageTransitionModes !== undefined &&
      onPageTransitionChange !== undefined ? (
        <div className="theme-field">
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
      <input
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={onChange}
      />
    </label>
  );
}
