import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type Annotation,
  defaultReaderTheme,
  type Book,
  type EpubLocator,
  type ImportBookResult,
  type PdfLocator,
  type TxtDocument,
} from "@reader/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { EpubReaderAdapter, type EpubPosition } from "./epub/EpubReaderAdapter";
import { PdfReaderAdapter, type PdfPosition } from "./pdf/PdfReaderAdapter";
import {
  importBook,
  listBooks,
  markBookOpened,
  pickBookFile,
  removeBook,
} from "./tauri/library";
import {
  createAnnotation,
  createBookmark,
  deleteAnnotation,
  deleteBookmark,
  getEpubBookSource,
  getPdfBookSource,
  getReaderTheme,
  getReadingProgress,
  listAnnotations,
  listBookmarks,
  openTxtBook,
  saveReaderTheme,
  saveReadingProgress,
  updateAnnotation,
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
const epubAdapterAddHighlightMock = vi.hoisted(() => vi.fn());
const epubAdapterRemoveHighlightMock = vi.hoisted(() => vi.fn());
const epubAdapterAddUnderlineMock = vi.hoisted(() => vi.fn());
const epubAdapterRemoveUnderlineMock = vi.hoisted(() => vi.fn());
const epubAdapterNextMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterOpenMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterPreviousMock = vi.hoisted(() => vi.fn(async () => undefined));
const epubAdapterSearchMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<Array<{ id: string; locator: EpubLocator; excerpt: string }>> =>
      [],
  ),
);
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

const pdfAdapterCloseMock = vi.hoisted(() => vi.fn(async () => undefined));
const pdfAdapterFitWidthMock = vi.hoisted(() =>
  vi.fn(async (width: number) => {
    void width;
  }),
);
const pdfAdapterGetTocMock = vi.hoisted(() =>
  vi.fn(async () => [
    {
      id: "pdf-page-1",
      title: "Page 1",
      locator: {
        kind: "pdf" as const,
        page: 1,
      },
    },
    {
      id: "pdf-page-2",
      title: "Page 2",
      locator: {
        kind: "pdf" as const,
        page: 2,
      },
    },
    {
      id: "pdf-page-3",
      title: "Page 3",
      locator: {
        kind: "pdf" as const,
        page: 3,
      },
    },
  ]),
);
const pdfAdapterGoToMock = vi.hoisted(() =>
  vi.fn(async (locator: PdfLocator) => {
    void locator;
  }),
);
const pdfAdapterGoToProgressMock = vi.hoisted(() =>
  vi.fn(async (progression: number) => {
    void progression;
  }),
);
const pdfAdapterNextMock = vi.hoisted(() => vi.fn(async () => undefined));
const pdfAdapterOpenMock = vi.hoisted(() =>
  vi.fn(async (bookId: string) => {
    void bookId;
  }),
);
const pdfAdapterPreviousMock = vi.hoisted(() => vi.fn(async () => undefined));
const pdfAdapterSearchMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<Array<{ id: string; locator: PdfLocator; excerpt: string }>> =>
      [],
  ),
);
const pdfAdapterPreviewProgressMock = vi.hoisted(() =>
  vi.fn((progression: number) => {
    void progression;
  }),
);
const pdfAdapterRenderPageMock = vi.hoisted(() =>
  vi.fn(async (canvas: HTMLCanvasElement, pageNumber: number) => {
    canvas.width = 600;
    canvas.height = 800;

    return {
      pageNumber,
      width: 600,
      height: 800,
      scale: 1,
    };
  }),
);
const pdfAdapterRenderTextLayerMock = vi.hoisted(() =>
  vi.fn(async (container: HTMLElement, pageNumber: number) => {
    container.dataset.pageNumber = String(pageNumber);

    return {
      pageNumber,
      width: 600,
      height: 800,
      scale: 1,
    };
  }),
);
const pdfAdapterPdfRectsToViewportRectsMock = vi.hoisted(() =>
  vi.fn(
    async (
      _pageNumber: number,
      rects: Array<{ x: number; y: number; width: number; height: number }>,
    ) => rects,
  ),
);
const pdfAdapterSetThemeMock = vi.hoisted(() => vi.fn(async () => undefined));
const pdfAdapterSetViewModeMock = vi.hoisted(() =>
  vi.fn((mode: "single" | "double" | "continuous", availableWidth?: number) => {
    void mode;
    void availableWidth;
  }),
);
const pdfAdapterSetZoomMock = vi.hoisted(() =>
  vi.fn((scale: number) => {
    void scale;
  }),
);
const pdfAdapterVisiblePagesMock = vi.hoisted(() => vi.fn(() => [1]));
const createBookmarkMock = vi.hoisted(() => vi.fn());
const createAnnotationMock = vi.hoisted(() => vi.fn());
const deleteAnnotationMock = vi.hoisted(() => vi.fn());
const deleteBookmarkMock = vi.hoisted(() => vi.fn());
const listAnnotationsMock = vi.hoisted(() => vi.fn());
const listBookmarksMock = vi.hoisted(() => vi.fn());

vi.mock("./tauri/library", () => ({
  importBook: vi.fn(),
  listBooks: vi.fn(),
  markBookOpened: vi.fn(),
  pickBookFile: vi.fn(),
  removeBook: vi.fn(),
}));

vi.mock("./tauri/reader", () => ({
  createAnnotation: createAnnotationMock,
  createBookmark: createBookmarkMock,
  deleteAnnotation: deleteAnnotationMock,
  deleteBookmark: deleteBookmarkMock,
  getEpubBookSource: vi.fn(),
  getPdfBookSource: vi.fn(),
  getReaderTheme: vi.fn(),
  getReadingProgress: vi.fn(),
  listAnnotations: listAnnotationsMock,
  listBookmarks: listBookmarksMock,
  openTxtBook: vi.fn(),
  saveReaderTheme: vi.fn(),
  saveReadingProgress: vi.fn(),
  updateAnnotation: vi.fn(),
}));

vi.mock("./epub/EpubReaderAdapter", () => ({
  EpubReaderAdapter: vi.fn(function MockEpubReaderAdapter() {
    return {
      addHighlight: epubAdapterAddHighlightMock,
      addUnderline: epubAdapterAddUnderlineMock,
      close: epubAdapterCloseMock,
      getToc: epubAdapterGetTocMock,
      goTo: epubAdapterGoToMock,
      goToProgress: epubAdapterGoToProgressMock,
      next: epubAdapterNextMock,
      open: epubAdapterOpenMock,
      previous: epubAdapterPreviousMock,
      previewProgress: epubAdapterPreviewProgressMock,
      removeHighlight: epubAdapterRemoveHighlightMock,
      removeUnderline: epubAdapterRemoveUnderlineMock,
      search: epubAdapterSearchMock,
      setSpreadMode: epubAdapterSetSpreadModeMock,
      setTheme: epubAdapterSetThemeMock,
    };
  }),
}));

vi.mock("./pdf/PdfReaderAdapter", () => ({
  PdfReaderAdapter: vi.fn(function MockPdfReaderAdapter(options: {
    initialLocator?: PdfLocator;
    onPositionChange?: (position: PdfPosition) => void;
  }) {
    let page = options.initialLocator?.page ?? 1;
    let scale = options.initialLocator?.scale ?? 1;
    let viewMode: "single" | "double" | "continuous" = "single";
    let renderedMode: "single" | "double" = "single";
    let zoomMode: "fit-width" | "custom" = options.initialLocator?.zoomMode ?? "custom";
    const totalPages = 3;
    const clampPage = (nextPage: number) => Math.min(Math.max(nextPage, 1), totalPages);
    const pageFromProgress = (progression: number) =>
      clampPage(
        Math.round(Math.min(Math.max(progression, 0), 1) * (totalPages - 1)) + 1,
      );
    const createPosition = (positionPage = page): PdfPosition => ({
      locator: {
        kind: "pdf",
        page: clampPage(positionPage),
        scale,
        zoomMode,
      },
      page: clampPage(positionPage),
      totalPages,
      scale,
      zoomMode,
      progression: (clampPage(positionPage) - 1) / (totalPages - 1),
      viewMode,
      renderedMode,
    });
    const reportPosition = () => {
      options.onPositionChange?.(createPosition());
    };

    return {
      close: pdfAdapterCloseMock,
      fitWidth: async (width: number) => {
        await pdfAdapterFitWidthMock(width);
        scale = 1.2;
        zoomMode = "fit-width";
        reportPosition();
        return createPosition();
      },
      getPosition: createPosition,
      getToc: pdfAdapterGetTocMock,
      getVisiblePages: () => {
        const visiblePages =
          renderedMode === "double" && page < totalPages ? [page, page + 1] : [page];
        pdfAdapterVisiblePagesMock();

        return visiblePages;
      },
      goTo: async (locator: PdfLocator) => {
        await pdfAdapterGoToMock(locator);
        page = clampPage(locator.page);
        scale = locator.scale ?? scale;
        zoomMode = locator.zoomMode ?? "custom";
        reportPosition();
      },
      goToProgress: async (progression: number) => {
        await pdfAdapterGoToProgressMock(progression);
        page = pageFromProgress(progression);
        zoomMode = "custom";
        reportPosition();
      },
      next: async () => {
        await pdfAdapterNextMock();
        page = clampPage(page + (renderedMode === "double" ? 2 : 1));
        zoomMode = "custom";
        reportPosition();
      },
      open: async (bookId: string) => {
        await pdfAdapterOpenMock(bookId);
        reportPosition();
      },
      previous: async () => {
        await pdfAdapterPreviousMock();
        page = clampPage(page - (renderedMode === "double" ? 2 : 1));
        zoomMode = "custom";
        reportPosition();
      },
      previewProgress: (progression: number) => {
        pdfAdapterPreviewProgressMock(progression);
        return createPosition(pageFromProgress(progression));
      },
      renderPage: pdfAdapterRenderPageMock,
      renderTextLayer: pdfAdapterRenderTextLayerMock,
      pdfRectsToViewportRects: pdfAdapterPdfRectsToViewportRectsMock,
      search: pdfAdapterSearchMock,
      setTheme: pdfAdapterSetThemeMock,
      setViewMode: (
        mode: "single" | "double" | "continuous",
        availableWidth?: number,
      ) => {
        pdfAdapterSetViewModeMock(mode, availableWidth);
        viewMode = mode;
        renderedMode =
          mode === "double" && (availableWidth ?? 1000) >= 920 ? "double" : "single";
        reportPosition();

        return createPosition();
      },
      setZoom: (nextScale: number) => {
        pdfAdapterSetZoomMock(nextScale);
        scale = Math.min(3, Math.max(0.5, nextScale));
        zoomMode = "custom";
        reportPosition();

        return createPosition();
      },
      viewportRectsToPdfRects: async (
        _pageNumber: number,
        rects: Array<{ x: number; y: number; width: number; height: number }>,
      ) => rects,
    };
  }),
}));

const getEpubBookSourceMock = vi.mocked(getEpubBookSource);
const getPdfBookSourceMock = vi.mocked(getPdfBookSource);
const getReaderThemeMock = vi.mocked(getReaderTheme);
const getReadingProgressMock = vi.mocked(getReadingProgress);
const createAnnotationMocked = vi.mocked(createAnnotation);
const createBookmarkMocked = vi.mocked(createBookmark);
const deleteAnnotationMocked = vi.mocked(deleteAnnotation);
const deleteBookmarkMocked = vi.mocked(deleteBookmark);
const importBookMock = vi.mocked(importBook);
const listAnnotationsMocked = vi.mocked(listAnnotations);
const listBookmarksMocked = vi.mocked(listBookmarks);
const listBooksMock = vi.mocked(listBooks);
const markBookOpenedMock = vi.mocked(markBookOpened);
const openTxtBookMock = vi.mocked(openTxtBook);
const pickBookFileMock = vi.mocked(pickBookFile);
const removeBookMock = vi.mocked(removeBook);
const saveReaderThemeMock = vi.mocked(saveReaderTheme);
const saveReadingProgressMock = vi.mocked(saveReadingProgress);
const updateAnnotationMock = vi.mocked(updateAnnotation);
const EpubReaderAdapterMock = vi.mocked(EpubReaderAdapter);
const PdfReaderAdapterMock = vi.mocked(PdfReaderAdapter);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    epubAdapterCloseMock.mockClear();
    epubAdapterGetTocMock.mockClear();
    epubAdapterGoToMock.mockClear();
    epubAdapterGoToProgressMock.mockClear();
    epubAdapterAddHighlightMock.mockClear();
    epubAdapterRemoveHighlightMock.mockClear();
    epubAdapterAddUnderlineMock.mockClear();
    epubAdapterRemoveUnderlineMock.mockClear();
    epubAdapterNextMock.mockClear();
    epubAdapterOpenMock.mockClear();
    epubAdapterPreviousMock.mockClear();
    epubAdapterSearchMock.mockClear();
    epubAdapterPreviewProgressMock.mockClear();
    epubAdapterSetSpreadModeMock.mockClear();
    epubAdapterSetThemeMock.mockClear();
    pdfAdapterCloseMock.mockClear();
    pdfAdapterFitWidthMock.mockClear();
    pdfAdapterGetTocMock.mockClear();
    pdfAdapterGoToMock.mockClear();
    pdfAdapterGoToProgressMock.mockClear();
    pdfAdapterNextMock.mockClear();
    pdfAdapterOpenMock.mockClear();
    pdfAdapterPreviousMock.mockClear();
    pdfAdapterSearchMock.mockClear();
    pdfAdapterPreviewProgressMock.mockClear();
    pdfAdapterRenderPageMock.mockClear();
    pdfAdapterRenderTextLayerMock.mockClear();
    pdfAdapterPdfRectsToViewportRectsMock.mockClear();
    pdfAdapterSetThemeMock.mockClear();
    pdfAdapterSetViewModeMock.mockClear();
    pdfAdapterSetZoomMock.mockClear();
    pdfAdapterVisiblePagesMock.mockClear();
    deleteAnnotationMock.mockClear();
    epubAdapterSearchMock.mockResolvedValue([]);
    pdfAdapterSearchMock.mockResolvedValue([]);
    listBooksMock.mockResolvedValue([]);
    markBookOpenedMock.mockImplementation(async (bookId) =>
      createBook({
        id: bookId,
        format: "txt",
        lastOpenedAt: "2026-06-19T10:00:00.000Z",
      }),
    );
    getEpubBookSourceMock.mockResolvedValue("blob:mock-epub");
    getPdfBookSourceMock.mockResolvedValue("blob:mock-pdf");
    getReaderThemeMock.mockResolvedValue(defaultReaderTheme);
    getReadingProgressMock.mockResolvedValue(null);
    listAnnotationsMocked.mockResolvedValue([]);
    listBookmarksMocked.mockResolvedValue([]);
    createAnnotationMocked.mockImplementation(
      async (bookId, annotationType, locator, color, selectedText, note) => ({
        id: "annotation-created",
        bookId,
        type: annotationType,
        color,
        selectedText,
        note,
        locator,
        createdAt: "2026-06-21T10:00:00.000Z",
        updatedAt: "2026-06-21T10:00:00.000Z",
      }),
    );
    updateAnnotationMock.mockImplementation(async (annotationId, color, note) => ({
      id: annotationId,
      bookId: "book-id",
      type: "highlight",
      color,
      selectedText: "Saved text",
      note,
      locator: {
        kind: "txt",
        chapterId: "chapter-1-0",
        charOffset: 7,
        endCharOffset: 11,
      },
      createdAt: "2026-06-21T10:00:00.000Z",
      updatedAt: "2026-06-21T10:05:00.000Z",
    }));
    deleteAnnotationMocked.mockResolvedValue(undefined);
    createBookmarkMocked.mockImplementation(async (bookId, locator, label) => ({
      id: "bookmark-created",
      bookId,
      locator,
      label,
      createdAt: "2026-06-21T10:00:00.000Z",
    }));
    deleteBookmarkMocked.mockResolvedValue(undefined);
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

    expect(
      await screen.findByRole("heading", { name: "Your library is empty" }),
    ).toBeVisible();
    expect(
      screen.getByRole("main", { name: "Ebook Reader bookshelf" }),
    ).toBeInTheDocument();
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
    expect(
      within(cards[0]).getByRole("heading", { name: "Recent Field Notes" }),
    ).toBeVisible();
    expect(
      within(cards[1]).getByRole("heading", { name: "Archive Notes" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("removes a book through the right-click actions menu after confirmation", async () => {
    const user = userEvent.setup();
    const book = createBook({
      id: "remove-book",
      title: "Remove Candidate",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([book]);
    removeBookMock.mockResolvedValueOnce({
      book,
      removedLibraryPath: "D:\\library\\remove-candidate.txt",
    });

    render(<App />);
    const card = await screen.findByRole("article", { name: "Remove Candidate book" });

    fireEvent.contextMenu(card, { clientX: 40, clientY: 60 });
    await user.click(screen.getByRole("menuitem", { name: "Remove from shelf" }));

    expect(
      await screen.findByRole("alertdialog", { name: "Remove from shelf?" }),
    ).toBeVisible();
    expect(
      screen.getByText(/The original file you imported will not be deleted/),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeBookMock).toHaveBeenCalledWith("remove-book"));
    await waitFor(() =>
      expect(
        screen.queryByRole("article", { name: "Remove Candidate book" }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Book removed")).toBeVisible();
    expect(
      screen.getByText("Remove Candidate was removed from this shelf."),
    ).toBeVisible();
  });

  it("opens book actions from the visible more button", async () => {
    const user = userEvent.setup();
    const book = createBook({
      id: "menu-book",
      title: "Menu Candidate",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([book]);

    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Menu Candidate" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "More actions for Menu Candidate" }),
    );

    expect(
      screen.getByRole("menu", { name: "Actions for Menu Candidate" }),
    ).toBeVisible();
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

    expect(
      await screen.findByRole("heading", { name: "Imported Handbook" }),
    ).toBeVisible();
    expect(screen.getByText("Import complete")).toBeVisible();
    expect(screen.getByText("Imported Imported Handbook.")).toBeInTheDocument();
    expect(importBookMock).toHaveBeenCalledWith("D:\\books\\imported-handbook.epub");
  });

  it("shows duplicate feedback without duplicating the shelf entry", async () => {
    const user = userEvent.setup();
    const duplicateBook = createBook({ id: "same-book", title: "Existing Manual" });
    listBooksMock.mockResolvedValueOnce([duplicateBook]);
    pickBookFileMock.mockResolvedValueOnce("D:\\books\\existing-manual.pdf");
    importBookMock.mockResolvedValueOnce(
      createImportResult("duplicate", duplicateBook),
    );

    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Existing Manual" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Import book" }));

    expect(await screen.findByText("Already in library")).toBeVisible();
    expect(
      screen.getByText("Existing Manual is already on this shelf."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("shows import failures without adding a book", async () => {
    const user = userEvent.setup();
    pickBookFileMock.mockResolvedValueOnce("D:\\books\\notes.md");
    importBookMock.mockRejectedValueOnce(new Error("unsupported book format"));

    render(<App />);
    await screen.findByRole("heading", { name: "Your library is empty" });

    await user.click(screen.getByRole("button", { name: "Import book" }));

    await waitFor(() =>
      expect(importBookMock).toHaveBeenCalledWith("D:\\books\\notes.md"),
    );
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

    expect(
      await screen.findByRole("main", { name: "Ebook Reader bookshelf" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "长夜将明" })).toBeVisible();
  });

  it("routes reader shortcuts without hijacking editable controls", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "keyboard-txt",
      title: "Keyboard TXT",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Continue" }));

    const viewport = await screen.findByLabelText("Keyboard TXT content");
    const scrollBy = vi.fn();
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(viewport, "scrollBy", {
      configurable: true,
      value: scrollBy,
    });

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(scrollBy).toHaveBeenCalledWith({ behavior: "smooth", top: 540 });

    fireEvent.keyDown(document, { ctrlKey: true, key: "f" });
    const searchInput = await screen.findByRole("textbox", {
      name: "Search in book",
    });
    await waitFor(() => expect(searchInput).toHaveFocus());
    expect(screen.getByRole("tab", { name: "Search" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.keyDown(searchInput, { key: "ArrowRight" });
    expect(scrollBy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText("Table of contents")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Focus" }));
    expect(screen.getByRole("button", { name: "Exit focus" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Exit focus" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Focus" })).toHaveFocus();
  });

  it("forwards EPUB iframe keyboard events to page navigation", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "keyboard-epub",
      title: "Keyboard EPUB",
      format: "epub",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });
    await waitFor(() => expect(EpubReaderAdapterMock).toHaveBeenCalled());

    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as {
      onKeyDown?: (event: KeyboardEvent) => void;
    };
    const nextEvent = new KeyboardEvent("keydown", {
      cancelable: true,
      key: "ArrowRight",
    });
    adapterOptions.onKeyDown?.(nextEvent);

    expect(nextEvent.defaultPrevented).toBe(true);
    expect(epubAdapterNextMock).toHaveBeenCalledTimes(1);
  });

  it("creates and jumps to a TXT bookmark from the reader sidebar", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "bookmark-txt",
      title: "Bookmark TXT",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Bookmark TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "TXT reader" });
    const bookmarkButton = within(reader).getByRole("button", { name: "Bookmark" });
    await waitFor(() => expect(bookmarkButton).toBeEnabled());

    await user.click(bookmarkButton);

    await waitFor(() =>
      expect(createBookmarkMocked).toHaveBeenCalledWith(
        "bookmark-txt",
        expect.objectContaining({
          kind: "txt",
          chapterId: "chapter-1-0",
          charOffset: 0,
        }),
        "第一章 初见",
      ),
    );
    expect(screen.getByRole("tab", { name: "Bookmarks" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(
      within(reader).getByRole("button", { name: "Go to bookmark 第一章 初见" }),
    );

    await waitFor(() =>
      expect(saveReadingProgressMock).toHaveBeenCalledWith(
        "bookmark-txt",
        expect.objectContaining({
          kind: "txt",
          chapterId: "chapter-1-0",
          charOffset: 0,
        }),
        0,
      ),
    );
  });

  it("opens an EPUB book in the reader shell", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-book",
      title: "Layout Notes",
      format: "epub",
    });
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

  it("shows selection actions for an EPUB selection", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-selection",
      title: "Selection EPUB",
      format: "epub",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Selection EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });

    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          onRelocated?: (position: EpubPosition) => void;
          onSelected?: (selection: {
            cfiRange: string;
            selectedText?: string;
            contextBefore?: string;
            contextAfter?: string;
            anchorRect?: { height: number; left: number; top: number; width: number };
          }) => void;
        }
      | undefined;
    adapterOptions?.onRelocated?.(createEpubPosition());
    adapterOptions?.onSelected?.({
      cfiRange: "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
      selectedText: "Selected text",
      contextBefore: "Before",
      contextAfter: "After",
      anchorRect: {
        height: 18,
        left: 120,
        top: 220,
        width: 40,
      },
    });

    const selectionActions = await screen.findByRole("toolbar", {
      name: "Selection actions",
    });
    expect(selectionActions).toHaveStyle({ left: "140px", top: "220px" });
    expect(within(selectionActions).getByRole("button", { name: "Highlight" })).toBeVisible();
    expect(within(selectionActions).getByRole("button", { name: "Note" })).toBeVisible();
    expect(within(selectionActions).getByRole("button", { name: "Copy" })).toBeVisible();

    await user.click(within(selectionActions).getByRole("button", { name: "Highlight" }));

    await waitFor(() =>
      expect(createAnnotationMocked).toHaveBeenCalledWith(
        "epub-selection",
        "highlight",
        expect.objectContaining({
          kind: "epub",
          cfi: "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
          selectedText: "Selected text",
          contextBefore: "Before",
          contextAfter: "After",
        }),
        "#f3bc55",
        "Selected text",
      ),
    );
  });

  it("creates a note from an EPUB selection through the inline note editor", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-note",
      title: "Note EPUB",
      format: "epub",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Note EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });

    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          onRelocated?: (position: EpubPosition) => void;
          onSelected?: (selection: {
            cfiRange: string;
            selectedText?: string;
            contextBefore?: string;
            contextAfter?: string;
          }) => void;
        }
      | undefined;
    adapterOptions?.onRelocated?.(createEpubPosition());
    adapterOptions?.onSelected?.({
      cfiRange: "epubcfi(/6/2[chapter-one]!/4/1:2,/4/1:8)",
      selectedText: "Selected note",
    });

    const selectionActions = await screen.findByRole("toolbar", {
      name: "Selection actions",
    });
    await user.click(within(selectionActions).getByRole("button", { name: "Note" }));

    const noteInput = await screen.findByRole("textbox", {
      name: "Note for Selected note",
    });
    await user.type(noteInput, "inline note");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createAnnotationMocked).toHaveBeenCalledWith(
        "epub-note",
        "note",
        expect.objectContaining({
          kind: "epub",
          cfi: "epubcfi(/6/2[chapter-one]!/4/1:2,/4/1:8)",
          selectedText: "Selected note",
        }),
        "#f3bc55",
        "Selected note",
        "inline note",
      ),
    );
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(
      screen.queryByRole("textbox", { name: "Note for Selected note" }),
    ).not.toBeInTheDocument();
  });

  it("updates an existing EPUB highlight color instead of creating a duplicate", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-recolor",
      title: "Recolor EPUB",
      format: "epub",
    });
    const existingHighlight = createAnnotationRecord({
      id: "existing-epub-highlight",
      bookId: "epub-recolor",
      color: "#f3bc55",
      locator: {
        kind: "epub",
        href: "OPS/chapter-one.xhtml",
        cfi: "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
        selectedText: "Selected text",
        contextBefore: "Before",
        contextAfter: "After",
      },
      selectedText: "Selected text",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);
    listAnnotationsMocked.mockResolvedValueOnce([existingHighlight]);
    updateAnnotationMock.mockResolvedValueOnce({
      ...existingHighlight,
      color: "#7dbb78",
      updatedAt: "2026-06-21T10:09:00.000Z",
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Recolor EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });

    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          onRelocated?: (position: EpubPosition) => void;
          onSelected?: (selection: {
            cfiRange: string;
            selectedText?: string;
            contextBefore?: string;
            contextAfter?: string;
          }) => void;
        }
      | undefined;
    adapterOptions?.onRelocated?.(createEpubPosition());
    adapterOptions?.onSelected?.({
      cfiRange: "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
      selectedText: "Selected text",
      contextBefore: "Before",
      contextAfter: "After",
    });

    const selectionActions = await screen.findByRole("toolbar", {
      name: "Selection actions",
    });
    await user.click(
      within(selectionActions).getByRole("button", { name: "Highlight green" }),
    );

    await waitFor(() =>
      expect(updateAnnotationMock).toHaveBeenCalledWith(
        "existing-epub-highlight",
        "#7dbb78",
        undefined,
      ),
    );
    expect(createAnnotationMocked).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(epubAdapterRemoveHighlightMock).toHaveBeenCalledWith(
        "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
      ),
    );
    await waitFor(() =>
      expect(epubAdapterAddHighlightMock).toHaveBeenCalledWith(
        "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
        "#7dbb78",
      ),
    );
  });

  it("hides EPUB selection UI when the adapter reports a cleared selection", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-clear-selection",
      title: "Clear EPUB",
      format: "epub",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Clear EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });

    const adapterOptions = EpubReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          onRelocated?: (position: EpubPosition) => void;
          onSelected?: (selection: {
            cfiRange: string;
            selectedText?: string;
          }) => void;
          onSelectionCleared?: () => void;
        }
      | undefined;
    adapterOptions?.onRelocated?.(createEpubPosition());
    adapterOptions?.onSelected?.({
      cfiRange: "epubcfi(/6/2[chapter-one]!/4/1:2,/4/1:8)",
      selectedText: "Selected note",
    });

    expect(
      await screen.findByRole("toolbar", { name: "Selection actions" }),
    ).toBeVisible();

    adapterOptions?.onSelectionCleared?.();

    await waitFor(() =>
      expect(
        screen.queryByRole("toolbar", { name: "Selection actions" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("replays saved TXT highlights in visible text blocks", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "highlight-txt",
      title: "Highlight TXT",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));
    listAnnotationsMocked.mockResolvedValueOnce([
      createAnnotationRecord({
        bookId: "highlight-txt",
        locator: {
          kind: "txt",
          chapterId: "chapter-1-0",
          charOffset: 7,
          endCharOffset: 11,
        },
        selectedText: "她推开门",
      }),
    ]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Highlight TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("她推开门", { selector: "mark" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit note for 她推开门" }),
    ).not.toBeInTheDocument();
  });

  it("creates one TXT highlight for a selection spanning rendered paragraphs", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "txt-cross-selection",
      title: "Cross TXT",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createCrossParagraphTxtDocument(txtBook));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Cross TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const viewport = await screen.findByLabelText("Cross TXT content");
    const firstParagraphNode = screen.getByText("第一段文字。").firstChild;
    const secondParagraphNode = screen.getByText("第二段文字。").firstChild;

    if (firstParagraphNode === null || secondParagraphNode === null) {
      throw new Error("Expected rendered TXT paragraph text nodes.");
    }

    const range = window.document.createRange();
    range.setStart(firstParagraphNode, 2);
    range.setEnd(secondParagraphNode, 2);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(viewport);

    const selectionActions = await screen.findByRole("toolbar", {
      name: "Selection actions",
    });
    await user.click(within(selectionActions).getByRole("button", { name: "Highlight" }));

    await waitFor(() =>
      expect(createAnnotationMocked).toHaveBeenCalledWith(
        "txt-cross-selection",
        "highlight",
        expect.objectContaining({
          kind: "txt",
          chapterId: "chapter-cross-0",
          charOffset: 9,
          endCharOffset: 16,
        }),
        "#f3bc55",
        expect.stringContaining("段文字。"),
      ),
    );
  });

  it("opens the inline note editor from annotated TXT text and saves updates", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "txt-inline-note",
      title: "Inline TXT",
      format: "txt",
    });
    const annotation = createAnnotationRecord({
      id: "txt-inline-annotation",
      bookId: "txt-inline-note",
      note: "old note",
      selectedText: "她推开门",
      locator: {
        kind: "txt",
        chapterId: "chapter-1-0",
        charOffset: 7,
        endCharOffset: 11,
      },
    });
    const secondAnnotation = createAnnotationRecord({
      id: "txt-inline-annotation-second",
      bookId: "txt-inline-note",
      note: "second note",
      selectedText: "她推开门",
      locator: {
        kind: "txt",
        chapterId: "chapter-1-0",
        charOffset: 7,
        endCharOffset: 11,
      },
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));
    listAnnotationsMocked.mockResolvedValueOnce([annotation, secondAnnotation]);
    updateAnnotationMock.mockResolvedValueOnce({
      ...annotation,
      note: "new inline note",
      updatedAt: "2026-06-21T10:09:00.000Z",
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Inline TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Edit note for 她推开门" }),
    );

    const savedNotes = await screen.findByRole("dialog", {
      name: "Saved notes for 她推开门",
    });
    expect(within(savedNotes).getByText("old note")).toBeVisible();
    expect(within(savedNotes).getByText("second note")).toBeVisible();

    await user.click(
      within(savedNotes).getByRole("button", {
        name: "Edit saved note 她推开门: old note",
      }),
    );

    const noteInput = await screen.findByRole("textbox", {
      name: "Note for 她推开门",
    });
    expect(noteInput).toHaveValue("old note");

    await user.clear(noteInput);
    await user.type(noteInput, "new inline note");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateAnnotationMock).toHaveBeenCalledWith(
        "txt-inline-annotation",
        "#f3bc55",
        "new inline note",
      ),
    );
    expect(
      screen.queryByRole("textbox", { name: "Note for 她推开门" }),
    ).not.toBeInTheDocument();
  });

  it("adds a new TXT note from the saved-note popover", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "txt-add-note",
      title: "Add Note TXT",
      format: "txt",
    });
    const annotation = createAnnotationRecord({
      id: "txt-add-note-existing",
      bookId: "txt-add-note",
      note: "saved note",
      selectedText: "她推开门",
      locator: {
        kind: "txt",
        chapterId: "chapter-1-0",
        charOffset: 7,
        endCharOffset: 11,
      },
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));
    listAnnotationsMocked.mockResolvedValueOnce([annotation]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Add Note TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Edit note for 她推开门" }),
    );

    const savedNotes = await screen.findByRole("dialog", {
      name: "Saved notes for 她推开门",
    });
    await user.click(within(savedNotes).getByRole("button", { name: "Add note" }));

    const noteInput = await screen.findByRole("textbox", {
      name: "Note for 她推开门",
    });
    expect(noteInput).toHaveValue("");

    await user.type(noteInput, "another saved note");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createAnnotationMocked).toHaveBeenCalledWith(
        "txt-add-note",
        "note",
        expect.objectContaining({
          kind: "txt",
          chapterId: "chapter-1-0",
          charOffset: 7,
          endCharOffset: 11,
        }),
        "#f3bc55",
        "她推开门",
        "another saved note",
      ),
    );
    expect(updateAnnotationMock).not.toHaveBeenCalled();
  });

  it("creates a new TXT note from a selection instead of overwriting a highlight", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "txt-note-new",
      title: "New Note TXT",
      format: "txt",
    });
    const highlight = createAnnotationRecord({
      id: "txt-note-existing-highlight",
      bookId: "txt-note-new",
      selectedText: "她推开门",
      locator: {
        kind: "txt",
        chapterId: "chapter-1-0",
        charOffset: 7,
        endCharOffset: 11,
      },
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));
    listAnnotationsMocked.mockResolvedValueOnce([highlight]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "New Note TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const viewport = await screen.findByLabelText("New Note TXT content");
    const highlightedText = await screen.findByText("她推开门", { selector: "mark" });
    const textNode = highlightedText.firstChild;

    if (textNode === null) {
      throw new Error("Expected highlighted TXT text node.");
    }

    const range = window.document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(viewport);

    const selectionActions = await screen.findByRole("toolbar", {
      name: "Selection actions",
    });
    await user.click(within(selectionActions).getByRole("button", { name: "Note" }));

    const noteInput = await screen.findByRole("textbox", {
      name: "Note for 她推开门",
    });
    await user.type(noteInput, "new note");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createAnnotationMocked).toHaveBeenCalledWith(
        "txt-note-new",
        "note",
        expect.objectContaining({
          kind: "txt",
          chapterId: "chapter-1-0",
          charOffset: 7,
          endCharOffset: 11,
        }),
        "#f3bc55",
        "她推开门",
        "new note",
      ),
    );
    expect(updateAnnotationMock).not.toHaveBeenCalled();
  });

  it("replays saved EPUB highlights through the adapter", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "highlight-epub",
      title: "Highlight EPUB",
      format: "epub",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);
    listAnnotationsMocked.mockResolvedValueOnce([
      createAnnotationRecord({
        bookId: "highlight-epub",
        color: "#7dbb78",
        locator: {
          kind: "epub",
          href: "OPS/chapter-one.xhtml",
          cfi: "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
        },
        selectedText: "Selected text",
      }),
    ]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Highlight EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });

    await waitFor(() =>
      expect(epubAdapterAddHighlightMock).toHaveBeenCalledWith(
        "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
        "#7dbb78",
      ),
    );
  });

  it("replays saved EPUB note underlines with a note popover click handler", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-note-underline",
      title: "Underline EPUB",
      format: "epub",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);
    listAnnotationsMocked.mockResolvedValueOnce([
      createAnnotationRecord({
        id: "epub-note-one",
        bookId: "epub-note-underline",
        type: "note",
        note: "saved epub note",
        selectedText: "Selected text",
        locator: {
          kind: "epub",
          href: "OPS/chapter-one.xhtml",
          cfi: "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
          selectedText: "Selected text",
        },
      }),
    ]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Underline EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("main", { name: "EPUB reader" });

    await waitFor(() =>
      expect(epubAdapterAddUnderlineMock).toHaveBeenCalledWith(
        "epubcfi(/6/2[chapter-one]!/4/1:0,/4/1:4)",
        "#f3bc55",
        expect.any(Function),
      ),
    );
    expect(epubAdapterAddHighlightMock).not.toHaveBeenCalled();

    const onUnderlineClick = epubAdapterAddUnderlineMock.mock.calls[0]?.[2] as
      | ((event: MouseEvent) => void)
      | undefined;
    onUnderlineClick?.({
      currentTarget: window.document.body,
      target: window.document.body,
    } as unknown as MouseEvent);

    const savedNotes = await screen.findByRole("dialog", {
      name: "Saved notes for Selected text",
    });
    expect(within(savedNotes).getByText("saved epub note")).toBeVisible();
  });

  it("replays saved PDF highlights as page overlays", async () => {
    const user = userEvent.setup();
    const pdfBook = createBook({
      id: "highlight-pdf",
      title: "Highlight PDF",
      format: "pdf",
    });
    listBooksMock.mockResolvedValueOnce([pdfBook]);
    markBookOpenedMock.mockResolvedValueOnce(pdfBook);
    listAnnotationsMocked.mockResolvedValueOnce([
      createAnnotationRecord({
        bookId: "highlight-pdf",
        locator: {
          kind: "pdf",
          page: 1,
          scale: 1,
          rects: [
            {
              x: 40,
              y: 60,
              width: 120,
              height: 18,
            },
          ],
        },
        selectedText: "PDF text",
      }),
    ]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Highlight PDF" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "PDF reader" });

    await waitFor(() =>
      expect(reader.querySelector(".reader-pdf-highlight-rect")).not.toBeNull(),
    );
    expect(
      within(reader).queryByRole("button", { name: "Edit note for PDF text" }),
    ).not.toBeInTheDocument();
    expect(pdfAdapterPdfRectsToViewportRectsMock).toHaveBeenCalledWith(
      1,
      [
        {
          x: 40,
          y: 60,
          width: 120,
          height: 18,
        },
      ],
      1,
    );
  });

  it("shows, jumps to, and deletes notes from the read-only notes sidebar", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "notes-txt",
      title: "Notes TXT",
      format: "txt",
    });
    const annotation = createAnnotationRecord({
      id: "annotation-note",
      bookId: "notes-txt",
      note: "old note",
      selectedText: "她推开门",
      locator: {
        kind: "txt",
        chapterId: "chapter-1-0",
        charOffset: 7,
        endCharOffset: 11,
      },
    });
    const highlightOnly = createAnnotationRecord({
      id: "annotation-highlight-only",
      bookId: "notes-txt",
      selectedText: "灯火亮了",
      locator: {
        kind: "txt",
        chapterId: "chapter-2-13",
        charOffset: 20,
        endCharOffset: 24,
      },
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));
    listAnnotationsMocked.mockResolvedValueOnce([annotation, highlightOnly]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Notes TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "TXT reader" });
    await user.click(within(reader).getByRole("tab", { name: "Notes" }));

    expect(await screen.findByText("old note")).toBeVisible();
    expect(
      within(reader).getByRole("button", { name: "Go to Highlight 灯火亮了" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Note text for 她推开门" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(updateAnnotationMock).not.toHaveBeenCalled();

    const noteJumpButton = within(reader).getByRole("button", {
      name: "Go to Highlight 她推开门",
    });
    await user.click(noteJumpButton);
    await waitFor(() =>
      expect(saveReadingProgressMock).toHaveBeenCalledWith(
        "notes-txt",
        expect.objectContaining({
          kind: "txt",
          chapterId: "chapter-1-0",
          charOffset: 7,
        }),
        expect.any(Number),
      ),
    );

    const noteItem = noteJumpButton.closest(".reader-note");

    if (!(noteItem instanceof HTMLElement)) {
      throw new Error("Expected note sidebar item.");
    }

    await user.click(within(noteItem).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteAnnotationMocked).toHaveBeenCalledWith("annotation-note"),
    );
    await waitFor(() =>
      expect(screen.queryByText("old note")).not.toBeInTheDocument(),
    );
  });

  it("searches TXT content and jumps to a result", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "search-txt",
      title: "Search TXT",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockResolvedValueOnce(createTxtDocument(txtBook));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Search TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "TXT reader" });
    await user.click(within(reader).getByRole("tab", { name: "Search" }));
    await user.type(
      within(reader).getByRole("textbox", { name: "Search in book" }),
      "推开",
    );
    await user.click(within(reader).getByRole("button", { name: "Search" }));

    const result = await within(reader).findByRole("listitem", {
      name: /Go to search result .*推开/s,
    });
    await user.click(result);

    await waitFor(() =>
      expect(saveReadingProgressMock).toHaveBeenCalledWith(
        "search-txt",
        expect.objectContaining({
          kind: "txt",
          chapterId: "chapter-1-0",
          charOffset: expect.any(Number) as number,
        }),
        expect.any(Number),
      ),
    );
  });

  it("searches EPUB content through the adapter and jumps to a result", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "search-epub",
      title: "Search EPUB",
      format: "epub",
    });
    const hitLocator: EpubLocator = {
      kind: "epub",
      href: "OPS/chapter-two.xhtml",
      cfi: "epubcfi(/6/4[chapter-two]!/4/1:2)",
    };
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);
    epubAdapterSearchMock.mockResolvedValueOnce([
      {
        id: "epub-search-hit",
        locator: hitLocator,
        excerpt: "chapter match",
      },
    ]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Search EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "EPUB reader" });
    await user.click(within(reader).getByRole("tab", { name: "Search" }));
    await user.type(
      within(reader).getByRole("textbox", { name: "Search in book" }),
      "chapter",
    );
    await user.click(within(reader).getByRole("button", { name: "Search" }));

    await waitFor(() => expect(epubAdapterSearchMock).toHaveBeenCalledWith("chapter"));
    await user.click(
      await within(reader).findByRole("listitem", {
        name: "Go to search result chapter match",
      }),
    );

    expect(epubAdapterGoToMock).toHaveBeenCalledWith(hitLocator);
  });

  it("searches PDF content through the adapter and jumps to a page result", async () => {
    const user = userEvent.setup();
    const pdfBook = createBook({
      id: "search-pdf",
      title: "Search PDF",
      format: "pdf",
    });
    const hitLocator: PdfLocator = {
      kind: "pdf",
      page: 2,
      selectedText: "pdf match",
    };
    listBooksMock.mockResolvedValueOnce([pdfBook]);
    markBookOpenedMock.mockResolvedValueOnce(pdfBook);
    pdfAdapterSearchMock.mockResolvedValueOnce([
      {
        id: "pdf-search-hit",
        locator: hitLocator,
        excerpt: "pdf match",
      },
    ]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Search PDF" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "PDF reader" });
    await user.click(within(reader).getByRole("tab", { name: "Search" }));
    await user.type(
      within(reader).getByRole("textbox", { name: "Search in book" }),
      "pdf",
    );
    await user.click(within(reader).getByRole("button", { name: "Search" }));

    await waitFor(() => expect(pdfAdapterSearchMock).toHaveBeenCalledWith("pdf"));
    await user.click(
      await within(reader).findByRole("listitem", {
        name: "Go to search result pdf match",
      }),
    );

    await waitFor(() => expect(pdfAdapterGoToMock).toHaveBeenCalledWith(hitLocator));
  });

  it("shows EPUB navigation below the page and enables progress after locations are ready", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-controls",
      title: "Controls EPUB",
      format: "epub",
    });
    listBooksMock.mockResolvedValueOnce([epubBook]);
    markBookOpenedMock.mockResolvedValueOnce(epubBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Controls EPUB" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "EPUB reader" });
    const slider = await screen.findByRole("slider", { name: "EPUB reading progress" });
    const pageInput = await screen.findByRole("spinbutton", {
      name: "EPUB page number",
    });
    expect(slider).toBeDisabled();
    expect(pageInput).toBeDisabled();
    expect(screen.getAllByText("Calculating pages").length).toBeGreaterThan(0);

    const frame = reader.querySelector(".reader-epub-frame");
    const controls = reader.querySelector(".reader-epub-controls");
    expect(frame).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(frame?.compareDocumentPosition(controls as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

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
    await waitFor(() => expect(pageInput).toBeEnabled());
    expect(screen.getAllByText("Page 36 / 100").length).toBeGreaterThan(0);
    expect(screen.getByText("36%")).toBeVisible();
    expect(pageInput).toHaveValue(36);

    fireEvent.change(pageInput, {
      target: {
        value: "42",
      },
    });
    fireEvent.keyDown(pageInput, {
      key: "Enter",
    });

    await waitFor(() =>
      expect(epubAdapterGoToProgressMock).toHaveBeenCalledWith(41 / 99),
    );

    await user.click(within(reader).getByRole("button", { name: "Previous" }));
    await user.click(within(reader).getByRole("button", { name: "Next" }));

    expect(epubAdapterPreviousMock).toHaveBeenCalledTimes(1);
    expect(epubAdapterNextMock).toHaveBeenCalledTimes(1);
  });

  it("previews EPUB progress while dragging and commits one jump on release", async () => {
    const user = userEvent.setup();
    const epubBook = createBook({
      id: "epub-progress",
      title: "Slider EPUB",
      format: "epub",
    });
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
    const epubBook = createBook({
      id: "epub-spread",
      title: "Spread EPUB",
      format: "epub",
    });
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

  it("opens a PDF book in the reader shell", async () => {
    const user = userEvent.setup();
    const pdfBook = createBook({
      id: "pdf-book",
      title: "Layout Notes PDF",
      format: "pdf",
    });
    const openedBook = {
      ...pdfBook,
      lastOpenedAt: "2026-06-20T10:00:00.000Z",
    };
    listBooksMock.mockResolvedValueOnce([pdfBook]);
    markBookOpenedMock.mockResolvedValueOnce(openedBook);

    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Layout Notes PDF" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(markBookOpenedMock).toHaveBeenCalledWith("pdf-book");
    expect(openTxtBookMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("main", { name: "PDF reader" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Page 1" })).toBeVisible();
    expect(pdfAdapterOpenMock).toHaveBeenCalledWith("pdf-book");
    expect(getPdfBookSourceMock).toHaveBeenCalledWith(openedBook);
  });

  it("drives PDF page, spread, and zoom controls through the adapter", async () => {
    const user = userEvent.setup();
    const pdfBook = createBook({
      id: "pdf-controls",
      title: "Controls PDF",
      format: "pdf",
    });
    listBooksMock.mockResolvedValueOnce([pdfBook]);
    markBookOpenedMock.mockResolvedValueOnce(pdfBook);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Controls PDF" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "PDF reader" });
    const frame = reader.querySelector(".reader-pdf-frame");
    expect(frame).not.toBeNull();
    Object.defineProperty(frame, "clientWidth", {
      configurable: true,
      value: 1100,
    });

    expect(await screen.findByText("Page 1 / 3")).toBeVisible();

    await user.click(within(reader).getByRole("button", { name: "Double" }));
    expect(pdfAdapterSetViewModeMock).toHaveBeenCalledWith("double", 1100);
    await waitFor(() => expect(screen.getByText("Pages 1-2 / 3")).toBeVisible());

    await user.click(within(reader).getByRole("button", { name: "Next" }));
    expect(pdfAdapterNextMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Page 3 / 3")).toBeVisible());

    const pageInput = within(reader).getByRole("spinbutton", {
      name: "PDF page number",
    });
    const progressSlider = within(reader).getByRole("slider", {
      name: "PDF reading progress",
    });
    fireEvent.change(pageInput, {
      target: {
        value: "2",
      },
    });
    fireEvent.keyDown(pageInput, {
      key: "Enter",
    });
    await waitFor(() =>
      expect(pdfAdapterGoToMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "pdf",
          page: 2,
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText("Pages 2-3 / 3")).toBeVisible());
    expect(progressSlider).toHaveValue("500");

    fireEvent.pointerDown(progressSlider);
    fireEvent.change(progressSlider, {
      target: {
        value: "1000",
      },
    });

    expect(pdfAdapterPreviewProgressMock).toHaveBeenCalledWith(1);
    expect(pdfAdapterGoToProgressMock).not.toHaveBeenCalled();
    expect(pageInput).toHaveValue(3);
    expect(screen.getByText("Page 3 / 3")).toBeVisible();

    fireEvent.pointerUp(progressSlider);

    await waitFor(() => expect(pdfAdapterGoToProgressMock).toHaveBeenCalledWith(1));

    await user.click(within(reader).getByRole("button", { name: "+" }));
    expect(pdfAdapterSetZoomMock.mock.calls.at(-1)?.[0]).toBeCloseTo(1.1, 3);

    await user.click(within(reader).getByRole("button", { name: "Fit width" }));
    expect(pdfAdapterFitWidthMock).toHaveBeenCalledWith(expect.any(Number));
    await waitFor(() => expect(screen.getByText("120%")).toBeVisible());
  });

  it("restores saved PDF progress and saves current PDF locators", async () => {
    const user = userEvent.setup();
    const pdfBook = createBook({
      id: "progress-pdf",
      title: "Progress PDF",
      format: "pdf",
    });
    const savedLocator: PdfLocator = {
      kind: "pdf",
      page: 2,
      scale: 1.25,
      zoomMode: "custom",
    };
    listBooksMock.mockResolvedValueOnce([pdfBook]);
    markBookOpenedMock.mockResolvedValueOnce(pdfBook);
    getReadingProgressMock.mockResolvedValueOnce({
      bookId: "progress-pdf",
      locator: savedLocator,
      progress: 0.5,
      updatedAt: "2026-06-20T12:00:00.000Z",
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Progress PDF" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const reader = await screen.findByRole("main", { name: "PDF reader" });
    await waitFor(() =>
      expect(pdfAdapterOpenMock).toHaveBeenCalledWith("progress-pdf"),
    );

    const adapterOptions = PdfReaderAdapterMock.mock.calls[0]?.[0] as
      | {
          initialLocator?: PdfLocator;
        }
      | undefined;
    expect(adapterOptions?.initialLocator).toEqual(savedLocator);
    expect(await screen.findByText("Page 2 / 3")).toBeVisible();

    await user.click(within(reader).getByRole("button", { name: "Shelf" }));

    await waitFor(() =>
      expect(saveReadingProgressMock).toHaveBeenCalledWith(
        "progress-pdf",
        expect.objectContaining({
          kind: "pdf",
          page: 2,
          scale: 1.25,
        }),
        0.5,
      ),
    );
  });

  it("shows TXT reader errors inside the reader shell", async () => {
    const user = userEvent.setup();
    const txtBook = createBook({
      id: "broken-txt",
      title: "Broken TXT",
      format: "txt",
    });
    listBooksMock.mockResolvedValueOnce([txtBook]);
    markBookOpenedMock.mockResolvedValueOnce(txtBook);
    openTxtBookMock.mockRejectedValueOnce(new Error("failed to decode TXT file"));

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Broken TXT" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("main", { name: "TXT reader" })).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Book could not be opened",
    );
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
    const epubBook = createBook({
      id: "theme-epub",
      title: "Theme EPUB",
      format: "epub",
    });
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
    const txtBook = createBook({
      id: "progress-txt",
      title: "Progress TXT",
      format: "txt",
    });
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
    const epubBook = createBook({
      id: "progress-epub",
      title: "Progress EPUB",
      format: "epub",
    });
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
    await waitFor(() =>
      expect(epubAdapterOpenMock).toHaveBeenCalledWith("progress-epub"),
    );

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
    await waitFor(() =>
      expect(screen.getAllByText("Page 75 / 100").length).toBeGreaterThan(0),
    );
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
    const txtBook = createBook({
      id: "scroll-txt",
      title: "Scroll TXT",
      format: "txt",
    });
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

function createAnnotationRecord(
  overrides: Partial<Annotation> & { locator: Annotation["locator"] },
): Annotation {
  return {
    id: "annotation-id",
    bookId: "book-id",
    type: "highlight",
    color: "#f3bc55",
    selectedText: undefined,
    note: undefined,
    createdAt: "2026-06-21T10:00:00.000Z",
    updatedAt: "2026-06-21T10:00:00.000Z",
    ...overrides,
  };
}

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

function createImportResult(
  status: ImportBookResult["status"],
  book: Book,
): ImportBookResult {
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

function createCrossParagraphTxtDocument(book: Book): TxtDocument {
  const text = "第一章 测试\n第一段文字。\n第二段文字。";

  return {
    book,
    encoding: "UTF-8",
    byteLength: text.length * 2,
    charCount: text.length,
    lineCount: 3,
    chapters: [
      {
        id: "chapter-cross-0",
        title: "第一章 测试",
        startChar: 0,
        endChar: text.length,
        text,
      },
    ],
  };
}

function createLongTxtDocument(book: Book): TxtDocument {
  const firstParagraphs = Array.from(
    { length: 80 },
    (_, index) => `第一章第 ${index + 1} 段。`,
  );
  const secondParagraphs = Array.from(
    { length: 80 },
    (_, index) => `第二章第 ${index + 1} 段。`,
  );
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
