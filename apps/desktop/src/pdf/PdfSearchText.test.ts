import { describe, expect, it } from "vitest";

import { buildPdfSearchText } from "./PdfReaderAdapter";

describe("PDF search text reconstruction", () => {
  it("keeps split glyph runs together when geometry has no visible gap", () => {
    expect(
      buildPdfSearchText([
        { str: "人", transform: [1, 0, 0, 1, 10, 30], width: 10, height: 10 },
        { str: "民", transform: [1, 0, 0, 1, 20, 30], width: 10, height: 10 },
        { str: "写", transform: [1, 0, 0, 1, 30, 30], width: 10, height: 10 },
        { str: "的", transform: [1, 0, 0, 1, 40, 30], width: 10, height: 10 },
      ]),
    ).toBe("人民写的");
  });

  it("adds spaces and line breaks from item geometry instead of every fragment", () => {
    expect(
      buildPdfSearchText([
        { str: "déjà", transform: [1, 0, 0, 1, 10, 30], width: 20, height: 10 },
        { str: "vu", transform: [1, 0, 0, 1, 35, 30], width: 10, height: 10 },
        {
          str: "again",
          hasEOL: true,
          transform: [1, 0, 0, 1, 10, 20],
          width: 20,
          height: 10,
        },
        { str: "next", transform: [1, 0, 0, 1, 10, 10], width: 20, height: 10 },
      ]),
    ).toBe("déjà vu\nagain\nnext");
  });
});
