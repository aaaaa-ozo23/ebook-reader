import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultReaderTheme, type CustomFont } from "@reader/core";

import { ReadingFontsSettings } from "./ReadingFontsSettings";
import {
  importCustomFont,
  inspectCustomFont,
  listCustomFonts,
  pickCustomFontFile,
  removeCustomFont,
  setCustomFontEnabled,
} from "../tauri/fonts";
import { getReaderTheme, saveReaderTheme } from "../tauri/reader";

vi.mock("../tauri/fonts", () => ({
  customFontCssFamily: (font: CustomFont) => `"${font.familyAlias}"`,
  getCustomFontAssetUrl: vi.fn(async () => "asset://font.ttf"),
  importCustomFont: vi.fn(),
  inspectCustomFont: vi.fn(),
  listCustomFonts: vi.fn(),
  pickCustomFontFile: vi.fn(),
  removeCustomFont: vi.fn(),
  setCustomFontEnabled: vi.fn(),
}));

vi.mock("../tauri/reader", () => ({
  getReaderTheme: vi.fn(),
  saveReaderTheme: vi.fn(),
}));

const customFont: CustomFont = {
  id: "font-quiet",
  familyName: "Quiet Serif",
  styleName: "Regular",
  fileName: "QuietSerif.ttf",
  filePath: "C:\\app-data\\fonts\\quiet.ttf",
  fileHash: "a".repeat(64),
  fileSize: 128_000,
  familyAlias: "EbookReaderFont_quiet",
  enabled: true,
  importedAt: "2026-07-22T00:00:00Z",
  updatedAt: "2026-07-22T00:00:00Z",
};

const listFontsMock = vi.mocked(listCustomFonts);
const getThemeMock = vi.mocked(getReaderTheme);
const saveThemeMock = vi.mocked(saveReaderTheme);
const pickFontMock = vi.mocked(pickCustomFontFile);
const inspectFontMock = vi.mocked(inspectCustomFont);
const importFontMock = vi.mocked(importCustomFont);
const enableFontMock = vi.mocked(setCustomFontEnabled);
const removeFontMock = vi.mocked(removeCustomFont);

describe("Reading & Fonts settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFontsMock.mockResolvedValue([]);
    getThemeMock.mockResolvedValue(defaultReaderTheme);
    saveThemeMock.mockImplementation(async (theme) => theme);
    pickFontMock.mockResolvedValue("C:\\fonts\\QuietSerif.ttf");
    inspectFontMock.mockResolvedValue({
      familyName: "Quiet Serif",
      styleName: "Regular",
      fileName: "QuietSerif.ttf",
      fileSize: 128_000,
    });
    importFontMock.mockResolvedValue({ status: "imported", font: customFont });
    enableFontMock.mockResolvedValue(customFont);
    removeFontMock.mockResolvedValue(undefined);
  });

  it("explains app-local storage and PDF behavior", async () => {
    render(<ReadingFontsSettings />);

    expect(await screen.findByText("App-local by design")).toBeVisible();
    expect(screen.getByText(/Nothing is installed system-wide/)).toBeVisible();
    expect(screen.getByText(/PDF uses fonts embedded in the document/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Import font/ })).toBeEnabled();
  });

  it("reviews license responsibility before importing a valid font", async () => {
    const user = userEvent.setup();
    listFontsMock.mockResolvedValueOnce([]).mockResolvedValue([customFont]);
    render(<ReadingFontsSettings />);

    await user.click(await screen.findByRole("button", { name: /Import font/ }));
    expect(
      await screen.findByRole("dialog", { name: "Review before importing" }),
    ).toBeVisible();
    expect(screen.getByText("Use fonts you have permission to use.")).toBeVisible();
    expect(screen.getByText("QuietSerif.ttf")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Import Quiet Serif" }));
    await waitFor(() =>
      expect(importFontMock).toHaveBeenCalledWith("C:\\fonts\\QuietSerif.ttf"),
    );
    expect(
      await screen.findByText("Quiet Serif is ready for TXT and EPUB."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Use" })).toBeVisible();
  });

  it("reports a duplicate without opening a second import dialog", async () => {
    const user = userEvent.setup();
    inspectFontMock.mockResolvedValue({
      familyName: "Quiet Serif",
      styleName: "Regular",
      fileName: "QuietSerif.ttf",
      fileSize: 128_000,
      duplicateFont: customFont,
    });
    render(<ReadingFontsSettings />);

    await user.click(await screen.findByRole("button", { name: /Import font/ }));
    expect(await screen.findByText(/already in your font library/)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(importFontMock).not.toHaveBeenCalled();
  });

  it("confirms removal and explains selected-font fallback", async () => {
    const user = userEvent.setup();
    listFontsMock.mockResolvedValue([customFont]);
    getThemeMock.mockResolvedValue({
      ...defaultReaderTheme,
      fontId: customFont.id,
      fontFamily: `"${customFont.familyAlias}"`,
    });
    render(<ReadingFontsSettings />);

    await user.click(await screen.findByRole("button", { name: "Remove Quiet Serif" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Remove Quiet Serif?" }),
    ).toBeVisible();
    expect(screen.getByText(/immediately return to Lora/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove and use Lora" }));
    await waitFor(() => expect(removeFontMock).toHaveBeenCalledWith(customFont.id));
  });
});
