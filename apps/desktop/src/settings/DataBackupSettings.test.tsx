import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperationProgress } from "@reader/core";

import { SettingsCenter } from "./DataBackupSettings";
import {
  cancelDataOperation,
  exportBackup,
  listenForDataOperationProgress,
  pickBackupDestination,
} from "../tauri/backup";

vi.mock("../tauri/backup", () => ({
  cancelDataOperation: vi.fn(),
  exportBackup: vi.fn(),
  listenForDataOperationProgress: vi.fn(),
  pickBackupDestination: vi.fn(),
}));

const pickBackupDestinationMock = vi.mocked(pickBackupDestination);
const exportBackupMock = vi.mocked(exportBackup);
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
});
