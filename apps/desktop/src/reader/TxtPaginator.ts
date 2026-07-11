export type TxtPaginationBlockKind = "heading" | "paragraph";

export interface TxtPaginationSourceBlock {
  id: string;
  kind: TxtPaginationBlockKind;
  chapterId: string;
  chapterTitle: string;
  charOffset: number;
  text: string;
}

export interface TxtPageFragment extends TxtPaginationSourceBlock {
  endInBlock: number;
  startInBlock: number;
}

export interface TxtPage {
  endCharOffset: number;
  fragments: TxtPageFragment[];
  index: number;
  startCharOffset: number;
}

export interface TxtPaginationOptions {
  maxPageHeight: number;
  measurePage: (fragments: readonly TxtPageFragment[]) => number;
  signal?: AbortSignal;
  yieldEvery?: number;
  yieldToMain?: () => Promise<void>;
}

const DEFAULT_YIELD_EVERY = 24;

export async function paginateTxtBlocks(
  blocks: readonly TxtPaginationSourceBlock[],
  options: TxtPaginationOptions,
): Promise<TxtPage[]> {
  const pages: TxtPage[] = [];
  let fragments: TxtPageFragment[] = [];
  let operations = 0;
  const yieldEvery = Math.max(1, options.yieldEvery ?? DEFAULT_YIELD_EVERY);
  const yieldToMain = options.yieldToMain ?? defaultYieldToMain;

  const checkpoint = async () => {
    throwIfAborted(options.signal);
    operations += 1;
    if (operations % yieldEvery === 0) {
      await yieldToMain();
      throwIfAborted(options.signal);
    }
  };

  const finishPage = () => {
    if (fragments.length === 0) {
      return;
    }
    pages.push(createPage(pages.length, fragments));
    fragments = [];
  };

  for (const block of blocks) {
    await checkpoint();
    if (block.kind === "heading" || block.text.length === 0) {
      const fragment = createFragment(block, 0, block.text.length);
      if (
        fragments.length > 0 &&
        options.measurePage([...fragments, fragment]) > options.maxPageHeight
      ) {
        finishPage();
      }
      fragments.push(fragment);
      continue;
    }

    const breakOffsets = getGraphemeBreakOffsets(block.text);
    let startBreakIndex = 0;
    while (startBreakIndex < breakOffsets.length - 1) {
      await checkpoint();
      const startInBlock = breakOffsets[startBreakIndex] ?? 0;
      const wholeFragment = createFragment(block, startInBlock, block.text.length);

      if (options.measurePage([...fragments, wholeFragment]) <= options.maxPageHeight) {
        fragments.push(wholeFragment);
        break;
      }

      if (fragments.some((fragment) => fragment.kind === "paragraph")) {
        finishPage();
        continue;
      }

      const endBreakIndex = findLargestFittingBreakIndex(
        block,
        breakOffsets,
        startBreakIndex,
        fragments,
        options,
      );
      const safeEndBreakIndex = Math.max(startBreakIndex + 1, endBreakIndex);
      fragments.push(
        createFragment(
          block,
          startInBlock,
          breakOffsets[safeEndBreakIndex] ?? block.text.length,
        ),
      );
      startBreakIndex = safeEndBreakIndex;
      if (startBreakIndex < breakOffsets.length - 1) {
        finishPage();
      }
    }
  }

  finishPage();
  return pages;
}

export function getGraphemeBreakOffsets(text: string): number[] {
  const offsets = [0];
  const Segmenter = Intl.Segmenter;

  if (typeof Segmenter === "function") {
    const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
    for (const segment of segmenter.segment(text)) {
      if (segment.index > 0) {
        offsets.push(segment.index);
      }
    }
  } else {
    let offset = 0;
    for (const codePoint of Array.from(text)) {
      offset += codePoint.length;
      offsets.push(offset);
    }
  }

  if (offsets[offsets.length - 1] !== text.length) {
    offsets.push(text.length);
  }
  return offsets;
}

export function createTxtDomPageMeasurer(
  host: HTMLElement,
  pageWidth: number,
): {
  dispose: () => void;
  measurePage: (fragments: readonly TxtPageFragment[]) => number;
} {
  const container = document.createElement("div");
  container.className = "reader-txt-measure";
  container.setAttribute("aria-hidden", "true");
  container.style.width = `${Math.max(1, pageWidth)}px`;
  const page = document.createElement("article");
  page.className = "reader-page reader-page--txt-paginated";
  container.append(page);
  host.append(container);

  return {
    dispose: () => container.remove(),
    measurePage: (fragments) => {
      page.replaceChildren(...fragments.map(createMeasurementNode));
      return page.scrollHeight;
    },
  };
}

function createMeasurementNode(fragment: TxtPageFragment): HTMLElement {
  const node = document.createElement(fragment.kind === "heading" ? "h2" : "p");
  node.className = `reader-txt-page-fragment reader-txt-page-fragment--${fragment.kind}`;
  node.textContent = fragment.text.slice(fragment.startInBlock, fragment.endInBlock);
  return node;
}

function createFragment(
  block: TxtPaginationSourceBlock,
  startInBlock: number,
  endInBlock: number,
): TxtPageFragment {
  return { ...block, startInBlock, endInBlock };
}

function createPage(index: number, fragments: readonly TxtPageFragment[]): TxtPage {
  const paragraphFragments = fragments.filter(
    (fragment) => fragment.kind === "paragraph",
  );
  const first = paragraphFragments[0] ?? fragments[0];
  const last = paragraphFragments[paragraphFragments.length - 1] ?? fragments.at(-1);
  const startCharOffset =
    first === undefined ? 0 : first.charOffset + first.startInBlock;
  const endCharOffset =
    last === undefined ? startCharOffset : last.charOffset + last.endInBlock;

  return {
    endCharOffset: Math.max(startCharOffset, endCharOffset),
    fragments: [...fragments],
    index,
    startCharOffset,
  };
}

function findLargestFittingBreakIndex(
  block: TxtPaginationSourceBlock,
  breakOffsets: readonly number[],
  startBreakIndex: number,
  currentFragments: readonly TxtPageFragment[],
  options: TxtPaginationOptions,
): number {
  let low = startBreakIndex + 1;
  let high = breakOffsets.length - 1;
  let best = startBreakIndex;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = createFragment(
      block,
      breakOffsets[startBreakIndex] ?? 0,
      breakOffsets[middle] ?? block.text.length,
    );
    if (
      options.measurePage([...currentFragments, candidate]) <= options.maxPageHeight
    ) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DOMException("TXT pagination was cancelled", "AbortError");
  }
}

function defaultYieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}
