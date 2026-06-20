import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  defaultReaderTheme,
  type Book,
  type EpubLocator,
  type ImportBookResult,
  type TxtDocument,
} from "@reader/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { EpubReaderAdapter, type EpubPosition } from "./epub/EpubReaderAdapter";
import { importBook, listBooks, markBookOpened, pickBookFile, removeBook } from "./tauri/library";
import {
  getEpubBookSource,
  getReaderTheme,
  getReadingProgress,
  openTxtBook,
  saveReaderTheme,
  saveReadingProgress,
} from "./tauri/reader";

const epubAdapterCloseMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterGetTocMock = vi.hoisted(() =>
  vi.fn(async () => [
    {
      id: "chapter-one",
      title: "Chapter One",
      href: "OPS/chapter-one.xhtml",
      locator: {
        kind: "epub" as const,
        href: "OPS/chapter-one.xhtml",
      },
    },
    {
      id: "chapter-two",
      title: "Chapter Two",
      href: "OPS/chapter-two.xhtml",
      locator: {
        kind: "epub" as const,
        href: "OPS/chapter-two.xhtml",
      },
    },
  ]),
);
const epubAdapterGoToMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterGoToProgressMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterNextMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterOpenMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterPreviousMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterPreviewProgressMock = vi.hoisted(() =>
  vi.fn((progression: number) => {
    const page = Math.max(1, Math.round(progression * 100));

    return {
      locator: {
        kind: "epub" as const,
        href: progression >= 0.5 ? "OPS/chapter-two.xhtml" : "OPS/chapter-one.xhtml",
        cfi: `epubcfi(/6/${page})`,
        progression,
      },
      progression,
      page,
      totalPages: 100,
      locationsReady: true as const,
    };
  }),
);
const epubAdapterSetSpreadModeMock = vi.hoisted(() =>
  vi.fn((mode: "single" | "double") => ({
    requested: mode,
    rendered: mode,
    canRenderDouble: true,
  })),
);
const epubAdapterSetThemeMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("./tauri/library", () => ({
  importBook: vi.fn(),
  listBooks: vi.fn(),
  markBookOpened: vi.fn(),
  pickBookFile: vi.fn(),
  removeBook: vi.fn(),
}));

vi.mock("./tauri/reader", () => ({
  getEpubBookSource: vi.fn(),
  getReaderTheme: vi.fn(),
  getReadingProgress: vi.fn(),
  openTxtBook: vi.fn(),
  saveReaderTheme: vi.fn(),
  saveReadingProgress: vi.fn(),
}));

vi.mock("./epub/EpubReaderAdapter", () => ({
  EpubReaderAdapter: vi.fn(function MockEpubReaderAdapter() {
    return {
      close: epubAdapterCloseMock,
      getToc: epubAdapterGetTocMock,
      goTo: epubAdapterGoToMock,
      goToProgress: epubAdapterGoToProgressMock,
      next: epubAdapterNextMock,
      open: epubAdapterOpenMock,
      previous: epubAdapterPreviousMock,
      previewProgress: epubAdapterPreviewProgressMock,
      setSpreadMode: epubAdapterSetSpreadModeMock,
      setTheme: epubAdapterSetThemeMock,
    };
  }),
}));

const getEpubBookSourceMock = vi.mocked(getEpubBookSource);
const getReaderThemeMock = vi.mocked(getReaderTheme);
const getReadingProgressMock = vi.mocked(getReadingProgress);
const importBookMock = vi.mocked(importBook);
const listBooksMock = vi.mocked(listBooks);
const markBookOpenedMock = vi.mocked(markBookOpened);
const openTxtBookMock = vi.mocked(openTxtBook);
const pickBookFileMock = vi.mocked(pickBookFile);
const removeBookMock = vi.mocked(removeBook);
const saveReaderThemeMock = vi.mocked(saveReaderTheme);
const saveReadingProgressMock = vi.mocked(saveReadingProgress);
const EpubReaderAdapterMock = vi.mocked(EpubReaderAdapter);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    epubAdapterCloseMock.mockClear();
    epubAdapterGetTocMock.mockClear();
    epubAdapterGoToMock.mockClear();
    epubAdapterGoToProgressMock.mockClear();
    epubAdapterNextMock.mockClear();
    epubAdapterOpenMock.mockClear();
    epubAdapterPreviousMock.mockClear();
    epubAdapterPreviewProgressMock.mockClear();
    epubAdapterSetSpreadModeMock.mockClear();
    epubAdapterSetThemeMock.mockClear();
    listBooksMock.mockResolvedValue([]);
    markBookOpenedMock.mockImplementation(async (bookId) =>
      createBook({ id: bookId, format: "txt", lastOpenedAt: "2026-06-19T10:00:00.000Z" }),
    );
    getEpubBookSourceMock.mockResolvedValue("blob:mock-epub");
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
    removeBookMock.mockImplementation(async (bookId) => ({
      book: createBook({ id: bookId }),
      removedLibraryPath: "D:\\library\\sample.epub",
    }));
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

  it("removes a book through the right-click actions menu after confirmation", async () => {
    const user = userEvent.setup();
    const book = createBook({ id: "remove-book", title: "Remove Candidate", format: "txt" });
    listBooksMock.mockResolvedValueOnce([book]);
    removeBookMock.mockResolvedValueOnce({
      book,
      removedLibraryPath: "D:\\library\\remove-candidate.txt",
    });

    render(<App />);
    const card = await screen.findByRole("article", { name: "Remove Candidate book" });

    fireEvent.contextMenu(card, { clientX: 40, clientY: 60 });
    await user.click(screen.getByRole("menuitem", { name: "Remove from shelf" }));

    expect(await screen.findByRole("alertdialog", { name: "Remove from shelf?" })).toBeVisible();
    expect(screen.getByText(/The original file you imported will not be deleted/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeBookMock).toHaveBeenCalledWith("remove-book"));
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Remove Candidate book" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Book removed")).toBeVisible();
    expect(screen.getByText("Remove Candidate was removed from this shelf.")).toBeVisible();
  });

  it("opens book actions from the visible more button", async () => {
    const user = userEvent.setup();
    const book = createBook({ id: "menu-book", title: "Menu Candidate", format: "txt" });
    listBooksMock.mockResolvedValueOnce([book]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Menu Candidate" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "More actions for Menu Candidate" }));

    expect(screen.getByRole("menu", { name: "Actions for Menu Candidate" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Remove from shelf" })).toBeVisible();
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

  it("opens an EPUB book in the reader shell", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({ id: "epub-book", title: "Layout Notes", format: "epub" });
    const openedBook = {
      ...epubBook,
      lastOpenedAt: "2026-06-20T10:00:00.000Z",
    };
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(openedBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Layout Notes" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(markBookOpenedMock).toHaveBeenCalledWith("epub-book");
    expect(openTxtBookMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("main", { name: "EPUB reader" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Chapter One" })).toBeVisible();
    expect(epubAdapterOpenMock).toHaveBeenCalledWith("epub-book");
    expect(getEpubBookSourceMock).toHaveBeenCalledWith(openedBook);
  });

  it("shows EPUB navigation below the page and enables progress after locations are ready", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({ id: "epub-controls", title: "Controls EPUB", format: "epub" });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Controls EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "EPUB reader" });
    const slider = await screen.findByRole("slider", { name: "EPUB reading progress" });
    expect(slider).toBeDisabled();
    expect(screen.getAllByText("Calculating pages").length).toBeGreaterThan(0);

    const frame = reader.querySelector(".reader-epub-frame");
    const controls = reader.querySelector(".reader-epub-controls");
    expect(frame).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(frame?.compareDocumentPosition(controls as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          onRelocated?: (position: EpubPosition) => void;
        }
      | undefined;
    adapterOptions?.onRelocated?.(
      createEpubPosition({
        locator: {
          kind: "epub",
          href: "OPS/chapter-one.xhtml",
          cfi: "epubcfi(/6/2[chapter-one]!/4/1:12)",
          progression: 0.36,
        },
        page: 36,
        progression: 0.36,
      }),
    );

    await waitFor(() => expect(slider).toBeEnabled());
    expect(screen.getAllByText("Page 36 / 100").length).toBeGreaterThan(0);
    expect(screen.getByText("36%")).toBeVisible();

    await user.click(within(reader).getByRole("button", { name: "Previous" }));
    await user.click(within(reader).getByRole("button", { name: "Next" }));

    expect(epubAdapterPreviousMock).toHaveBeenCalledTimes(1);
    expect(epubAdapterNextMock).toHaveBeenCalledTimes(1);
  });

  it("previews EPUB progress while dragging and commits one jump on release", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({ id: "epub-progress", title: "Slider EPUB", format: "epub" });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Slider EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });
    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          onRelocated?: (position: EpubPosition) => void;
        }
      | undefined;
    adapterOptions?.onRelocated?.(
      createEpubPosition({
        locator: {
          kind: "epub",
          href: "OPS/chapter-one.xhtml",
          cfi: "epubcfi(/6/2[chapter-one]!/4/1:12)",
          progression: 0.12,
        },
        page: 12,
        progression: 0.12,
      }),
    );

    const slider = await screen.findByRole("slider", { name: "EPUB reading progress" });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, {
      target: {
        value: "620",
      },
    });

    expect(epubAdapterPreviewProgressMock).toHaveBeenCalledWith(0.62);
    expect(epubAdapterGoToProgressMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Chapter Two" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(screen.getAllByText("Page 62 / 100").length).toBeGreaterThan(0);
    expect(screen.getByText("62%")).toBeVisible();

    fireEvent.pointerUp(slider);

    await waitFor(() => expect(epubAdapterGoToProgressMock).toHaveBeenCalledWith(0.62));
    expect(epubAdapterGoToProgressMock).toHaveBeenCalledTimes(1);
  });

  it("toggles EPUB single and double page view through the adapter", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({ id: "epub-spread", title: "Spread EPUB", format: "epub" });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Spread EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });

    await user.click(screen.getByRole("button", { name: "Double" }));
    expect(epubAdapterSetSpreadModeMock).toHaveBeenCalledWith("double");
    expect(screen.getByRole("button", { name: "Double" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Single" }));
    expect(epubAdapterSetSpreadModeMock).toHaveBeenCalledWith("single");
    expect(screen.getByRole("button", { name: "Single" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a later-stage reader message for PDF books", async () => {
    const user = userEvent.setup();
    const pdfBook = createBook({ id: "pdf-book", title: "Layout Notes PDF", format: "pdf" });
    listBooksMock.mockResolvedValueOnce([pdfBook]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Layout Notes PDF" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Reader support coming later")).toBeVisible();
    expect(screen.getByText("PDF reading will be added in a later stage.")).toBeInTheDocument();
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
    expect(reader).toHaveStyle("--txt-reader-heading: #f0e8d7");
    expect(reader).toHaveAttribute("data-reader-theme", "dark");
  });

  it("updates EPUB themes through the adapter without reopening the book", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({ id: "theme-epub", title: "Theme EPUB", format: "epub" });
    const openedBook = {
      ...epubBook,
      lastOpenedAt: "2026-06-20T10:00:00.000Z",
    };
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(openedBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Theme EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "EPUB reader" });
    await waitFor(() => expect(epubAdapterOpenMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("button", { name: "dark" }));

    await waitFor(() =>
      expect(epubAdapterSetThemeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "dark",
          backgroundColor: "#171a1d",
          textColor: "#f0e8d7",
        }),
      ),
    );
    expect(saveReaderThemeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "dark",
      }),
    );
    expect(epubAdapterOpenMock).toHaveBeenCalledTimes(1);
    expect(reader).toHaveAttribute("data-reader-theme", "dark");
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

    expect(screen.getByRole("button", { name: "第二章 风起" })).toHaveAttribute(
      "aria-current",
      "location",
    );
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

  it("restores saved EPUB progress and saves relocated locators", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({ id: "progress-epub", title: "Progress EPUB", format: "epub" });
    const openedBook = {
      ...epubBook,
      lastOpenedAt: "2026-06-20T10:00:00.000Z",
    };
    const savedLocator: EpubLocator = {
      kind: "epub",
      href: "OPS/chapter-two.xhtml",
      cfi: "epubcfi(/6/4[chapter-two]!/4/1:18)",
      progression: 0.42,
    };
    const relocatedLocator: EpubLocator = {
      kind: "epub",
      href: "OPS/chapter-one.xhtml",
      cfi: "epubcfi(/6/2[chapter-one]!/4/1:12)",
      progression: 0.75,
    };
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(openedBook);
    getReadingProgressMock.mockResolvedValueOnce({
      bookId: "progress-epub",
      locator: savedLocator,
      progress: 0.42,
      updatedAt: "2026-06-20T12:00:00.000Z",
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Progress EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "EPUB reader" });
    await waitFor(() => expect(epubAdapterOpenMock).toHaveBeenCalledWith("progress-epub"));

    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          initialLocator?: EpubLocator;
          onRelocated?: (position: EpubPosition) => void;
        }
      | undefined;
    expect(adapterOptions?.initialLocator).toEqual(savedLocator);

    adapterOptions?.onRelocated?.(
      createEpubPosition({
        locator: relocatedLocator,
        page: 75,
        totalPages: 100,
        progression: 0.75,
      }),
    );
    await waitFor(() => expect(screen.getAllByText("Page 75 / 100").length).toBeGreaterThan(0));
    expect(screen.getByText("75%")).toBeVisible();

    await user.click(within(reader).getByRole("button", { name: "Shelf" }));

    await waitFor(() =>
      expect(saveReadingProgressMock).toHaveBeenCalledWith(
        "progress-epub",
        relocatedLocator,
        0.75,
      ),
    );
  });

  it("saves scroll progress after scroll idle instead of during every scroll event", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({ id: "scroll-txt", title: "Scroll TXT", format: "txt" });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createLongTxtDocument(txtBook));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Scroll TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const viewport = await screen.findByLabelText("Scroll TXT content");
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 1800,
    });

    vi.useFakeTimers();
    fireEvent.scroll(viewport);

    expect(saveReadingProgressMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(760);
    vi.useRealTimers();

    expect(saveReadingProgressMock).toHaveBeenCalledWith(
      "scroll-txt",
      expect.objectContaining({
        kind: "txt",
        chapterId: expect.any(String) as string,
        charOffset: expect.any(Number) as number,
      }),
      expect.any(Number),
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

function createLongTxtDocument(book: Book): TxtDocument {
  const firstParagraphs = Array.from({ length: 80 }, (_, index) => `第一章第 ${index + 1} 段。`);
  const secondParagraphs = Array.from({ length: 80 }, (_, index) => `第二章第 ${index + 1} 段。`);
  const firstText = ["第一章 初见", ...firstParagraphs].join("\n");
  const secondText = ["第二章 风起", ...secondParagraphs].join("\n");
  const text = `${firstText}\n${secondText}`;
  const secondStart = firstText.length + 1;

  return {
    book,
    encoding: "UTF-8",
    byteLength: text.length * 2,
    charCount: text.length,
    lineCount: firstParagraphs.length + secondParagraphs.length + 2,
    chapters: [
      {
        id: "chapter-1-0",
        title: "第一章 初见",
        startChar: 0,
        endChar: secondStart - 1,
        text: firstText,
      },
      {
        id: `chapter-2-${secondStart}`,
        title: "第二章 风起",
        startChar: secondStart,
        endChar: text.length,
        text: secondText,
      },
    ],
  };
}

function createEpubPosition(overrides: Partial<EpubPosition> = {}): EpubPosition {
  const locator = overrides.locator ?? {
    kind: "epub" as const,
    href: "OPS/chapter-one.xhtml",
    cfi: "epubcfi(/6/2[chapter-one]!/4/1:12)",
    progression: 0.1,
  };

  return {
    locator,
    progression: locator.progression ?? null,
    page: 10,
    totalPages: 100,
    displayedPage: 1,
    displayedTotal: 1,
    locationsReady: true,
    ...overrides,
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
