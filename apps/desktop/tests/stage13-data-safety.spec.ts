import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function collectConsoleIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  return issues;
}

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

test("opens Data & Backup with safe defaults across responsive layouts", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 900, height: 720 },
    { width: 640, height: 720 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Data & Backup" })).toBeVisible();
    await expect(page.getByText("Backups are not encrypted")).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Core reading data/ }),
    ).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Book covers/ })).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Original book files/ }),
    ).not.toBeChecked();
    await expect(
      page.getByText(/Reader caches and machine-specific paths/),
    ).toBeVisible();
    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    if (viewport.width === 375) {
      await expect(page.locator(".settings-shell")).toHaveCSS("position", "fixed");
      await expect(page.getByRole("button", { name: "Back to shelf" })).toHaveCSS(
        "min-height",
        "44px",
      );
    }
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.finish();
      }
    });
    await expectNoSeriousAccessibilityViolations(page);
  }

  expect(consoleIssues).toEqual([]);
});

test("keeps focus, reduced-motion and desktop-runtime errors understandable", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByRole("button", { name: "Back to shelf" })).toBeFocused();
  await expect(page.locator(".settings-shell")).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "Choose location & export" }).click();
  await expect(page.getByRole("alert")).toContainText("Backup failed");
  await expect(page.getByRole("alert")).toContainText(
    "Backup requires the Tauri desktop runtime.",
  );
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("heading", { name: "Ebook Reader" })).toBeVisible();
  expect(consoleIssues).toEqual([]);
});
