import type { PageTransitionMode } from "@reader/core";

import type { PageDirection, PageTransitionFrames } from "./PageTransitionController";

import "./PageTransitionLayer.css";

export interface PageSnapshot {
  node: HTMLElement;
}

const SNAPSHOT_LOAD_TIMEOUT_MS = 180;

export const PAGE_TRANSITION_DURATIONS: Readonly<
  Record<Exclude<PageTransitionMode, "none">, number>
> = {
  slide: 280,
  cover: 320,
  "page-curl": 650,
};

export function capturePageSnapshot(element: HTMLElement | null): PageSnapshot | null {
  if (element === null) {
    return null;
  }

  return { node: element.cloneNode(true) as HTMLElement };
}

export function captureEpubRenditionSnapshot(
  element: HTMLElement | null,
): PageSnapshot | null {
  if (element === null) {
    return null;
  }

  const sourceFrames = Array.from(element.querySelectorAll("iframe")).filter(
    (frame) => frame.contentDocument?.documentElement !== undefined,
  );

  if (sourceFrames.length === 0) {
    return null;
  }

  const snapshot = document.createElement("div");
  snapshot.className = "reader-transition-snapshot";
  snapshot.style.setProperty(
    "--reader-transition-column-count",
    String(sourceFrames.length),
  );

  for (const sourceFrame of sourceFrames) {
    const sourceDocument = sourceFrame.contentDocument;

    if (sourceDocument === null) {
      continue;
    }

    const snapshotFrame = document.createElement("iframe");
    snapshotFrame.className = "reader-transition-snapshot__frame";
    snapshotFrame.setAttribute("aria-hidden", "true");
    snapshotFrame.setAttribute("sandbox", "allow-same-origin");
    snapshotFrame.setAttribute("tabindex", "-1");
    snapshotFrame.srcdoc = serializeSanitizedDocument(sourceDocument);
    snapshot.append(snapshotFrame);
  }

  return snapshot.childElementCount === 0 ? null : { node: snapshot };
}

export async function animateIsolatedPageTransition(
  host: HTMLElement,
  frames: PageTransitionFrames<PageSnapshot>,
  mode: Exclude<PageTransitionMode, "none">,
  signal?: AbortSignal,
): Promise<void> {
  const layer = document.createElement("div");
  const currentFrame = createFrame("current", frames.current.node);
  const targetFrame = createFrame("target", frames.target.node);
  layer.className = "reader-transition-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.direction = frames.direction;
  layer.dataset.mode = mode;
  const pageCurlDecorations =
    mode === "page-curl" ? createPageCurlDecorations(currentFrame) : null;
  const coverEdge = mode === "cover" ? createCoverEdge() : null;
  layer.append(currentFrame, targetFrame);
  if (coverEdge !== null) {
    layer.append(coverEdge);
  }
  if (pageCurlDecorations !== null) {
    layer.append(
      pageCurlDecorations.shade,
      pageCurlDecorations.shadow,
      pageCurlDecorations.sheet,
    );
  }
  host.append(layer);

  try {
    const snapshotsReady = await waitForSnapshotFrames(layer, signal);

    if (!snapshotsReady || signal?.aborted === true) {
      return;
    }

    if (
      typeof currentFrame.animate !== "function" ||
      typeof targetFrame.animate !== "function"
    ) {
      return;
    }

    const animations = createTransitionAnimations(
      mode,
      currentFrame,
      targetFrame,
      pageCurlDecorations,
      coverEdge,
      frames.direction,
      host.clientWidth,
    );
    const handleAbort = () => {
      for (const animation of animations) {
        animation.cancel();
      }
    };
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      await Promise.all(animations.map((animation) => animation.finished));
    } catch (error) {
      if (!isAbortSignalAborted(signal)) {
        throw error;
      }
    } finally {
      signal?.removeEventListener("abort", handleAbort);
    }
  } finally {
    layer.remove();
  }
}

function isAbortSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function serializeSanitizedDocument(sourceDocument: Document): string {
  const documentElement = sourceDocument.documentElement.cloneNode(true) as HTMLElement;
  documentElement
    .querySelectorAll("script, form, iframe, frame, frameset, object, embed")
    .forEach((element) => element.remove());
  documentElement
    .querySelectorAll("[autofocus], [contenteditable]")
    .forEach((element) => {
      element.removeAttribute("autofocus");
      element.removeAttribute("contenteditable");
    });
  documentElement
    .querySelectorAll("input, button, select, textarea")
    .forEach((element) => {
      element.setAttribute("disabled", "");
      element.setAttribute("tabindex", "-1");
    });

  const head = documentElement.querySelector("head");
  if (head !== null && sourceDocument.baseURI.length > 0) {
    const base = sourceDocument.createElement("base");
    base.href = sourceDocument.baseURI;
    head.prepend(base);
  }

  return `<!doctype html>${documentElement.outerHTML}`;
}

async function waitForSnapshotFrames(
  layer: HTMLElement,
  signal?: AbortSignal,
): Promise<boolean> {
  const frames = Array.from(
    layer.querySelectorAll<HTMLIFrameElement>(".reader-transition-snapshot__frame"),
  );

  if (frames.length === 0 || signal?.aborted === true) {
    return frames.length === 0 && signal?.aborted !== true;
  }

  const frameResults = await Promise.all(
    frames.map(
      (frame) =>
        new Promise<boolean>((resolve) => {
          if (frame.contentDocument?.readyState === "complete") {
            resolve(true);
            return;
          }

          let timeoutId = 0;
          const finish = (isReady: boolean) => {
            window.clearTimeout(timeoutId);
            frame.removeEventListener("load", handleLoad);
            frame.removeEventListener("error", handleError);
            signal?.removeEventListener("abort", handleAbort);
            resolve(isReady);
          };
          const handleLoad = () => finish(true);
          const handleError = () => finish(false);
          const handleAbort = () => finish(false);
          frame.addEventListener("load", handleLoad, { once: true });
          frame.addEventListener("error", handleError, { once: true });
          signal?.addEventListener("abort", handleAbort, { once: true });
          timeoutId = window.setTimeout(() => finish(false), SNAPSHOT_LOAD_TIMEOUT_MS);
        }),
    ),
  );

  return frameResults.every(Boolean);
}

function createFrame(kind: "current" | "target", snapshot: HTMLElement): HTMLElement {
  const frame = document.createElement("div");
  const front = document.createElement("div");
  frame.className = `reader-transition-layer__frame reader-transition-layer__frame--${kind}`;
  frame.setAttribute("aria-hidden", "true");
  front.className = "reader-transition-layer__front";
  front.append(snapshot);
  frame.append(front);
  return frame;
}

interface PageCurlDecorations {
  shade: HTMLElement;
  shadow: HTMLElement;
  sheet: HTMLElement;
}

function createPageCurlDecorations(currentFrame: HTMLElement): PageCurlDecorations {
  const sheet = document.createElement("div");
  const front = document.createElement("div");
  const back = document.createElement("div");
  const shade = document.createElement("div");
  const shadow = document.createElement("div");
  sheet.className = "reader-transition-layer__curl-sheet";
  front.className = "reader-transition-layer__curl-sheet-front";
  back.className = "reader-transition-layer__back";
  shade.className = "reader-transition-layer__target-shade";
  sheet.setAttribute("aria-hidden", "true");
  front.setAttribute("aria-hidden", "true");
  back.setAttribute("aria-hidden", "true");
  shade.setAttribute("aria-hidden", "true");
  shadow.className = "reader-transition-layer__curl-shadow";
  shadow.setAttribute("aria-hidden", "true");
  front.style.background = getComputedStyle(currentFrame).backgroundColor;
  sheet.append(front, back);
  return { shade, shadow, sheet };
}

function createTransitionAnimations(
  mode: Exclude<PageTransitionMode, "none">,
  currentFrame: HTMLElement,
  targetFrame: HTMLElement,
  pageCurlDecorations: PageCurlDecorations | null,
  coverEdge: HTMLElement | null,
  direction: PageDirection,
  stageWidth: number,
): Animation[] {
  if (mode === "slide") {
    return createSmoothAnimations(currentFrame, targetFrame, direction);
  }

  if (mode === "cover") {
    return createCoverAnimations(
      targetFrame,
      coverEdge as HTMLElement,
      direction,
      stageWidth,
    );
  }

  return createPageCurlAnimations(
    currentFrame,
    pageCurlDecorations as PageCurlDecorations,
    direction,
    stageWidth,
  );
}

function createCoverEdge(): HTMLElement {
  const edge = document.createElement("div");
  edge.className = "reader-transition-layer__cover-edge";
  edge.setAttribute("aria-hidden", "true");
  return edge;
}

function createSmoothAnimations(
  currentFrame: HTMLElement,
  targetFrame: HTMLElement,
  direction: PageDirection,
): Animation[] {
  const sign = direction === "next" ? -1 : 1;
  const options: KeyframeAnimationOptions = {
    duration: PAGE_TRANSITION_DURATIONS.slide,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    fill: "both",
  };

  return [
    currentFrame.animate(
      [
        { transform: "translate3d(0, 0, 0)" },
        { transform: `translate3d(${sign * 100}%, 0, 0)` },
      ],
      options,
    ),
    targetFrame.animate(
      [
        {
          boxShadow: `${sign * 18}px 0 28px rgba(18, 22, 24, 0.18)`,
          transform: `translate3d(${-sign * 100}%, 0, 0)`,
        },
        {
          boxShadow: "0 0 0 rgba(18, 22, 24, 0)",
          transform: "translate3d(0, 0, 0)",
        },
      ],
      options,
    ),
  ];
}

function createCoverAnimations(
  targetFrame: HTMLElement,
  edge: HTMLElement,
  direction: PageDirection,
  stageWidth: number,
): Animation[] {
  const width = Math.max(stageWidth, 1);
  const edgeStart = direction === "next" ? width : 0;
  const edgeEnd = direction === "next" ? 0 : width;
  const options: KeyframeAnimationOptions = {
    duration: PAGE_TRANSITION_DURATIONS.cover,
    easing: "cubic-bezier(0.22, 0.68, 0.18, 1)",
    fill: "both",
  };
  prepareAnchoredSnapshotFrame(
    targetFrame,
    direction === "next" ? "right" : "left",
    width,
  );

  return [
    targetFrame.animate(
      [
        { width: "0px" },
        { offset: 0.82, width: `${width}px` },
        { width: `${width}px` },
      ],
      options,
    ),
    edge.animate(
      [
        { opacity: 0, transform: `translate3d(${edgeStart}px, 0, 0)` },
        {
          opacity: 0.78,
          offset: 0.08,
          transform: `translate3d(${edgeStart}px, 0, 0)`,
        },
        {
          opacity: 0.56,
          offset: 0.82,
          transform: `translate3d(${edgeEnd}px, 0, 0)`,
        },
        { opacity: 0, transform: `translate3d(${edgeEnd}px, 0, 0)` },
      ],
      options,
    ),
  ];
}

function prepareAnchoredSnapshotFrame(
  frame: HTMLElement,
  anchor: "left" | "right",
  stageWidth: number,
) {
  const front = frame.querySelector<HTMLElement>(".reader-transition-layer__front");
  frame.style.insetBlock = "0";
  frame.style.width = `${stageWidth}px`;
  frame.style.left = anchor === "left" ? "0" : "auto";
  frame.style.right = anchor === "right" ? "0" : "auto";

  if (front !== null) {
    front.style.width = `${stageWidth}px`;
    front.style.left = anchor === "left" ? "0" : "auto";
    front.style.right = anchor === "right" ? "0" : "auto";
  }
}

function createPageCurlAnimations(
  currentFrame: HTMLElement,
  decorations: PageCurlDecorations,
  direction: PageDirection,
  stageWidth: number,
): Animation[] {
  const { shade, shadow, sheet } = decorations;
  const width = Math.max(stageWidth, 1);
  const currentAnchor = direction === "next" ? "left" : "right";
  const origin = direction === "next" ? "left center" : "right center";
  sheet.style.transformOrigin = origin;
  sheet.dataset.direction = direction;
  prepareAnchoredSnapshotFrame(currentFrame, currentAnchor, width);
  const options: KeyframeAnimationOptions = {
    duration: PAGE_TRANSITION_DURATIONS["page-curl"],
    easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
    fill: "both",
  };

  return [
    currentFrame.animate(
      [
        { width: `${width}px` },
        { offset: 0.28, width: `${Math.round(width * 0.86)}px` },
        { offset: 0.62, width: `${Math.round(width * 0.5)}px` },
        { offset: 0.86, width: `${Math.round(width * 0.12)}px` },
        { width: "0px" },
      ],
      options,
    ),
    shade.animate(
      [{ opacity: 0.24 }, { opacity: 0.16, offset: 0.56 }, { opacity: 0 }],
      options,
    ),
    sheet.animate(
      [
        { opacity: 0.18, transform: "translateX(0) scaleX(0.96) skewY(0deg)" },
        {
          offset: 0.44,
          opacity: 1,
          transform: `translateX(${direction === "next" ? -38 : 38}%) scaleX(0.72) skewY(${direction === "next" ? -7 : 7}deg)`,
        },
        {
          offset: 0.76,
          opacity: 0.9,
          transform: `translateX(${direction === "next" ? -78 : 78}%) scaleX(0.34) skewY(${direction === "next" ? 4 : -4}deg)`,
        },
        {
          opacity: 0,
          transform: `translateX(${direction === "next" ? -112 : 112}%) scaleX(0.08) skewY(0deg)`,
        },
      ],
      options,
    ),
    shadow.animate(
      [
        { opacity: 0, transform: "translateX(0)" },
        {
          opacity: 0.26,
          offset: 0.22,
          transform: `translateX(${direction === "next" ? -4 : 4}%) skewX(${direction === "next" ? -6 : 6}deg)`,
        },
        {
          opacity: 0.62,
          offset: 0.56,
          transform: `translateX(${direction === "next" ? -38 : 38}%) skewX(${direction === "next" ? -11 : 11}deg)`,
        },
        {
          opacity: 0,
          transform: `translateX(${direction === "next" ? -86 : 86}%) skewX(0deg)`,
        },
      ],
      options,
    ),
  ];
}
