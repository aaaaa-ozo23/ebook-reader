import type {
  LibrarySearchHit,
  Locator,
  PdfLocator,
  SearchHit,
  TxtLocator,
} from "@reader/core";

export function findLibrarySearchTargetHit(
  hits: Array<SearchHit<Locator>>,
  request: LibrarySearchHit,
): SearchHit<Locator> | undefined {
  const target = request.target;
  if (target.kind === "txt") {
    return hits
      .filter((hit): hit is SearchHit<TxtLocator> => hit.locator.kind === "txt")
      .sort(
        (first, second) =>
          Math.abs(first.locator.charOffset - target.charOffset) -
          Math.abs(second.locator.charOffset - target.charOffset),
      )[0];
  }
  if (target.kind === "epub") {
    const sectionHits = hits.filter(
      (hit) =>
        hit.locator.kind === "epub" &&
        (hit.locator.href === target.href ||
          hit.locator.href.endsWith(`/${target.href}`) ||
          target.href.endsWith(`/${hit.locator.href}`)),
    );
    return (
      sectionHits[target.matchIndex ?? 0] ??
      sectionHits[0] ??
      hits.find((hit) => hit.locator.kind === "epub")
    );
  }
  if (target.kind === "pdf") {
    const pageHits = hits.filter(
      (hit): hit is SearchHit<PdfLocator> =>
        hit.locator.kind === "pdf" && hit.locator.page === target.page,
    );
    return (
      pageHits[target.matchIndex ?? 0] ??
      pageHits[0] ??
      hits.find((hit) => hit.locator.kind === "pdf")
    );
  }
  return undefined;
}
