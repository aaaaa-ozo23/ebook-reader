import { fireEvent, render, screen } from "@testing-library/react";
import { defaultReaderTheme, type PageTransitionMode } from "@reader/core";
import { describe, expect, it, vi } from "vitest";

import { ReaderThemePanel } from "./ReaderThemePanel";

const MODES: readonly PageTransitionMode[] = ["none", "page-curl", "cover", "slide"];

describe("ReaderThemePanel page transitions", () => {
  it("uses distinct semantic controls for line, spacing, and margin presets", () => {
    const { container } = render(
      <ReaderThemePanel
        isOpen
        onClose={vi.fn()}
        theme={defaultReaderTheme}
        themeError={null}
        onThemeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "Compact line height" })).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Standard paragraph spacing" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Wide page margin" })).toBeVisible();
    expect(container.querySelectorAll(".theme-typography-glyph--line")).toHaveLength(3);
    expect(container.querySelectorAll(".theme-typography-glyph--spacing")).toHaveLength(
      3,
    );
    expect(container.querySelectorAll(".theme-typography-glyph--margin")).toHaveLength(
      3,
    );
  });
  it("uses an in-system font listbox instead of the platform select popup", () => {
    const onThemeChange = vi.fn();
    render(
      <ReaderThemePanel
        isOpen
        onClose={vi.fn()}
        theme={defaultReaderTheme}
        themeError={null}
        onThemeChange={onThemeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Lora" }));
    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.click(screen.getByRole("option", { name: "Sans" }));
    expect(onThemeChange).toHaveBeenCalledWith(
      expect.objectContaining({ fontFamily: expect.stringContaining("Inter") }),
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("restores the complete reader theme defaults", () => {
    const onThemeChange = vi.fn();
    render(
      <ReaderThemePanel
        isOpen
        onClose={vi.fn()}
        theme={{ ...defaultReaderTheme, fontSize: 26 }}
        themeError={null}
        onThemeChange={onThemeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(onThemeChange).toHaveBeenCalledWith(defaultReaderTheme);
  });

  it("presents the four compatible modes as an accessible radio group", () => {
    renderPanel("none", vi.fn());

    const transitionGroup = screen.getByRole("radiogroup", {
      name: "EPUB page transition",
    });
    expect(transitionGroup).toBeVisible();
    expect(transitionGroup.querySelectorAll('[role="radio"]')).toHaveLength(4);
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

  it("disables page view truthfully while continuous reading is active", () => {
    render(
      <ReaderThemePanel
        isOpen
        onClose={vi.fn()}
        pageViewDisabled
        pageViewDisabledMessage="Page view is not available in Continuous reading mode."
        pageViewMode="single"
        theme={defaultReaderTheme}
        themeError={null}
        onPageViewModeChange={vi.fn()}
        onThemeChange={vi.fn()}
      />,
    );

    const pageView = screen.getByRole("radiogroup", { name: "Page view" });
    expect(pageView.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "single" })).toBeDisabled();
    expect(
      screen.getByText("Page view is not available in Continuous reading mode."),
    ).toBeVisible();
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
