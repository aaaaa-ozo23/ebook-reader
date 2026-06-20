import { expect, test } from "@playwright/test";

test("renders the bookshelf-first desktop UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main", { name: "Ebook Reader bookshelf" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ebook Reader" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import book" })).toBeVisible();
  await expect(page.locator(".import-button__icon")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
  await expect(page.getByText("Sorted by Recent reading")).toBeVisible();
  await expect(page.getByText("Desktop shell initialized.")).toHaveCount(0);
});

test("removes a seeded book through the right-click actions menu", async ({ page }) => {
  await page.addInitScript(() => {
    const book = {
      id: "e2e-remove-book",
      title: "右键移除样本",
      format: "txt",
      sourcePath: "D:\\books\\remove.txt",
      libraryPath: "D:\\library\\remove.txt",
      fileHash: "remove-hash",
      createdAt: "2026-06-19T08:00:00.000Z",
      updatedAt: "2026-06-19T08:00:00.000Z",
    };

    window.localStorage.setItem("reader:fallback:books", JSON.stringify([book]));
  });

  await page.goto("/");

  const card = page.getByRole("article", { name: "右键移除样本 book" });
  await expect(card).toBeVisible();
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from shelf" }).click();
  await expect(page.getByRole("alertdialog", { name: "Remove from shelf?" })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(card).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
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
    const firstParagraphs = Array.from(
      { length: 120 },
      (_, index) => `第一章第 ${index + 1} 段正文。`,
    );
    const secondParagraphs = Array.from(
      { length: 120 },
      (_, index) => `第二章第 ${index + 1} 段正文。`,
    );
    const thirdParagraphs = Array.from(
      { length: 120 },
      (_, index) => `第三章第 ${index + 1} 段正文。`,
    );
    const firstText = ["第一章 长文本", ...firstParagraphs].join("\n");
    const secondText = ["第二章 远行", ...secondParagraphs].join("\n");
    const thirdText = ["第三章 归来", ...thirdParagraphs].join("\n");
    const text = `${firstText}\n${secondText}\n${thirdText}`;
    const secondStart = firstText.length + 1;
    const thirdStart = firstText.length + secondText.length + 2;
    const document = {
      book,
      encoding: "UTF-8",
      byteLength: text.length * 2,
      charCount: text.length,
      lineCount: firstParagraphs.length + secondParagraphs.length + thirdParagraphs.length + 3,
      chapters: [
        {
          id: "chapter-1-0",
          title: "第一章 长文本",
          startChar: 0,
          endChar: secondStart - 1,
          text: firstText,
        },
        {
          id: `chapter-2-${secondStart}`,
          title: "第二章 远行",
          startChar: secondStart,
          endChar: thirdStart - 1,
          text: secondText,
        },
        {
          id: `chapter-3-${thirdStart}`,
          title: "第三章 归来",
          startChar: thirdStart,
          endChar: text.length,
          text: thirdText,
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
  await expect(page.locator(".reader-viewport")).toHaveCSS("scroll-behavior", "auto");

  const renderedParagraphCount = await page.locator(".reader-virtual-row--paragraph").count();
  expect(renderedParagraphCount).toBeGreaterThan(0);
  expect(renderedParagraphCount).toBeLessThan(80);

  await page.getByRole("button", { name: "第三章 归来" }).click();
  await expect(page.getByRole("button", { name: "第三章 归来" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await expect(page.getByRole("heading", { name: "第三章 归来" })).toBeVisible();

  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "dark" }).click();
  await expect(page.getByRole("main", { name: "TXT reader" })).toHaveAttribute(
    "style",
    /--txt-reader-background: #171a1d/,
  );
  await expect(page.getByRole("main", { name: "TXT reader" })).toHaveAttribute(
    "style",
    /--txt-reader-heading: #f0e8d7/,
  );

  await page.locator(".reader-viewport").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(page.getByRole("button", { name: "第三章 归来" })).toHaveAttribute(
    "aria-current",
    "location",
  );

  await page.getByRole("button", { name: "Back to shelf" }).click();
  await expect(page.getByRole("main", { name: "Ebook Reader bookshelf" })).toBeVisible();
});
