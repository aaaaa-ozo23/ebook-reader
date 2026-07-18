import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, BookDetails } from "@reader/core";

import { BookDetailsEditor } from "./BookDetailsEditor";
import {
  getBookDetails,
  resetBookOverrides,
  saveBookMetadataOverrides,
  saveUserBookCover,
} from "../tauri/library";

vi.mock("../tauri/library", () => ({
  getBookDetails: vi.fn(),
  resetBookOverrides: vi.fn(),
  saveBookMetadataOverrides: vi.fn(),
  saveUserBookCover: vi.fn(),
}));

const book: Book = {
  id: "book-1",
  title: "Automatic title",
  author: "Automatic author",
  format: "epub",
  libraryPath: "D:\\library\\book.epub",
  fileHash: "hash",
  coverStatus: "fallback",
  availability: "available",
  createdAt: "2026-07-16T00:00:00Z",
  updatedAt: "2026-07-16T00:00:00Z",
};

const details: BookDetails = {
  book,
  automaticTitle: book.title,
  automaticAuthor: book.author,
  coverOrigin: "fallback",
};

describe("BookDetailsEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBookDetails).mockResolvedValue(details);
    vi.mocked(saveBookMetadataOverrides).mockImplementation(async (_id, patch) => ({
      ...details,
      book: {
        ...book,
        title: patch.title.action === "set" ? patch.title.value : book.title,
      },
      titleOverrideUpdatedAt: "2026-07-16T01:00:00Z",
    }));
    vi.mocked(resetBookOverrides).mockResolvedValue(details);
    vi.mocked(saveUserBookCover).mockResolvedValue(details);
  });

  it("saves explicit field patches and returns the effective book", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<BookDetailsEditor book={book} onClose={onClose} onSaved={onSaved} />);

    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "My shelf title");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveBookMetadataOverrides).toHaveBeenCalled());
    expect(vi.mocked(saveBookMetadataOverrides).mock.calls[0]?.[1]).toEqual({
      title: { action: "set", value: "My shelf title" },
      author: { action: "unchanged" },
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My shelf title" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps restore automatic actions independently disabled until overridden", async () => {
    render(<BookDetailsEditor book={book} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(
      await screen.findByRole("button", { name: "Restore automatic title" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Restore automatic cover" }),
    ).toBeDisabled();
  });
});
