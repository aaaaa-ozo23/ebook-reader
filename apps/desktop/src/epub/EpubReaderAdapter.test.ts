import { defaultReaderTheme, type ReaderTheme } from "@reader/core";
import { describe, expect, it } from "vitest";

import { buildEpubThemeRules } from "./EpubReaderAdapter";

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
    });
    expect(rules.p).toMatchObject({
      "margin-bottom": "18px !important",
      "margin-top": "0 !important",
    });
    expect(rules["a, a:visited"]).toMatchObject({
      color: "#f3bc55",
    });
  });
});
