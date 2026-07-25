import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearReadingHistory,
  exportReadingHistory,
  getReadingHistoryPreferences,
  pickReadingHistoryDestination,
  revealReadingHistoryExport,
  saveReadingHistoryPreferences,
} from "../tauri/readingHistory";
import { ReadingHistorySettings } from "./ReadingHistorySettings";

vi.mock("../tauri/readingHistory", () => ({
  clearReadingHistory: vi.fn(),
  exportReadingHistory: vi.fn(),
  getReadingHistoryPreferences: vi.fn(),
  pickReadingHistoryDestination: vi.fn(),
  revealReadingHistoryExport: vi.fn(),
  saveReadingHistoryPreferences: vi.fn(),
}));

describe("ReadingHistorySettings", () => {
  beforeEach(() => {
    vi.mocked(getReadingHistoryPreferences).mockResolvedValue({
      enabled: true,
      updatedAt: "2026-07-22T12:00:00Z",
    });
    vi.mocked(saveReadingHistoryPreferences).mockImplementation(async (enabled) => ({
      enabled,
      updatedAt: "2026-07-22T12:01:00Z",
    }));
    vi.mocked(pickReadingHistoryDestination).mockResolvedValue(
      "D:/exports/history.csv",
    );
    vi.mocked(exportReadingHistory).mockResolvedValue({
      outputPath: "D:/exports/history.csv",
      sessionCount: 24,
      bytesWritten: 2_048,
    });
    vi.mocked(clearReadingHistory).mockResolvedValue({
      enabled: true,
      updatedAt: "2026-07-22T12:02:00Z",
      clearedAt: "2026-07-22T12:02:00Z",
    });
  });

  it("toggles recording and exports a local CSV", async () => {
    render(<ReadingHistorySettings />);
    const toggle = await screen.findByRole("switch", {
      name: "Record reading history",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(saveReadingHistoryPreferences).toHaveBeenCalledWith(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByText("CSV exported")).toBeVisible();
    expect(screen.getByText(/24 local sessions/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    await waitFor(() =>
      expect(revealReadingHistoryExport).toHaveBeenCalledWith("D:/exports/history.csv"),
    );
  });

  it("requires confirmation before clearing and restores focus", async () => {
    render(<ReadingHistorySettings />);
    const trigger = await screen.findByRole("button", { name: "Clear history" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("alertdialog", {
      name: "Clear all reading history?",
    });
    expect(dialog).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear history" })[1]);
    await waitFor(() => expect(clearReadingHistory).toHaveBeenCalled());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
