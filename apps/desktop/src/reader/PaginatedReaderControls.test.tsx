import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PaginatedReaderControls } from "./PaginatedReaderControls";

describe("paginated reader controls", () => {
  it("shares the EPUB two-row page, percentage, navigation, and progress structure", () => {
    const onPageInputChange = vi.fn();
    const onPageInputCommit = vi.fn();
    const onProgressChange = vi.fn();
    const onProgressCommit = vi.fn();
    const { container } = render(
      <PaginatedReaderControls
        ariaLabel="TXT navigation"
        chapterTitle="第二章"
        isDraggingProgress
        onNext={vi.fn()}
        onPageInputChange={onPageInputChange}
        onPageInputCommit={onPageInputCommit}
        onPrevious={vi.fn()}
        onProgressChange={onProgressChange}
        onProgressCommit={onProgressCommit}
        onProgressStart={vi.fn()}
        pageFieldLabel="Page"
        pageInputAriaLabel="TXT page number"
        pageInputDisabled={false}
        pageInputMax={63}
        pageInputValue="14"
        positionLabel="Pages 13-14 / 63"
        progressAriaLabel="TXT reading progress"
        progressDisabled={false}
        progressLabel="21%"
        progressTooltip="Page 14 · 21%"
        progressValue={210}
      />,
    );

    expect(container.querySelectorAll(".reader-epub-control-row")).toHaveLength(1);
    expect(container.querySelectorAll(".reader-page-navigation")).toHaveLength(1);
    expect(container.querySelectorAll(".reader-epub-progress")).toHaveLength(1);
    expect(screen.getByText("Pages 13-14 / 63")).toBeVisible();
    expect(screen.getByText("21%")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Single" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Double" })).not.toBeInTheDocument();
    expect(container.querySelector(".reader-epub-progress")).toHaveStyle({
      "--epub-progress-percent": "21%",
    });

    const pageInput = screen.getByRole("spinbutton", { name: "TXT page number" });
    fireEvent.change(pageInput, { target: { value: "70" } });
    fireEvent.keyDown(pageInput, { key: "Enter" });
    expect(onPageInputChange).toHaveBeenCalledWith("70");
    expect(onPageInputCommit).toHaveBeenCalledTimes(1);

    const progress = screen.getByRole("slider", {
      name: "TXT reading progress",
    });
    fireEvent.change(progress, { target: { value: "750" } });
    fireEvent.pointerUp(progress);
    expect(onProgressChange).toHaveBeenCalledWith("750");
    expect(onProgressCommit).toHaveBeenCalledTimes(1);
  });
});
