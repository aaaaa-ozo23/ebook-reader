import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  endReadingSession,
  heartbeatReadingSession,
  startReadingSession,
} from "../tauri/readingHistory";
import { useReadingHistorySession } from "./useReadingHistorySession";

vi.mock("../tauri/readingHistory", () => ({
  endReadingSession: vi.fn(),
  heartbeatReadingSession: vi.fn(),
  startReadingSession: vi.fn(),
}));

function SessionHarness({
  bookId = "book-1",
  ready,
}: {
  bookId?: string;
  ready: boolean;
}) {
  useReadingHistorySession({ bookId, ready });
  return <div>Reader</div>;
}

describe("useReadingHistorySession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00Z"));
    vi.mocked(startReadingSession).mockResolvedValue({
      id: "session-1",
      bookId: "book-1",
      startedAt: "2026-07-22T12:00:00Z",
      lastHeartbeatAt: "2026-07-22T12:00:00Z",
      activeSeconds: 0,
      updatedAt: "2026-07-22T12:00:00Z",
    });
    vi.mocked(heartbeatReadingSession).mockResolvedValue({
      id: "session-1",
      bookId: "book-1",
      startedAt: "2026-07-22T12:00:00Z",
      lastHeartbeatAt: "2026-07-22T12:00:30Z",
      activeSeconds: 30,
      updatedAt: "2026-07-22T12:00:30Z",
    });
    vi.mocked(endReadingSession).mockResolvedValue({
      id: "session-1",
      bookId: "book-1",
      startedAt: "2026-07-22T12:00:00Z",
      endedAt: "2026-07-22T12:00:30Z",
      lastHeartbeatAt: "2026-07-22T12:00:30Z",
      activeSeconds: 30,
      updatedAt: "2026-07-22T12:00:30Z",
    });
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts only after ready, heartbeats while active, and ends on cleanup", async () => {
    const view = render(<SessionHarness ready={false} />);
    expect(startReadingSession).not.toHaveBeenCalled();
    view.rerender(<SessionHarness ready />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(startReadingSession).toHaveBeenCalledWith("book-1");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(heartbeatReadingSession).toHaveBeenCalledWith("session-1");
    view.unmount();
    expect(endReadingSession).toHaveBeenCalledWith("session-1");
  });

  it("does not heartbeat an invisible reader", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    render(<SessionHarness ready />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(startReadingSession).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(heartbeatReadingSession).not.toHaveBeenCalled();
  });
});
