import { describe, expect, it } from "vitest";

import {
  buildMappedSearchExcerpt,
  findDomSearchTextMatches,
  findSearchTextMatches,
} from "./searchText";

describe("Unicode search text mapping", () => {
  it.each([
    ["序章里说，历史是人民写的。", "历史是人民写的", "历史是人民写的"],
    ["The Right Place", "the right place", "The Right Place"],
    ["Un café déjà vu", "CAFE\u0301 DE\u0301JA\u0300", "café déjà"],
    ["Straße und Bücher", "STRASSE", "Straße"],
    ["İstanbul kitaplığı", "i\u0307stanbul", "İstanbul"],
    ["الكتاب في المكتبة", "الكتاب", "الكتاب"],
  ])("maps %s back to its original text", (source, query, selectedText) => {
    const match = findSearchTextMatches(source, query, 1)[0];
    expect(match).toBeDefined();
    expect(source.slice(match?.start, match?.end)).toBe(selectedText);
  });

  it("collapses whitespace while retaining the full original range", () => {
    const source = "one\n   multilingual\tphrase";
    const match = findSearchTextMatches(source, "ONE multilingual phrase", 1)[0];
    expect(source.slice(match?.start, match?.end)).toBe(source);
  });

  it("reports the original match range inside an excerpt", () => {
    const source = `${"x".repeat(80)}Straße${"y".repeat(100)}`;
    const match = findSearchTextMatches(source, "STRASSE", 1)[0];
    expect(match).toBeDefined();
    const excerpt = buildMappedSearchExcerpt(source, match!, 20, 20);
    expect(excerpt.text.slice(excerpt.matchStart, excerpt.matchEnd)).toBe("Straße");
    expect(excerpt.text.startsWith("...")).toBe(true);
    expect(excerpt.text.endsWith("...")).toBe(true);
  });
});

describe("EPUB DOM search mapping", () => {
  it("creates one range across adjacent inline text nodes", () => {
    document.body.innerHTML = "<p>Un <em>café</em> déjà <strong>vu</strong>.</p>";
    const match = findDomSearchTextMatches(
      document,
      "CAFE\u0301 de\u0301ja\u0300 vu",
      1,
    )[0];
    expect(match).toBeDefined();
    expect(match?.range.toString()).toBe("café déjà vu");
    expect(match?.selectedText).toBe("café déjà vu");
    expect(
      match?.excerpt.text.slice(match.excerpt.matchStart, match.excerpt.matchEnd),
    ).toBe("café déjà vu");
  });

  it("does not index script and style contents", () => {
    document.body.innerHTML =
      "<style>.secret { color: red }</style><script>hidden phrase</script><p>Visible phrase</p>";
    expect(findDomSearchTextMatches(document, "hidden phrase")).toHaveLength(0);
    expect(findDomSearchTextMatches(document, "visible phrase")).toHaveLength(1);
  });
});
