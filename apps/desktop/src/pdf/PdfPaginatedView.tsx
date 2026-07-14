import type { Annotation } from "@reader/core";

import { PdfPageSurface } from "./PdfPageSurface";
import { type PdfPosition, type PdfReaderAdapter } from "./PdfReaderAdapter";
import { getPdfSpreadPages, getPdfSpreadWindowStarts } from "./PdfPagination";

export interface PdfPaginatedViewProps {
  adapter: PdfReaderAdapter;
  annotations: Annotation[];
  availableWidth: number;
  isTransitioning: boolean;
  onAnnotationActivate: (annotation: Annotation, element: HTMLElement) => void;
  onSelectionEnd: () => void;
  position: PdfPosition;
  renderVersion: number;
}

export function PdfPaginatedView({
  adapter,
  annotations,
  availableWidth,
  isTransitioning,
  onAnnotationActivate,
  onSelectionEnd,
  position,
  renderVersion,
}: PdfPaginatedViewProps) {
  const spreadStarts = getPdfSpreadWindowStarts(position);
  const pageGap = 14;
  const spreadSize = position.renderedMode === "double" ? 2 : 1;
  const pageWidth = Math.max(
    240,
    (availableWidth - 28 - pageGap * (spreadSize - 1)) / spreadSize,
  );

  return (
    <div
      className={`reader-pdf-paginated-window reader-pdf-paginated-window--${position.renderedMode} ${
        isTransitioning ? "reader-pdf-paginated-window--transitioning" : ""
      }`}
      data-current-spread={position.page}
    >
      {spreadStarts.map((spreadStart) => {
        const isCurrent = spreadStart === position.page;
        const pages = getPdfSpreadPages(
          spreadStart,
          position.totalPages,
          position.renderedMode,
        );

        return (
          <div
            key={spreadStart}
            aria-hidden={isCurrent ? undefined : "true"}
            className="reader-pdf-spread"
            data-spread-start={spreadStart}
            data-window-state={isCurrent ? "current" : "neighbor"}
          >
            {pages.map((pageNumber) => (
              <PdfPageSurface
                key={pageNumber}
                adapter={adapter}
                annotations={isCurrent ? annotations : []}
                availableWidth={pageWidth}
                isVisible={isCurrent}
                onAnnotationActivate={onAnnotationActivate}
                onMetrics={() => undefined}
                onSelectionEnd={onSelectionEnd}
                pageNumber={pageNumber}
                renderTextLayer={isCurrent}
                renderVersion={renderVersion}
                scale={position.scale}
                zoomMode={position.zoomMode}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
