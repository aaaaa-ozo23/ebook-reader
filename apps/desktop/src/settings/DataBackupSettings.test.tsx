import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperationProgress } from "@reader/core";

import { SettingsCenter } from "./DataBackupSettings";
import {
  cancelDataOperation,
  exportBackup,
  inspectBackup,
  listenForDataOperationProgress,
  pickBackupDestination,
  pickBackupFile,
  restoreBackup,
} from "../tauri/backup";

vi.mock("../tauri/backup", () => ({
  cancelDataOperation: vi.fn(),
  exportBackup: vi.fn(),
  inspectBackup: vi.fn(),
  listenForDataOperationProgress: vi.fn(),
  pickBackupDestination: vi.fn(),
  pickBackupFile: vi.fn(),
  restoreBackup: vi.fn(),
}));

const pickBackupDestinationMock = vi.mocked(pickBackupDestination);
const exportBackupMock = vi.mocked(exportBackup);
const inspectBackupMock = vi.mocked(inspectBackup);
const pickBackupFileMock = vi.mocked(pickBackupFile);
const restoreBackupMock = vi.mocked(restoreBackup);
const cancelDataOperationMock = vi.mocked(cancelDataOperation);
const listenForProgressMock = vi.mocked(listenForDataOperationProgress);

describe("Data & Backup settings", () => {
  let progressHandler: ((progress: OperationProgress) => void) | undefined;

  beforeEach(() => {
    progressHandler = undefined;
    vi.clearAllMocks();
    listenForProgressMock.mockImplementation(async (handler) => {
      progressHandler = handler;
      return () => undefined;
    });
    pickBackupDestinationMock.mockResolvedValue("C:\\backup\\library.erbackup");
    exportBackupMock.mockResolvedValue({
      operationId: "backup-test",
      status: "completed",
      outputPath: "C:\\backup\\library.erbackup",
      fileName: "library.erbackup",
      bytesWritten: 2048,
    });
    cancelDataOperationMock.mockResolvedValue(true);
    pickBackupFileMock.mockResolvedValue("C:\\backup\\library.erbackup");
    inspectBackupMock.mockResolvedValue({
      operationId: "restore-inspect",
      fileName: "library.erbackup",
      archiveBytes: 4096,
      warnings: [],
      newBooks: 2,
      matchedBooks: 3,
      missingFiles: 1,
      conflictRecords: 4,
      canRestore: true,
      manifest: {
        formatIdentifier: "ebook-reader-backup",
        formatVersion: 1,
        appVersion: "0.1.0",
        schemaVersion: 4,
        exportedAt: "2026-07-16T08:00:00Z",
        options: { includeData: true, includeCovers: true, includeBooks: false },
        recordCounts: {},
        payloads: [],
      },
    });
    restoreBackupMock.mockResolvedValue({
      operationId: "restore",
      status: "completed",
      counts: {
        restored: 2,
        merged: 3,
        "local-kept": 1,
        "missing-file": 1,
        skipped: 0,
        failed: 0,
      },
      items: [
        {
          category: "book",
          id: "book-1",
          label: "Pride and Prejudice",
          status: "missing-file",
          message: "File needed; reading data was retained",
        },
      ],
    });
  });

  it("uses the locked safe defaults and explains the unencrypted archive", () => {
    render(<SettingsCenter onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Data & Backup" })).toBeVisible();
    expect(screen.getByText("Backups are not encrypted")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Core reading data/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Core reading data/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Book covers/ })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Original book files/ }),
    ).not.toBeChecked();
  });

  it("exports with the selected options and reports completion", async () => {
    const user = userEvent.setup();
    render(<SettingsCenter onClose={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /Original book files/ }));
    await user.click(screen.getByRole("button", { name: /Choose location & export/ }));

    await waitFor(() => expect(exportBackupMock).toHaveBeenCalledTimes(1));
    expect(exportBackupMock.mock.calls[0]?.[2]).toEqual({
      includeData: true,
      includeCovers: true,
      includeBooks: true,
    });
    expect(await screen.findByText("Backup complete")).toBeVisible();
    expect(screen.getByText(/library\.erbackup · 2\.0 KB/)).toBeVisible();
  });

  it("surfaces operation progress and requests cancellation", async () => {
    let resolveExport:
      | ((value: Awaited<ReturnType<typeof exportBackup>>) => void)
      | undefined;
    exportBackupMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<SettingsCenter onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Choose location & export/ }));
    await waitFor(() => expect(exportBackupMock).toHaveBeenCalled());
    const operationId = exportBackupMock.mock.calls[0]?.[0] ?? "missing";
    progressHandler?.({
      operationId,
      kind: "backup-export",
      phase: "writing",
      completed: 2,
      total: 4,
      message: "Writing managed files",
    });

    expect(await screen.findByText("50%")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelDataOperationMock).toHaveBeenCalledWith(operationId);
    resolveExport?.({ operationId, status: "canceled", bytesWritten: 0 });
  });

  it("previews conflicts before confirmation and reports every outcome", async () => {
    const user = userEvent.setup();
    const onLibraryChanged = vi.fn();
    render(<SettingsCenter onClose={vi.fn()} onLibraryChanged={onLibraryChanged} />);

    await user.click(screen.getByRole("button", { name: "Choose backup" }));
    expect(await screen.findByText("Safe to restore")).toBeVisible();
    expect(screen.getByText("Files needed")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();
    expect(restoreBackupMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Confirm & restore/ }));
    expect(await screen.findByText("Restore complete")).toBeVisible();
    expect(screen.getByText("Pride and Prejudice")).toBeVisible();
    expect(screen.getAllByText("missing-file")).toHaveLength(2);
    expect(onLibraryChanged).toHaveBeenCalledTimes(1);
  });

  it("keeps a rejected archive out of the confirmation state", async () => {
    inspectBackupMock.mockRejectedValueOnce(
      "[checksum-mismatch] payload data.json failed SHA-256 verification",
    );
    const user = userEvent.setup();
    render(<SettingsCenter onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Choose backup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "payload data.json failed SHA-256 verification",
    );
    expect(
      screen.queryByRole("button", { name: /Confirm & restore/ }),
    ).not.toBeInTheDocument();
  });
});
