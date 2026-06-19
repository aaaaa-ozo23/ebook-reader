import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultReaderTheme, type Book, type ImportBookResult, type TxtDocument } from "@reader/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { importBook, listBooks, markBookOpened, pickBookFile } from "./tauri/library";
import {
  getReaderTheme,
  getReadingProgress,
  openTxtBook,
  saveReaderTheme,
  saveReadingProgress,
} from "./tauri/reader";

vi.mock("./tauri/library", () => ({
  importBook: vi.fn(),
  listBooks: vi.fn(),
  markBookOpened: vi.fn(),
  pickBookFile: vi.fn(),
}));

vi.mock("./tauri/reader", () => ({
  getReaderTheme: vi.fn(),
  getReadingProgress: vi.fn(),
  openTxtBook: vi.fn(),
  saveReaderTheme: vi.fn(),
  saveReadingProgress: vi.fn(),
}));

const getReaderThemeMock = vi.mocked(getReaderTheme);
const getReadingProgressMock = vi.mocked(getReadingProgress);
const importBookMock = vi.mocked(importBook);
const listBooksMock = vi.mocked(listBooks);
const markBookOpenedMock = vi.mocked(markBookOpened);
const openTxtBookMock = vi.mocked(openTxtBook);
const pickBookFileMock = vi.mocked(pickBookFile);
const saveReaderThemeMock = vi.mocked(saveReaderTheme);
const saveReadingProgressMock = vi.mocked(saveReadingProgress);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBooksMock.mockResolvedValue([]);
    markBookOpenedMock.mockImplementation(async (bookId) =>
      createBook({ id: bookId, format: "txt", lastOpenedAt: "2026-06-19T10:00:00.000Z" }),
    );
    getReaderThemeMock.mockResolvedValue(defaultReaderTheme);
    getReadingProgressMock.mockResolvedValue(null);
    openTxtBookMock.mockResolvedValue(createTxtDocument(createBook({ format: "txt" })));
    saveReaderThemeMock.mockImplementation(async (theme) => theme);
    saveReadingProgressMock.mockImplementation(async (bookId, locator, progress) => ({
      bookId,
      locator,
      progress,
      updatedAt: "2026-06-19T12:00:00.000Z",
    }));
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

  it("opens a TXT book in the reader shell and returns to the shelf", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({ id: "txt-book", title: "长夜将明", format: "txt" });
    const openedBook = {
      ...txtBook,
      lastOpenedAt: "2026-06-19T11:00:00.000Z",
    };
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(openedBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(openedBook));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "长夜将明" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(markBookOpenedMock).toHaveBeenCalledWith("txt-book");
    expect(openTxtBookMock).toHaveBeenCalledWith("txt-book");
    expect(await screen.findByRole("main", { name: "TXT reader" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "第一章 初见" })).toBeVisible();
    expect(screen.getByText("她推开门。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to shelf" }));

    expect(await screen.findByRole("main", { name: "Ebook Reader bookshelf" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "长夜将明" })).toBeVisible();
  });

  it("shows a later-stage reader message for EPUB and PDF books", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({ id: "epub-book", title: "Layout Notes", format: "epub" });
    listBooksMock.mockResolvedValueOnce([epubBook]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Layout Notes" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Reader support coming later")).toBeVisible();
    expect(screen.getByText("EPUB reading will be added in a later stage.")).toBeInTheDocument();
    expect(markBookOpenedMock).not.toHaveBeenCalled();
    expect(openTxtBookMock).not.toHaveBeenCalled();
  });

  it("shows TXT reader errors inside the reader shell", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({ id: "broken-txt", title: "Broken TXT", format: "txt" });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockRejectedValueOnce(new Error("failed to decode TXT file"));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Broken TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("main", { name: "TXT reader" })).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("Book could not be opened");
    expect(screen.getByText("failed to decode TXT file")).toBeInTheDocument();
  });

  it("applies and saves reader theme changes immediately", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({ id: "theme-txt", title: "Theme TXT", format: "txt" });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Theme TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "TXT reader" });
    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("button", { name: "dark" }));

    expect(saveReaderThemeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "dark",
        backgroundColor: "#171a1d",
        textColor: "#f0e8d7",
      }),
    );
    expect(reader).toHaveStyle("--txt-reader-background: #171a1d");
  });

  it("restores saved TXT progress and saves table-of-contents jumps", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({ id: "progress-txt", title: "Progress TXT", format: "txt" });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));
    getReadingProgressMock.mockResolvedValueOnce({
      bookId: "progress-txt",
      locator: {
        kind: "txt",
        chapterId: "chapter-2-13",
        charOffset: 13,
      },
      progress: 0.5,
      updatedAt: "2026-06-19T12:00:00.000Z",
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Progress TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("main", { name: "TXT reader" })).toBeVisible();
    expect(getReadingProgressMock).toHaveBeenCalledWith("progress-txt");

    await user.click(screen.getByRole("button", { name: "第二章 风起" }));

    await waitFor(() =>
      expect(saveReadingProgressMock).toHaveBeenCalledWith(
        "progress-txt",
        {
          kind: "txt",
          chapterId: "chapter-2-13",
          charOffset: 13,
        },
        expect.any(Number),
      ),
    );
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

function createTxtDocument(book: Book): TxtDocument {
  const text = "第一章 初见\n她推开门。\n第二章 风起\n灯火亮了。";

  return {
    book,
    encoding: "UTF-8",
    byteLength: 64,
    charCount: text.length,
    lineCount: 4,
    chapters: [
      {
        id: "chapter-1-0",
        title: "第一章 初见",
        startChar: 0,
        endChar: 12,
        text: "第一章 初见\n她推开门。",
      },
      {
        id: "chapter-2-13",
        title: "第二章 风起",
        startChar: 13,
        endChar: text.length,
        text: "第二章 风起\n灯火亮了。",
      },
    ],
  };
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
