import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("previews local MOBI conversion, drag overlay, progress, and partial DRM failure", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const callbacks = new Map<number, (value: unknown) => void>();
    const listeners = new Map<string, number[]>();
    let nextCallbackId = 1;
    const emit = (event: string, payload: unknown) => {
      for (const id of listeners.get(event) ?? []) {
        callbacks.get(id)?.({ event, id, payload });
      }
    };
    const transformCallback = (callback?: (value: unknown) => void, once = false) => {
      const id = nextCallbackId++;
      callbacks.set(id, (value) => {
        callback?.(value);
        if (once) callbacks.delete(id);
      });
      return id;
    };
    const importedBook = {
      id: "imported-mobi",
      title: "Local conversion sample",
      author: "Offline fixture",
      format: "mobi",
      sourcePath: "D:\\books\\local-sample.mobi",
      libraryPath: "D:\\library\\local-sample.mobi",
      fileHash: "local-sample-source-hash",
      readerFormat: "epub",
      readerPath: "D:\\library\\local-sample.reader.epub",
      readerHash: "local-sample-reader-hash",
      coverStatus: "pending",
      availability: "available",
      createdAt: "2026-07-20T12:00:00Z",
      updatedAt: "2026-07-20T12:00:00Z",
    };
    const invoke = async (command: string, args: Record<string, unknown> = {}) => {
      if (command === "list_books") return [];
      if (command === "take_pending_open_files") return [];
      if (command === "plugin:dialog|open") {
        return ["D:\\books\\local-sample.mobi", "D:\\books\\protected.azw3"];
      }
      if (command === "plugin:event|listen") {
        const event = String(args.event);
        const handler = Number(args.handler);
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        return handler;
      }
      if (command === "plugin:event|unlisten") {
        const event = String(args.event);
        const handler = Number(args.eventId);
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((id) => id !== handler),
        );
        return null;
      }
      if (command === "scan_import_paths") {
        return {
          operationId: args.operationId,
          truncated: false,
          items: [
            {
              path: "D:\\books\\local-sample.mobi",
              name: "local-sample.mobi",
              status: "valid",
              selected: true,
            },
            {
              path: "D:\\books\\protected.azw3",
              name: "protected.azw3",
              status: "valid",
              selected: true,
            },
          ],
        };
      }
      if (command === "import_batch") {
        emit("data-operation-progress", {
          operationId: args.operationId,
          kind: "batch-import",
          phase: "converting",
          completed: 0,
          total: 2,
          message: "Converting local-sample.mobi locally",
        });
        await new Promise((resolve) => setTimeout(resolve, 350));
        return {
          operationId: args.operationId,
          status: "completed",
          items: [
            {
              path: "D:\\books\\local-sample.mobi",
              name: "local-sample.mobi",
              status: "imported",
              book: importedBook,
            },
            {
              path: "D:\\books\\protected.azw3",
              name: "protected.azw3",
              status: "error",
              message:
                "[mobi-drm-unsupported] this ebook is DRM-protected; Ebook Reader will not remove DRM",
            },
          ],
        };
      }
      return null;
    };

    Object.assign(window, {
      __TAURI_INTERNALS__: {
        callbacks,
        convertFileSrc: (path: string) =>
          `http://asset.localhost/${encodeURIComponent(path)}`,
        invoke,
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main", windowLabel: "main" },
        },
        runCallback: (id: number, value: unknown) => callbacks.get(id)?.(value),
        transformCallback,
        unregisterCallback: (id: number) => callbacks.delete(id),
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: (_event: string, id: number) => callbacks.delete(id),
      },
      __emitStage14Event: emit,
      __hasStage14Listener: (event: string) => (listeners.get(event)?.length ?? 0) > 0,
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & {
            __hasStage14Listener: (event: string) => boolean;
          }
        ).__hasStage14Listener("tauri://drag-enter"),
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __emitStage14Event: (event: string, payload: unknown) => void;
      }
    ).__emitStage14Event("tauri://drag-enter", {
      paths: ["D:\\books\\local-sample.mobi"],
      position: { x: 320, y: 240 },
    });
  });
  await expect(page.getByText("Drop to review books")).toBeVisible();
  await expect(page.getByText("EPUB, TXT, PDF, MOBI, AZW3, or a folder")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("stage14-drop-overlay-desktop.png"),
  });
  await page.evaluate(() => {
    (
      window as typeof window & {
        __emitStage14Event: (event: string, payload: unknown) => void;
      }
    ).__emitStage14Event("tauri://drag-leave", {});
  });
  await expect(page.getByText("Drop to review books")).toBeHidden();

  await page.getByRole("button", { name: "More import options" }).click();
  await page.getByRole("menuitem", { name: "Import files" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("MOBI · Will convert locally to EPUB")).toBeVisible();
  await expect(dialog.getByText("AZW3 · Will convert locally to EPUB")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("stage14-import-preview-desktop.png"),
  });

  const violations = await new AxeBuilder({ page }).analyze();
  expect(
    violations.violations.filter(({ impact }) =>
      ["serious", "critical"].includes(impact ?? ""),
    ),
  ).toEqual([]);

  await page.setViewportSize({ width: 375, height: 760 });
  const mobileLayout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.clientWidth);
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("stage14-import-preview-mobile.png"),
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await dialog.getByRole("button", { name: "Import 2 selected" }).click();
  await expect(dialog.getByText("Converting local-sample.mobi locally")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("stage14-conversion-progress.png"),
  });
  await expect(
    dialog.getByRole("heading", { name: "Some books need attention" }),
  ).toBeVisible();
  await expect(dialog.getByText("1 of 2 imported")).toBeVisible();
  await expect(
    dialog.getByText(
      "This file is protected. Ebook Reader will not attempt to remove DRM.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("stage14-partial-drm-result.png"),
  });
});
