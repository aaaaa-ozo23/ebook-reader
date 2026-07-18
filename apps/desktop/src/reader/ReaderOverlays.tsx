import type { Annotation } from "@reader/core";
import type { CSSProperties, RefObject } from "react";

import {
  formatAnnotationTimestamp,
  getLocatorLabel,
  HIGHLIGHT_COLORS,
} from "./readerAnnotationPresentation";
import type {
  ReaderNoteEditorState,
  ReaderNotePopoverState,
  ReaderSelectionSnapshot,
} from "./readerUiTypes";
import { ReaderIcon } from "./ReaderIcons";

interface SelectionMenuProps {
  menuRef: RefObject<HTMLDivElement | null>;
  selection: ReaderSelectionSnapshot | null;
  onCopy: () => void;
  onHighlight: (color?: string) => void;
  onNote: () => void;
}

export function SelectionMenu({
  menuRef,
  selection,
  onCopy,
  onHighlight,
  onNote,
}: SelectionMenuProps) {
  if (selection === null) return null;
  return (
    <div
      ref={menuRef}
      className="reader-selection-menu"
      role="toolbar"
      aria-label="Selection actions"
      style={{ left: `${selection.menuX}px`, top: `${selection.menuY}px` }}
    >
      <button type="button" onClick={() => onHighlight()}>
        Highlight
      </button>
      <div className="reader-selection-menu__swatches" aria-label="Highlight colors">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            className="reader-selection-menu__swatch"
            aria-label={`Highlight ${color.label.toLowerCase()}`}
            style={{ "--reader-highlight-color": color.value } as CSSProperties}
            onClick={() => onHighlight(color.value)}
          />
        ))}
      </div>
      <button type="button" onClick={onNote}>
        Note
      </button>
      <button type="button" onClick={onCopy}>
        Copy
      </button>
    </div>
  );
}

interface NoteEditorProps {
  editor: ReaderNoteEditorState | null;
  editorRef: RefObject<HTMLFormElement | null>;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
}

export function NoteEditor({
  editor,
  editorRef,
  error,
  isSaving,
  onCancel,
  onDraftChange,
  onSave,
}: NoteEditorProps) {
  if (editor === null) return null;
  return (
    <form
      ref={editorRef}
      className="reader-note-editor"
      aria-label="Edit note"
      style={{ left: `${editor.menuX}px`, top: `${editor.menuY}px` }}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <textarea
        aria-label={`Note for ${editor.selectedText}`}
        autoFocus
        disabled={isSaving}
        value={editor.draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
      />
      {error !== null ? <p role="alert">{error}</p> : null}
      <div className="reader-note-editor__actions">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button type="button" disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface NotePopoverProps {
  popover: ReaderNotePopoverState | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  onAddNote: () => void;
  onClose: () => void;
  onEditAnnotation: (annotation: Annotation) => void;
}

export function NotePopover({
  popover,
  popoverRef,
  onAddNote,
  onClose,
  onEditAnnotation,
}: NotePopoverProps) {
  if (popover === null) return null;
  return (
    <div
      ref={popoverRef}
      className="reader-note-popover"
      role="dialog"
      aria-label={`Saved notes for ${popover.selectedText}`}
      style={{
        left: `${popover.menuX}px`,
        top: `${getNotePopoverTop(popover.menuY)}px`,
      }}
    >
      <div className="reader-note-popover__header">
        <span>
          <strong>Saved notes</strong>
          <small>{popover.annotations.length} saved</small>
        </span>
        <button type="button" aria-label="Close saved notes" onClick={onClose}>
          <ReaderIcon name="close" />
        </button>
      </div>
      <div className="reader-note-popover__items" role="list">
        {popover.annotations.map((annotation) => {
          const excerpt =
            annotation.selectedText ??
            annotation.locator.selectedText ??
            getLocatorLabel(annotation.locator);
          const note = annotation.note?.trim() ?? "";
          return (
            <button
              key={annotation.id}
              type="button"
              className="reader-note-popover__item"
              aria-label={`Edit saved note ${excerpt}${note === "" ? "" : `: ${note}`}`}
              title="Edit note"
              onClick={() => onEditAnnotation(annotation)}
            >
              <span>{note === "" ? excerpt : note}</span>
              <small>{formatAnnotationTimestamp(annotation.updatedAt)}</small>
            </button>
          );
        })}
      </div>
      <button type="button" className="reader-note-popover__add" onClick={onAddNote}>
        Add note
      </button>
    </div>
  );
}

function getNotePopoverTop(anchorY: number): number {
  const viewportPadding = 14;
  const maxPopoverHeight = Math.min(420, window.innerHeight - viewportPadding * 2);
  return Math.max(
    viewportPadding,
    Math.min(anchorY + 12, window.innerHeight - maxPopoverHeight - viewportPadding),
  );
}
