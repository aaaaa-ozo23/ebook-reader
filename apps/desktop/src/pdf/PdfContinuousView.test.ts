import { describe, expect, it } from "vitest";

import { resolvePdfContinuousAnchor } from "./PdfContinuousPosition";

describe("resolvePdfContinuousAnchor", () => {
  const items = [
    { index: 4, start: 4000, end: 4828 },
    { index: 5, start: 4828, end: 5656 },
  ];

  it("uses the viewport center and actual page height", () => {
    expect(resolvePdfContinuousAnchor(items, 4200, () => 800)).toEqual({
      page: 5,
      pageOffsetRatio: 0.25,
    });
  });

  it("selects the nearest page when the center line is in the inter-page gap", () => {
    expect(resolvePdfContinuousAnchor(items, 4818, () => 800)).toEqual({
      page: 6,
      pageOffsetRatio: 0,
    });
  });

  it("returns null when no virtual page is mounted", () => {
    expect(resolvePdfContinuousAnchor([], 100, () => 800)).toBeNull();
  });
});
