import { describe, expect, it, vi } from "vitest";

import {
  getGraphemeBreakOffsets,
  paginateTxtBlocks,
  type TxtPageFragment,
  type TxtPaginationSourceBlock,
} from "./TxtPaginator";

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
});
