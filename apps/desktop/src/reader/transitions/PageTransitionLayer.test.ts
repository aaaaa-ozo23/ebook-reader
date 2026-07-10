import { afterEach, describe, expect, it, vi } from "vitest";

import {
  animateIsolatedPageTransition,
  captureEpubRenditionSnapshot,
  capturePageSnapshot,
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
