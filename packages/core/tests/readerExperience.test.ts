import { describe, expect, expectTypeOf, it } from "vitest";

import {
  defaultReaderExperiencePreferences,
  normalizePdfLocator,
  normalizeReaderExperiencePreferences,
  readerCapabilitiesByFormat,
  resolveEffectivePageTransition,
  type EpubViewMode,
  type PageTransitionMode,
  type PdfLocator,
  type PdfViewMode,
  type TxtViewMode,
} from "../src/index";

describe("reader experience contracts", () => {
  it("exposes the locked view and transition unions", () => {
    expectTypeOf<EpubViewMode>().toEqualTypeOf<"paginated">();
    expectTypeOf<TxtViewMode>().toEqualTypeOf<"scroll" | "paginated">();
    expectTypeOf<PdfViewMode>().toEqualTypeOf<"single" | "double" | "continuous">();
    expectTypeOf<PageTransitionMode>().toEqualTypeOf<
      "none" | "slide" | "cover" | "page-curl"
    >();
  });

  it("uses the v0.2 defaults and format capability matrix", () => {
    expect(defaultReaderExperiencePreferences).toEqual({
      epub: { viewMode: "paginated", transition: "none" },
      txt: { viewMode: "scroll", transition: "slide" },
      pdf: { viewMode: "single", transition: "slide" },
    });
    expect(readerCapabilitiesByFormat.epub.viewModes).toEqual(["paginated"]);
    expect(readerCapabilitiesByFormat.txt.viewModes).toEqual(["scroll", "paginated"]);
    expect(readerCapabilitiesByFormat.pdf.viewModes).toEqual([
      "single",
      "double",
      "continuous",
    ]);
    expect(readerCapabilitiesByFormat.epub.pageTransitions).toEqual([
      "none",
      "page-curl",
      "cover",
      "slide",
    ]);
    expect(readerCapabilitiesByFormat.txt.pageTransitions).toEqual([
      "none",
      "page-curl",
      "cover",
      "slide",
    ]);
  });

  it("normalizes partial and invalid preferences field by field", () => {
    expect(
      normalizeReaderExperiencePreferences({
        epub: { viewMode: "scrolled", transition: "fade" },
        txt: { viewMode: "paginated", transition: "page-curl" },
        pdf: { viewMode: "continuous", transition: "none" },
        future: true,
      }),
    ).toEqual({
      epub: { viewMode: "paginated", transition: "none" },
      txt: { viewMode: "paginated", transition: "page-curl" },
      pdf: { viewMode: "continuous", transition: "none" },
    });
  });

  it("preserves the new cover value without changing legacy modes", () => {
    const preferences = normalizeReaderExperiencePreferences({
      epub: { transition: "cover" },
      txt: { transition: "slide" },
      pdf: { transition: "page-curl" },
    });

    expect(preferences.epub.transition).toBe("cover");
    expect(preferences.txt.transition).toBe("slide");
    expect(preferences.pdf.transition).toBe("page-curl");
  });

  it("resolves runtime-only transition overrides without changing preferences", () => {
    const preferences = normalizeReaderExperiencePreferences({
      epub: { transition: "page-curl" },
      txt: { viewMode: "scroll", transition: "slide" },
      pdf: { viewMode: "continuous", transition: "page-curl" },
    });

    expect(resolveEffectivePageTransition("epub", preferences, false)).toBe(
      "page-curl",
    );
    expect(resolveEffectivePageTransition("epub", preferences, true)).toBe("none");
    expect(resolveEffectivePageTransition("txt", preferences, false)).toBe("none");
    expect(resolveEffectivePageTransition("pdf", preferences, false)).toBe("none");
    expect(preferences.epub.transition).toBe("page-curl");
  });

  it("keeps old PDF locators valid and clamps optional page offsets", () => {
    const legacy: PdfLocator = { kind: "pdf", page: 3 };

    expect(normalizePdfLocator(legacy)).toEqual(legacy);
    expect(
      normalizePdfLocator({ ...legacy, pageOffsetRatio: -0.5 }).pageOffsetRatio,
    ).toBe(0);
    expect(
      normalizePdfLocator({ ...legacy, pageOffsetRatio: 1.5 }).pageOffsetRatio,
    ).toBe(1);
    expect(normalizePdfLocator({ ...legacy, pageOffsetRatio: Number.NaN })).toEqual(
      legacy,
    );
  });
});
