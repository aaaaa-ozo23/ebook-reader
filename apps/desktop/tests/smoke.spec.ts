import { expect, test } from "@playwright/test";

test("renders the bookshelf-first desktop UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main", { name: "Ebook Reader bookshelf" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ebook Reader" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import book" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
  await expect(page.getByText("Sorted by Recent reading")).toBeVisible();
  await expect(page.getByText("Desktop shell initialized.")).toHaveCount(0);
});
