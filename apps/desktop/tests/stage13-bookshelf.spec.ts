import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const desktopScreenshot = "D:\\tl-temp\\ebook-reader-stage13-13.1-grid.png";
const listScreenshot = "D:\\tl-temp\\ebook-reader-stage13-13.1-list.png";
const mobileScreenshot = "D:\\tl-temp\\ebook-reader-stage13-13.1-mobile.png";

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

async function seedApprovedShelf(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const cover = (title: string, background: string, accent: string) => {
      const words = title.split(" ");
      const splitAt = Math.ceil(words.length / 2);
      const firstLine = words.slice(0, splitAt).join(" ");
      const secondLine = words.slice(splitAt).join(" ");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="${background}"/><circle cx="315" cy="135" r="110" fill="${accent}" opacity=".18"/><path d="M0 410 C105 330 205 520 400 365 V600 H0Z" fill="${accent}" opacity=".38"/><path d="M0 470 C130 390 270 560 400 450" fill="none" stroke="#fff" opacity=".24" stroke-width="3"/><text x="200" y="240" text-anchor="middle" fill="#fff" font-family="Georgia" font-size="31" letter-spacing="3">${firstLine}</text><text x="200" y="282" text-anchor="middle" fill="#fff" font-family="Georgia" font-size="31" letter-spacing="3">${secondLine}</text><text x="200" y="525" text-anchor="middle" fill="#fff" opacity=".85" font-family="Arial" font-size="18" letter-spacing="4">EBOOK READER</text></svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };
    const base = {
      coverStatus: "ready",
      updatedAt: "2026-07-16T08:00:00.000Z",
    };
    const createdHours = ["05", "05", "05", "07", "05", "04"];
    const recentHours = ["10", "09", "08", null, "06", null];
    const books = [
      [
        "beyond",
        "Beyond the Horizon",
        "Elena Maris",
        "epub",
        "#315f6b",
        "#d4aa65",
        true,
      ],
      ["grove", "The Gilded Grove", "Maya Linden", "epub", "#174e45", "#d4a84b", true],
      ["river", "River of Shadows", "Julian North", "epub", "#17384c", "#4e8ca2", true],
      [
        "clock",
        "The Clockmaker's Daughter",
        "Lucas Fenton",
        "txt",
        "#152d40",
        "#c99746",
        false,
      ],
      [
        "willow",
        "Letters to Willow",
        "Sophie Harlow",
        "pdf",
        "#95a88b",
        "#eee1be",
        true,
      ],
      [
        "winter",
        "Winter at Pine Hollow",
        "Daniel Keats",
        "epub",
        "#738b92",
        "#d8e0dd",
        false,
      ],
    ].map(([id, title, author, format, background, accent, recent], index) => ({
      ...base,
      id,
      title,
      author,
      format,
      sourcePath: `D:\\books\\${id}.${format}`,
      libraryPath: `D:\\library\\${id}.${format}`,
      fileHash: `hash-${id}`,
      coverPath: cover(String(title), String(background), String(accent)),
      createdAt: `2026-07-16T${createdHours[index]}:00:00.000Z`,
      lastOpenedAt: recent ? `2026-07-16T${recentHours[index]}:00:00.000Z` : undefined,
    }));
    const progress = Object.fromEntries(
      [
        ["beyond", 0.72],
        ["grove", 0.48],
        ["river", 0.36],
        ["clock", 0.19],
        ["willow", 0.85],
        ["winter", 1],
      ].map(([bookId, value]) => [
        bookId,
        {
          bookId,
          locator: { kind: "txt", offset: 0 },
          progress: value,
          updatedAt: "2026-07-16T08:00:00.000Z",
        },
      ]),
    );
    window.localStorage.setItem("reader:fallback:books", JSON.stringify(books));
    window.localStorage.setItem(
      "reader:fallback:readingProgress",
      JSON.stringify(progress),
    );
  });
}

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

test("matches the approved 13.1 desktop grid and list interaction contract", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  await seedApprovedShelf(page);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/");

  const shelf = page.getByRole("region", { name: "Library books" });
  const cards = shelf.getByRole("article");
  await expect(cards).toHaveCount(6);
  await cards.evaluateAll((elements) => {
    for (const animation of elements.flatMap((element) => element.getAnimations())) {
      animation.finish();
    }
  });
  await expect(page.getByText("6 books", { exact: true })).toBeVisible();
  await expect(cards.first().getByText("72% read")).toBeVisible();
  await expect(cards.last().getByText("Finished")).toBeVisible();
  await expect(page.getByRole("button", { name: "Grid" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const gridGeometry = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
      };
    }),
  );
  expect(new Set(gridGeometry.map(({ x }) => x)).size).toBe(3);
  expect(new Set(gridGeometry.map(({ y }) => y)).size).toBe(2);
  expect(gridGeometry.every(({ width }) => width >= 390)).toBe(true);
  expect(
    await page
      .locator(".library-rail")
      .evaluate((rail) => rail.getBoundingClientRect().width),
  ).toBe(106);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1536);
  await expectNoSeriousAccessibilityViolations(page);

  if (process.env.READER_VISUAL_QA === "1") {
    await page.screenshot({ path: desktopScreenshot, animations: "disabled" });
  }

  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const firstCover = cards.first().locator(".book-card__cover");
  await expect(firstCover).toHaveCSS("width", "70px");
  await expect(firstCover).toHaveCSS("height", "105px");

  await page
    .getByRole("article", { name: "The Gilded Grove book" })
    .getByRole("button", { name: /More actions/ })
    .click();
  const menu = page.getByRole("menu", { name: "Actions for The Gilded Grove" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open" })).toBeFocused();
  await menu.getByRole("menuitem", { name: "Remove from shelf" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Remove from shelf?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Recent" }).click();
  await expect(cards).toHaveCount(4);
  await page.getByRole("button", { name: "Shelf" }).click();
  await expect(cards).toHaveCount(6);
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });

  if (process.env.READER_VISUAL_QA === "1") {
    await page.screenshot({ path: listScreenshot, animations: "disabled" });
  }
  expect(consoleIssues).toEqual([]);
});

test("matches the approved 900, 640 and 375 responsive bookshelf layouts", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  await seedApprovedShelf(page);

  for (const viewport of [
    { width: 900, height: 640, columns: 3, railVisible: true },
    { width: 640, height: 640, columns: 2, railVisible: true },
    { width: 375, height: 760, columns: 3, railVisible: false },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const cards = page
      .getByRole("region", { name: "Library books" })
      .getByRole("article");
    await expect(cards).toHaveCount(6);
    await cards.evaluateAll((elements) => {
      for (const animation of elements.flatMap((element) => element.getAnimations())) {
        animation.finish();
      }
    });
    if (viewport.railVisible) {
      await expect(page.locator(".library-rail")).toBeVisible();
    } else {
      await expect(page.locator(".library-rail")).toBeHidden();
    }
    const xPositions = await cards.evaluateAll((elements) =>
      elements
        .slice(0, 3)
        .map((element) => Math.round(element.getBoundingClientRect().x)),
    );
    expect(new Set(xPositions).size).toBe(viewport.columns);
    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    if (viewport.width === 375) {
      const undersizedTargets = await page
        .locator("button:visible")
        .evaluateAll((buttons) =>
          buttons
            .map((button) => ({
              height: Math.round(button.getBoundingClientRect().height),
              label: button.getAttribute("aria-label") ?? button.textContent?.trim(),
            }))
            .filter(({ height }) => height < 44),
        );
      expect(undersizedTargets).toEqual([]);
      await expect(
        cards.first().getByRole("button", { name: /More actions/ }),
      ).toBeHidden();
      if (process.env.READER_VISUAL_QA === "1") {
        await page.screenshot({ path: mobileScreenshot, animations: "disabled" });
      }
    }
  }

  await expectNoSeriousAccessibilityViolations(page);
  expect(consoleIssues).toEqual([]);
});

test("keeps 13.1 motion calm and deterministic for reduced-motion users", async ({
  page,
}) => {
  await seedApprovedShelf(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const firstCard = page.getByRole("article").first();
  await expect(firstCard).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
