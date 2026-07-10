export interface Point {
  x: number;
  y: number;
}

export interface Size {
  height: number;
  width: number;
}

const MIN_ZOOM_PERCENT = 100;
const MAX_ZOOM_PERCENT = 500;

export function calculateFitScale(naturalSize: Size, stageSize: Size): number {
  if (
    naturalSize.width <= 0 ||
    naturalSize.height <= 0 ||
    stageSize.width <= 0 ||
    stageSize.height <= 0
  ) {
    return 1;
  }

  return Math.min(
    1,
    stageSize.width / naturalSize.width,
    stageSize.height / naturalSize.height,
  );
}

export function clampZoomPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_ZOOM_PERCENT;
  }

  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, Math.round(value)));
}

export function clampImagePan(
  pan: Point,
  naturalSize: Size,
  stageSize: Size,
  scale: number,
): Point {
  const bounds = getPanBounds(naturalSize, stageSize, scale);
  return {
    x: Math.min(bounds.x, Math.max(-bounds.x, pan.x)),
    y: Math.min(bounds.y, Math.max(-bounds.y, pan.y)),
  };
}

export function getPanBounds(naturalSize: Size, stageSize: Size, scale: number): Point {
  return {
    x: Math.max(0, (naturalSize.width * scale - stageSize.width) / 2),
    y: Math.max(0, (naturalSize.height * scale - stageSize.height) / 2),
  };
}
