import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function installReadingHistoryMock(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (value: unknown) => void>();
    let nextCallbackId = 1;
    let enabled = true;
    let clearedAt: string | undefined;
    const invoke = async (command: string, args: Record<string, unknown> = {}) => {
      if (command === "list_books" || command === "take_pending_open_files") return [];
      if (command === "get_update_preferences") return { dailyCheck: false };
      if (command === "get_reading_statistics") {
        return {
          enabled,
          activeSession: false,
          todaySeconds: 2_520,
          last7DaysSeconds: 15_480,
          totalSeconds: 461_160,
          daily: [
            { date: new Date().toISOString().slice(0, 10), activeSeconds: 2_520 },
          ],
          books: [
            {
              bookId: "history-book",
              title: "历史是人民写的",
              author: "马伯庸",
              format: "mobi",
              activeSeconds: 8_040,
              sessionCount: 4,
              progress: 0.68,
              lastReadAt: new Date().toISOString(),
            },
          ],
          clearedAt,
        };
      }
      if (command === "get_reading_history_preferences") {
        return { enabled, updatedAt: new Date().toISOString(), clearedAt };
      }
      if (command === "save_reading_history_preferences") {
        enabled = Boolean(args.enabled);
        return { enabled, updatedAt: new Date().toISOString(), clearedAt };
      }
      if (command === "plugin:dialog|save") return "D:/exports/reading-history.csv";
      if (command === "export_reading_history") {
        return {
          outputPath: String(args.outputPath),
          sessionCount: 24,
          bytesWritten: 2_048,
        };
      }
      if (command === "clear_reading_history") {
        clearedAt = new Date().toISOString();
        return { enabled, updatedAt: clearedAt, clearedAt };
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
        transformCallback: (callback?: (value: unknown) => void) => {
          const id = nextCallbackId++;
          callbacks.set(id, (value) => callback?.(value));
          return id;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
      },
    });
  });
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
}

test("shows effective local Insights and restores shelf focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installReadingHistoryMock(page);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Insights", exact: true });
  await trigger.focus();
  await trigger.click();
  const insights = page.getByRole("main", { name: "Reading insights" });
  await expect(insights).toBeVisible();
  await expect(insights.getByText("Your reading, quietly remembered.")).toBeVisible();
  await expect(insights.getByText("42 min")).toBeVisible();
  await expect(insights.getByText("历史是人民写的")).toBeVisible();
  await expect(insights.getByText("MOBI · 68% complete")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({
    path: "test-results/stage14-reading-insights-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("keeps History & Privacy explicit and usable at 375px", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await installReadingHistoryMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "History & Privacy" }).click();
  await expect(page.getByRole("heading", { name: "History & Privacy" })).toBeVisible();
  await page.screenshot({
    path: "test-results/stage14-reading-history-mobile.png",
    fullPage: true,
  });
  const toggle = page.getByRole("switch", { name: "Record reading history" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Export CSV" }).click();
  await expect(page.getByText("CSV exported")).toBeVisible();
  const clearTrigger = page.getByRole("button", { name: "Clear history" });
  await clearTrigger.click();
  const dialog = page.getByRole("alertdialog", { name: "Clear all reading history?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Clear history" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(clearTrigger).toBeFocused();
  for (const control of [
    toggle,
    page.getByRole("button", { name: "Export CSV" }),
    clearTrigger,
  ]) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expectNoSeriousAccessibilityViolations(page);
});
