import type { PdfLocator } from "@reader/core";

export type PdfLocatorAnchorKind = "rect" | "page-offset" | "page-top";

export function resolvePdfLocatorAnchorKind(locator: PdfLocator): PdfLocatorAnchorKind {
  if (locator.rects !== undefined && locator.rects.length > 0) {
    return "rect";
  }
  if (locator.pageOffsetRatio !== undefined) {
    return "page-offset";
  }
  return "page-top";
}

export function resolvePdfContinuousAnchor(
  items: Array<{ end: number; index: number; start: number }>,
  viewportCenter: number,
  getPageHeight: (pageNumber: number) => number,
): { page: number; pageOffsetRatio: number } | null {
  if (items.length === 0) {
    return null;
  }

  const item = items.reduce((closest, candidate) => {
    const candidateHeight = Math.max(1, getPageHeight(candidate.index + 1));
    const closestHeight = Math.max(1, getPageHeight(closest.index + 1));
    const candidateDistance = distanceFromRange(
      viewportCenter,
      candidate.start,
      candidate.start + candidateHeight,
    );
    const closestDistance = distanceFromRange(
      viewportCenter,
      closest.start,
      closest.start + closestHeight,
    );
    return candidateDistance < closestDistance ? candidate : closest;
  });
  const pageHeight = Math.max(1, getPageHeight(item.index + 1));

  return {
    page: item.index + 1,
    pageOffsetRatio: Math.min(
      1,
      Math.max(0, (viewportCenter - item.start) / pageHeight),
    ),
  };
}

function distanceFromRange(value: number, start: number, end: number): number {
  if (value < start) {
    return start - value;
  }
  if (value > end) {
    return value - end;
  }
  return 0;
}
