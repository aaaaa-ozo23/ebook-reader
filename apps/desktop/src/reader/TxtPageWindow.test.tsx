import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TxtPageWindow } from "./TxtPageWindow";
import { getTxtSpreadStart, type TxtPage } from "./TxtPaginator";

const pages: TxtPage[] = Array.from({ length: 10 }, (_, index) => ({
  index,
  startCharOffset: index * 10,
  endCharOffset: (index + 1) * 10,
  fragments: [
    {
      id: `paragraph-${index}`,
      kind: "paragraph",
      chapterId: "chapter-1",
      chapterTitle: "Chapter 1",
      charOffset: index * 10,
      text: `page-${index}`,
      startInBlock: 0,
      endInBlock: 6,
    },
  ],
}));

describe("TXT page window", () => {
  it("mounts only previous, current, and next pages in single mode", () => {
    render(
      <TxtPageWindow
        currentPageIndex={4}
        pages={pages}
        renderFragment={(fragment) => fragment.text}
        spreadMode="single"
      />,
    );

    const window = screen.getByText("page-4").closest(".reader-txt-page-window");
    expect(window).toHaveAttribute("data-rendered-page-count", "3");
    expect(window?.querySelectorAll(".reader-txt-page")).toHaveLength(3);
    expect(window?.querySelector('[data-window-state="current"]')).not.toHaveAttribute(
      "hidden",
    );
  });

  it("mounts at most three spreads and six pages in double mode", () => {
    const renderFragment = vi.fn((fragment) => fragment.text);
    const { container } = render(
      <TxtPageWindow
        currentPageIndex={4}
        pages={pages}
        renderFragment={renderFragment}
        spreadMode="double"
      />,
    );

    expect(container.querySelector(".reader-txt-page-window")).toHaveAttribute(
      "data-rendered-page-count",
      "6",
    );
    expect(container.querySelector(".reader-txt-page-window")).toHaveAttribute(
      "data-rendered-spread-mode",
      "double",
    );
    expect(container.querySelectorAll(".reader-txt-spread")).toHaveLength(3);
    expect(container.querySelectorAll(".reader-txt-page")).toHaveLength(6);
    expect(container.querySelector('[data-spread-start="4"]')).not.toHaveAttribute(
      "hidden",
    );
    const currentPages = container.querySelectorAll(
      '[data-spread-start="4"] .reader-txt-page',
    );
    expect(currentPages).toHaveLength(2);
    expect(currentPages[0]).toHaveTextContent("page-4");
    expect(currentPages[1]).toHaveTextContent("page-5");
    expect(renderFragment).toHaveBeenCalledTimes(6);
  });

  it("aligns requested pages to spread boundaries", () => {
    expect(getTxtSpreadStart(5, "single")).toBe(5);
    expect(getTxtSpreadStart(5, "double")).toBe(4);
    expect(getTxtSpreadStart(-1, "double")).toBe(0);
  });
});
