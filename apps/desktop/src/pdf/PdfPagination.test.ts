import { describe, expect, it } from "vitest";

import { getPdfSpreadPages, getPdfSpreadWindowStarts } from "./PdfPagination";
import type { PdfPosition } from "./PdfReaderAdapter";

function position(overrides: Partial<PdfPosition>): PdfPosition {
  return {
    locator: { kind: "pdf", page: overrides.page ?? 1 },
    page: 1,
    totalPages: 12,
    scale: 1,
    zoomMode: "custom",
    progression: 0,
    viewMode: "single",
    renderedMode: "single",
    ...overrides,
  };
}

describe("PDF paginated window", () => {
  it("keeps only previous, current, and next single pages", () => {
    const starts = getPdfSpreadWindowStarts(position({ page: 6 }));
    expect(starts).toEqual([5, 6, 7]);
    expect(
      starts.flatMap((start) => getPdfSpreadPages(start, 12, "single")),
    ).toHaveLength(3);
  });

  it("keeps three double spreads and treats the cover as one page", () => {
    const double = position({
      page: 2,
      renderedMode: "double",
      viewMode: "double",
    });
    const starts = getPdfSpreadWindowStarts(double);
    expect(starts).toEqual([1, 2, 4]);
    expect(
      starts.flatMap((start) => getPdfSpreadPages(start, 12, "double")),
    ).toHaveLength(5);
    expect(getPdfSpreadPages(1, 12, "double")).toEqual([1]);
    expect(getPdfSpreadPages(2, 12, "double")).toEqual([2, 3]);
    expect(getPdfSpreadPages(12, 12, "double")).toEqual([12]);
  });
});
