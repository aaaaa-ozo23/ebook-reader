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

export type TxtSpreadMode = "single" | "double";

export interface TxtPaginationLayoutSignature {
  devicePixelRatio: number;
  pageHeight: number;
  pageWidth: number;
  spreadMode: TxtSpreadMode;
  themeFingerprint: string;
}

export interface TxtPaginationBoundary {
  endCharOffset: number;
  startCharOffset: number;
}

export interface TxtPaginationCacheEnvelope {
  boundaries: TxtPaginationBoundary[];
  charCount: number;
  signature: TxtPaginationLayoutSignature;
  version: 1;
}

export interface TxtPaginationOptions {
  maxPageHeight: number;
  measurePage: (fragments: readonly TxtPageFragment[]) => number;
  signal?: AbortSignal;
  yieldEvery?: number;
  yieldToMain?: () => Promise<void>;
}

const DEFAULT_YIELD_EVERY = 24;
export const TXT_PAGINATION_CACHE_KEY = "txt_pagination_v1";

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
  return normalizePageRanges(pages, blocks);
}

export function createTxtPaginationCacheEnvelope(
  pages: readonly TxtPage[],
  signature: TxtPaginationLayoutSignature,
  charCount: number,
): TxtPaginationCacheEnvelope {
  return {
    boundaries: pages.map(({ startCharOffset, endCharOffset }, index) => ({
      endCharOffset: index === pages.length - 1 ? charCount : endCharOffset,
      startCharOffset,
    })),
    charCount,
    signature: normalizeLayoutSignature(signature),
    version: 1,
  };
}

export function parseTxtPaginationCache(
  value: string | null,
  expectedSignature: TxtPaginationLayoutSignature,
  expectedCharCount: number,
): TxtPaginationBoundary[] | null {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) {
      return null;
    }
    if (parsed.charCount !== expectedCharCount) {
      return null;
    }
    if (!layoutSignaturesMatch(parsed.signature, expectedSignature)) {
      return null;
    }
    if (!Array.isArray(parsed.boundaries)) {
      return null;
    }
    const boundaries = parsed.boundaries.flatMap((boundary) =>
      isValidBoundaryShape(boundary) ? [boundary] : [],
    );
    if (
      boundaries.length !== parsed.boundaries.length ||
      !validateTxtPaginationBoundaries(boundaries, expectedCharCount)
    ) {
      return null;
    }
    return boundaries;
  } catch {
    return null;
  }
}

export function reconstructTxtPages(
  blocks: readonly TxtPaginationSourceBlock[],
  boundaries: readonly TxtPaginationBoundary[],
): TxtPage[] {
  return boundaries.map((boundary, index) => ({
    ...boundary,
    fragments: blocks.flatMap((block) =>
      createFragmentsForBoundary(block, boundary, index === boundaries.length - 1),
    ),
    index,
  }));
}

export function findTxtPageIndex(
  pages: readonly Pick<TxtPage, "startCharOffset" | "endCharOffset">[],
  charOffset: number,
): number {
  if (pages.length === 0) {
    return -1;
  }
  const target = Math.max(0, charOffset);
  let low = 0;
  let high = pages.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const page = pages[middle];
    if (page === undefined) {
      break;
    }
    if (target < page.startCharOffset) {
      high = middle - 1;
    } else if (target >= page.endCharOffset && middle < pages.length - 1) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return Math.min(pages.length - 1, Math.max(0, low));
}

export function getTxtSpreadStart(
  pageIndex: number,
  spreadMode: TxtSpreadMode,
): number {
  const size = spreadMode === "double" ? 2 : 1;
  return Math.max(0, Math.floor(Math.max(0, pageIndex) / size) * size);
}

export function validateTxtPaginationBoundaries(
  boundaries: readonly TxtPaginationBoundary[],
  charCount: number,
): boolean {
  if (charCount === 0) {
    return boundaries.length === 0;
  }
  if (boundaries.length === 0 || boundaries[0]?.startCharOffset !== 0) {
    return false;
  }
  for (const [index, boundary] of boundaries.entries()) {
    if (
      boundary.startCharOffset < 0 ||
      boundary.endCharOffset <= boundary.startCharOffset ||
      boundary.endCharOffset > charCount ||
      (index > 0 && boundaries[index - 1]?.endCharOffset !== boundary.startCharOffset)
    ) {
      return false;
    }
  }
  return boundaries.at(-1)?.endCharOffset === charCount;
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

function normalizePageRanges(
  pages: readonly TxtPage[],
  blocks: readonly TxtPaginationSourceBlock[],
): TxtPage[] {
  if (pages.length === 0) {
    return [];
  }
  const contentEnd = blocks.reduce(
    (maximum, block) => Math.max(maximum, block.charOffset + block.text.length),
    0,
  );
  return pages.map((page, index) => ({
    ...page,
    endCharOffset:
      pages[index + 1]?.startCharOffset ?? Math.max(page.endCharOffset, contentEnd),
    startCharOffset: index === 0 ? 0 : page.startCharOffset,
  }));
}

function createFragmentsForBoundary(
  block: TxtPaginationSourceBlock,
  boundary: TxtPaginationBoundary,
  isLastPage: boolean,
): TxtPageFragment[] {
  if (block.kind === "heading" || block.text.length === 0) {
    const belongsToPage =
      block.charOffset >= boundary.startCharOffset &&
      (block.charOffset < boundary.endCharOffset ||
        (isLastPage && block.charOffset === boundary.endCharOffset));
    return belongsToPage ? [createFragment(block, 0, block.text.length)] : [];
  }
  const blockEnd = block.charOffset + block.text.length;
  const startInBlock = Math.max(0, boundary.startCharOffset - block.charOffset);
  const endInBlock = Math.min(
    block.text.length,
    boundary.endCharOffset - block.charOffset,
  );
  return blockEnd > boundary.startCharOffset &&
    block.charOffset < boundary.endCharOffset &&
    endInBlock > startInBlock
    ? [createFragment(block, startInBlock, endInBlock)]
    : [];
}

function normalizeLayoutSignature(
  signature: TxtPaginationLayoutSignature,
): TxtPaginationLayoutSignature {
  return {
    devicePixelRatio: Math.round(signature.devicePixelRatio * 1000) / 1000,
    pageHeight: Math.round(signature.pageHeight),
    pageWidth: Math.round(signature.pageWidth),
    spreadMode: signature.spreadMode,
    themeFingerprint: signature.themeFingerprint,
  };
}

function layoutSignaturesMatch(
  value: unknown,
  expected: TxtPaginationLayoutSignature,
): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.devicePixelRatio !== "number" ||
    typeof value.pageHeight !== "number" ||
    typeof value.pageWidth !== "number" ||
    (value.spreadMode !== "single" && value.spreadMode !== "double") ||
    typeof value.themeFingerprint !== "string"
  ) {
    return false;
  }
  return (
    JSON.stringify(
      normalizeLayoutSignature({
        devicePixelRatio: value.devicePixelRatio,
        pageHeight: value.pageHeight,
        pageWidth: value.pageWidth,
        spreadMode: value.spreadMode,
        themeFingerprint: value.themeFingerprint,
      }),
    ) === JSON.stringify(normalizeLayoutSignature(expected))
  );
}

function isValidBoundaryShape(value: unknown): value is TxtPaginationBoundary {
  return (
    isRecord(value) &&
    Number.isInteger(value.startCharOffset) &&
    Number.isInteger(value.endCharOffset)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
