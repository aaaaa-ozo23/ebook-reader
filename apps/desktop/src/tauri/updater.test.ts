import { describe, expect, it } from "vitest";

import { normalizeUpdaterError } from "./updater";

describe("normalizeUpdaterError", () => {
  it("preserves stable updater codes from Rust", () => {
    expect(
      normalizeUpdaterError({ code: "signature-failure", message: "bad signature" }),
    ).toEqual({ code: "signature-failure", message: "bad signature" });
  });

  it("normalizes runtime failures", () => {
    expect(normalizeUpdaterError(new Error("desktop runtime required"))).toEqual({
      code: "updater-failure",
      message: "desktop runtime required",
    });
  });
});
