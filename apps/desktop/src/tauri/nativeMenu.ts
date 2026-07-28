export type NativeAppAction = "import-files" | "import-folder" | "settings";

export type NativeAppActionHandler = (action: NativeAppAction) => void | Promise<void>;

export interface NativeAppActions {
  importFiles: () => void;
  importFolder: () => void;
  openSettings: () => void;
}

const NATIVE_APP_ACTION_EVENT = "native-app-action";

export function dispatchNativeAppAction(
  action: NativeAppAction,
  actions: NativeAppActions,
): void {
  if (action === "import-files") {
    actions.importFiles();
  } else if (action === "import-folder") {
    actions.importFolder();
  } else {
    actions.openSettings();
  }
}

export async function listenForNativeAppActions(
  handler: NativeAppActionHandler,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => undefined;
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<NativeAppAction>(NATIVE_APP_ACTION_EVENT, (event) => {
    void handler(event.payload);
  });
}

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
