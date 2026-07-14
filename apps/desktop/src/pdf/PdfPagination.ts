import {
  nextPdfSpreadStart,
  previousPdfSpreadStart,
  type PdfPosition,
} from "./PdfReaderAdapter";

export function getPdfSpreadWindowStarts(position: PdfPosition): number[] {
  const previous =
    position.renderedMode === "double"
      ? previousPdfSpreadStart(position.page, position.totalPages)
      : Math.max(1, position.page - 1);
  const next =
    position.renderedMode === "double"
      ? nextPdfSpreadStart(position.page, position.totalPages)
      : Math.min(position.totalPages, position.page + 1);

  return [previous, position.page, next].filter(
    (spreadStart, index, values) => values.indexOf(spreadStart) === index,
  );
}

export function getPdfSpreadPages(
  spreadStart: number,
  totalPages: number,
  renderedMode: PdfPosition["renderedMode"],
): number[] {
  if (renderedMode !== "double" || spreadStart === 1) {
    return [spreadStart];
  }
  return [spreadStart, spreadStart + 1].filter((page) => page <= totalPages);
}
