export interface SearchTextMatch {
  start: number;
  end: number;
}

export interface SearchExcerpt {
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface DomSearchTextMatch {
  range: Range;
  selectedText: string;
  excerpt: SearchExcerpt;
}

interface NormalizedSearchText {
  text: string;
  sourceStarts: number[];
  sourceEnds: number[];
}

const COMBINING_MARK = /\p{Mark}/u;
const VARIATION_SELECTOR = /[\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]/u;
const WHITESPACE = /\s/u;

/**
 * Finds text without losing the UTF-16 offsets required by locators and DOM ranges.
 * Compatibility normalization and case folding may change string length, so every
 * normalized code unit retains a mapping back to the original grapheme cluster.
 */
export function findSearchTextMatches(
  source: string,
  query: string,
  limit = 100,
): SearchTextMatch[] {
  const normalizedSource = normalizeWithOffsetMap(source);
  const normalizedQuery = normalizeWithOffsetMap(query.trim()).text.trim();

  if (normalizedQuery.length === 0 || normalizedSource.text.length === 0) {
    return [];
  }

  const matches: SearchTextMatch[] = [];
  let cursor = 0;

  while (cursor <= normalizedSource.text.length - normalizedQuery.length) {
    const index = normalizedSource.text.indexOf(normalizedQuery, cursor);
    if (index < 0) break;

    const lastIndex = index + normalizedQuery.length - 1;
    matches.push({
      start: normalizedSource.sourceStarts[index] ?? 0,
      end: normalizedSource.sourceEnds[lastIndex] ?? source.length,
    });

    if (matches.length >= limit) break;
    cursor = index + Math.max(1, normalizedQuery.length);
  }

  return matches;
}

export function buildMappedSearchExcerpt(
  source: string,
  match: SearchTextMatch,
  before = 48,
  after = 72,
): SearchExcerpt {
  const sliceStart = Math.max(0, match.start - before);
  const sliceEnd = Math.min(source.length, match.end + after);
  const rawSlice = source.slice(sliceStart, sliceEnd);
  const leadingWhitespace = rawSlice.length - rawSlice.trimStart().length;
  const trailingWhitespace = rawSlice.length - rawSlice.trimEnd().length;
  const trimmedEnd = Math.max(leadingWhitespace, rawSlice.length - trailingWhitespace);
  const body = rawSlice.slice(leadingWhitespace, trimmedEnd);
  const prefix = sliceStart > 0 ? "..." : "";
  const suffix = sliceEnd < source.length ? "..." : "";
  const relativeStart = Math.max(0, match.start - sliceStart - leadingWhitespace);
  const relativeEnd = Math.max(
    relativeStart,
    match.end - sliceStart - leadingWhitespace,
  );

  return {
    text: `${prefix}${body}${suffix}`,
    matchStart: prefix.length + relativeStart,
    matchEnd: prefix.length + relativeEnd,
  };
}

export function findDomSearchTextMatches(
  document: Document,
  query: string,
  limit = 100,
): DomSearchTextMatch[] {
  const root = document.body ?? document.documentElement;
  if (root === null) return [];

  const walker = document.createTreeWalker(root, 4);
  const spans: Array<{ node: Text; start: number; end: number }> = [];
  let source = "";
  let current = walker.nextNode();

  while (current !== null) {
    if (current.nodeType === 3 && !isIgnoredSearchNode(current)) {
      const node = current as Text;
      const start = source.length;
      source += node.data;
      spans.push({ node, start, end: source.length });
    }
    current = walker.nextNode();
  }

  return findSearchTextMatches(source, query, limit).flatMap((match) => {
    const startSpan = spans.find(
      (span) => match.start >= span.start && match.start < span.end,
    );
    const endSpan = spans.find(
      (span) => match.end > span.start && match.end <= span.end,
    );

    if (startSpan === undefined || endSpan === undefined) return [];

    const range = document.createRange();
    range.setStart(startSpan.node, match.start - startSpan.start);
    range.setEnd(endSpan.node, match.end - endSpan.start);
    return [
      {
        range,
        selectedText: source.slice(match.start, match.end),
        excerpt: buildMappedSearchExcerpt(source, match),
      },
    ];
  });
}

function normalizeWithOffsetMap(source: string): NormalizedSearchText {
  const textParts: string[] = [];
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];
  let normalizedLength = 0;

  for (const segment of segmentGraphemes(source)) {
    const folded = foldSearchSegment(segment.value);
    if (folded.length === 0) continue;

    if (WHITESPACE.test(folded)) {
      if (textParts.at(-1) === " ") {
        sourceEnds[normalizedLength - 1] = segment.end;
        continue;
      }
      textParts.push(" ");
      sourceStarts.push(segment.start);
      sourceEnds.push(segment.end);
      normalizedLength += 1;
      continue;
    }

    textParts.push(folded);
    for (let index = 0; index < folded.length; index += 1) {
      sourceStarts.push(segment.start);
      sourceEnds.push(segment.end);
    }
    normalizedLength += folded.length;
  }

  return { text: textParts.join(""), sourceStarts, sourceEnds };
}

function foldSearchSegment(value: string): string {
  return value.normalize("NFKC").toUpperCase().toLowerCase().normalize("NFKC");
}

function segmentGraphemes(source: string): Array<{
  value: string;
  start: number;
  end: number;
}> {
  const segments: Array<{ value: string; start: number; end: number }> = [];
  let offset = 0;

  for (const codePoint of source) {
    const start = offset;
    offset += codePoint.length;
    const previous = segments.at(-1);
    const joinsPrevious =
      previous !== undefined &&
      (COMBINING_MARK.test(codePoint) ||
        VARIATION_SELECTOR.test(codePoint) ||
        previous.value.endsWith("\u200d"));

    if (joinsPrevious) {
      previous.value += codePoint;
      previous.end = offset;
    } else {
      segments.push({ value: codePoint, start, end: offset });
    }
  }

  return segments;
}

function isIgnoredSearchNode(node: Node): boolean {
  const parentName = node.parentElement?.tagName.toLowerCase();
  return parentName === "script" || parentName === "style" || parentName === "noscript";
}
