import type { Book, ImportBookResult, RemoveBookResult } from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "This action requires the Tauri desktop runtime.";
const FALLBACK_BOOKS_KEY = "reader:fallback:books";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
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
    setFallbackBooks(books.map((currentBook) => (currentBook.id === bookId ? openedBook : currentBook)));
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
        extensions: ["epub", "txt", "pdf"],
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
    return JSON.parse(rawBooks) as Book[];
  } catch {
    return [];
  }
}

function setFallbackBooks(books: Book[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(FALLBACK_BOOKS_KEY, JSON.stringify(books));
}
