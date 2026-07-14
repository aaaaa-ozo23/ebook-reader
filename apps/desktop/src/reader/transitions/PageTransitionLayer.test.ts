import { afterEach, describe, expect, it, vi } from "vitest";

import {
  animateIsolatedPageTransition,
  captureEpubRenditionSnapshot,
  captureEpubRenditionSnapshotAfterLayout,
  capturePageSnapshot,
  capturePdfSpreadSnapshot,
  captureTxtSpreadSnapshot,
  PAGE_TRANSITION_DURATIONS,
  serializeSanitizedDocument,
} from "./PageTransitionLayer";

const originalAnimate = HTMLElement.prototype.animate;

afterEach(() => {
  HTMLElement.prototype.animate = originalAnimate;
  vi.restoreAllMocks();
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

  it("captures the exact TXT target spread with its single or double context", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="reader-txt-page-window reader-txt-page-window--double">
        <section class="reader-txt-spread" data-spread-start="2" hidden aria-hidden="true">
          <article class="reader-txt-page" data-page-index="2">target-left</article>
          <article class="reader-txt-page" data-page-index="3"><span id="live-note">target-right</span></article>
        </section>
        <section class="reader-txt-spread" data-spread-start="4" data-window-state="current">
          <article class="reader-txt-page" data-page-index="4">wrong-page</article>
        </section>
      </div>`;

    const snapshot = captureTxtSpreadSnapshot(host, 2, "double");

    expect(snapshot?.node).toHaveClass("reader-txt-page-window--double");
    expect(snapshot?.node.textContent).toContain("target-left");
    expect(snapshot?.node.textContent).toContain("target-right");
    expect(snapshot?.node.textContent).not.toContain("wrong-page");
    expect(snapshot?.node.querySelector(".reader-txt-spread")).not.toHaveAttribute(
      "hidden",
    );
    expect(snapshot?.node.querySelector("[aria-hidden]")).toBeNull();
    expect(snapshot?.node.querySelector("#live-note")).toBeNull();
    expect(host.querySelector("#live-note")).not.toBeNull();
  });

  it("copies pixels from the exact PDF spread canvases", () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="reader-pdf-spread" data-spread-start="2">
        <div class="reader-pdf-page-surface" data-render-ready="true">
          <canvas data-page-number="2"></canvas><div class="reader-pdf-text-layer">live</div>
        </div>
        <div class="reader-pdf-page-surface" data-render-ready="true">
          <canvas data-page-number="3"></canvas><div class="reader-pdf-highlight-layer"></div>
        </div>
      </div>
      <div class="reader-pdf-spread" data-spread-start="4">
        <div class="reader-pdf-page-surface" data-render-ready="true">
          <canvas data-page-number="4"></canvas>
        </div>
      </div>`;
    const sourceCanvases = host.querySelectorAll("canvas");
    sourceCanvases[0]!.width = 200;
    sourceCanvases[0]!.height = 300;
    sourceCanvases[1]!.width = 220;
    sourceCanvases[1]!.height = 320;

    const snapshot = capturePdfSpreadSnapshot(host, 2);
    const snapshotCanvases = snapshot?.node.querySelectorAll("canvas");

    expect(snapshot?.node).toHaveAttribute("data-spread-start", "2");
    expect(
      Array.from(snapshotCanvases ?? []).map((canvas) => canvas.dataset.pageNumber),
    ).toEqual(["2", "3"]);
    expect(drawImage).toHaveBeenNthCalledWith(1, sourceCanvases[0], 0, 0);
    expect(drawImage).toHaveBeenNthCalledWith(2, sourceCanvases[1], 0, 0);
    expect(snapshot?.node.querySelector(".reader-pdf-text-layer")).toBeNull();
    expect(snapshot?.node.querySelector(".reader-pdf-highlight-layer")).toBeNull();
  });

  it("refuses a PDF snapshot until every target canvas is ready", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="reader-pdf-spread" data-spread-start="8">
      <div class="reader-pdf-page-surface" data-render-ready="false">
        <canvas data-page-number="8" width="10" height="10"></canvas>
      </div>
    </div>`;
    expect(capturePdfSpreadSnapshot(host, 8)).toBeNull();
  });

  it("animates smooth as a full-width two-page movement", async () => {
    const animate = vi.fn<typeof HTMLElement.prototype.animate>(
      () => ({ finished: Promise.resolve() }) as unknown as Animation,
    );
    HTMLElement.prototype.animate = animate;
    const host = document.createElement("div");
    const current = document.createElement("article");
    const target = document.createElement("article");
    Object.defineProperty(host, "clientWidth", { value: 400 });
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
    expect(JSON.stringify(animate.mock.calls)).toContain('"width":"0px"');
    expect(JSON.stringify(animate.mock.calls)).toContain("translate3d(100%, 0, 0)");
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

  it("preserves the live EPUB page viewport instead of resetting to chapter start", () => {
    const host = document.createElement("div");
    const liveFrame = document.createElement("iframe");
    host.append(liveFrame);
    document.body.append(host);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
      createRect({ height: 600, left: 100, top: 40, width: 400 }),
    );
    vi.spyOn(liveFrame, "getBoundingClientRect").mockReturnValue(
      createRect({ height: 600, left: -700, top: 40, width: 2400 }),
    );

    const snapshot = captureEpubRenditionSnapshot(host);
    const snapshotFrame = snapshot?.node.querySelector<HTMLIFrameElement>("iframe");

    expect(snapshot?.node).toHaveAttribute("data-layout", "positioned");
    expect(snapshotFrame?.style.left).toBe("0px");
    expect(snapshotFrame?.style.top).toBe("0px");
    expect(snapshotFrame?.style.width).toBe("400px");
    expect(snapshotFrame?.style.height).toBe("600px");
    expect(snapshotFrame?.dataset.readerSnapshotScrollLeft).toBe("800");
  });

  it("captures different previous and next EPUB page offsets", () => {
    const host = document.createElement("div");
    const liveFrame = document.createElement("iframe");
    host.append(liveFrame);
    document.body.append(host);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
      createRect({ height: 600, left: 0, top: 0, width: 400 }),
    );
    const frameRect = vi
      .spyOn(liveFrame, "getBoundingClientRect")
      .mockReturnValueOnce(createRect({ height: 600, left: -800, top: 0, width: 2400 }))
      .mockReturnValueOnce(
        createRect({ height: 600, left: -400, top: 0, width: 2400 }),
      );

    const laterPage = captureEpubRenditionSnapshot(host);
    const previousPage = captureEpubRenditionSnapshot(host);

    expect(frameRect).toHaveBeenCalledTimes(2);
    expect(
      laterPage?.node.querySelector<HTMLIFrameElement>("iframe")?.dataset
        .readerSnapshotScrollLeft,
    ).toBe("800");
    expect(
      previousPage?.node.querySelector<HTMLIFrameElement>("iframe")?.dataset
        .readerSnapshotScrollLeft,
    ).toBe("400");
  });

  it("ignores zero-sized preloaded frames when a visible EPUB view is available", () => {
    const host = document.createElement("div");
    const visibleFrame = document.createElement("iframe");
    const preloadedFrame = document.createElement("iframe");
    host.append(visibleFrame, preloadedFrame);
    document.body.append(host);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
      createRect({ height: 600, left: 0, top: 0, width: 400 }),
    );
    vi.spyOn(visibleFrame, "getBoundingClientRect").mockReturnValue(
      createRect({ height: 600, left: -400, top: 0, width: 2400 }),
    );
    vi.spyOn(preloadedFrame, "getBoundingClientRect").mockReturnValue(
      createRect({ height: 0, left: 0, top: 0, width: 0 }),
    );

    const snapshot = captureEpubRenditionSnapshot(host);

    expect(snapshot?.node).toHaveAttribute("data-layout", "positioned");
    expect(snapshot?.node.querySelectorAll("iframe")).toHaveLength(1);
    expect(
      snapshot?.node.querySelector<HTMLIFrameElement>("iframe")?.dataset
        .readerSnapshotScrollLeft,
    ).toBe("400");
  });

  it("waits for a transient zero-sized EPUB view to finish layout", async () => {
    const host = document.createElement("div");
    const liveFrame = document.createElement("iframe");
    host.append(liveFrame);
    document.body.append(host);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
      createRect({ height: 600, left: 0, top: 0, width: 400 }),
    );
    vi.spyOn(liveFrame, "getBoundingClientRect")
      .mockReturnValueOnce(createRect({ height: 0, left: 0, top: 0, width: 0 }))
      .mockReturnValue(createRect({ height: 600, left: -400, top: 0, width: 2400 }));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const snapshot = await captureEpubRenditionSnapshotAfterLayout(host);

    expect(snapshot?.node).toHaveAttribute("data-layout", "positioned");
    expect(
      snapshot?.node.querySelector<HTMLIFrameElement>("iframe")?.dataset
        .readerSnapshotScrollLeft,
    ).toBe("400");
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

function createRect({
  height,
  left,
  top,
  width,
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  };
}
