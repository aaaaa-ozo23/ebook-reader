import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import { Modal } from "./Modal";
import { SegmentedControl } from "./SegmentedControl";
import { SliderField } from "./SliderField";

const VIEW_OPTIONS = [
  { label: "Grid", value: "grid" },
  { label: "List", value: "list" },
] as const;

describe("design system controls", () => {
  it("renders explicit button variants and disabled state", () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="danger" disabled>
          Remove
        </Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Primary" })).toHaveClass(
      "ui-button--primary",
    );
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("changes segmented values with click and arrow keys", async () => {
    const user = userEvent.setup();
    render(<SegmentedHarness />);

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("traps modal focus, closes on Escape and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const trigger = screen.getByRole("button", { name: "Open settings" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Reading settings" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close Reading settings" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("exposes a labeled range and current value", () => {
    const handleChange = vi.fn();
    render(
      <SliderField
        label="Size"
        min={14}
        max={30}
        step={1}
        value={18}
        valueLabel="18px"
        onChange={handleChange}
      />,
    );

    expect(screen.getByText("18px")).toBeVisible();
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), {
      target: { value: "19" },
    });
    expect(handleChange).toHaveBeenCalled();
  });
});

function SegmentedHarness() {
  const [value, setValue] = useState<"grid" | "list">("grid");
  return (
    <SegmentedControl
      label="View mode"
      options={VIEW_OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

function ModalHarness() {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <Button onClick={open}>Open settings</Button>
      <Modal isOpen={isOpen} onClose={close} title="Reading settings">
        <Button onClick={close}>Apply</Button>
      </Modal>
    </>
  );
}
