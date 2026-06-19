import { expect, test } from "@playwright/test";

test("renders the desktop shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Ebook Reader" })).toBeVisible();
  await expect(page.getByText("Desktop shell initialized.")).toBeVisible();
});
