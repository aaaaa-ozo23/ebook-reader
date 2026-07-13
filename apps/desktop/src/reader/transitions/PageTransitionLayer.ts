import type { PageTransitionMode } from "@reader/core";

import type { PageDirection, PageTransitionFrames } from "./PageTransitionController";
import type { TxtSpreadMode } from "../TxtPaginator";

import "./PageTransitionLayer.css";

export interface PageSnapshot {
  node: HTMLElement;
}

const SNAPSHOT_LOAD_TIMEOUT_MS = 180;
const SNAPSHOT_LAYOUT_ATTEMPTS = 6;

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

export function captureTxtSpreadSnapshot(
  host: HTMLElement | null,
  spreadStart: number,
  spreadMode: TxtSpreadMode,
): PageSnapshot | null {
  if (host === null) {
    return null;
  }

  const sourceSpread = Array.from(
    host.querySelectorAll<HTMLElement>(".reader-txt-spread[data-spread-start]"),
  ).find((spread) => Number(spread.dataset.spreadStart) === spreadStart);
  if (sourceSpread === undefined) {
    return null;
  }

  const snapshot = document.createElement("div");
  snapshot.className = `reader-txt-page-window reader-txt-page-window--${spreadMode} reader-txt-transition-snapshot`;
  const spread = sourceSpread.cloneNode(true) as HTMLElement;
  spread.hidden = false;
  spread.removeAttribute("hidden");
  spread.removeAttribute("aria-hidden");
  spread.dataset.windowState = "current";
  spread.querySelectorAll<HTMLElement>("[hidden]").forEach((element) => {
    element.hidden = false;
    element.removeAttribute("hidden");
  });
  spread.querySelectorAll<HTMLElement>("[aria-hidden]").forEach((element) => {
    element.removeAttribute("aria-hidden");
  });
  spread.querySelectorAll<HTMLElement>("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
  snapshot.append(spread);
  return { node: snapshot };
}

export function captureEpubRenditionSnapshot(
  element: HTMLElement | null,
): PageSnapshot | null {
  if (element === null) {
    return null;
  }

  const candidateFrames = Array.from(element.querySelectorAll("iframe")).filter(
    (frame) =>
      frame.closest(".reader-transition-layer") === null &&
      frame.contentDocument?.documentElement !== undefined,
  );

  if (candidateFrames.length === 0) {
    return null;
  }

  const hostRect = element.getBoundingClientRect();
  const visibleFrames = candidateFrames.flatMap((frame) => {
    const layout = captureSnapshotFrameLayout(frame, hostRect);
    return layout !== null && intersectsSnapshotViewport(layout, hostRect)
      ? [{ frame, layout }]
      : [];
  });
  const usesPositionedLayout = visibleFrames.length > 0;
  const hostHasLayout = hostRect.width > 0 && hostRect.height > 0;
  if (hostHasLayout && !usesPositionedLayout) {
    return null;
  }
  const sourceFrames = usesPositionedLayout
    ? visibleFrames
    : candidateFrames.map((frame) => ({ frame, layout: null }));
  const snapshot = document.createElement("div");
  snapshot.className = "reader-transition-snapshot";
  snapshot.dataset.layout = usesPositionedLayout ? "positioned" : "grid";
  snapshot.style.setProperty(
    "--reader-transition-column-count",
    String(sourceFrames.length),
  );

  for (const { frame: sourceFrame, layout } of sourceFrames) {
    const sourceDocument = sourceFrame.contentDocument;

    if (sourceDocument === null) {
      continue;
    }

    const snapshotFrame = document.createElement("iframe");
    snapshotFrame.className = "reader-transition-snapshot__frame";
    snapshotFrame.setAttribute("aria-hidden", "true");
    snapshotFrame.setAttribute("sandbox", "allow-same-origin");
    snapshotFrame.setAttribute("tabindex", "-1");
    snapshotFrame.dataset.readerSnapshotReady = "false";
    const frameScroll = readFrameScroll(sourceFrame);
    if (layout !== null) {
      applySnapshotFrameLayout(snapshotFrame, layout, hostRect, frameScroll);
    } else {
      snapshotFrame.dataset.readerSnapshotScrollLeft = String(frameScroll.left);
      snapshotFrame.dataset.readerSnapshotScrollTop = String(frameScroll.top);
    }
    const handleSnapshotLoad = () => {
      if (!isSnapshotDocumentReady(snapshotFrame)) {
        return;
      }
      restoreSnapshotFrameScroll(snapshotFrame);
      snapshotFrame.dataset.readerSnapshotReady = "true";
      snapshotFrame.removeEventListener("load", handleSnapshotLoad);
    };
    snapshotFrame.addEventListener("load", handleSnapshotLoad);
    snapshotFrame.srcdoc = serializeSanitizedDocument(sourceDocument);
    snapshot.append(snapshotFrame);
  }

  return snapshot.childElementCount === 0 ? null : { node: snapshot };
}

export async function captureEpubRenditionSnapshotAfterLayout(
  element: HTMLElement | null,
): Promise<PageSnapshot | null> {
  if (element === null) {
    return null;
  }

  for (let attempt = 0; attempt < SNAPSHOT_LAYOUT_ATTEMPTS; attempt += 1) {
    const snapshot = captureEpubRenditionSnapshot(element);
    if (snapshot !== null) {
      return snapshot;
    }

    if (attempt < SNAPSHOT_LAYOUT_ATTEMPTS - 1) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
  }

  return null;
}

interface SnapshotFrameLayout {
  height: number;
  left: number;
  top: number;
  width: number;
}

function intersectsSnapshotViewport(
  layout: SnapshotFrameLayout,
  hostRect: DOMRect,
): boolean {
  return (
    layout.left < hostRect.width &&
    layout.left + layout.width > 0 &&
    layout.top < hostRect.height &&
    layout.top + layout.height > 0
  );
}

function captureSnapshotFrameLayout(
  frame: HTMLIFrameElement,
  hostRect: DOMRect,
): SnapshotFrameLayout | null {
  const frameRect = frame.getBoundingClientRect();

  if (
    hostRect.width <= 0 ||
    hostRect.height <= 0 ||
    frameRect.width <= 0 ||
    frameRect.height <= 0
  ) {
    return null;
  }

  return {
    height: frameRect.height,
    left: frameRect.left - hostRect.left,
    top: frameRect.top - hostRect.top,
    width: frameRect.width,
  };
}

function applySnapshotFrameLayout(
  frame: HTMLIFrameElement,
  layout: SnapshotFrameLayout,
  hostRect: DOMRect,
  sourceScroll: { left: number; top: number },
) {
  const left = Math.max(0, layout.left);
  const top = Math.max(0, layout.top);
  const width = Math.max(
    0,
    Math.min(hostRect.width, layout.left + layout.width) - left,
  );
  const height = Math.max(
    0,
    Math.min(hostRect.height, layout.top + layout.height) - top,
  );
  frame.style.height = `${height}px`;
  frame.style.left = `${left}px`;
  frame.style.top = `${top}px`;
  frame.style.width = `${width}px`;
  frame.dataset.readerSnapshotScrollLeft = String(
    sourceScroll.left + Math.max(0, -layout.left),
  );
  frame.dataset.readerSnapshotScrollTop = String(
    sourceScroll.top + Math.max(0, -layout.top),
  );
}

function readFrameScroll(frame: HTMLIFrameElement): { left: number; top: number } {
  const sourceDocument = frame.contentDocument;
  const sourceWindow = frame.contentWindow;
  const left =
    sourceWindow?.scrollX ??
    sourceDocument?.documentElement.scrollLeft ??
    sourceDocument?.body.scrollLeft ??
    0;
  const top =
    sourceWindow?.scrollY ??
    sourceDocument?.documentElement.scrollTop ??
    sourceDocument?.body.scrollTop ??
    0;

  return { left, top };
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
  documentElement.dataset.readerSnapshotDocument = "true";
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
          if (
            frame.dataset.readerSnapshotReady === "true" ||
            isSnapshotDocumentReady(frame)
          ) {
            restoreSnapshotFrameScroll(frame);
            frame.dataset.readerSnapshotReady = "true";
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
          const handleLoad = () => {
            if (!isSnapshotDocumentReady(frame)) {
              return;
            }
            restoreSnapshotFrameScroll(frame);
            frame.dataset.readerSnapshotReady = "true";
            finish(true);
          };
          const handleError = () => finish(false);
          const handleAbort = () => finish(false);
          frame.addEventListener("load", handleLoad);
          frame.addEventListener("error", handleError, { once: true });
          signal?.addEventListener("abort", handleAbort, { once: true });
          timeoutId = window.setTimeout(() => finish(false), SNAPSHOT_LOAD_TIMEOUT_MS);
        }),
    ),
  );

  return frameResults.every(Boolean);
}

function isSnapshotDocumentReady(frame: HTMLIFrameElement): boolean {
  return (
    frame.contentDocument?.documentElement.dataset.readerSnapshotDocument === "true"
  );
}

function restoreSnapshotFrameScroll(frame: HTMLIFrameElement) {
  const left = Number(frame.dataset.readerSnapshotScrollLeft ?? 0);
  const top = Number(frame.dataset.readerSnapshotScrollTop ?? 0);

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return;
  }

  try {
    if (frame.contentDocument !== null) {
      const { body, documentElement } = frame.contentDocument;
      body.style.position = "relative";
      body.style.left = `${-left}px`;
      body.style.top = `${-top}px`;
      frame.contentWindow?.scrollTo(0, 0);
      documentElement.scrollLeft = 0;
      documentElement.scrollTop = 0;
      body.scrollLeft = 0;
      body.scrollTop = 0;
    }
  } catch {
    // Snapshot scroll restoration is best effort; layout geometry remains primary.
  }
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
    return createSmoothAnimations(currentFrame, targetFrame, direction, stageWidth);
  }

  if (mode === "cover") {
    return createCoverAnimations(
      currentFrame,
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
  stageWidth: number,
): Animation[] {
  const sign = direction === "next" ? -1 : 1;
  const width = Math.max(stageWidth, 1);
  const options: KeyframeAnimationOptions = {
    duration: PAGE_TRANSITION_DURATIONS.slide,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    fill: "both",
  };
  prepareAnchoredSnapshotFrame(
    currentFrame,
    direction === "next" ? "left" : "right",
    width,
  );
  const targetBodyAnimations = Array.from(
    targetFrame.querySelectorAll<HTMLIFrameElement>(
      ".reader-transition-snapshot__frame",
    ),
  ).flatMap((frame) => {
    const body = frame.contentDocument?.body;
    if (body === undefined) {
      return [];
    }

    const restingLeft = Number.parseFloat(body.style.left) || 0;
    return [
      body.animate(
        [{ left: `${restingLeft - sign * width}px` }, { left: `${restingLeft}px` }],
        options,
      ),
    ];
  });
  const targetAnimations =
    targetBodyAnimations.length > 0
      ? targetBodyAnimations
      : [
          targetFrame.animate(
            [
              { transform: `translate3d(${-sign * 100}%, 0, 0)` },
              { transform: "translate3d(0, 0, 0)" },
            ],
            options,
          ),
        ];

  return [
    currentFrame.animate(
      [
        {
          boxShadow: `${sign * 18}px 0 28px rgba(18, 22, 24, 0.18)`,
          width: `${width}px`,
        },
        {
          boxShadow: "0 0 0 rgba(18, 22, 24, 0)",
          width: "0px",
        },
      ],
      options,
    ),
    ...targetAnimations,
  ];
}

function createCoverAnimations(
  currentFrame: HTMLElement,
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
    currentFrame,
    direction === "next" ? "left" : "right",
    width,
  );

  return [
    currentFrame.animate([{ width: `${width}px` }, { width: "0px" }], options),
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
          offset: 0.94,
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
