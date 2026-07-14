import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type CSSProperties,
} from "react";
import type { Annotation } from "@reader/core";

import { DEFAULT_HIGHLIGHT_COLOR } from "../reader/readerAnnotationPresentation";

import { type PdfPageMetrics, type PdfReaderAdapter } from "./PdfReaderAdapter";

export interface PdfPageSurfaceProps {
  adapter: PdfReaderAdapter;
  annotations?: Annotation[];
  availableWidth: number;
  isVisible: boolean;
  onMetrics: (metrics: PdfPageMetrics) => void;
  onAnnotationActivate?: (annotation: Annotation, element: HTMLElement) => void;
  onSelectionEnd: (
    event: KeyboardEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
  ) => void;
  pageNumber: number;
  renderTextLayer?: boolean;
  renderVersion?: number;
  scale: number;
  zoomMode: "fit-width" | "custom";
}

export const PdfPageSurface = memo(function PdfPageSurface({
  adapter,
  annotations = [],
  availableWidth,
  isVisible,
  onMetrics,
  onAnnotationActivate,
  onSelectionEnd,
  pageNumber,
  renderTextLayer = true,
  renderVersion = 0,
  scale,
  zoomMode,
}: PdfPageSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const renderIdentityRef = useRef(0);
  const [metrics, setMetrics] = useState<PdfPageMetrics | null>(
    () => adapter.getCachedPageMetrics(pageNumber) ?? null,
  );
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [highlightRects, setHighlightRects] = useState<
    Array<{
      annotation: Annotation;
      height: number;
      id: string;
      width: number;
      x: number;
      y: number;
    }>
  >([]);
  const effectiveScale =
    zoomMode === "fit-width" && metrics !== null
      ? Math.max(0.1, availableWidth / Math.max(metrics.width, 1))
      : scale;

  useEffect(() => {
    let isCurrent = true;

    void adapter
      .getPageMetrics(pageNumber)
      .then((nextMetrics) => {
        if (!isCurrent) {
          return;
        }
        setMetrics(nextMetrics);
        onMetrics(nextMetrics);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setRenderError(getPdfSurfaceErrorMessage(error));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [adapter, onMetrics, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;

    if (canvas === null || metrics === null) {
      return;
    }

    const renderIdentity = renderIdentityRef.current + 1;
    renderIdentityRef.current = renderIdentity;
    let frameHandle: number | null = null;
    let isCurrent = true;
    setIsReady(false);
    setRenderError(null);

    let renderHandle: ReturnType<PdfReaderAdapter["createPageSurfaceRender"]> | null =
      null;
    const renderSurface = async () => {
      try {
        canvas.dataset.pageNumber = String(pageNumber);
        renderHandle = adapter.createPageSurfaceRender({
          canvas,
          pageNumber,
          renderTextLayer,
          scale: effectiveScale,
          textLayer,
        });
        await renderHandle.ready;

        if (isCurrent && renderIdentityRef.current === renderIdentity) {
          setIsReady(true);
        }
      } catch (error: unknown) {
        if (
          isCurrent &&
          renderIdentityRef.current === renderIdentity &&
          !isPdfRenderingCancelled(error)
        ) {
          setRenderError(getPdfSurfaceErrorMessage(error));
        }
      }
    };

    if (isVisible) {
      void renderSurface();
    } else {
      frameHandle = window.requestAnimationFrame(() => {
        frameHandle = null;
        void renderSurface();
      });
    }

    return () => {
      isCurrent = false;
      renderIdentityRef.current += 1;
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle);
      }
      renderHandle?.release();
      if (renderHandle === null) {
        adapter.releasePageSurface(pageNumber, canvas, textLayer);
      }
      window.getSelection()?.removeAllRanges();
    };
  }, [
    adapter,
    effectiveScale,
    isVisible,
    metrics,
    pageNumber,
    renderTextLayer,
    renderVersion,
    retryVersion,
  ]);

  useEffect(() => {
    let isCurrent = true;
    const pageAnnotations = annotations.filter(
      (annotation) =>
        annotation.locator.kind === "pdf" &&
        annotation.locator.page === pageNumber &&
        annotation.locator.rects !== undefined &&
        annotation.locator.rects.length > 0,
    );

    if (!isReady || pageAnnotations.length === 0) {
      setHighlightRects([]);
      return;
    }

    void Promise.all(
      pageAnnotations.map(async (annotation) => ({
        annotation,
        rects: await adapter.pdfRectsToViewportRects(
          pageNumber,
          annotation.locator.kind === "pdf" ? (annotation.locator.rects ?? []) : [],
          effectiveScale,
        ),
      })),
    ).then((results) => {
      if (!isCurrent) {
        return;
      }
      setHighlightRects(
        results.flatMap(({ annotation, rects }) =>
          rects.map((rect, index) => ({
            annotation,
            id: `${annotation.id}-${index}`,
            ...rect,
          })),
        ),
      );
    });

    return () => {
      isCurrent = false;
    };
  }, [adapter, annotations, effectiveScale, isReady, pageNumber]);

  const estimatedWidth = (metrics?.width ?? 612) * effectiveScale;
  const estimatedHeight = (metrics?.height ?? 792) * effectiveScale;

  return (
    <div
      className="reader-pdf-sheet reader-pdf-page-surface"
      data-page-number={pageNumber}
      data-render-ready={isReady ? "true" : "false"}
      onKeyUp={onSelectionEnd}
      onMouseUp={onSelectionEnd}
      style={{
        minHeight: `${Math.max(1, estimatedHeight)}px`,
        width: `${Math.max(1, estimatedWidth)}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="reader-pdf-canvas"
        aria-label={`PDF page ${pageNumber}`}
      />
      <div
        ref={textLayerRef}
        className="reader-pdf-text-layer"
        data-page-number={pageNumber}
      />
      <div className="reader-pdf-highlight-layer">
        {highlightRects.map((highlight) => {
          const hasHighlight = highlight.annotation.type === "highlight";
          const hasNote =
            highlight.annotation.note?.trim() !== "" &&
            highlight.annotation.note !== undefined;
          const className = `reader-pdf-highlight-rect ${
            hasHighlight ? "reader-pdf-highlight-rect--highlight" : ""
          } ${hasNote ? "reader-pdf-highlight-rect--note" : ""}`;
          const style = {
            "--reader-highlight-color":
              highlight.annotation.color ?? DEFAULT_HIGHLIGHT_COLOR,
            height: `${highlight.height}px`,
            left: `${highlight.x}px`,
            top: `${highlight.y}px`,
            width: `${highlight.width}px`,
          } as CSSProperties;

          if (!hasNote || onAnnotationActivate === undefined) {
            return (
              <span
                key={highlight.id}
                aria-hidden="true"
                className={className}
                style={style}
              />
            );
          }

          return (
            <span
              key={highlight.id}
              aria-label={`Edit note for ${
                highlight.annotation.selectedText ??
                highlight.annotation.locator.selectedText ??
                `page ${pageNumber}`
              }`}
              className={className}
              role="button"
              style={style}
              tabIndex={0}
              onClick={(event) =>
                onAnnotationActivate(highlight.annotation, event.currentTarget)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onAnnotationActivate(highlight.annotation, event.currentTarget);
                }
              }}
            />
          );
        })}
      </div>
      {renderError !== null ? (
        <div className="reader-pdf-page-error" role="alert">
          <span>Page {pageNumber} could not be rendered.</span>
          <button
            type="button"
            className="reader-tool-button"
            onClick={() => setRetryVersion((version) => version + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
});

function isPdfRenderingCancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "RenderingCancelledException" ||
      error.message.includes("Rendering cancelled"))
  );
}

function getPdfSurfaceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown PDF rendering error.";
}
