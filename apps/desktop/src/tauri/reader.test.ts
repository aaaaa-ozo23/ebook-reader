import type { Book } from "@reader/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getReaderCache,
  getEpubBookSource,
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

  it("opens MOBI and AZW3 through their derived EPUB reader path", async () => {
    const mobi: Book = {
      ...createBook("source-hash"),
      format: "mobi",
      libraryPath: "D:\\library\\source.mobi",
      readerFormat: "epub",
      readerPath: "D:\\library\\source.reader.epub",
      readerHash: "reader-hash",
    };

    await expect(getEpubBookSource(mobi)).resolves.toBe(mobi.readerPath);
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
      epub: { viewMode: "paginated", transition: "none" },
      txt: { viewMode: "scroll", paginatedViewMode: "single", transition: "slide" },
      pdf: {
        viewMode: "single",
        paginatedViewMode: "single",
        transition: "slide",
      },
    });

    await expect(
      saveReaderExperiencePreferences({
        epub: { viewMode: "paginated", transition: "cover" },
        txt: {
          viewMode: "paginated",
          paginatedViewMode: "double",
          transition: "none",
        },
        pdf: {
          viewMode: "continuous",
          paginatedViewMode: "double",
          transition: "slide",
        },
      }),
    ).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "cover" },
      txt: {
        viewMode: "paginated",
        paginatedViewMode: "double",
        transition: "none",
      },
      pdf: {
        viewMode: "continuous",
        paginatedViewMode: "double",
        transition: "slide",
      },
    });
    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "cover" },
      txt: {
        viewMode: "paginated",
        paginatedViewMode: "double",
        transition: "none",
      },
      pdf: {
        viewMode: "continuous",
        paginatedViewMode: "double",
        transition: "slide",
      },
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
      epub: { viewMode: "paginated", transition: "none" },
      txt: {
        viewMode: "paginated",
        paginatedViewMode: "single",
        transition: "page-curl",
      },
      pdf: {
        viewMode: "single",
        paginatedViewMode: "single",
        transition: "none",
      },
    });
  });

  it("uses defaults for malformed JSON and unknown versions without overwriting storage", async () => {
    const futureValue = JSON.stringify({
      version: 2,
      preferences: { txt: { viewMode: "paginated" } },
    });
    window.localStorage.setItem("reader:fallback:readerExperience", futureValue);

    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "none" },
      txt: { viewMode: "scroll", paginatedViewMode: "single", transition: "slide" },
      pdf: {
        viewMode: "single",
        paginatedViewMode: "single",
        transition: "slide",
      },
    });
    expect(window.localStorage.getItem("reader:fallback:readerExperience")).toBe(
      futureValue,
    );

    window.localStorage.setItem("reader:fallback:readerExperience", "not-json");
    await expect(getReaderExperiencePreferences()).resolves.toEqual({
      epub: { viewMode: "paginated", transition: "none" },
      txt: { viewMode: "scroll", paginatedViewMode: "single", transition: "slide" },
      pdf: {
        viewMode: "single",
        paginatedViewMode: "single",
        transition: "slide",
      },
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
    readerFormat: "epub",
    readerPath: "D:\\library\\cached.epub",
    readerHash: fileHash,
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
