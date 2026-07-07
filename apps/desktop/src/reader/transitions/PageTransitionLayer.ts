import type { PageTransitionMode } from "@reader/core";

import type { PageDirection, PageTransitionFrames } from "./PageTransitionController";

import "./PageTransitionLayer.css";

export interface PageSnapshot {
  node: HTMLElement;
}

export function capturePageSnapshot(element: HTMLElement | null): PageSnapshot | null {
  if (element === null) {
    return null;
  }

  return { node: element.cloneNode(true) as HTMLElement };
}

export async function animateIsolatedPageTransition(
  host: HTMLElement,
  frames: PageTransitionFrames<PageSnapshot>,
  mode: Exclude<PageTransitionMode, "none">,
): Promise<void> {
  const layer = document.createElement("div");
  const currentFrame = createFrame("current", frames.current.node);
  const targetFrame = createFrame("target", frames.target.node);
  layer.className = "reader-transition-layer";
  layer.dataset.direction = frames.direction;
  layer.dataset.mode = mode;
  layer.append(currentFrame, targetFrame);
  host.append(layer);

  try {
    if (
      typeof currentFrame.animate !== "function" ||
      typeof targetFrame.animate !== "function"
    ) {
      return;
    }

    const animations =
      mode === "slide"
        ? createSlideAnimations(currentFrame, targetFrame, frames.direction)
        : createPageCurlAnimations(currentFrame, targetFrame, frames.direction);
    await Promise.all(animations.map((animation) => animation.finished));
  } finally {
    layer.remove();
  }
}

function createFrame(kind: "current" | "target", snapshot: HTMLElement): HTMLElement {
  const frame = document.createElement("div");
  frame.className = `reader-transition-layer__frame reader-transition-layer__frame--${kind}`;
  frame.setAttribute("aria-hidden", "true");
  frame.append(snapshot);
  return frame;
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
  direction: PageDirection,
): Animation[] {
  const rotation = direction === "next" ? -82 : 82;
  const origin = direction === "next" ? "left center" : "right center";
  currentFrame.style.transformOrigin = origin;
  const options: KeyframeAnimationOptions = {
    duration: 500,
    easing: "cubic-bezier(0.32, 0, 0.2, 1)",
    fill: "both",
  };

  return [
    currentFrame.animate(
      [
        { filter: "brightness(1)", transform: "perspective(1400px) rotateY(0deg)" },
        {
          filter: "brightness(0.72)",
          transform: `perspective(1400px) rotateY(${rotation}deg)`,
        },
      ],
      options,
    ),
    targetFrame.animate(
      [
        { opacity: 0.65, transform: "scale(0.985)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      options,
    ),
  ];
}
