import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getReadingStatistics,
  saveReadingHistoryPreferences,
} from "../tauri/readingHistory";
import { ReadingInsights } from "./ReadingInsights";

vi.mock("../tauri/readingHistory", () => ({
  getReadingStatistics: vi.fn(),
  saveReadingHistoryPreferences: vi.fn(),
}));

describe("ReadingInsights", () => {
  beforeEach(() => {
    vi.mocked(getReadingStatistics).mockResolvedValue({
      enabled: true,
      activeSession: false,
      todaySeconds: 2_520,
      last7DaysSeconds: 15_480,
      totalSeconds: 461_160,
      daily: [{ date: "2026-07-22", activeSeconds: 2_520 }],
      books: [
        {
          bookId: "book-1",
          title: "历史是人民写的",
          format: "mobi",
          activeSeconds: 8_040,
          sessionCount: 4,
          progress: 0.68,
        },
      ],
    });
    vi.mocked(saveReadingHistoryPreferences).mockResolvedValue({
      enabled: true,
      updatedAt: "2026-07-22T12:00:00Z",
    });
  });

  it("renders local effective time and saved book progress", async () => {
    render(<ReadingInsights onClose={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(await screen.findByText("Your reading, quietly remembered.")).toBeVisible();
    expect(screen.getByText("42 min")).toBeVisible();
    expect(screen.getByText("历史是人民写的")).toBeVisible();
    expect(screen.getByText("MOBI · 68% complete")).toBeVisible();
    expect(screen.getByText("Local only")).toBeVisible();
  });

  it("offers an explicit opt-in state when history is disabled", async () => {
    vi.mocked(getReadingStatistics)
      .mockResolvedValueOnce({
        enabled: false,
        activeSession: false,
        todaySeconds: 0,
        last7DaysSeconds: 0,
        totalSeconds: 0,
        daily: [],
        books: [],
      })
      .mockResolvedValueOnce({
        enabled: true,
        activeSession: false,
        todaySeconds: 0,
        last7DaysSeconds: 0,
        totalSeconds: 0,
        daily: [],
        books: [],
      });
    render(<ReadingInsights onClose={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on history" }));
    await waitFor(() =>
      expect(saveReadingHistoryPreferences).toHaveBeenCalledWith(true),
    );
    expect(await screen.findByText("No reading history yet.")).toBeVisible();
  });
});
