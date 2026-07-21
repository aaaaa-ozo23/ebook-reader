import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchImportDialog } from "./BatchImportDialog";
import { importBatch, scanImportPaths } from "../tauri/batchImport";

vi.mock("../tauri/batchImport", () => ({
  importBatch: vi.fn(),
  scanImportPaths: vi.fn(),
}));
vi.mock("../tauri/backup", () => ({
  cancelDataOperation: vi.fn(),
  listenForDataOperationProgress: vi.fn(async () => () => undefined),
}));

describe("BatchImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scanImportPaths).mockResolvedValue({
      operationId: "scan",
      truncated: false,
      items: [
        {
          path: "D:\\books\\one.epub",
          name: "one.epub",
          status: "valid",
          selected: true,
        },
        {
          path: "D:\\books\\kindle.azw3",
          name: "kindle.azw3",
          status: "valid",
          selected: false,
        },
        {
          path: "D:\\books\\copy.epub",
          name: "copy.epub",
          status: "duplicate",
          selected: false,
        },
        {
          path: "D:\\books\\notes.md",
          name: "notes.md",
          status: "unsupported",
          selected: false,
        },
        {
          path: "D:\\books\\protected.mobi",
          name: "protected.mobi",
          status: "error",
          selected: false,
          message:
            "[mobi-drm-unsupported] this ebook is DRM-protected; Ebook Reader will not remove DRM",
        },
      ],
    });
    vi.mocked(importBatch).mockResolvedValue({
      operationId: "import",
      status: "completed",
      items: [],
    });
  });

  it("previews every status and imports only selected valid files", async () => {
    const user = userEvent.setup();
    render(
      <BatchImportDialog
        paths={["D:\\books"]}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    expect(await screen.findByText("one.epub")).toBeVisible();
    expect(screen.getByText("copy.epub")).toBeVisible();
    expect(screen.getByText("notes.md")).toBeVisible();
    expect(screen.getByText("AZW3 · Will convert locally to EPUB")).toBeVisible();
    expect(
      screen.getByText(
        "This file is protected. Ebook Reader will not attempt to remove DRM.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Import 1 selected" }));

    await waitFor(() => expect(importBatch).toHaveBeenCalled());
    expect(vi.mocked(importBatch).mock.calls[0]?.[1]).toEqual(["D:\\books\\one.epub"]);
    expect(await screen.findByText("Import complete")).toBeVisible();
  });
});
