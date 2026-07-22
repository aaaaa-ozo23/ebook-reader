import type {
  LibrarySearchRebuildResult,
  LibrarySearchResult,
  LibrarySearchStatus,
} from "@reader/core";

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

export async function getLibrarySearchStatus(): Promise<LibrarySearchStatus> {
  if (!hasTauriRuntime()) {
    return {
      state: "empty",
      totalBooks: 0,
      indexedBooks: 0,
      pendingBooks: 0,
      failedBooks: 0,
      noTextBooks: 0,
    };
  }
  return invokeCommand<LibrarySearchStatus>("get_library_search_status");
}

export async function rebuildLibrarySearchIndex(
  operationId: string,
): Promise<LibrarySearchRebuildResult> {
  if (!hasTauriRuntime()) {
    return {
      operationId,
      status: "completed",
      indexedBooks: 0,
      failedBooks: 0,
      noTextBooks: 0,
    };
  }
  return invokeCommand<LibrarySearchRebuildResult>("rebuild_library_search_index", {
    operationId,
  });
}

export async function searchLibrary(query: string): Promise<LibrarySearchResult> {
  if (!hasTauriRuntime()) return { query, hits: [], truncated: false };
  return invokeCommand<LibrarySearchResult>("search_library", { query });
}
