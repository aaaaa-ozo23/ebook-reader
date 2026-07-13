import { describe, expect, it, vi } from "vitest";

import {
  createTxtDomPageMeasurer,
  createTxtPaginationCacheEnvelope,
  findTxtPageIndex,
  getGraphemeBreakOffsets,
  paginateTxtBlocks,
  parseTxtPaginationCache,
  reconstructTxtPages,
  TxtPaginationSessionCache,
  type TxtPageFragment,
  type TxtPaginationSourceBlock,
} from "./TxtPaginator";

const signature = {
  devicePixelRatio: 1.25,
  pageHeight: 640,
  pageWidth: 720,
  spreadMode: "single" as const,
  themeFingerprint: "theme-v1",
};

const paragraph = (
  text: string,
  charOffset = 0,
  id = "paragraph-1",
): TxtPaginationSourceBlock => ({
  id,
  kind: "paragraph",
  chapterId: "chapter-1",
  chapterTitle: "Chapter 1",
  charOffset,
  text,
});

const measureCharacters = (fragments: readonly TxtPageFragment[]) =>
  fragments.reduce(
    (total, fragment) => total + fragment.endInBlock - fragment.startInBlock,
    0,
  );

describe("TXT paginator", () => {
  it("creates continuous charOffset pages without dropping or repeating text", async () => {
    const pages = await paginateTxtBlocks([paragraph("abcdefghij")], {
      maxPageHeight: 4,
      measurePage: measureCharacters,
      yieldToMain: async () => undefined,
    });

    expect(
      pages.map(({ startCharOffset, endCharOffset }) => [
        startCharOffset,
        endCharOffset,
      ]),
    ).toEqual([
      [0, 4],
      [4, 8],
      [8, 10],
    ]);
    expect(
      pages
        .flatMap((page) => page.fragments)
        .map((fragment) =>
          fragment.text.slice(fragment.startInBlock, fragment.endInBlock),
        ),
    ).toEqual(["abcd", "efgh", "ij"]);
  });

  it("only splits on grapheme boundaries while retaining UTF-16 offsets", async () => {
    const text = "A👩‍💻é中";
    const breaks = getGraphemeBreakOffsets(text);
    const pages = await paginateTxtBlocks([paragraph(text, 12)], {
      maxPageHeight: 3,
      measurePage: (fragments) =>
        fragments.reduce(
          (total, fragment) =>
            total +
            Array.from(
              new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
                fragment.text.slice(fragment.startInBlock, fragment.endInBlock),
              ),
            ).length,
          0,
        ),
      yieldToMain: async () => undefined,
    });

    expect(breaks).toEqual([0, 1, 6, 8, 9]);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.endCharOffset).toBe(20);
    expect(pages[1]?.startCharOffset).toBe(20);
    expect(pages[1]?.endCharOffset).toBe(21);
  });

  it("keeps headings and empty paragraphs in the measured flow", async () => {
    const blocks: TxtPaginationSourceBlock[] = [
      {
        ...paragraph("Heading", 0, "heading"),
        kind: "heading",
      },
      paragraph("", 0, "empty"),
      paragraph("body", 1, "body"),
    ];
    const pages = await paginateTxtBlocks(blocks, {
      maxPageHeight: 11,
      measurePage: (fragments) => fragments.length * 2 + measureCharacters(fragments),
      yieldToMain: async () => undefined,
    });

    expect(pages).toHaveLength(2);
    expect(pages[0]?.fragments.map((fragment) => fragment.id)).toEqual([
      "heading",
      "empty",
    ]);
    expect(pages[1]?.fragments[0]?.id).toBe("body");
  });

  it("yields during long pagination and honours cancellation", async () => {
    const controller = new AbortController();
    const yieldToMain = vi.fn(async () => controller.abort());

    await expect(
      paginateTxtBlocks([paragraph("abcdefghij")], {
        maxPageHeight: 1,
        measurePage: measureCharacters,
        signal: controller.signal,
        yieldEvery: 1,
        yieldToMain,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(yieldToMain).toHaveBeenCalledTimes(1);
  });

  it("round-trips a matching boundary cache and rejects stale or corrupt entries", () => {
    const pages = [
      { index: 0, startCharOffset: 0, endCharOffset: 4, fragments: [] },
      { index: 1, startCharOffset: 4, endCharOffset: 10, fragments: [] },
    ];
    const serialized = JSON.stringify(
      createTxtPaginationCacheEnvelope(pages, signature, 10),
    );

    expect(parseTxtPaginationCache(serialized, signature, 10)).toEqual([
      { startCharOffset: 0, endCharOffset: 4 },
      { startCharOffset: 4, endCharOffset: 10 },
    ]);
    expect(
      parseTxtPaginationCache(serialized, { ...signature, pageWidth: 721 }, 10),
    ).toBeNull();
    expect(parseTxtPaginationCache(serialized, signature, 11)).toBeNull();
    expect(parseTxtPaginationCache("not-json", signature, 10)).toBeNull();
    expect(
      parseTxtPaginationCache(
        JSON.stringify({
          ...createTxtPaginationCacheEnvelope(pages, signature, 10),
          boundaries: [{ startCharOffset: 0, endCharOffset: 9 }],
        }),
        signature,
        10,
      ),
    ).toBeNull();
  });

  it("reconstructs cached fragments and resolves charOffset pages", () => {
    const blocks = [paragraph("abcd", 0, "first"), paragraph("efghij", 4, "second")];
    const pages = reconstructTxtPages(blocks, [
      { startCharOffset: 0, endCharOffset: 6 },
      { startCharOffset: 6, endCharOffset: 10 },
    ]);

    expect(
      pages[0]?.fragments.map((fragment) =>
        fragment.text.slice(fragment.startInBlock, fragment.endInBlock),
      ),
    ).toEqual(["abcd", "ef"]);
    expect(pages[1]?.fragments[0]).toMatchObject({
      id: "second",
      startInBlock: 2,
      endInBlock: 6,
    });
    expect(findTxtPageIndex(pages, 0)).toBe(0);
    expect(findTxtPageIndex(pages, 6)).toBe(1);
    expect(findTxtPageIndex(pages, 999)).toBe(1);
  });

  it("publishes complete page batches without exposing a partial cache", async () => {
    const published: number[] = [];
    const pages = await paginateTxtBlocks([paragraph("abcdefghijkl")], {
      maxPageHeight: 2,
      measurePage: measureCharacters,
      onPages: (nextPages) => published.push(nextPages.length),
      progressEveryPages: 2,
      yieldToMain: async () => undefined,
    });

    expect(pages).toHaveLength(6);
    expect(published).toEqual([1, 2, 4, 6, 6]);
  });

  it("reconstructs large cached books with a forward-only block cursor", () => {
    const blockCount = 10_000;
    const blocks = Array.from({ length: blockCount }, (_, index) =>
      paragraph("x", index, `paragraph-${index}`),
    );
    const boundaries = Array.from({ length: blockCount }, (_, index) => ({
      startCharOffset: index,
      endCharOffset: index + 1,
    }));

    const startedAt = performance.now();
    const pages = reconstructTxtPages(blocks, boundaries);

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(pages).toHaveLength(blockCount);
    expect(pages[0]?.fragments[0]?.id).toBe("paragraph-0");
    expect(pages.at(-1)?.fragments[0]?.id).toBe("paragraph-9999");
  });

  it("reuses measurement nodes while only the final fragment grows", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const measurer = createTxtDomPageMeasurer(host, 640);
    const first = paragraph("abcdefgh", 0, "first");
    const second = paragraph("ijklmnop", 8, "second");
    const firstCandidate: TxtPageFragment[] = [
      { ...first, startInBlock: 0, endInBlock: 8 },
      { ...second, startInBlock: 0, endInBlock: 2 },
    ];

    measurer.measurePage(firstCandidate);
    const page = host.querySelector<HTMLElement>(".reader-txt-page");
    const initialNodes = [...(page?.children ?? [])];
    measurer.measurePage([
      firstCandidate[0]!,
      { ...firstCandidate[1]!, endInBlock: 5 },
    ]);

    expect(page?.children).toHaveLength(2);
    expect(page?.children[0]).toBe(initialNodes[0]);
    expect(page?.children[1]).toBe(initialNodes[1]);
    expect(page?.children[1]?.textContent).toBe("ijklm");

    measurer.dispose();
    host.remove();
  });

  it("keeps only the two most recently used TXT layouts in memory", () => {
    const cache = new TxtPaginationSessionCache(2);
    const first = [{ startCharOffset: 0, endCharOffset: 1 }];
    const second = [{ startCharOffset: 0, endCharOffset: 2 }];
    const third = [{ startCharOffset: 0, endCharOffset: 3 }];

    cache.set("single", first);
    cache.set("double", second);
    expect(cache.get("single")).toEqual(first);
    cache.set("large-text", third);

    expect(cache.get("double")).toBeNull();
    expect(cache.get("single")).toEqual(first);
    expect(cache.get("large-text")).toEqual(third);
  });
});
