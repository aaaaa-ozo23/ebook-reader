import type { Annotation, Locator } from "@reader/core";

export interface ReaderSelectionSnapshot {
  locator: Locator;
  selectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  menuX: number;
  menuY: number;
}

export interface ReaderNoteEditorState {
  annotationId?: string;
  color?: string;
  contextAfter?: string;
  contextBefore?: string;
  draft: string;
  locator: Locator;
  menuX: number;
  menuY: number;
  selectedText: string;
}

export interface ReaderNotePopoverState {
  annotations: Annotation[];
  color?: string;
  contextAfter?: string;
  contextBefore?: string;
  locator: Locator;
  menuX: number;
  menuY: number;
  selectedText: string;
}

export interface ReaderMenuAnchor {
  menuX: number;
  menuY: number;
}
