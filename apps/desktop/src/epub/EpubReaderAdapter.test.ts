import { defaultReaderTheme, type ReaderTheme } from "@reader/core";
import { describe, expect, it } from "vitest";

import {
  buildEpubThemeRules,
  nextEpubLocationIndex,
  progressionToEpubPage,
} from "./EpubReaderAdapter";

describe("buildEpubThemeRules", () => {
  it("maps reader theme tokens into EPUB iframe CSS rules", () => {
    const theme: ReaderTheme = {
      ...defaultReaderTheme,
      mode: "dark",
      backgroundColor: "#171a1d",
      textColor: "#f0e8d7",
      fontFamily: "Georgia, serif",
      fontSize: 22,
      lineHeight: 1.9,
      paragraphSpacing: 18,
      pageMargin: 34,
    };

    const rules = buildEpubThemeRules(theme);

    expect(rules.html).toMatchObject({
      background: "#171a1d !important",
      color: "#f0e8d7 !important",
    });
    expect(rules.body).toMatchObject({
      background: "#171a1d !important",
      color: "#f0e8d7 !important",
      "font-family": "Georgia, serif !important",
      "font-size": "22px !important",
      "line-height": "1.9 !important",
      margin: "0 !important",
      padding: "0 34px !important",
      "user-select": "text !important",
    });
    expect(rules["body, p, div, section, article"]).toMatchObject({
      "user-select": "text !important",
    });
    expect(rules.p).toMatchObject({
      "margin-bottom": "18px !important",
      "margin-top": "0 !important",
    });
    expect(rules["a, a:visited"]).toMatchObject({
      color: "#f3bc55",
    });
  });

  it("maps generated locations progress to synthetic EPUB pages", () => {
    expect(progressionToEpubPage(0, 10)).toBe(1);
    expect(progressionToEpubPage(0.5, 10)).toBe(6);
    expect(progressionToEpubPage(1, 10)).toBe(10);
    expect(progressionToEpubPage(2, 10)).toBe(10);
  });

  it("maps page navigation to generated location indexes", () => {
    expect(nextEpubLocationIndex(1, 10)).toBe(1);
    expect(nextEpubLocationIndex(9, 10)).toBe(9);
    expect(nextEpubLocationIndex(10, 10)).toBeNull();
    expect(nextEpubLocationIndex(null, 10)).toBeNull();
  });
});
