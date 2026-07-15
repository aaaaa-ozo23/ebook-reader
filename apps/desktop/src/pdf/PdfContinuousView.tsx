import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import type { Annotation } from "@reader/core";
import { useVirtualizer } from "@tanstack/react-virtual";

import { PdfPageSurface } from "./PdfPageSurface";
import {
  type PdfPageMetrics,
  type PdfPosition,
  type PdfReaderAdapter,
} from "./PdfReaderAdapter";
import { resolvePdfContinuousAnchor } from "./PdfContinuousPosition";

export interface PdfContinuousViewProps {
  adapter: PdfReaderAdapter;
  annotations: Annotation[];
  availableWidth: number;
  frameRef: RefObject<HTMLDivElement | null>;
  navigationVersion: number;
  onAnnotationActivate: (annotation: Annotation, element: HTMLElement) => void;
  onSelectionEnd: (
    event: KeyboardEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
  ) => void;
  position: PdfPosition;
  renderVersion: number;
}

const PDF_DEFAULT_PAGE_WIDTH = 612;
const PDF_DEFAULT_PAGE_HEIGHT = 792;
const PDF_PAGE_GAP = 28;

export function PdfContinuousView({
  adapter,
  annotations,
  availableWidth,
  frameRef,
  navigationVersion,
  onAnnotationActivate,
  onSelectionEnd,
  position,
  renderVersion,
}: PdfContinuousViewProps) {
  const [metricsVersion, setMetricsVersion] = useState(0);
  const suppressScrollTrackingUntilRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const pageContentWidth = Math.max(240, availableWidth - 28);
  const getPageSize = useCallback(
    (pageNumber: number) => {
      void metricsVersion;
      const metrics = adapter.getCachedPageMetrics(pageNumber);
      const width = metrics?.width ?? PDF_DEFAULT_PAGE_WIDTH;
      const height = metrics?.height ?? PDF_DEFAULT_PAGE_HEIGHT;
      const renderScale =
        position.zoomMode === "fit-width"
          ? pageContentWidth / Math.max(width, 1)
          : position.scale;

      return {
        height: Math.max(1, height * renderScale),
        width: Math.max(1, width * renderScale),
      };
    },
    [adapter, metricsVersion, pageContentWidth, position.scale, position.zoomMode],
  );
  // TanStack Virtual owns the imperative scroll model for the continuous PDF.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: position.totalPages,
    estimateSize: (index) => getPageSize(index + 1).height + PDF_PAGE_GAP,
    getScrollElement: () => frameRef.current,
    initialRect: { height: 720, width: 1000 },
    overscan: 1,
  });
  const virtualItems = virtualizer.getVirtualItems();

  const handleMetrics = useCallback((metrics: PdfPageMetrics) => {
    void metrics;
    setMetricsVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    virtualizer.measure();
  }, [metricsVersion, virtualizer]);

  useEffect(() => {
    let isCurrent = true;
    const pageIndex = Math.max(0, Math.min(position.totalPages - 1, position.page - 1));
    const requestedRatio = position.locator.pageOffsetRatio;

    void adapter.getPageMetrics(position.page).then(() => {
      if (!isCurrent) {
        return;
      }

      setMetricsVersion((version) => version + 1);
      suppressScrollTrackingUntilRef.current = performance.now() + 240;
      virtualizer.scrollToIndex(pageIndex, { align: "start" });

      window.requestAnimationFrame(() => {
        if (!isCurrent || requestedRatio === undefined) {
          return;
        }

        const targetItem = virtualizer
          .getVirtualItems()
          .find((item) => item.index === pageIndex);
        const viewport = frameRef.current;

        if (targetItem === undefined || viewport === null) {
          return;
        }

        virtualizer.scrollToOffset(
          Math.max(
            0,
            targetItem.start +
              requestedRatio * targetItem.size -
              viewport.clientHeight / 2,
          ),
          { align: "start" },
        );
      });
    });

    return () => {
      isCurrent = false;
    };
    // navigationVersion deliberately represents direct navigation; ordinary
    // scroll position updates must not restore the viewport on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationVersion]);

  useEffect(() => {
    const viewport = frameRef.current;

    if (viewport === null) {
      return;
    }

    const updateContinuousLocator = () => {
      scrollFrameRef.current = null;
      if (performance.now() < suppressScrollTrackingUntilRef.current) {
        return;
      }

      if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1) {
        adapter.setContinuousPosition(position.totalPages, 1);
        return;
      }
      const anchor = resolvePdfContinuousAnchor(
        virtualizer.getVirtualItems(),
        viewport.scrollTop + viewport.clientHeight / 2,
        (pageNumber) => getPageSize(pageNumber).height,
      );

      if (anchor !== null) {
        adapter.setContinuousPosition(anchor.page, anchor.pageOffsetRatio);
      }
    };
    const handleScroll = () => {
      if (scrollFrameRef.current !== null) {
        return;
      }
      scrollFrameRef.current = window.requestAnimationFrame(updateContinuousLocator);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [adapter, frameRef, getPageSize, position.totalPages, virtualizer]);

  const viewport = frameRef.current;
  const viewportStart = viewport?.scrollTop ?? 0;
  const viewportEnd = viewportStart + (viewport?.clientHeight ?? 720);

  return (
    <div
      className="reader-pdf-continuous-list"
      data-mounted-pages={virtualItems.length}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map((virtualItem) => {
        const pageNumber = virtualItem.index + 1;
        const pageSize = getPageSize(pageNumber);
        const isVisible =
          virtualItem.end >= viewportStart && virtualItem.start <= viewportEnd;

        return (
          <div
            key={virtualItem.key}
            className="reader-pdf-virtual-row"
            data-index={virtualItem.index}
            data-page-number={pageNumber}
            ref={virtualizer.measureElement}
            style={{
              minWidth: `${Math.max(availableWidth, pageSize.width + 28)}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <PdfPageSurface
              adapter={adapter}
              annotations={annotations}
              availableWidth={pageContentWidth}
              isVisible={isVisible}
              onMetrics={handleMetrics}
              onAnnotationActivate={onAnnotationActivate}
              onSelectionEnd={onSelectionEnd}
              pageNumber={pageNumber}
              renderVersion={renderVersion}
              scale={position.scale}
              zoomMode={position.zoomMode}
            />
          </div>
        );
      })}
    </div>
  );
}

export const MemoizedPdfContinuousView = memo(PdfContinuousView);
