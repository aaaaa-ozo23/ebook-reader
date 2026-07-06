import { useCallback, useState } from "react";

import "./DesignSystemFixture.css";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Modal } from "./Modal";
import { SegmentedControl } from "./SegmentedControl";
import { SliderField } from "./SliderField";
import { Toolbar } from "./Toolbar";

const VIEW_OPTIONS = [
  { label: "Grid", value: "grid" },
  { label: "List", value: "list" },
] as const;

const TRANSITION_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Slide", value: "slide" },
  { label: "Page curl", value: "page-curl" },
] as const;

export function DesignSystemFixture() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [transition, setTransition] = useState<"none" | "slide" | "page-curl">("slide");
  const [fontSize, setFontSize] = useState(18);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  return (
    <main className="design-system-fixture">
      <header className="design-system-fixture__header">
        <div>
          <p>V0.2 DESIGN SYSTEM</p>
          <h1>Ebook Reader controls</h1>
        </div>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
      </header>

      <div className="design-system-fixture__grid">
        <section className="design-system-fixture__section">
          <h2>Buttons and toolbar</h2>
          <Toolbar aria-label="Fixture actions">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Remove</Button>
            <IconButton aria-label="Bookmark" icon={<BookmarkIcon />} />
          </Toolbar>
          <Button onClick={openModal}>Open settings</Button>
        </section>

        <section className="design-system-fixture__section">
          <h2>Segmented controls</h2>
          <SegmentedControl
            label="View mode"
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
          <SegmentedControl
            label="Page transition"
            options={TRANSITION_OPTIONS}
            value={transition}
            onChange={setTransition}
          />
        </section>

        <section className="design-system-fixture__section">
          <h2>Reading themes</h2>
          <div className="design-system-fixture__themes">
            {(["light", "sepia", "green", "dark"] as const).map((theme) => (
              <div
                key={theme}
                className={`design-system-fixture__theme design-system-fixture__theme--${theme}`}
              >
                {theme}
              </div>
            ))}
          </div>
        </section>

        <section className="design-system-fixture__section">
          <h2>Slider</h2>
          <SliderField
            label="Size"
            min={14}
            max={30}
            step={1}
            value={fontSize}
            valueLabel={`${fontSize}px`}
            onChange={(event) => setFontSize(Number(event.currentTarget.value))}
          />
          <p>Focus, disabled and reduced-motion states use shared tokens.</p>
        </section>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Reading settings"
        variant="sheet"
      >
        <div className="design-system-fixture__modal-content">
          <SegmentedControl
            label="Page transition"
            options={TRANSITION_OPTIONS}
            value={transition}
            onChange={setTransition}
          />
          <Button onClick={closeModal}>Apply</Button>
        </div>
      </Modal>
    </main>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v16l-5-3-5 3V4z" />
    </svg>
  );
}
