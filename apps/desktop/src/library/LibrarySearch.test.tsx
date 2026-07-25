import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cancelDataOperation, listenForDataOperationProgress } from "../tauri/backup";
import {
  getLibrarySearchStatus,
  rebuildLibrarySearchIndex,
  searchLibrary,
} from "../tauri/librarySearch";
import { LibrarySearch } from "./LibrarySearch";

vi.mock("../tauri/backup", () => ({
  cancelDataOperation: vi.fn(),
  listenForDataOperationProgress: vi.fn(async () => () => undefined),
}));
vi.mock("../tauri/librarySearch", () => ({
  getLibrarySearchStatus: vi.fn(),
  rebuildLibrarySearchIndex: vi.fn(),
  searchLibrary: vi.fn(),
}));

describe("LibrarySearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLibrarySearchStatus).mockResolvedValue({
      state: "ready",
      totalBooks: 2,
      indexedBooks: 2,
      pendingBooks: 0,
      failedBooks: 0,
      noTextBooks: 0,
    });
    vi.mocked(rebuildLibrarySearchIndex).mockResolvedValue({
      operationId: "index",
      status: "completed",
      indexedBooks: 2,
      failedBooks: 0,
      noTextBooks: 0,
    });
    vi.mocked(searchLibrary).mockResolvedValue({
      query: "人民写的",
      truncated: false,
      hits: [
        {
          id: "hit-1",
          bookId: "book-1",
          title: "历史是人民写的",
          author: "马伯庸",
          format: "mobi",
          readerFormat: "epub",
          availability: "available",
          excerpt: "序章里说，历史是人民写的，也由每一个普通人保存。",
          excerptMatchStart: 8,
          excerptMatchEnd: 12,
          locationLabel: "Chapter 1 · Location 27",
          target: { kind: "epub", href: "chapter-1.xhtml" },
        },
      ],
    });
  });

  it("groups local multilingual hits and opens the exact result", async () => {
    const user = userEvent.setup();
    const onOpenHit = vi.fn();
    render(
      <LibrarySearch
        onClose={vi.fn()}
        onOpenHit={onOpenHit}
        onOpenSettings={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Search the entire library" }),
      "人民写的{Enter}",
    );

    expect(await screen.findByText("历史是人民写的")).toBeVisible();
    const mark = screen.getByText("人民写的", { selector: "mark" });
    expect(mark).toBeVisible();
    const resultButton = screen.getByRole("button", {
      name: /序章里说，历史是人民写的/,
    });
    expect(within(resultButton).getByText("Chapter 1 · Location 27")).toBeVisible();
    await user.click(resultButton);
    expect(onOpenHit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hit-1",
        target: { kind: "epub", href: "chapter-1.xhtml" },
      }),
    );
  });

  it("automatically resumes a pending index and allows cancellation", async () => {
    let resolveRebuild: (() => void) | undefined;
    vi.mocked(getLibrarySearchStatus)
      .mockResolvedValueOnce({
        state: "needs-index",
        totalBooks: 3,
        indexedBooks: 1,
        pendingBooks: 2,
        failedBooks: 0,
        noTextBooks: 0,
      })
      .mockResolvedValue({
        state: "ready",
        totalBooks: 3,
        indexedBooks: 3,
        pendingBooks: 0,
        failedBooks: 0,
        noTextBooks: 0,
      });
    vi.mocked(rebuildLibrarySearchIndex).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRebuild = () =>
            resolve({
              operationId: "index",
              status: "completed",
              indexedBooks: 3,
              failedBooks: 0,
              noTextBooks: 0,
            });
        }),
    );
    const user = userEvent.setup();
    render(
      <LibrarySearch onClose={vi.fn()} onOpenHit={vi.fn()} onOpenSettings={vi.fn()} />,
    );

    expect(await screen.findByText("Rebuilding library search")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelDataOperation).toHaveBeenCalled();
    resolveRebuild?.();
    await waitFor(() => expect(rebuildLibrarySearchIndex).toHaveBeenCalledOnce());
    expect(listenForDataOperationProgress).toHaveBeenCalledOnce();
  });
});
