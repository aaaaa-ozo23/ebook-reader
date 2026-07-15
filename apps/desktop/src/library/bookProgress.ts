export type BookProgressSummary = Record<string, number>;

const MAX_CONCURRENT_REQUESTS = 6;

export async function loadBookProgressSummaries(
  bookIds: readonly string[],
): Promise<BookProgressSummary> {
  const uniqueBookIds = [...new Set(bookIds)];

  if (uniqueBookIds.length === 0) {
    return {};
  }

  const { getReadingProgress } = await import("../tauri/reader");
  const summaries: BookProgressSummary = {};
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < uniqueBookIds.length) {
      const bookId = uniqueBookIds[nextIndex];
      nextIndex += 1;

      if (bookId === undefined) {
        continue;
      }

      try {
        const savedProgress = await getReadingProgress(bookId);

        if (savedProgress?.progress !== undefined) {
          summaries[bookId] = clampProgress(savedProgress.progress);
        }
      } catch {
        // A single unavailable progress record must not block the local shelf.
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_REQUESTS, uniqueBookIds.length) },
      worker,
    ),
  );

  return summaries;
}

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}
