import type { PageTransitionMode } from "@reader/core";

import type { PageDirection, PageTransitionFrames } from "./PageTransitionController";

import "./PageTransitionLayer.css";

export interface PageSnapshot {
  node: HTMLElement;
}

const SNAPSHOT_LOAD_TIMEOUT_MS = 180;

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
  layer.append(currentFrame, targetFrame);
  if (pageCurlDecorations !== null) {
    layer.append(pageCurlDecorations.sheet, pageCurlDecorations.shadow);
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

    const animations =
      mode === "slide"
        ? createSlideAnimations(currentFrame, targetFrame, frames.direction)
        : createPageCurlAnimations(
            currentFrame,
            targetFrame,
            pageCurlDecorations as PageCurlDecorations,
            frames.direction,
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
  shadow: HTMLElement;
  sheet: HTMLElement;
}

function createPageCurlDecorations(currentFrame: HTMLElement): PageCurlDecorations {
  const sheet = document.createElement("div");
  const front = document.createElement("div");
  const back = document.createElement("div");
  const shadow = document.createElement("div");
  sheet.className = "reader-transition-layer__curl-sheet";
  front.className = "reader-transition-layer__curl-sheet-front";
  back.className = "reader-transition-layer__back";
  sheet.setAttribute("aria-hidden", "true");
  front.setAttribute("aria-hidden", "true");
  back.setAttribute("aria-hidden", "true");
  shadow.className = "reader-transition-layer__curl-shadow";
  shadow.setAttribute("aria-hidden", "true");
  front.style.background = getComputedStyle(currentFrame).backgroundColor;
  sheet.append(front, back);
  return { shadow, sheet };
}

function createSlideAnimations(
  currentFrame: HTMLElement,
  targetFrame: HTMLElement,
  direction: PageDirection,
): Animation[] {
  const sign = direction === "next" ? -1 : 1;
  const options: KeyframeAnimationOptions = {
    duration: 220,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    fill: "both",
  };

  return [
    currentFrame.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0.24, transform: `translateX(${sign * 9}%)` },
      ],
      options,
    ),
    targetFrame.animate(
      [
        { opacity: 0.24, transform: `translateX(${-sign * 9}%)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      options,
    ),
  ];
}

function createPageCurlAnimations(
  currentFrame: HTMLElement,
  targetFrame: HTMLElement,
  decorations: PageCurlDecorations,
  direction: PageDirection,
): Animation[] {
  const { shadow, sheet } = decorations;
  const rotation = direction === "next" ? -178 : 178;
  const origin = direction === "next" ? "left center" : "right center";
  sheet.style.transformOrigin = origin;
  sheet.dataset.direction = direction;
  const options: KeyframeAnimationOptions = {
    duration: 500,
    easing: "cubic-bezier(0.32, 0, 0.2, 1)",
    fill: "both",
  };

  return [
    currentFrame.animate(
      [
        { clipPath: "inset(0 0 0 0)", filter: "brightness(1)" },
        {
          clipPath: direction === "next" ? "inset(0 28% 0 0)" : "inset(0 0 0 28%)",
          filter: "brightness(0.88)",
          offset: 0.34,
        },
        {
          clipPath: direction === "next" ? "inset(0 76% 0 0)" : "inset(0 0 0 76%)",
          filter: "brightness(0.68)",
          offset: 0.72,
        },
        {
          clipPath: direction === "next" ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)",
          filter: "brightness(0.92)",
        },
      ],
      options,
    ),
    targetFrame.animate(
      [
        { filter: "brightness(0.78)", opacity: 0.72, transform: "scale(0.992)" },
        { filter: "brightness(0.92)", opacity: 0.9, offset: 0.62 },
        { opacity: 1, transform: "scale(1)" },
      ],
      options,
    ),
    sheet.animate(
      [
        { transform: "translateX(0) rotateY(0deg)" },
        {
          offset: 0.48,
          transform: `translateX(${direction === "next" ? -48 : 48}%) rotateY(${rotation * 0.52}deg)`,
        },
        {
          transform: `translateX(${direction === "next" ? -96 : 96}%) rotateY(${rotation}deg)`,
        },
      ],
      options,
    ),
    shadow.animate(
      [
        { opacity: 0, transform: "translateX(0)" },
        {
          opacity: 0.5,
          offset: 0.48,
          transform: `translateX(${direction === "next" ? -7 : 7}%)`,
        },
        {
          opacity: 0,
          transform: `translateX(${direction === "next" ? -18 : 18}%)`,
        },
      ],
      options,
    ),
  ];
}
