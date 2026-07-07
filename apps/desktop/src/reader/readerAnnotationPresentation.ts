import type { Locator } from "@reader/core";

export const DEFAULT_HIGHLIGHT_COLOR = "#f3bc55";

export const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: DEFAULT_HIGHLIGHT_COLOR },
  { label: "Green", value: "#7dbb78" },
  { label: "Blue", value: "#73a7d8" },
  { label: "Pink", value: "#df8bb4" },
] as const;

export function getLocatorLabel(locator: Locator): string {
  if (locator.kind === "txt") return `TXT ${locator.charOffset}`;
  if (locator.kind === "epub") return "EPUB location";
  return `Page ${locator.page}`;
}

export function formatAnnotationTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
