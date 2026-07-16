import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdatesSettings } from "./UpdatesSettings";

const updaterMocks = vi.hoisted(() => ({
  getUpdaterCapability: vi.fn(),
  getUpdatePreferences: vi.fn(),
  saveUpdatePreferences: vi.fn(),
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  cancelUpdateDownload: vi.fn(),
  installDownloadedUpdate: vi.fn(),
}));

vi.mock("../tauri/updater", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tauri/updater")>()),
  ...updaterMocks,
}));

describe("UpdatesSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updaterMocks.getUpdaterCapability.mockResolvedValue({
      enabled: true,
      track: "nsis",
      endpoint: "https://example.test/latest.json",
    });
    updaterMocks.getUpdatePreferences.mockResolvedValue({ dailyCheck: false });
    updaterMocks.saveUpdatePreferences.mockImplementation(async (value) => value);
  });

  it("checks, downloads, and exposes install only after verification", async () => {
    const user = userEvent.setup();
    updaterMocks.checkForUpdate.mockResolvedValue({
      status: "available",
      update: { version: "0.2.0", currentVersion: "0.1.0" },
    });
    updaterMocks.downloadUpdate.mockImplementation(async (onProgress) => {
      onProgress({ downloaded: 10, contentLength: 10 });
      return { status: "downloaded" };
    });
    render(<UpdatesSettings />);

    await user.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Version 0.2.0 is available")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Download update" }));
    expect(await screen.findByText("Downloaded and signature verified")).toBeVisible();
    expect(screen.getByRole("button", { name: "Install & exit app" })).toBeVisible();
  });

  it("keeps MSI on the manual track and disables daily checks", async () => {
    updaterMocks.getUpdaterCapability.mockResolvedValue({
      enabled: false,
      track: "msi",
      endpoint: "https://example.test/latest.json",
    });
    render(<UpdatesSettings />);
    expect(await screen.findByText("Manual updates for MSI")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Check once a day/ })).toBeDisabled();
  });
});
