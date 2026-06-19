import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Book, ImportBookResult } from "@reader/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { importBook, listBooks, pickBookFile } from "./tauri/library";

vi.mock("./tauri/library", () => ({
  importBook: vi.fn(),
  listBooks: vi.fn(),
  markBookOpened: vi.fn(),
  pickBookFile: vi.fn(),
}));

const importBookMock = vi.mocked(importBook);
const listBooksMock = vi.mocked(listBooks);
const pickBookFileMock = vi.mocked(pickBookFile);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBooksMock.mockResolvedValue([]);
    pickBookFileMock.mockResolvedValue(null);
  });

  it("renders the bookshelf empty state", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Your library is empty" })).toBeVisible();
    expect(screen.getByRole("main", { name: "Ebook Reader bookshelf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import book" })).toBeEnabled();
    expect(screen.getByText("Sorted by Recent reading")).toBeInTheDocument();
    expect(screen.queryByText("Desktop shell initialized.")).not.toBeInTheDocument();
  });

  it("renders loading and then lists books by recent reading", async () => {
    const firstBook = createBook({
      id: "book-1",
      title: "Archive Notes",
      createdAt: "2026-06-17T08:00:00.000Z",
      updatedAt: "2026-06-17T08:00:00.000Z",
      lastOpenedAt: "2026-06-17T09:00:00.000Z",
    });
    const recentBook = createBook({
      id: "book-2",
      title: "Recent Field Notes",
      createdAt: "2026-06-18T08:00:00.000Z",
      updatedAt: "2026-06-18T08:00:00.000Z",
      lastOpenedAt: "2026-06-19T09:00:00.000Z",
    });
    const libraryLoad = createResolvablePromise<Book[]>();
    listBooksMock.mockReturnValueOnce(libraryLoad.promise);

    render(<App />);

    expect(screen.getByText("Loading library...")).toBeInTheDocument();

    libraryLoad.resolve([firstBook, recentBook]);

    const cards = await screen.findAllByRole("article");
    expect(within(cards[0]).getByRole("heading", { name: "Recent Field Notes" })).toBeVisible();
    expect(within(cards[1]).getByRole("heading", { name: "Archive Notes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not import when file selection is canceled", async () => {
    const user = userEvent.setup();
    pickBookFileMock.mockResolvedValueOnce(null);

    render(<App />);
    await screen.findByRole("heading", { name: "Your library is empty" });

    await user.click(screen.getByRole("button", { name: "Import book" }));

    expect(pickBookFileMock).toHaveBeenCalledTimes(1);
    expect(importBookMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Import canceled")).toBeVisible();
    expect(screen.getByText("No file was selected.")).toBeInTheDocument();
  });

  it("imports a selected book and renders success feedback", async () => {
    const user = userEvent.setup();
    const importedBook = createBook({ id: "imported", title: "Imported Handbook" });
    const importResult = createImportResult("imported", importedBook);
    const importRequest = createResolvablePromise<ImportBookResult>();
    pickBookFileMock.mockResolvedValueOnce("D:\\books\\imported-handbook.epub");
    importBookMock.mockReturnValueOnce(importRequest.promise);

    render(<App />);
    await screen.findByRole("heading", { name: "Your library is empty" });

    await user.click(screen.getByRole("button", { name: "Import book" }));

    expect(await screen.findByRole("button", { name: "Importing..." })).toBeDisabled();
    importRequest.resolve(importResult);

    expect(await screen.findByRole("heading", { name: "Imported Handbook" })).toBeVisible();
    expect(screen.getByText("Import complete")).toBeVisible();
    expect(screen.getByText("Imported Imported Handbook.")).toBeInTheDocument();
    expect(importBookMock).toHaveBeenCalledWith("D:\\books\\imported-handbook.epub");
  });

  it("shows duplicate feedback without duplicating the shelf entry", async () => {
    const user = userEvent.setup();
    const duplicateBook = createBook({ id: "same-book", title: "Existing Manual" });
    listBooksMock.mockResolvedValueOnce([duplicateBook]);
    pickBookFileMock.mockResolvedValueOnce("D:\\books\\existing-manual.pdf");
    importBookMock.mockResolvedValueOnce(createImportResult("duplicate", duplicateBook));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Existing Manual" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Import book" }));

    expect(await screen.findByText("Already in library")).toBeVisible();
    expect(screen.getByText("Existing Manual is already on this shelf.")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("shows import failures without adding a book", async () => {
    const user = userEvent.setup();
    pickBookFileMock.mockResolvedValueOnce("D:\\books\\notes.md");
    importBookMock.mockRejectedValueOnce(new Error("unsupported book format"));

    render(<App />);
    await screen.findByRole("heading", { name: "Your library is empty" });

    await user.click(screen.getByRole("button", { name: "Import book" }));

    await waitFor(() => expect(importBookMock).toHaveBeenCalledWith("D:\\books\\notes.md"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Import failed");
    expect(screen.getByText("unsupported book format")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});

function createBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-id",
    title: "Sample Book",
    author: undefined,
    format: "epub",
    sourcePath: "D:\\books\\sample.epub",
    libraryPath: "D:\\library\\sample.epub",
    fileHash: "sample-hash",
    coverPath: undefined,
    createdAt: "2026-06-18T08:00:00.000Z",
    updatedAt: "2026-06-18T08:00:00.000Z",
    lastOpenedAt: undefined,
    ...overrides,
  };
}

function createImportResult(status: ImportBookResult["status"], book: Book): ImportBookResult {
  return { status, book };
}

function createResolvablePromise<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}
