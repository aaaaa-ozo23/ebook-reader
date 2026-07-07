import { describe, expect, it, vi } from "vitest";

import { registerEpubImageBridge, resolveEpubImageResource } from "./EpubImageBridge";

describe("EPUB image bridge", () => {
  it("decorates loaded HTML images and activates them by click", () => {
    document.body.innerHTML = `
      <figure>
        <img src="blob:epub-dog-rose" alt="Dog rose plate" title="Plate IV" />
        <figcaption>Botanical illustration</figcaption>
      </figure>
    `;
    const image = document.querySelector("img") as HTMLImageElement;
    markImageLoaded(image, 1200, 900);
    const onActivate = vi.fn();
    const cleanup = registerEpubImageBridge(document, onActivate);

    expect(image).toHaveAttribute("tabindex", "0");
    expect(image).toHaveAttribute("role", "button");
    expect(image).toHaveAttribute("aria-haspopup", "dialog");
    expect(image).toHaveClass("reader-epub-viewable-image");

    image.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

    expect(onActivate).toHaveBeenCalledWith({
      sourceUrl: "blob:epub-dog-rose",
      accessibleName: "Dog rose plate",
      description: "Plate IV",
      naturalWidth: 1200,
      naturalHeight: 900,
      trigger: image,
    });
    expect(document.activeElement).toBe(image);

    cleanup();
    expect(image).not.toHaveAttribute("tabindex");
    expect(image).not.toHaveAttribute("role");
    expect(image).not.toHaveAttribute("aria-haspopup");
    expect(image).not.toHaveClass("reader-epub-viewable-image");
  });

  it("activates SVG image resources with Enter and restores original attributes", () => {
    document.body.innerHTML = `
      <svg aria-label="Botanical plate">
        <image href="blob:epub-botanical" width="800" height="600"></image>
      </svg>
    `;
    const image = document.querySelector("image") as SVGElement;
    image.setAttribute("tabindex", "4");
    const onActivate = vi.fn();
    const cleanup = registerEpubImageBridge(document, onActivate);

    image.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));

    expect(onActivate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: "blob:epub-botanical",
        accessibleName: "Botanical plate",
        trigger: image,
      }),
    );

    cleanup();
    expect(image).toHaveAttribute("tabindex", "4");
  });

  it("ignores decorative, missing, broken, and modified-click images", () => {
    document.body.innerHTML = `
      <img id="decorative" src="blob:decorative" aria-hidden="true" />
      <img id="missing" alt="Missing source" />
      <img id="broken" src="blob:broken" alt="Broken source" />
      <img id="valid" src="blob:valid" alt="Valid source" />
    `;
    const broken = document.querySelector("#broken") as HTMLImageElement;
    const valid = document.querySelector("#valid") as HTMLImageElement;
    markImageLoaded(broken, 0, 0);
    markImageLoaded(valid, 640, 480);
    const onActivate = vi.fn();
    registerEpubImageBridge(document, onActivate);

    for (const id of ["decorative", "missing", "broken"]) {
      document
        .querySelector(`#${id}`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    }
    valid.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0, ctrlKey: true }),
    );

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("does not fetch or create replacement resources", () => {
    document.body.innerHTML = `<img src="blob:existing-resource" alt="Existing" />`;
    const image = document.querySelector("img") as HTMLImageElement;
    markImageLoaded(image, 100, 100);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(resolveEpubImageResource(image)).toMatchObject({
      sourceUrl: "blob:existing-resource",
    });
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("removes event listeners on cleanup", () => {
    document.body.innerHTML = `<img src="blob:cleanup" alt="Cleanup" />`;
    const image = document.querySelector("img") as HTMLImageElement;
    markImageLoaded(image, 100, 100);
    const onActivate = vi.fn();
    const cleanup = registerEpubImageBridge(document, onActivate);

    cleanup();
    image.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

    expect(onActivate).not.toHaveBeenCalled();
  });
});

function markImageLoaded(
  image: HTMLImageElement,
  naturalWidth: number,
  naturalHeight: number,
) {
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    currentSrc: { configurable: true, value: image.getAttribute("src") ?? "" },
    naturalHeight: { configurable: true, value: naturalHeight },
    naturalWidth: { configurable: true, value: naturalWidth },
  });
}
