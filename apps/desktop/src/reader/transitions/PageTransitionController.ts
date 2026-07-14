import type { PageTransitionMode } from "@reader/core";

export type PageDirection = "next" | "previous";
export type PageTransitionControllerState = "idle" | "running";

export interface PageTransitionFrames<TSnapshot> {
  current: TSnapshot;
  direction: PageDirection;
  target: TSnapshot;
}

export function resolvePageTransitionMode(
  mode: PageTransitionMode,
  isPageCurlBlocked: boolean,
): PageTransitionMode {
  return mode === "page-curl" && isPageCurlBlocked ? "none" : mode;
}

interface PageTransitionControllerOptions<TSnapshot> {
  animate: (
    frames: PageTransitionFrames<TSnapshot>,
    mode: Exclude<PageTransitionMode, "none">,
    signal: AbortSignal,
  ) => Promise<void>;
  captureCurrent: (signal: AbortSignal) => Promise<TSnapshot | null> | TSnapshot | null;
  captureTarget: (signal: AbortSignal) => Promise<TSnapshot | null> | TSnapshot | null;
  commit: (direction: PageDirection) => Promise<void> | void;
  getMode: () => PageTransitionMode;
  navigate: (
    direction: PageDirection,
    signal: AbortSignal,
    shouldCaptureTarget: boolean,
  ) => Promise<void>;
  onRecoverableError?: (error: unknown) => void;
  prefersReducedMotion: () => boolean;
}

export class PageTransitionController<TSnapshot> {
  private state: PageTransitionControllerState = "idle";
  private pendingDirection: PageDirection | null = null;
  private runningPromise: Promise<void> | null = null;
  private activeAbortController: AbortController | null = null;

  constructor(private readonly options: PageTransitionControllerOptions<TSnapshot>) {}

  getState(): PageTransitionControllerState {
    return this.state;
  }

  cancel(): void {
    this.pendingDirection = null;
    this.activeAbortController?.abort();
  }

  request(direction: PageDirection): Promise<void> {
    if (this.state === "running" && this.runningPromise !== null) {
      this.pendingDirection = direction;
      return this.runningPromise;
    }

    this.state = "running";
    this.runningPromise = this.drain(direction).finally(() => {
      this.pendingDirection = null;
      this.runningPromise = null;
      this.state = "idle";
    });
    return this.runningPromise;
  }

  private async drain(initialDirection: PageDirection): Promise<void> {
    let direction: PageDirection | null = initialDirection;

    while (direction !== null) {
      this.pendingDirection = null;
      await this.runTransaction(direction);
      direction = this.pendingDirection;
    }
  }

  private async runTransaction(direction: PageDirection): Promise<void> {
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    try {
      const mode = this.options.getMode();
      const canAnimate = mode !== "none" && !this.options.prefersReducedMotion();
      const current = canAnimate
        ? await this.captureSafely(this.options.captureCurrent, abortController.signal)
        : null;

      await this.options.navigate(
        direction,
        abortController.signal,
        canAnimate && current !== null,
      );

      if (canAnimate && current !== null && !abortController.signal.aborted) {
        const target = await this.captureSafely(
          this.options.captureTarget,
          abortController.signal,
        );

        if (target !== null) {
          try {
            await this.options.animate(
              { current, direction, target },
              mode as Exclude<PageTransitionMode, "none">,
              abortController.signal,
            );
          } catch (error) {
            this.options.onRecoverableError?.(error);
          }
        }
      }

      await this.options.commit(direction);
    } finally {
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }
  }

  private async captureSafely(
    capture: (signal: AbortSignal) => Promise<TSnapshot | null> | TSnapshot | null,
    signal: AbortSignal,
  ): Promise<TSnapshot | null> {
    try {
      return await capture(signal);
    } catch (error) {
      this.options.onRecoverableError?.(error);
      return null;
    }
  }
}
