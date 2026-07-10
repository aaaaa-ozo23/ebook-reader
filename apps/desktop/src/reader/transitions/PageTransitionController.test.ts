import { describe, expect, it, vi } from "vitest";

import {
  PageTransitionController,
  resolvePageTransitionMode,
  type PageDirection,
} from "./PageTransitionController";

describe("PageTransitionController", () => {
  it("disables only page-curl while a blocking reader surface is open", () => {
    expect(resolvePageTransitionMode("page-curl", true)).toBe("none");
    expect(resolvePageTransitionMode("page-curl", false)).toBe("page-curl");
    expect(resolvePageTransitionMode("slide", true)).toBe("slide");
    expect(resolvePageTransitionMode("none", true)).toBe("none");
  });
  it("coalesces 30 rapid inputs into the active transaction and latest pending direction", async () => {
    const navigationGate = createDeferred<void>();
    const navigations: PageDirection[] = [];
    const commits: PageDirection[] = [];
    const controller = new PageTransitionController<string>({
      animate: vi.fn(async () => undefined),
      captureCurrent: () => "current",
      captureTarget: () => "target",
      commit: (direction) => {
        commits.push(direction);
      },
      getMode: () => "slide",
      navigate: async (direction) => {
        navigations.push(direction);
        if (navigations.length === 1) {
          await navigationGate.promise;
        }
      },
      prefersReducedMotion: () => false,
    });

    const running = controller.request("next");
    for (let index = 1; index < 30; index += 1) {
      void controller.request(index % 2 === 0 ? "next" : "previous");
    }
    navigationGate.resolve();
    await running;

    expect(navigations).toEqual(["next", "previous"]);
    expect(commits).toEqual(navigations);
    expect(controller.getState()).toBe("idle");
  });

  it("commits navigation once when capture or animation fails", async () => {
    const recoverableErrors: unknown[] = [];
    const commit = vi.fn();
    const animate = vi
      .fn<(frames: unknown, mode: "slide" | "page-curl") => Promise<void>>()
      .mockRejectedValueOnce(new Error("animation failed"));
    let captureAttempt = 0;
    const controller = new PageTransitionController<string>({
      animate,
      captureCurrent: () => {
        captureAttempt += 1;
        if (captureAttempt === 1) {
          throw new Error("capture failed");
        }
        return "current";
      },
      captureTarget: () => "target",
      commit,
      getMode: () => "slide",
      navigate: async () => undefined,
      onRecoverableError: (error) => recoverableErrors.push(error),
      prefersReducedMotion: () => false,
    });

    await controller.request("next");
    await controller.request("previous");

    expect(commit).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(recoverableErrors).toHaveLength(2);
  });

  it("skips snapshots and animation for none or reduced motion", async () => {
    const capture = vi.fn(() => "snapshot");
    const animate = vi.fn(async () => undefined);
    let reducedMotion = false;
    let mode: "none" | "slide" = "none";
    const controller = new PageTransitionController<string>({
      animate,
      captureCurrent: capture,
      captureTarget: capture,
      commit: vi.fn(),
      getMode: () => mode,
      navigate: async () => undefined,
      prefersReducedMotion: () => reducedMotion,
    });

    await controller.request("next");
    mode = "slide";
    reducedMotion = true;
    await controller.request("previous");

    expect(capture).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not commit a failed real navigation and returns to idle", async () => {
    const commit = vi.fn();
    const controller = new PageTransitionController<string>({
      animate: vi.fn(async () => undefined),
      captureCurrent: () => "current",
      captureTarget: () => "target",
      commit,
      getMode: () => "slide",
      navigate: async () => {
        throw new Error("navigation failed");
      },
      prefersReducedMotion: () => false,
    });

    await expect(controller.request("next")).rejects.toThrow("navigation failed");
    expect(commit).not.toHaveBeenCalled();
    expect(controller.getState()).toBe("idle");
  });

  it("cancels the active animation and clears the pending direction", async () => {
    const animationGate = createDeferred<void>();
    const signals: AbortSignal[] = [];
    const navigations: PageDirection[] = [];
    const controller = new PageTransitionController<string>({
      animate: async (_frames, _mode, signal) => {
        signals.push(signal);
        await animationGate.promise;
      },
      captureCurrent: () => "current",
      captureTarget: () => "target",
      commit: vi.fn(),
      getMode: () => "slide",
      navigate: async (direction) => {
        navigations.push(direction);
      },
      prefersReducedMotion: () => false,
    });

    const running = controller.request("next");
    void controller.request("previous");
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    controller.cancel();
    animationGate.resolve();
    await running;

    expect(signals[0]?.aborted).toBe(true);
    expect(navigations).toEqual(["next"]);
    expect(controller.getState()).toBe("idle");
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
