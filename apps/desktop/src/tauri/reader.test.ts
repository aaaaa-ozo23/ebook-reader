import type { Book } from "@reader/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getReaderCache,
  getReaderLayoutPreferences,
  saveReaderCache,
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
