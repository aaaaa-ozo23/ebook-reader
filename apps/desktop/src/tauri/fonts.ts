import type {
  CustomFont,
  CustomFontPreview,
  ImportCustomFontResult,
} from "@reader/core";

const DESKTOP_RUNTIME_ERROR = "Custom fonts require the Tauri desktop runtime.";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function pickCustomFontFile(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "Static fonts", extensions: ["ttf", "otf"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function listCustomFonts(): Promise<CustomFont[]> {
  if (!hasTauriRuntime()) return [];
  return invokeCommand<CustomFont[]>("list_custom_fonts");
}

export async function importCustomFont(path: string): Promise<ImportCustomFontResult> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  return invokeCommand<ImportCustomFontResult>("import_custom_font", { path });
}

export async function inspectCustomFont(path: string): Promise<CustomFontPreview> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  return invokeCommand<CustomFontPreview>("inspect_custom_font", { path });
}

export async function setCustomFontEnabled(
  fontId: string,
  enabled: boolean,
): Promise<CustomFont> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  return invokeCommand<CustomFont>("set_custom_font_enabled", { fontId, enabled });
}

export async function removeCustomFont(fontId: string): Promise<void> {
  if (!hasTauriRuntime()) {
    throw new Error(DESKTOP_RUNTIME_ERROR);
  }
  return invokeCommand<void>("remove_custom_font", { fontId });
}

export async function getCustomFontAssetUrl(font: CustomFont): Promise<string> {
  if (!hasTauriRuntime() || /^(?:blob:|data:|https?:)/i.test(font.filePath)) {
    return font.filePath;
  }
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(font.filePath);
}

export function customFontCssFamily(font: CustomFont): string {
  return `"${font.familyAlias}"`;
}
