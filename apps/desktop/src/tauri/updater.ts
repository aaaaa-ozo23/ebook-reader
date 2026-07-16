import type {
  UpdateActionResult,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdatePreferences,
  UpdaterCapability,
} from "@reader/core";

export interface UpdaterCommandError {
  code: string;
  message: string;
}

type NativeDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | {
      event: "Progress";
      data: { chunkLength: number; downloaded: number; contentLength?: number };
    }
  | { event: "Finished" };

export async function getUpdaterCapability(): Promise<UpdaterCapability> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdaterCapability>("updater_capability");
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateCheckResult>("check_for_update");
}

export async function downloadUpdate(
  onProgress: (progress: UpdateDownloadProgress) => void,
): Promise<UpdateActionResult> {
  const { Channel, invoke } = await import("@tauri-apps/api/core");
  const onEvent = new Channel<NativeDownloadEvent>();
  onEvent.onmessage = (event) => {
    if (event.event === "Started") {
      onProgress({ downloaded: 0, contentLength: event.data.contentLength });
    } else if (event.event === "Progress") {
      onProgress({
        downloaded: event.data.downloaded,
        contentLength: event.data.contentLength,
      });
    }
  };
  return invoke<UpdateActionResult>("download_update", { onEvent });
}

export async function cancelUpdateDownload(): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("cancel_update_download");
}

export async function installDownloadedUpdate(): Promise<UpdateActionResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateActionResult>("install_downloaded_update");
}

export async function getUpdatePreferences(): Promise<UpdatePreferences> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdatePreferences>("get_update_preferences");
}

export async function saveUpdatePreferences(
  preferences: UpdatePreferences,
): Promise<UpdatePreferences> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdatePreferences>("save_update_preferences", { preferences });
}

export function normalizeUpdaterError(error: unknown): UpdaterCommandError {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === "string" && typeof record.message === "string") {
      return { code: record.code, message: record.message };
    }
  }
  return {
    code: "updater-failure",
    message: error instanceof Error ? error.message : String(error),
  };
}
