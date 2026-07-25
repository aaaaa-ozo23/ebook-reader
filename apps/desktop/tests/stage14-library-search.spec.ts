import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const installLibrarySearchMock = async (page: Page) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (value: unknown) => void>();
    const listeners = new Map<string, number[]>();
    let nextCallbackId = 1;
    const transformCallback = (callback?: (value: unknown) => void, once = false) => {
      const id = nextCallbackId++;
      callbacks.set(id, (value) => {
        callback?.(value);
        if (once) callbacks.delete(id);
      });
      return id;
    };
    const invoke = async (command: string, args: Record<string, unknown> = {}) => {
      if (command === "list_books" || command === "take_pending_open_files") return [];
      if (command === "get_library_search_status") {
        return {
          state: "ready",
          totalBooks: 3,
          indexedBooks: 3,
          pendingBooks: 0,
          failedBooks: 0,
          noTextBooks: 0,
        };
      }
      if (command === "search_library") {
        const query = String(args.query ?? "");
        return {
          query,
          truncated: false,
          hits: [
            {
              id: "metadata-1",
              bookId: "book-1",
              title: "历史是人民写的",
              author: "马伯庸",
              format: "mobi",
              readerFormat: "epub",
              availability: "missing",
              excerpt: "历史是人民写的",
              excerptMatchStart: 3,
              excerptMatchEnd: 7,
              locationLabel: "Title",
              target: { kind: "metadata" },
            },
            {
              id: "epub-1",
              bookId: "book-1",
              title: "历史是人民写的",
              author: "马伯庸",
              format: "mobi",
              readerFormat: "epub",
              availability: "available",
              excerpt: "序章里说，历史是人民写的，也由每一个普通人保存。",
              excerptMatchStart: 8,
              excerptMatchEnd: 12,
              locationLabel: "Chapter 1 · Location 27",
              target: {
                kind: "epub",
                href: "chapter-1.xhtml",
                charOffset: 8,
                matchIndex: 0,
              },
            },
            {
              id: "pdf-1",
              bookId: "book-2",
              title: "Multilingual typography",
              author: "Local fixture",
              format: "pdf",
              readerFormat: "pdf",
              availability: "available",
              excerpt: "Un café déjà vu apparaît entre deux fragments de texte.",
              excerptMatchStart: 3,
              excerptMatchEnd: 7,
              locationLabel: "Page 18",
              target: { kind: "pdf", page: 18, charOffset: 3, matchIndex: 0 },
            },
          ],
        };
      }
      if (command === "plugin:event|listen") {
        const event = String(args.event);
        const handler = Number(args.handler);
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        return handler;
      }
      if (command === "plugin:event|unlisten") return null;
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
    });
  });
};

test("opens multilingual library search, filters results, and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installLibrarySearchMock(page);
  await page.goto("/");

  const navigation = page.getByRole("complementary", { name: "Library navigation" });
  const searchTrigger = navigation.getByRole("button", { name: "Search", exact: true });
  await searchTrigger.focus();
  await searchTrigger.click();

  const searchPage = page.getByRole("main", { name: "Library search" });
  await expect(searchPage).toBeVisible();
  const input = searchPage.getByRole("textbox", { name: "Search the entire library" });
  await expect(input).toBeFocused();
  await input.fill("人民写的");
  await searchPage.locator("form").getByRole("button", { name: "Search" }).click();

  await expect(
    searchPage.getByText("历史是人民写的", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    searchPage.locator("mark", { hasText: "人民写的" }).first(),
  ).toBeVisible();
  await expect(
    searchPage.getByText("Un café déjà vu apparaît", { exact: false }),
  ).toBeVisible();
  await expect(searchPage.getByText("File needed", { exact: true })).toBeVisible();
  await expect(
    searchPage.getByText("3 matches in 2 books", { exact: false }),
  ).toBeVisible();

  const highlightColor = await searchPage
    .locator("mark")
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(highlightColor).toBe("rgba(80, 186, 179, 0.22)");

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
  await expect(searchTrigger).toBeFocused();
});

test("mobile library search has 44px controls, no overflow, and no serious axe issues", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installLibrarySearchMock(page);
  await page.goto("/");
  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
  await page.keyboard.press("Control+Shift+F");

  const searchPage = page.getByRole("main", { name: "Library search" });
  const input = searchPage.getByRole("textbox", { name: "Search the entire library" });
  await input.fill("人民写的");
  await input.press("Enter");
  await expect(
    searchPage.getByText("历史是人民写的", { exact: true }).first(),
  ).toBeVisible();

  for (const name of ["All", "Titles", "Book text"]) {
    const control = searchPage.getByRole("button", { name, exact: true });
    await expect(control).toHaveCSS("min-height", "44px");
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await searchPage.getByRole("button", { name: "Titles", exact: true }).click();
  await expect(
    searchPage.getByText("马伯庸 · 1 matches", { exact: true }),
  ).toBeVisible();
  await expect(searchPage.getByText("File needed", { exact: true })).toBeVisible();
  await expect(
    searchPage.getByText("Chapter 1 · Location 27", { exact: true }),
  ).toHaveCount(0);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
