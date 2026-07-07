import { afterEach, describe, expect, it, vi } from "vitest";

import {
  animateIsolatedPageTransition,
  capturePageSnapshot,
} from "./PageTransitionLayer";

const originalAnimate = HTMLElement.prototype.animate;

afterEach(() => {
  HTMLElement.prototype.animate = originalAnimate;
  document.body.replaceChildren();
});

describe("isolated page transition layer", () => {
  it("clones snapshots without moving the live page", () => {
    const livePage = document.createElement("article");
    livePage.textContent = "Live selectable page";

    const snapshot = capturePageSnapshot(livePage);

    expect(snapshot?.node).not.toBe(livePage);
    expect(snapshot?.node.textContent).toBe("Live selectable page");
    expect(livePage.parentElement).toBeNull();
  });

  it("animates slide and removes the isolated layer", async () => {
    const animate = vi.fn(
      () => ({ finished: Promise.resolve() }) as unknown as Animation,
    );
    HTMLElement.prototype.animate = animate;
    const host = document.createElement("div");
    const current = document.createElement("article");
    const target = document.createElement("article");
    document.body.append(host);

    await animateIsolatedPageTransition(
      host,
      {
        current: { node: current },
        direction: "next",
        target: { node: target },
      },
      "slide",
    );

    expect(animate).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".reader-transition-layer")).toBeNull();
  });

  it("falls back immediately when Web Animations is unavailable", async () => {
    HTMLElement.prototype.animate = undefined as never;
    const host = document.createElement("div");

    await animateIsolatedPageTransition(
      host,
      {
        current: { node: document.createElement("article") },
        direction: "previous",
        target: { node: document.createElement("article") },
      },
      "page-curl",
    );

    expect(host.querySelector(".reader-transition-layer")).toBeNull();
  });
});
