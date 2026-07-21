import type {
  Book,
  BookDetails,
  BookMetadataOverridePatch,
  ImportBookResult,
  RemoveBookResult,
} from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";
const FALLBACK_BOOKS_KEY = "reader:fallback:books";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");

  return invoke<T>(command, args);
}

export async function listBooks(): Promise<Book[]> {
  if (!hasTauriRuntime()) {
    return getFallbackBooks();
  }

  return invokeCommand<Book[]>("list_books");
}

export async function importBook(path: string): Promise<ImportBookResult> {
  if (!hasTauriRuntime()) {
    throw new Error(`Importing books failed. ${DESKTOP_RUNTIME_ERROR}`);
  }

  return invokeCommand<ImportBookResult>("import_book", { path });
}

export async function markBookOpened(bookId: string): Promise<Book> {
  if (!hasTauriRuntime()) {
    const books = getFallbackBooks();
    const book = books.find((currentBook) => currentBook.id === bookId);

    if (book === undefined) {
      throw new Error(`Opening a book failed. ${DESKTOP_RUNTIME_ERROR}`);
    }

    const openedBook = {
      ...book,
      lastOpenedAt: new Date().toISOString(),
    };
    setFallbackBooks(
      books.map((currentBook) =>
        currentBook.id === bookId ? openedBook : currentBook,
      ),
    );
    return openedBook;
  }

  return invokeCommand<Book>("mark_book_opened", { bookId });
}

export async function removeBook(bookId: string): Promise<RemoveBookResult> {
  if (!hasTauriRuntime()) {
    const books = getFallbackBooks();
    const book = books.find((currentBook) => currentBook.id === bookId);

    if (book === undefined) {
      throw new Error(`Removing a book failed. ${DESKTOP_RUNTIME_ERROR}`);
    }

    setFallbackBooks(books.filter((currentBook) => currentBook.id !== bookId));
    return {
      book,
      removedLibraryPath: book.libraryPath,
    };
  }

  return invokeCommand<RemoveBookResult>("remove_book", { bookId });
}

export async function getBookDetails(bookId: string): Promise<BookDetails> {
  if (!hasTauriRuntime()) {
    const book = getFallbackBooks().find((candidate) => candidate.id === bookId);
    if (book === undefined) throw new Error(DESKTOP_RUNTIME_ERROR);
    return {
      book,
      automaticTitle: book.title,
      automaticAuthor: book.author,
      automaticCoverPath: book.coverPath,
      coverOrigin: book.coverPath === undefined ? "fallback" : "automatic",
    };
  }
  return invokeCommand<BookDetails>("get_book_details", { bookId });
}

export async function saveBookMetadataOverrides(
  bookId: string,
  patch: BookMetadataOverridePatch,
): Promise<BookDetails> {
  if (!hasTauriRuntime()) throw new Error(DESKTOP_RUNTIME_ERROR);
  return invokeCommand<BookDetails>("save_book_metadata_overrides", { bookId, patch });
}

export async function saveUserBookCover(
  bookId: string,
  imageBytes: number[],
): Promise<BookDetails> {
  if (!hasTauriRuntime()) throw new Error(DESKTOP_RUNTIME_ERROR);
  return invokeCommand<BookDetails>("save_user_book_cover", { bookId, imageBytes });
}

export async function resetBookOverrides(
  bookId: string,
  fields: Array<"title" | "author" | "cover">,
): Promise<BookDetails> {
  if (!hasTauriRuntime()) throw new Error(DESKTOP_RUNTIME_ERROR);
  return invokeCommand<BookDetails>("reset_book_overrides", { bookId, fields });
}

export async function saveBookCover(
  bookId: string,
  imageBytes: number[],
  imageFormat: "webp" | "png" | "jpeg",
): Promise<Book> {
  if (!hasTauriRuntime()) {
    const books = getFallbackBooks();
    const book = books.find((currentBook) => currentBook.id === bookId);

    if (book === undefined) {
      throw new Error(`Saving a book cover failed. ${DESKTOP_RUNTIME_ERROR}`);
    }

    const updatedBook: Book = {
      ...book,
      coverPath: bytesToDataUrl(imageBytes, imageFormat),
      coverStatus: "ready",
      updatedAt: new Date().toISOString(),
    };
    setFallbackBooks(
      books.map((currentBook) =>
        currentBook.id === bookId ? updatedBook : currentBook,
      ),
    );
    return updatedBook;
  }

  return invokeCommand<Book>("save_book_cover", {
    bookId,
    imageBytes,
    imageFormat,
  });
}

export async function markBookCoverFallback(bookId: string): Promise<Book> {
  if (!hasTauriRuntime()) {
    const books = getFallbackBooks();
    const book = books.find((currentBook) => currentBook.id === bookId);

    if (book === undefined) {
      throw new Error(`Updating a book cover failed. ${DESKTOP_RUNTIME_ERROR}`);
    }

    const updatedBook: Book = {
      ...book,
      coverPath: undefined,
      coverStatus: "fallback",
      updatedAt: new Date().toISOString(),
    };
    setFallbackBooks(
      books.map((currentBook) =>
        currentBook.id === bookId ? updatedBook : currentBook,
      ),
    );
    return updatedBook;
  }

  return invokeCommand<Book>("mark_book_cover_fallback", { bookId });
}

export async function getBookCoverSource(book: Book): Promise<string | null> {
  if (book.coverStatus !== "ready" || book.coverPath === undefined) {
    return null;
  }

  if (!hasTauriRuntime() || /^(?:blob:|data:|https?:)/i.test(book.coverPath)) {
    return book.coverPath;
  }

  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(book.coverPath);
}

export async function pickBookFile(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    return null;
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Books",
        extensions: ["epub", "txt", "pdf", "mobi", "azw3"],
      },
    ],
  });

  if (Array.isArray(selected)) {
    return selected[0] ?? null;
  }

  return selected;
}

function getFallbackBooks(): Book[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawBooks = window.localStorage.getItem(FALLBACK_BOOKS_KEY);

  if (rawBooks === null) {
    return [];
  }

  try {
    return (JSON.parse(rawBooks) as Book[]).map(normalizeBookState);
  } catch {
    return [];
  }
}

function normalizeBookState(book: Book): Book {
  const readerFormat =
    book.readerFormat ??
    (book.format === "mobi" || book.format === "azw3" ? "epub" : book.format);
  return {
    ...book,
    readerFormat,
    readerPath: book.readerPath ?? book.libraryPath,
    readerHash: book.readerHash ?? book.fileHash,
    availability: book.availability ?? "available",
    coverStatus:
      book.coverStatus ??
      (book.coverPath !== undefined
        ? "ready"
        : book.format === "txt"
          ? "fallback"
          : "pending"),
  };
}

function bytesToDataUrl(
  imageBytes: number[],
  imageFormat: "webp" | "png" | "jpeg",
): string {
  let binary = "";

  for (let offset = 0; offset < imageBytes.length; offset += 8192) {
    binary += String.fromCharCode(...imageBytes.slice(offset, offset + 8192));
  }

  return `data:image/${imageFormat};base64,${window.btoa(binary)}`;
}

function setFallbackBooks(books: Book[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(FALLBACK_BOOKS_KEY, JSON.stringify(books));
}
