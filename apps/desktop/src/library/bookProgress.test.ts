import { beforeEach, describe, expect, it, vi } from "vitest";

const getReadingProgressMock = vi.hoisted(() => vi.fn());

vi.mock("../tauri/reader", () => ({
  getReadingProgress: getReadingProgressMock,
}));

import { loadBookProgressSummaries } from "./bookProgress";

describe("loadBookProgressSummaries", () => {
  beforeEach(() => {
    getReadingProgressMock.mockReset();
  });

  it("loads each unique book and clamps persisted progress", async () => {
    getReadingProgressMock.mockImplementation(async (bookId: string) => ({
      bookId,
      locator: { kind: "txt", offset: 0 },
      progress: bookId === "over" ? 1.3 : -0.2,
      updatedAt: "2026-07-16T00:00:00.000Z",
    }));

    await expect(
      loadBookProgressSummaries(["under", "over", "under"]),
    ).resolves.toEqual({ under: 0, over: 1 });
    expect(getReadingProgressMock).toHaveBeenCalledTimes(2);
  });

  it("omits missing and individually unavailable progress records", async () => {
    getReadingProgressMock.mockImplementation(async (bookId: string) => {
      if (bookId === "broken") throw new Error("record unavailable");
      if (bookId === "missing") return null;
      return {
        bookId,
        locator: { kind: "txt", offset: 20 },
        progress: 0.42,
        updatedAt: "2026-07-16T00:00:00.000Z",
      };
    });

    await expect(
      loadBookProgressSummaries(["ready", "broken", "missing"]),
    ).resolves.toEqual({ ready: 0.42 });
  });

  it("limits progress reads to six concurrent requests", async () => {
    let activeRequests = 0;
    let peakRequests = 0;

    getReadingProgressMock.mockImplementation(async (bookId: string) => {
      activeRequests += 1;
      peakRequests = Math.max(peakRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return {
        bookId,
        locator: { kind: "txt", offset: 0 },
        progress: 0.5,
        updatedAt: "2026-07-16T00:00:00.000Z",
      };
    });

    const summaries = await loadBookProgressSummaries(
      Array.from({ length: 15 }, (_, index) => `book-${index}`),
    );

    expect(Object.keys(summaries)).toHaveLength(15);
    expect(peakRequests).toBeLessThanOrEqual(6);
  });
});
