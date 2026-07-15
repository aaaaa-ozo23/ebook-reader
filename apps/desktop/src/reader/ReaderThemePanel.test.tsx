import { fireEvent, render, screen } from "@testing-library/react";
import { defaultReaderTheme, type PageTransitionMode } from "@reader/core";
import { describe, expect, it, vi } from "vitest";

import { ReaderThemePanel } from "./ReaderThemePanel";

const MODES: readonly PageTransitionMode[] = ["none", "page-curl", "cover", "slide"];

describe("ReaderThemePanel page transitions", () => {
  it("presents the four compatible modes as an accessible radio group", () => {
    renderPanel("none", vi.fn());

    expect(
      screen.getByRole("radiogroup", { name: "EPUB page transition" }),
    ).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "None" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Realistic" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Cover" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Smooth" })).toBeVisible();
  });

  it("supports arrow, Home, and End selection with roving focus", () => {
    const onChange = vi.fn();
    renderPanel("none", onChange);
    const none = screen.getByRole("radio", { name: "None" });

    none.focus();
    fireEvent.keyDown(none, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("page-curl");
    expect(screen.getByRole("radio", { name: "Realistic" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("radio", { name: "Realistic" }), {
      key: "End",
    });
    expect(onChange).toHaveBeenLastCalledWith("slide");
    expect(screen.getByRole("radio", { name: "Smooth" })).toHaveFocus();
  });

  it("presents continuous and four paginated TXT modes as peers", () => {
    const onTxtReadingModeChange = vi.fn();
    render(
      <ReaderThemePanel
        isOpen
        onClose={vi.fn()}
        theme={defaultReaderTheme}
        themeError={null}
        txtReadingMode="continuous"
        txtReadingModeOptions={["continuous", ...MODES]}
        onThemeChange={vi.fn()}
        onTxtReadingModeChange={onTxtReadingModeChange}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "TXT reading mode" });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "Cover" }));
    expect(onTxtReadingModeChange).toHaveBeenCalledWith("cover");
  });

  it("presents continuous and four paginated PDF modes as peers", () => {
    const onPdfReadingModeChange = vi.fn();
    render(
      <ReaderThemePanel
        isOpen
        onClose={vi.fn()}
        pdfReadingMode="continuous"
        pdfReadingModeOptions={["continuous", ...MODES]}
        theme={defaultReaderTheme}
        themeError={null}
        onPdfReadingModeChange={onPdfReadingModeChange}
        onThemeChange={vi.fn()}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "PDF reading mode" });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "Realistic" }));
    expect(onPdfReadingModeChange).toHaveBeenCalledWith("page-curl");
  });
});

function renderPanel(
  pageTransition: PageTransitionMode,
  onPageTransitionChange: (mode: PageTransitionMode) => void,
) {
  return render(
    <ReaderThemePanel
      isOpen
      onClose={vi.fn()}
      pageTransition={pageTransition}
      pageTransitionError={null}
      pageTransitionModes={MODES}
      theme={defaultReaderTheme}
      themeError={null}
      onPageTransitionChange={onPageTransitionChange}
      onThemeChange={vi.fn()}
    />,
  );
}
