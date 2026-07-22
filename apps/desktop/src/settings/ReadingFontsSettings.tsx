import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomFont, CustomFontPreview, ReaderTheme } from "@reader/core";

import {
  customFontCssFamily,
  getCustomFontAssetUrl,
  importCustomFont,
  inspectCustomFont,
  listCustomFonts,
  pickCustomFontFile,
  removeCustomFont,
  setCustomFontEnabled,
} from "../tauri/fonts";
import { getReaderTheme, saveReaderTheme } from "../tauri/reader";

const BUILT_IN_FAMILY =
  '"Noto Serif SC", "Songti SC", "Microsoft YaHei", Georgia, serif';

interface PendingFont {
  path: string;
  preview: CustomFontPreview;
}

export function ReadingFontsSettings() {
  const [fonts, setFonts] = useState<CustomFont[]>([]);
  const [theme, setTheme] = useState<ReaderTheme | null>(null);
  const [pendingFont, setPendingFont] = useState<PendingFont | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CustomFont | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const loadState = useCallback(async () => {
    const [nextFonts, nextTheme] = await Promise.all([
      listCustomFonts(),
      getReaderTheme(),
    ]);
    setFonts(nextFonts);
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void Promise.all([listCustomFonts(), getReaderTheme()])
      .then(([nextFonts, nextTheme]) => {
        if (!isCurrent) return;
        setFonts(nextFonts);
        setTheme(nextTheme);
      })
      .catch((nextError: unknown) => {
        if (isCurrent) setError(errorMessage(nextError));
      });
    return () => {
      isCurrent = false;
    };
  }, [loadState]);

  useEffect(() => {
    let isCurrent = true;
    const faces: FontFace[] = [];
    void Promise.all(
      fonts
        .filter((font) => font.enabled)
        .map(async (font) => {
          const source = await getCustomFontAssetUrl(font);
          const face = new FontFace(font.familyAlias, `url("${source}")`);
          await face.load();
          if (isCurrent) {
            document.fonts.add(face);
            faces.push(face);
          }
        }),
    ).catch(() => undefined);
    return () => {
      isCurrent = false;
      for (const face of faces) document.fonts.delete(face);
    };
  }, [fonts]);

  const selectedFont = useMemo(
    () => fonts.find((font) => font.id === theme?.fontId && font.enabled),
    [fonts, theme?.fontId],
  );

  const handleChooseFont = useCallback(async () => {
    setError(null);
    setNotice(null);
    dialogReturnFocusRef.current = importButtonRef.current;
    try {
      const path = await pickCustomFontFile();
      if (path === null) return;
      const preview = await inspectCustomFont(path);
      if (preview.duplicateFont !== undefined) {
        setNotice(
          `${preview.duplicateFont.familyName} ${preview.duplicateFont.styleName} is already in your font library. No duplicate copy was created.`,
        );
        return;
      }
      setPendingFont({ path, preview });
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, []);

  const restoreDialogFocus = useCallback(() => {
    window.setTimeout(() => {
      const target = dialogReturnFocusRef.current;
      if (target?.isConnected === true) target.focus();
      else importButtonRef.current?.focus();
    }, 0);
  }, []);

  const handleCancelImport = useCallback(() => {
    setPendingFont(null);
    restoreDialogFocus();
  }, [restoreDialogFocus]);

  const handleCancelRemove = useCallback(() => {
    setRemoveTarget(null);
    restoreDialogFocus();
  }, [restoreDialogFocus]);

  const handleImport = useCallback(async () => {
    if (pendingFont === null) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await importCustomFont(pendingFont.path);
      setPendingFont(null);
      await loadState();
      setNotice(
        result.status === "duplicate"
          ? `${result.font.familyName} is already in your font library.`
          : `${result.font.familyName} is ready for TXT and EPUB.`,
      );
      window.setTimeout(() => importButtonRef.current?.focus(), 0);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  }, [loadState, pendingFont]);

  const handleSelect = useCallback(
    async (font?: CustomFont) => {
      if (theme === null) return;
      setIsBusy(true);
      setError(null);
      try {
        setTheme(
          await saveReaderTheme({
            ...theme,
            fontId: font?.id,
            fontFamily:
              font === undefined ? BUILT_IN_FAMILY : customFontCssFamily(font),
          }),
        );
      } catch (nextError) {
        setError(errorMessage(nextError));
      } finally {
        setIsBusy(false);
      }
    },
    [theme],
  );

  const handleToggle = useCallback(
    async (font: CustomFont) => {
      setIsBusy(true);
      setError(null);
      try {
        const updated = await setCustomFontEnabled(font.id, !font.enabled);
        setFonts((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        if (!updated.enabled && theme?.fontId === updated.id) {
          setTheme(await getReaderTheme());
          setNotice(
            `${updated.familyName} was disabled. Reading font returned to Lora.`,
          );
        }
      } catch (nextError) {
        setError(errorMessage(nextError));
      } finally {
        setIsBusy(false);
      }
    },
    [theme],
  );

  const handleRemove = useCallback(async () => {
    if (removeTarget === null) return;
    setIsBusy(true);
    setError(null);
    try {
      const wasSelected = theme?.fontId === removeTarget.id;
      await removeCustomFont(removeTarget.id);
      setRemoveTarget(null);
      await loadState();
      setNotice(
        wasSelected
          ? `${removeTarget.familyName} was removed. Reading font returned to Lora.`
          : `${removeTarget.familyName} was removed from this device.`,
      );
      restoreDialogFocus();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  }, [loadState, removeTarget, restoreDialogFocus, theme]);

  return (
    <>
      <div className="font-local-notice" role="note">
        <LockIcon />
        <div>
          <strong>App-local by design</strong>
          <p>
            Imported files are copied into Ebook Reader&apos;s private font library.
            Nothing is installed system-wide or sent online.
          </p>
        </div>
      </div>

      <section className="font-preview-card" aria-label="Reading font preview">
        <div>
          <span>Selected font · {selectedFont?.familyName ?? "Lora"}</span>
          <p
            style={{
              fontFamily:
                selectedFont === undefined
                  ? BUILT_IN_FAMILY
                  : customFontCssFamily(selectedFont),
            }}
          >
            Every page should feel quiet enough for the story to speak.
          </p>
        </div>
        <aside>
          <strong>
            {selectedFont === undefined
              ? "Lora"
              : `${selectedFont.familyName} ${selectedFont.styleName}`}
          </strong>
          <small>
            {selectedFont === undefined ? "Built-in fallback" : "Custom · Enabled"}
          </small>
        </aside>
      </section>

      <div className="font-library-heading">
        <div>
          <h2>Font library</h2>
          <span>Applied to TXT and EPUB</span>
        </div>
        <button
          ref={importButtonRef}
          type="button"
          className="settings-button settings-button--primary"
          disabled={isBusy}
          onClick={() => void handleChooseFont()}
        >
          <PlusIcon /> Import font
        </button>
      </div>

      {notice !== null ? <FontFeedback kind="success" text={notice} /> : null}
      {error !== null ? <FontFeedback kind="error" text={error} /> : null}

      <section className="font-library-list" aria-label="Font library">
        <FontRow
          family="Lora"
          meta="Built-in reading font · Fallback"
          selected={selectedFont === undefined}
          onSelect={() => void handleSelect()}
        />
        {fonts.map((font) => (
          <FontRow
            key={font.id}
            family={font.familyName}
            meta={`${font.styleName} · ${formatBytes(font.fileSize)}`}
            enabled={font.enabled}
            selected={selectedFont?.id === font.id}
            style={{ fontFamily: customFontCssFamily(font) }}
            onSelect={() => void handleSelect(font)}
            onToggle={() => void handleToggle(font)}
            onRemove={() => {
              dialogReturnFocusRef.current =
                document.activeElement as HTMLElement | null;
              setRemoveTarget(font);
            }}
          />
        ))}
      </section>

      <p className="font-format-note">
        <InfoIcon /> Static TTF and OTF only · 20 MiB maximum per file. You are
        responsible for permission to use imported fonts. PDF uses fonts embedded in the
        document.
      </p>

      {pendingFont !== null ? (
        <FontImportDialog
          pending={pendingFont}
          busy={isBusy}
          onCancel={handleCancelImport}
          onImport={() => void handleImport()}
        />
      ) : null}
      {removeTarget !== null ? (
        <FontRemoveDialog
          font={removeTarget}
          selected={theme?.fontId === removeTarget.id}
          busy={isBusy}
          onCancel={handleCancelRemove}
          onRemove={() => void handleRemove()}
        />
      ) : null}
    </>
  );
}

function FontRow({
  enabled = true,
  family,
  meta,
  onRemove,
  onSelect,
  onToggle,
  selected,
  style,
}: {
  enabled?: boolean;
  family: string;
  meta: string;
  onRemove?: () => void;
  onSelect: () => void;
  onToggle?: () => void;
  selected: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <article className="font-library-row" data-enabled={enabled}>
      <span className="font-library-row__sample" style={style} aria-hidden="true">
        Aa
      </span>
      <div>
        <strong>{family}</strong>
        <small>{meta}</small>
      </div>
      {selected ? <em>Selected</em> : onRemove === undefined ? <em>Built in</em> : null}
      {!selected && enabled ? (
        <button type="button" className="font-use-button" onClick={onSelect}>
          Use
        </button>
      ) : null}
      {onToggle !== undefined ? (
        <button
          type="button"
          className="font-toggle"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? "Disable" : "Enable"} ${family}`}
          onClick={onToggle}
        >
          <i />
        </button>
      ) : null}
      {onRemove !== undefined ? (
        <button
          type="button"
          className="font-remove-button"
          aria-label={`Remove ${family}`}
          onClick={onRemove}
        >
          <TrashIcon />
        </button>
      ) : null}
    </article>
  );
}

function FontFeedback({ kind, text }: { kind: "success" | "error"; text: string }) {
  return (
    <div
      className={`font-feedback font-feedback--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "error" ? <WarningIcon /> : <CheckIcon />}
      <span>{text}</span>
    </div>
  );
}

function FontImportDialog({
  pending,
  busy,
  onCancel,
  onImport,
}: {
  pending: PendingFont;
  busy: boolean;
  onCancel: () => void;
  onImport: () => void;
}) {
  useEscapeDismiss(onCancel, busy);
  const { preview } = pending;
  return (
    <div className="font-dialog-scrim">
      <section
        className="font-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="font-import-title"
      >
        <header>
          <div>
            <span>Local font</span>
            <h2 id="font-import-title">Review before importing</h2>
          </div>
          <button
            type="button"
            className="settings-close"
            aria-label="Close font import"
            disabled={busy}
            onClick={onCancel}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="font-dialog__body">
          <div className="font-dropzone" aria-label="Selected local font">
            <span aria-hidden="true">
              <PlusIcon />
            </span>
            <strong>Ready to add to your private font library</strong>
            <small>Static TTF or OTF · stored only on this device</small>
          </div>
          <div className="font-file-review">
            <span aria-hidden="true">{fileExtension(preview.fileName)}</span>
            <div>
              <strong>{preview.fileName}</strong>
              <small>Parsed successfully · duplicate check passed</small>
            </div>
            <dl>
              <dt>Family</dt>
              <dd>{preview.familyName}</dd>
              <dt>Style</dt>
              <dd>{preview.styleName}</dd>
              <dt>Size</dt>
              <dd>{formatBytes(preview.fileSize)}</dd>
            </dl>
          </div>
          <div className="font-license-notice" role="note">
            <InfoIcon />
            <p>
              <strong>Use fonts you have permission to use.</strong>Ebook Reader stores
              this file locally and cannot verify its license. Importing confirms that
              you accept responsibility for its use.
            </p>
          </div>
        </div>
        <footer>
          <button
            type="button"
            className="settings-button settings-button--secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings-button settings-button--primary"
            disabled={busy}
            onClick={onImport}
          >
            <PlusIcon /> Import {preview.familyName}
          </button>
        </footer>
      </section>
    </div>
  );
}

function FontRemoveDialog({
  font,
  selected,
  busy,
  onCancel,
  onRemove,
}: {
  font: CustomFont;
  selected: boolean;
  busy: boolean;
  onCancel: () => void;
  onRemove: () => void;
}) {
  useEscapeDismiss(onCancel, busy);
  return (
    <div className="font-dialog-scrim">
      <section
        className="font-dialog font-dialog--confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="font-remove-title"
      >
        <div className="font-dialog__body">
          <h2 id="font-remove-title">Remove {font.familyName}?</h2>
          <p>
            {selected
              ? `${font.familyName} is your current reading font. TXT and EPUB will immediately return to Lora. PDF appearance will not change.`
              : "The font file and its registration will be removed from this device. PDF appearance will not change."}
          </p>
          {selected ? (
            <div className="font-fallback-row">
              <span aria-hidden="true">Aa</span>
              <strong>{font.familyName} → Lora</strong>
              <small>Saved automatically</small>
            </div>
          ) : null}
        </div>
        <footer>
          <button
            type="button"
            className="settings-button settings-button--secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Keep font
          </button>
          <button
            type="button"
            className="settings-button font-remove-confirm"
            disabled={busy}
            onClick={onRemove}
          >
            Remove{selected ? " and use Lora" : " font"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toUpperCase() ?? "FONT";
}
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\[([a-z0-9-]+)\]\s*(.*)/i);
  if (match === null) return message;
  const [, , detail] = match;
  if (match[1] === "font-format-unsupported")
    return "Font format not supported. Choose a static TTF or OTF file.";
  if (match[1] === "font-file-too-large")
    return "This font is larger than the 20 MiB limit.";
  if (match[1] === "font-invalid")
    return `This file is not a valid static font. ${detail}`;
  return detail || "The font operation could not be completed.";
}
function useEscapeDismiss(onDismiss: () => void, disabled: boolean) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!disabled && event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, onDismiss]);
}
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
const LockIcon = () => (
  <Icon>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 018 0v3" />
  </Icon>
);
const CheckIcon = () => (
  <Icon>
    <path d="M5 12l4 4L19 6" />
  </Icon>
);
const WarningIcon = () => (
  <Icon>
    <path d="M12 8v5M12 17h.01M12 3l9 17H3z" />
  </Icon>
);
const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7h.01" />
  </Icon>
);
const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
  </Icon>
);
