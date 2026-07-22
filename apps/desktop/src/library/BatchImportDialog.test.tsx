import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OperationProgress } from "@reader/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchImportDialog } from "./BatchImportDialog";
import { cancelDataOperation, listenForDataOperationProgress } from "../tauri/backup";
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
  let progressHandler: ((progress: OperationProgress) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    progressHandler = undefined;
    vi.mocked(listenForDataOperationProgress).mockImplementation(async (handler) => {
      progressHandler = handler;
      return () => undefined;
    });
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

  it("shows honest folder scan stages and reveals the preview after hashing", async () => {
    let resolveScan!: (preview: Awaited<ReturnType<typeof scanImportPaths>>) => void;
    vi.mocked(scanImportPaths).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        }),
    );

    render(
      <BatchImportDialog
        paths={["D:\\books"]}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Scanning folder" }),
    ).toBeVisible();
    await waitFor(() => expect(scanImportPaths).toHaveBeenCalledTimes(1));
    const operationId = vi.mocked(scanImportPaths).mock.calls[0]?.[0] ?? "missing";

    progressHandler?.({
      operationId,
      kind: "batch-import",
      phase: "scanning",
      completed: 0,
      total: 0,
      message: "Discovering books in selected folders",
    });
    expect(screen.getByText("Discovering books in this folder")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Importing books" })).toBeNull();

    progressHandler?.({
      operationId,
      kind: "batch-import",
      phase: "hashing",
      completed: 1,
      total: 2,
      message: "Checking nested.epub",
    });
    expect(await screen.findByText("Checking discovered books")).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();

    resolveScan({
      operationId,
      truncated: false,
      items: [
        {
          path: "D:\\books\\nested\\nested.epub",
          name: "nested.epub",
          status: "valid",
          selected: true,
        },
      ],
    });

    expect(await screen.findByText("nested.epub")).toBeVisible();
    expect(screen.getByRole("button", { name: "Import 1 selected" })).toBeEnabled();
    expect(screen.queryByText("Checking discovered books")).toBeNull();
  });

  it("cancels an active folder scan without leaving background work", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(scanImportPaths).mockImplementation(() => new Promise(() => undefined));

    render(
      <BatchImportDialog
        paths={["D:\\books"]}
        onClose={onClose}
        onImported={vi.fn()}
      />,
    );

    await waitFor(() => expect(scanImportPaths).toHaveBeenCalledTimes(1));
    const operationId = vi.mocked(scanImportPaths).mock.calls[0]?.[0];
    await user.click(screen.getByRole("button", { name: "Cancel scan" }));
    expect(cancelDataOperation).toHaveBeenCalledWith(operationId);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("explains an empty folder instead of showing a stalled scanner", async () => {
    vi.mocked(scanImportPaths).mockResolvedValue({
      operationId: "empty-scan",
      truncated: false,
      items: [],
    });

    render(
      <BatchImportDialog
        paths={["D:\\empty"]}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    expect(await screen.findByText("No supported books found")).toBeVisible();
    expect(screen.getByRole("button", { name: "Import 0 selected" })).toBeDisabled();
  });
});
