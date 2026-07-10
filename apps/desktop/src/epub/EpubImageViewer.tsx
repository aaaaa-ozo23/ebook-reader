import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { Modal } from "../components/ui/Modal";
import type { EpubImageResource } from "./EpubImageBridge";
import {
  calculateFitScale,
  clampImagePan,
  clampZoomPercent,
  getPanBounds,
  type Point,
  type Size,
} from "./EpubImageViewerModel";

import "./EpubImageViewer.css";

interface EpubImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  resource: EpubImageResource | null;
}

interface PinchState {
  distance: number;
  midpoint: Point;
  zoomPercent: number;
}

type ZoomMode = "fit" | "manual";

const MIN_ZOOM_PERCENT = 100;
const MAX_ZOOM_PERCENT = 500;
const ZOOM_STEP = 25;

export function EpubImageViewer({ isOpen, onClose, resource }: EpubImageViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerPositionsRef = useRef(new Map<number, Point>());
  const lastDragPointRef = useRef<Point | null>(null);
  const pinchStateRef = useRef<PinchState | null>(null);
  const isSpacePressedRef = useRef(false);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const stageSizeRef = useRef<Size>({ height: 0, width: 0 });
  const naturalSizeRef = useRef<Size>({
    height: resource?.naturalHeight ?? 0,
    width: resource?.naturalWidth ?? 0,
  });
  const zoomModeRef = useRef<ZoomMode>("fit");
  const zoomPercentRef = useRef(MIN_ZOOM_PERCENT);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [zoomPercent, setZoomPercent] = useState(MIN_ZOOM_PERCENT);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [stageSize, setStageSize] = useState<Size>({ height: 0, width: 0 });
  const [naturalSize, setNaturalSize] = useState<Size>({
    height: resource?.naturalHeight ?? 0,
    width: resource?.naturalWidth ?? 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const fitScale = useMemo(
    () => calculateFitScale(naturalSize, stageSize),
    [naturalSize, stageSize],
  );
  const scale = zoomMode === "fit" ? fitScale : zoomPercent / 100;
  const effectiveZoomPercent = Math.max(1, Math.round(scale * 100));
  const panBounds = useMemo(
    () => getPanBounds(naturalSize, stageSize, scale),
    [naturalSize, scale, stageSize],
  );
  const canPan = panBounds.x > 0 || panBounds.y > 0;

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

  useEffect(() => {
    naturalSizeRef.current = naturalSize;
  }, [naturalSize]);

  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);

  useEffect(() => {
    zoomPercentRef.current = zoomPercent;
  }, [zoomPercent]);

  useEffect(() => {
    if (!isOpen || stageRef.current === null) {
      return;
    }

    const stage = stageRef.current;
    const updateStageSize = () => {
      const nextStageSize = {
        height: stage.clientHeight,
        width: stage.clientWidth,
      };
      stageSizeRef.current = nextStageSize;
      setStageSize(nextStageSize);
      const nextScale =
        zoomModeRef.current === "fit"
          ? calculateFitScale(naturalSizeRef.current, nextStageSize)
          : zoomPercentRef.current / 100;
      scaleRef.current = nextScale;
      const nextPan = clampImagePan(
        panRef.current,
        naturalSizeRef.current,
        nextStageSize,
        nextScale,
      );
      panRef.current = nextPan;
      setPan(nextPan);
    };
    updateStageSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateStageSize);
      return () => window.removeEventListener("resize", updateStageSize);
    }

    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [isOpen]);

  const setFitZoom = useCallback(() => {
    setZoomMode("fit");
    zoomModeRef.current = "fit";
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  }, []);

  const setManualZoom = useCallback((nextZoomPercent: number, anchor?: Point) => {
    const normalizedZoom = clampZoomPercent(nextZoomPercent);
    const oldScale = scaleRef.current;
    const nextScale = normalizedZoom / 100;
    let nextPan = panRef.current;

    if (anchor !== undefined && stageRef.current !== null && oldScale > 0) {
      const rect = stageRef.current.getBoundingClientRect();
      const anchorFromCenter = {
        x: anchor.x - (rect.left + rect.width / 2),
        y: anchor.y - (rect.top + rect.height / 2),
      };
      const contentPoint = {
        x: (anchorFromCenter.x - nextPan.x) / oldScale,
        y: (anchorFromCenter.y - nextPan.y) / oldScale,
      };
      nextPan = {
        x: anchorFromCenter.x - contentPoint.x * nextScale,
        y: anchorFromCenter.y - contentPoint.y * nextScale,
      };
    }

    nextPan = clampImagePan(
      nextPan,
      naturalSizeRef.current,
      stageSizeRef.current,
      nextScale,
    );
    setZoomMode("manual");
    zoomModeRef.current = "manual";
    setZoomPercent(normalizedZoom);
    zoomPercentRef.current = normalizedZoom;
    setPan(nextPan);
    panRef.current = nextPan;
    scaleRef.current = nextScale;
  }, []);

  const setActualSize = useCallback(() => {
    setManualZoom(MIN_ZOOM_PERCENT);
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  }, [setManualZoom]);

  const adjustZoom = useCallback(
    (direction: -1 | 1, anchor?: Point) => {
      if (direction < 0 && zoomModeRef.current === "fit") {
        return;
      }

      const currentZoom =
        zoomModeRef.current === "fit" ? MIN_ZOOM_PERCENT : zoomPercentRef.current;
      setManualZoom(currentZoom + direction * ZOOM_STEP, anchor);
    },
    [setManualZoom],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " && !isInteractiveTarget(event.target)) {
        isSpacePressedRef.current = true;
        event.preventDefault();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjustZoom(1);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        adjustZoom(-1);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") {
        isSpacePressedRef.current = false;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      isSpacePressedRef.current = false;
    };
  }, [adjustZoom, isOpen]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!isOpen || stage === null) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      adjustZoom(event.deltaY > 0 ? -1 : 1, {
        x: event.clientX,
        y: event.clientY,
      });
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [adjustZoom, isOpen]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = { x: event.clientX, y: event.clientY };
      pointerPositionsRef.current.set(event.pointerId, point);

      if (pointerPositionsRef.current.size === 1) {
        lastDragPointRef.current = point;
        setIsDragging(canPan || event.pointerType === "touch");
      } else if (pointerPositionsRef.current.size === 2) {
        const [first, second] = Array.from(pointerPositionsRef.current.values());
        pinchStateRef.current = {
          distance: getPointDistance(first, second),
          midpoint: getMidpoint(first, second),
          zoomPercent:
            zoomModeRef.current === "fit" ? MIN_ZOOM_PERCENT : zoomPercentRef.current,
        };
        setIsDragging(true);
      }
    },
    [canPan],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerPositionsRef.current.has(event.pointerId)) {
        return;
      }

      const nextPoint = { x: event.clientX, y: event.clientY };
      pointerPositionsRef.current.set(event.pointerId, nextPoint);

      if (pointerPositionsRef.current.size >= 2) {
        const [first, second] = Array.from(pointerPositionsRef.current.values());
        const pinchState = pinchStateRef.current;

        if (pinchState === null || pinchState.distance <= 0) {
          return;
        }

        const midpoint = getMidpoint(first, second);
        const distance = getPointDistance(first, second);
        setManualZoom(
          pinchState.zoomPercent * (distance / pinchState.distance),
          midpoint,
        );
        const midpointDelta = {
          x: midpoint.x - pinchState.midpoint.x,
          y: midpoint.y - pinchState.midpoint.y,
        };
        const nextPan = clampImagePan(
          {
            x: panRef.current.x + midpointDelta.x,
            y: panRef.current.y + midpointDelta.y,
          },
          naturalSizeRef.current,
          stageSizeRef.current,
          scaleRef.current,
        );
        panRef.current = nextPan;
        setPan(nextPan);
        pinchStateRef.current = {
          distance,
          midpoint,
          zoomPercent: zoomPercentRef.current,
        };
        return;
      }

      const previousPoint = lastDragPointRef.current;
      lastDragPointRef.current = nextPoint;

      if (
        previousPoint === null ||
        (!canPan && !isSpacePressedRef.current && event.pointerType !== "touch")
      ) {
        return;
      }

      const nextPan = clampImagePan(
        {
          x: panRef.current.x + nextPoint.x - previousPoint.x,
          y: panRef.current.y + nextPoint.y - previousPoint.y,
        },
        naturalSizeRef.current,
        stageSizeRef.current,
        scaleRef.current,
      );
      panRef.current = nextPan;
      setPan(nextPan);
    },
    [canPan, setManualZoom],
  );

  const releasePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerPositionsRef.current.delete(event.pointerId);
    pinchStateRef.current = null;
    const remainingPoint = pointerPositionsRef.current.values().next().value as
      | Point
      | undefined;
    lastDragPointRef.current = remainingPoint ?? null;
    setIsDragging(pointerPositionsRef.current.size > 0);
  }, []);

  const handleSliderChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setManualZoom(Number(event.currentTarget.value));
    },
    [setManualZoom],
  );

  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const nextNaturalSize = {
      height: image.naturalHeight,
      width: image.naturalWidth,
    };
    naturalSizeRef.current = nextNaturalSize;
    setNaturalSize(nextNaturalSize);
    const nextScale =
      zoomModeRef.current === "fit"
        ? calculateFitScale(nextNaturalSize, stageSizeRef.current)
        : zoomPercentRef.current / 100;
    scaleRef.current = nextScale;
    const nextPan = clampImagePan(
      panRef.current,
      nextNaturalSize,
      stageSizeRef.current,
      nextScale,
    );
    panRef.current = nextPan;
    setPan(nextPan);
  }, []);

  if (!isOpen || resource === null) {
    return null;
  }

  const imageShellStyle = {
    "--epub-image-pan-x": `${pan.x}px`,
    "--epub-image-pan-y": `${pan.y}px`,
    "--epub-image-scale": scale,
    "--epub-image-width": `${naturalSize.width || resource.naturalWidth || 1}px`,
    "--epub-image-height": `${naturalSize.height || resource.naturalHeight || 1}px`,
  } as CSSProperties;

  return (
    <Modal
      backdropClassName="ui-modal-backdrop--image-viewer"
      className="epub-image-viewer-modal"
      closeLabel="Close image viewer"
      description={resource.description}
      headerActions={
        <div className="epub-image-viewer__toolbar" aria-label="Image zoom tools">
          <ViewerTool label="Fit" onClick={setFitZoom} selected={zoomMode === "fit"}>
            <FitIcon />
          </ViewerTool>
          <ViewerTool label="100%" onClick={setActualSize}>
            <ActualSizeIcon />
          </ViewerTool>
          <ViewerTool
            disabled={zoomMode === "fit" || zoomPercent <= MIN_ZOOM_PERCENT}
            label="Zoom out"
            onClick={() => adjustZoom(-1)}
          >
            <ZoomOutIcon />
          </ViewerTool>
          <output className="epub-image-viewer__zoom-value" aria-live="polite">
            {effectiveZoomPercent}%
          </output>
          <ViewerTool
            disabled={zoomMode === "manual" && zoomPercent >= MAX_ZOOM_PERCENT}
            label="Zoom in"
            onClick={() => adjustZoom(1)}
          >
            <ZoomInIcon />
          </ViewerTool>
          <ViewerTool label="Reset" onClick={setFitZoom}>
            <ResetIcon />
          </ViewerTool>
        </div>
      }
      isOpen={isOpen}
      onClose={onClose}
      restoreFocusOnClose={false}
      title={resource.accessibleName}
    >
      <div className="epub-image-viewer">
        <div
          ref={stageRef}
          className={`epub-image-viewer__stage ${
            canPan ? "epub-image-viewer__stage--pannable" : ""
          } ${isDragging ? "epub-image-viewer__stage--dragging" : ""}`.trim()}
          aria-label={`Zoomed image: ${resource.accessibleName}`}
          role="region"
          onDoubleClick={() =>
            zoomModeRef.current === "fit" ? setActualSize() : setFitZoom()
          }
          onPointerCancel={releasePointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releasePointer}
        >
          <div className="epub-image-viewer__image-shell" style={imageShellStyle}>
            <img
              alt={resource.accessibleName}
              draggable={false}
              src={resource.sourceUrl}
              onLoad={handleImageLoad}
            />
          </div>
          {canPan ? (
            <span className="epub-image-viewer__pan-hint">
              <PanIcon />
              Drag to pan
            </span>
          ) : null}
        </div>
        <footer className="epub-image-viewer__footer">
          <span>100%</span>
          <input
            aria-label="Image zoom"
            max={MAX_ZOOM_PERCENT}
            min={MIN_ZOOM_PERCENT}
            step={ZOOM_STEP}
            type="range"
            value={zoomMode === "fit" ? MIN_ZOOM_PERCENT : zoomPercent}
            onChange={handleSliderChange}
          />
          <span>500%</span>
          <p>
            Use mouse wheel, trackpad pinch, or +/- keys to zoom. Drag or hold Space and
            drag to pan. Press Esc to close.
          </p>
        </footer>
      </div>
    </Modal>
  );
}

function getPointDistance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getMidpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("button, input, select, textarea, a[href]") !== null
  );
}

function ViewerTool({
  children,
  disabled = false,
  label,
  onClick,
  selected = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className="epub-image-viewer__tool"
      aria-pressed={selected || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function FitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8l-5-5M16 8l5-5M16 16l5 5M8 16l-5 5" />
    </svg>
  );
}

function ActualSizeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7V5h2M17 5h2v2M19 17v2h-2M7 19H5v-2M9 9h6v6H9z" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21M7.5 10.5h6" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21M7.5 10.5h6M10.5 7.5v6" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8V3m0 0h5M5 3l3.7 3.7A8 8 0 1 1 4 13" />
    </svg>
  );
}

function PanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 11V7a1.5 1.5 0 0 1 3 0v3-5a1.5 1.5 0 0 1 3 0v5-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v5c0 4-3 7-7 7h-1c-2.2 0-3.8-1-5.2-2.7L3.5 14a1.6 1.6 0 0 1 2.4-2.1L8 14" />
    </svg>
  );
}
