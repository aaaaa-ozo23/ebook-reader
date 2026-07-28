import type { DesktopPlatformCapabilities } from "@reader/core";

export const fallbackDesktopPlatformCapabilities: DesktopPlatformCapabilities = {
  platform: "windows",
  architecture: "x86_64",
  primaryModifier: "control",
  supportedFormats: ["epub", "txt", "pdf", "mobi", "azw3"],
  distributionTrack: "nsis",
};

export async function getDesktopPlatformCapabilities(): Promise<DesktopPlatformCapabilities> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DesktopPlatformCapabilities>("get_desktop_platform_capabilities");
}

export function hasPrimaryModifier(
  event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">,
  primaryModifier: DesktopPlatformCapabilities["primaryModifier"],
): boolean {
  return primaryModifier === "meta" ? event.metaKey : event.ctrlKey;
}
