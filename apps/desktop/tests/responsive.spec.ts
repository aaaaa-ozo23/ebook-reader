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
