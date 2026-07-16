import { describe, expect, it } from "vitest";

import { defaultBackupFileName } from "./backup";

describe("backup bridge", () => {
  it("uses the portable dated .erbackup file name", () => {
    expect(defaultBackupFileName(new Date("2026-07-16T10:00:00Z"))).toMatch(
      /^ebook-reader-backup-2026-07-16\.erbackup$/,
    );
  });
});
