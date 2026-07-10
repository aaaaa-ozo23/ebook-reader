import { afterEach, describe, expect, it, vi } from "vitest";

import {
  animateIsolatedPageTransition,
  captureEpubRenditionSnapshot,
  capturePageSnapshot,
  PAGE_TRANSITION_DURATIONS,
  serializeSanitizedDocument,
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

  it("animates smooth as a full-width two-page movement", async () => {
    const animate = vi.fn<typeof HTMLElement.prototype.animate>(
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
    expect(JSON.stringify(animate.mock.calls)).toContain("translate3d(-100%, 0, 0)");
    expect(animate.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ duration: PAGE_TRANSITION_DURATIONS.slide }),
    );
    expect(host.querySelector(".reader-transition-layer")).toBeNull();
  });

  it("animates cover with a moving target edge over a stationary page", async () => {
    const animate = vi.fn<typeof HTMLElement.prototype.animate>(
      () => ({ finished: Promise.resolve() }) as unknown as Animation,
    );
    HTMLElement.prototype.animate = animate;
    const host = document.createElement("div");
    document.body.append(host);

    await animateIsolatedPageTransition(
      host,
      {
        current: { node: document.createElement("article") },
        direction: "previous",
        target: { node: document.createElement("article") },
      },
      "cover",
    );

    expect(animate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(animate.mock.calls)).toContain('"width":"0px"');
    expect(JSON.stringify(animate.mock.calls)).toContain("translate3d(0px, 0, 0)");
    expect(animate.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ duration: PAGE_TRANSITION_DURATIONS.cover }),
    );
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

  it("renders a 650ms diagonal realistic curl with printed paper depth", async () => {
    let finishAnimation!: () => void;
    const finished = new Promise<void>((resolve) => {
      finishAnimation = resolve;
    });
    const animate = vi.fn<typeof HTMLElement.prototype.animate>(
      () => ({ cancel: vi.fn(), finished }) as unknown as Animation,
    );
    HTMLElement.prototype.animate = animate;
    const host = document.createElement("div");
    document.body.append(host);

    const running = animateIsolatedPageTransition(
      host,
      {
        current: { node: document.createElement("article") },
        direction: "next",
        target: { node: document.createElement("article") },
      },
      "page-curl",
    );

    await vi.waitFor(() =>
      expect(host.querySelector(".reader-transition-layer")).not.toBeNull(),
    );
    const layer = host.querySelector(".reader-transition-layer");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveAttribute("data-mode", "page-curl");
    expect(layer?.querySelector(".reader-transition-layer__back")).not.toBeNull();
    expect(
      layer?.querySelector(".reader-transition-layer__curl-shadow"),
    ).not.toBeNull();
    expect(animate).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(animate.mock.calls)).toContain(
      "translateX(-112%) scaleX(0.08) skewY(0deg)",
    );
    expect(JSON.stringify(animate.mock.calls)).toContain('"width":"0px"');
    expect(JSON.stringify(animate.mock.calls)).not.toContain("clipPath");
    expect(animate.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ duration: PAGE_TRANSITION_DURATIONS["page-curl"] }),
    );

    finishAnimation();
    await running;
    expect(host.querySelector(".reader-transition-layer")).toBeNull();
  });

  it("builds sandboxed EPUB snapshots and strips active document content", () => {
    const host = document.createElement("div");
    const liveFrame = document.createElement("iframe");
    host.append(liveFrame);
    document.body.append(host);
    liveFrame.contentDocument?.open();
    liveFrame.contentDocument?.write(`<!doctype html><html><head></head><body>
      <script>window.parent.hacked = true</script>
      <form><input autofocus value="draft"><button>Submit</button></form>
      <iframe src="about:blank"></iframe>
      <p contenteditable="true">Readable page</p>
    </body></html>`);
    liveFrame.contentDocument?.close();

    const snapshot = captureEpubRenditionSnapshot(host);
    const snapshotFrame = snapshot?.node.querySelector("iframe");

    expect(snapshotFrame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(snapshotFrame).toHaveAttribute("aria-hidden", "true");
    expect(snapshotFrame?.getAttribute("srcdoc")).toContain("Readable page");
    expect(snapshotFrame?.getAttribute("srcdoc")).not.toContain("<script");
    expect(snapshotFrame?.getAttribute("srcdoc")).not.toContain("<form");
    expect(snapshotFrame?.getAttribute("srcdoc")).not.toContain("<iframe");
    expect(snapshotFrame?.getAttribute("srcdoc")).not.toContain("contenteditable");
  });

  it("serializes resources against the already loaded document base", () => {
    const sourceDocument = document.implementation.createHTMLDocument("Snapshot");
    const image = sourceDocument.createElement("img");
    image.src = "images/figure.png";
    sourceDocument.body.append(image);

    const serialized = serializeSanitizedDocument(sourceDocument);

    expect(serialized).toContain("<base href=");
    expect(serialized).toContain("images/figure.png");
  });
});
