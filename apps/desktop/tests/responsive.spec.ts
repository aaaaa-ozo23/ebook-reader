import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const acceptanceViewports = [
  { width: 1280, height: 800 },
  { width: 900, height: 640 },
  { width: 640, height: 640 },
  { width: 375, height: 760 },
];

test("keeps the bookshelf usable at every stage 6 acceptance viewport", async ({
  page,
}) => {
  const consoleIssues: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));

  for (const viewport of acceptanceViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("main", { name: "Ebook Reader bookshelf" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Import book" })).toBeVisible();

    const layout = await page.evaluate(() => ({
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));

    expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.bodyClientWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(consoleIssues).toEqual([]);
  }
});

test("renders the v0.2 design-system fixture across states and reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?fixture=design-system");

  await expect(
    page.getByRole("heading", { name: "Ebook Reader controls" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Disabled" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Slide" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Reading settings" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close Reading settings" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Open settings" })).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotionDuration = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--ds-motion-ui")
      .trim(),
  );
  expect(reducedMotionDuration).toBe("0.01ms");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  await page.setViewportSize({ width: 375, height: 760 });
  const mobileLayout = await page.evaluate(() => ({
    buttonHeights: Array.from(document.querySelectorAll("button")).map((button) =>
      Math.round(button.getBoundingClientRect().height),
    ),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.clientWidth);
  expect(mobileLayout.buttonHeights.every((height) => height >= 44)).toBe(true);
});
