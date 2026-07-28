import { describe, expect, it } from "vitest";

import { hasPrimaryModifier } from "./platform";

describe("desktop platform shortcuts", () => {
  it("uses Command on macOS and Control elsewhere", () => {
    expect(hasPrimaryModifier({ ctrlKey: true, metaKey: false }, "control")).toBe(true);
    expect(hasPrimaryModifier({ ctrlKey: false, metaKey: true }, "control")).toBe(
      false,
    );
    expect(hasPrimaryModifier({ ctrlKey: false, metaKey: true }, "meta")).toBe(true);
    expect(hasPrimaryModifier({ ctrlKey: true, metaKey: false }, "meta")).toBe(false);
  });
});
