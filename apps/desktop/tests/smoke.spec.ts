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

test("opens a seeded TXT reader without rendering the whole document", async ({ page }) => {
  await page.addInitScript(() => {
    const book = {
      id: "e2e-long-txt",
      title: "长篇样本",
      format: "txt",
      sourcePath: "D:\\books\\long.txt",
      libraryPath: "D:\\library\\long.txt",
      fileHash: "long-hash",
      createdAt: "2026-06-19T08:00:00.000Z",
      updatedAt: "2026-06-19T08:00:00.000Z",
    };
    const paragraphs = Array.from({ length: 240 }, (_, index) => `这是第 ${index + 1} 段正文。`);
    const text = ["第一章 长文本", ...paragraphs].join("\n");
    const document = {
      book,
      encoding: "UTF-8",
      byteLength: text.length * 2,
      charCount: text.length,
      lineCount: paragraphs.length + 1,
      chapters: [
        {
          id: "chapter-1-0",
          title: "第一章 长文本",
          startChar: 0,
          endChar: text.length,
          text,
        },
      ],
    };

    window.localStorage.setItem("reader:fallback:books", JSON.stringify([book]));
    window.localStorage.setItem(
      "reader:fallback:txtDocuments",
      JSON.stringify({
        "e2e-long-txt": document,
      }),
    );
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "长篇样本" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("main", { name: "TXT reader" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "第一章 长文本" })).toBeVisible();

  const renderedParagraphCount = await page.locator(".reader-virtual-row--paragraph").count();
  expect(renderedParagraphCount).toBeGreaterThan(0);
  expect(renderedParagraphCount).toBeLessThan(80);

  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "dark" }).click();
  await expect(page.getByRole("main", { name: "TXT reader" })).toHaveAttribute(
    "style",
    /--txt-reader-background: #171a1d/,
  );

  await page.getByRole("button", { name: "Back to shelf" }).click();
  await expect(page.getByRole("main", { name: "Ebook Reader bookshelf" })).toBeVisible();
});
