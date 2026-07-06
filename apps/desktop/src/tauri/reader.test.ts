import type { Book } from "@reader/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getReaderCache,
  getReaderExperiencePreferences,
  getReaderLayoutPreferences,
  saveReaderCache,
  saveReaderExperiencePreferences,
  saveReaderLayoutPreferences,
} from "./reader";

describe("reader cache fallback", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
  });

  it("returns cached JSON only while the source hash matches", async () => {
    const book = createBook("hash-v1");

    await saveReaderCache(book, "epub_toc_v1", '[{"id":"one","title":"One"}]');

    await expect(getReaderCache(book, "epub_toc_v1")).resolves.toContain('"One"');
    await expect(
      getReaderCache(createBook("hash-v2"), "epub_toc_v1"),
    ).resolves.toBeNull();
  });
});

describe("reader layout fallback", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
  });

  it("persists integer pixel widths without 8px snapping", async () => {
    await expect(saveReaderLayoutPreferences({ sidebarWidth: 401.4 })).resolves.toEqual(
      { sidebarWidth: 401 },
    );
    await expect(getReaderLayoutPreferences()).resolves.toEqual({ sidebarWidth: 401 });
  });

  it("clamps restored widths to the supported bounds", async () => {
    await expect(saveReaderLayoutPreferences({ sidebarWidth: 120 })).resolves.toEqual({
      sidebarWidth: 240,
    });
    await expect(saveReaderLayoutPreferences({ sidebarWidth: 720 })).resolves.toEqual({
      sidebarWidth: 480,
    });
  });
});

describe("reader experience fallback", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
  });

  it("returns defaults and persists a canonical v1 envelope", async () => {
    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "slide" },
      txt: { viewMode: "scroll", transition: "slide" },
      pdf: { viewMode: "single", transition: "slide" },
    });

    await expect(
      saveReaderExperiencePreferences({
        epub: { viewMode: "paginated", transition: "page-curl" },
        txt: { viewMode: "paginated", transition: "none" },
        pdf: { viewMode: "continuous", transition: "slide" },
      }),
    ).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "page-curl" },
      txt: { viewMode: "paginated", transition: "none" },
      pdf: { viewMode: "continuous", transition: "slide" },
    });
    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "page-curl" },
      txt: { viewMode: "paginated", transition: "none" },
      pdf: { viewMode: "continuous", transition: "slide" },
    });
  });

  it("normalizes invalid fields and ignores unknown fields", async () => {
    window.localStorage.setItem(
      "reader:fallback:readerExperience",
      JSON.stringify({
        version: 1,
        preferences: {
          epub: { viewMode: "scrolled", transition: "fade" },
          txt: { viewMode: "paginated", transition: "page-curl", future: true },
          pdf: { viewMode: "spread", transition: "none" },
          future: true,
        },
      }),
    );

    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "slide" },
      txt: { viewMode: "paginated", transition: "page-curl" },
      pdf: { viewMode: "single", transition: "none" },
    });
  });

  it("uses defaults for malformed JSON and unknown versions without overwriting storage", async () => {
    const futureValue = JSON.stringify({
      version: 2,
      preferences: { txt: { viewMode: "paginated" } },
    });
    window.localStorage.setItem("reader:fallback:readerExperience", futureValue);

    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "slide" },
      txt: { viewMode: "scroll", transition: "slide" },
      pdf: { viewMode: "single", transition: "slide" },
    });
    expect(window.localStorage.getItem("reader:fallback:readerExperience")).toBe(
      futureValue,
    );

    window.localStorage.setItem("reader:fallback:readerExperience", "not-json");
    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "slide" },
      txt: { viewMode: "scroll", transition: "slide" },
      pdf: { viewMode: "single", transition: "slide" },
    });
  });
});

function createBook(fileHash: string): Book {
  return {
    id: "cached-book",
    title: "Cached Book",
    format: "epub",
    libraryPath: "D:\\library\\cached.epub",
    fileHash,
    coverStatus: "fallback",
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
