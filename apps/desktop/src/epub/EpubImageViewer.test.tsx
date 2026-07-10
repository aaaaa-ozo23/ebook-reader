import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EpubImageViewer } from "./EpubImageViewer";
import type { EpubImageResource } from "./EpubImageBridge";
import {
  calculateFitScale,
  clampImagePan,
  clampZoomPercent,
} from "./EpubImageViewerModel";

describe("EpubImageViewer", () => {
  it("renders approved viewer controls and supports zoom commands", async () => {
    const user = userEvent.setup();
    render(<EpubImageViewer isOpen onClose={vi.fn()} resource={createResource()} />);

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Dog rose plate" })).toBeVisible();
    expect(screen.getByText("Botanical illustration")).toBeVisible();
    expect(screen.getByRole("button", { name: "Fit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "100%" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Image zoom" })).toHaveValue("100");

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeVisible();

    fireEvent.change(screen.getByRole("slider", { name: "Image zoom" }), {
      target: { value: "300" },
    });
    expect(screen.getByText("300%")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "Fit" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("supports wheel and keyboard zoom and closes with Escape", () => {
    const onClose = vi.fn();
    render(<EpubImageViewer isOpen onClose={onClose} resource={createResource()} />);
    const stage = screen.getByRole("region", { name: /Zoomed image/ });

    fireEvent.wheel(stage, { clientX: 300, clientY: 200, deltaY: -1 });
    expect(screen.getByText("125%")).toBeVisible();
    fireEvent.keyDown(document, { key: "+" });
    expect(screen.getByText("150%")).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calculates fit, zoom, and bounded pan deterministically", () => {
    expect(
      calculateFitScale({ width: 1200, height: 800 }, { width: 600, height: 500 }),
    ).toBe(0.5);
    expect(
      calculateFitScale({ width: 300, height: 200 }, { width: 600, height: 500 }),
    ).toBe(1);
    expect(clampZoomPercent(75)).toBe(100);
    expect(clampZoomPercent(800)).toBe(500);
    expect(
      clampImagePan(
        { x: 900, y: -900 },
        { width: 1000, height: 800 },
        { width: 600, height: 400 },
        2,
      ),
    ).toEqual({ x: 700, y: -600 });
  });
});

function createResource(): EpubImageResource {
  const trigger = document.createElement("img");
  document.body.append(trigger);
  return {
    sourceUrl: "blob:dog-rose",
    accessibleName: "Dog rose plate",
    description: "Botanical illustration",
    naturalWidth: 1200,
    naturalHeight: 800,
    trigger,
  };
}
