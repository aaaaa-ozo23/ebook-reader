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

async function openFontSettings(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Reading & Fonts" }).click();
  await expect(page.getByRole("heading", { name: "Font library" })).toBeVisible();
}

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

test("keeps Reading & Fonts polished across desktop and mobile", async ({
  page,
}, testInfo) => {
  const consoleIssues = collectConsoleIssues(page);

  for (const viewport of [
    { width: 1280, height: 800, name: "desktop" },
    { width: 900, height: 720, name: "compact" },
    { width: 640, height: 720, name: "narrow" },
    { width: 375, height: 812, name: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await openFontSettings(page);

    await expect(page.getByText("App-local by design")).toBeVisible({
      visible: viewport.width > 520,
    });
    await expect(page.getByText("Applied to TXT and EPUB")).toBeVisible();
    await expect(page.getByText(/Static TTF and OTF only/)).toBeVisible();
    await expect(page.getByText(/PDF uses fonts embedded/)).toBeVisible();

    const importButton = page.getByRole("button", { name: "Import font" });
    await expect(importButton).toBeVisible();
    const importBox = await importButton.boundingBox();
    expect(importBox?.height).toBeGreaterThanOrEqual(44);

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);

    if (viewport.width === 375) {
      await expect(
        page.getByRole("main", { name: "Your type, locally." }),
      ).toBeVisible();
      for (const name of ["Back to settings", "Close settings"]) {
        const button = page.getByRole("button", { name });
        const box = await button.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        const icon = button.locator("svg");
        await expect(icon).toHaveCSS("fill", "none");
        await expect(icon).not.toHaveCSS("stroke", "none");
      }
    } else {
      await expect(page.getByRole("main", { name: "Reading & Fonts" })).toBeVisible();
    }

    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: testInfo.outputPath(`stage14-custom-fonts-${viewport.name}.png`),
    });
    await expectNoSeriousAccessibilityViolations(page);
  }

  expect(consoleIssues).toEqual([]);
});

test("uses reduced motion and restores focus from the font picker failure", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFontSettings(page);

  await expect(page.locator(".settings-shell")).toHaveCSS("animation-name", "none");
  const importButton = page.getByRole("button", { name: "Import font" });
  await importButton.click();
  await expect(page.getByRole("alert")).toContainText(
    "Custom fonts require the Tauri desktop runtime.",
  );
  await expect(importButton).toBeFocused();
  expect(consoleIssues).toEqual([]);
});
