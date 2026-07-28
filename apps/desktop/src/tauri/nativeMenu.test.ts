import { describe, expect, it, vi } from "vitest";

import {
  dispatchNativeAppAction,
  type NativeAppAction,
  type NativeAppActions,
} from "./nativeMenu";

describe("native macOS menu actions", () => {
  it.each([
    ["import-files", "importFiles"],
    ["import-folder", "importFolder"],
    ["settings", "openSettings"],
  ] as const)("maps %s to the existing %s behavior", (action, expectedCallback) => {
    const actions: NativeAppActions = {
      importFiles: vi.fn(),
      importFolder: vi.fn(),
      openSettings: vi.fn(),
    };

    dispatchNativeAppAction(action as NativeAppAction, actions);

    expect(actions[expectedCallback]).toHaveBeenCalledOnce();
    for (const [callbackName, callback] of Object.entries(actions)) {
      if (callbackName !== expectedCallback) {
        expect(callback).not.toHaveBeenCalled();
      }
    }
  });
});
