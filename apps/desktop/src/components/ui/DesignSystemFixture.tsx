import { useCallback, useEffect, useRef, useState } from "react";
import type { PageTransitionMode } from "@reader/core";

import "./DesignSystemFixture.css";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Modal } from "./Modal";
import { SegmentedControl } from "./SegmentedControl";
import { SliderField } from "./SliderField";
import { Toolbar } from "./Toolbar";
import { PageTransitionController } from "../../reader/transitions/PageTransitionController";
import {
  animateIsolatedPageTransition,
  capturePageSnapshot,
  type PageSnapshot,
} from "../../reader/transitions/PageTransitionLayer";

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
        <TransitionPrototype />
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

const PROTOTYPE_PAGES = [
  { heading: "Chapter 1", text: "A calm reading surface remains selectable and live." },
  { heading: "Chapter 2", text: "Only cloned display layers participate in motion." },
  { heading: "Chapter 3", text: "Progress is committed once after each navigation." },
] as const;

function TransitionPrototype() {
  const [pageIndex, setPageIndex] = useState(0);
  const [commitCount, setCommitCount] = useState(0);
  const [mode, setMode] = useState<PageTransitionMode>("slide");
  const [state, setState] = useState<"idle" | "running">("idle");
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const pageIndexRef = useRef(0);
  const modeRef = useRef<PageTransitionMode>("slide");
  const controllerRef = useRef<PageTransitionController<PageSnapshot> | null>(null);

  useEffect(() => {
    controllerRef.current = new PageTransitionController<PageSnapshot>({
      animate: async (frames, transitionMode) => {
        if (hostRef.current !== null) {
          await animateIsolatedPageTransition(hostRef.current, frames, transitionMode);
        }
      },
      captureCurrent: () => capturePageSnapshot(pageRef.current),
      captureTarget: () => capturePageSnapshot(pageRef.current),
      commit: () => setCommitCount((count) => count + 1),
      getMode: () => modeRef.current,
      navigate: async (direction) => {
        const delta = direction === "next" ? 1 : -1;
        const nextIndex = Math.min(
          PROTOTYPE_PAGES.length - 1,
          Math.max(0, pageIndexRef.current + delta),
        );
        pageIndexRef.current = nextIndex;
        setPageIndex(nextIndex);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      },
      onRecoverableError: (transitionError) =>
        setError(
          transitionError instanceof Error
            ? transitionError.message
            : "Transition unavailable",
        ),
      prefersReducedMotion: () =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });

    return () => {
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const navigate = useCallback((direction: "next" | "previous") => {
    const controller = controllerRef.current;
    if (controller === null) {
      return;
    }

    setState("running");
    setError(null);
    void controller
      .request(direction)
      .catch((navigationError: unknown) =>
        setError(
          navigationError instanceof Error
            ? navigationError.message
            : "Navigation unavailable",
        ),
      )
      .finally(() => setState("idle"));
  }, []);
  const page = PROTOTYPE_PAGES[pageIndex];

  return (
    <section className="design-system-fixture__section design-system-fixture__section--wide">
      <div className="design-system-fixture__prototype-header">
        <div>
          <h2>Page transition prototype</h2>
          <p data-testid="transition-state">
            {state} · Committed: {commitCount}
          </p>
        </div>
        <SegmentedControl
          label="Prototype transition"
          options={TRANSITION_OPTIONS}
          value={mode}
          onChange={setMode}
        />
      </div>
      <div ref={hostRef} className="design-system-fixture__page reader-transition-host">
        <article ref={pageRef}>
          <small>Page {pageIndex + 1}</small>
          <h3>{page.heading}</h3>
          <p>{page.text}</p>
        </article>
      </div>
      <Toolbar aria-label="Prototype navigation">
        <Button variant="secondary" onClick={() => navigate("previous")}>
          Previous
        </Button>
        <Button data-testid="transition-next" onClick={() => navigate("next")}>
          Next
        </Button>
      </Toolbar>
      {error !== null ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v16l-5-3-5 3V4z" />
    </svg>
  );
}
