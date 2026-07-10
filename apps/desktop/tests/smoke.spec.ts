import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function collectConsoleIssues(page: Page): string[] {
  const issues: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  return issues;
}

async function readEpubLocationState(
  page: Page,
): Promise<{ currentLocation: number; totalLocations: number }> {
  const input = page.getByRole("spinbutton", { name: "EPUB location number" });
  const currentLocation = Number(await input.inputValue());
  const fieldText = await input.locator("xpath=..").textContent();
  const match = fieldText?.match(/\/\s+(\d+)/);

  if (!Number.isFinite(currentLocation) || match === undefined || match === null) {
    throw new Error(`Unable to read EPUB location state from: ${fieldText ?? ""}`);
  }

  return {
    currentLocation,
    totalLocations: Number(match[1]),
  };
}

async function captureTransitionKeyframes(
  page: Page,
  mode: "slide" | "cover" | "page-curl",
  duration: number,
): Promise<boolean> {
  if (process.env.READER_VISUAL_QA !== "1") return true;

  const layer = page.locator(`.reader-transition-layer[data-mode="${mode}"]`);
  try {
    await layer.waitFor({ state: "visible", timeout: 800 });
  } catch {
    return false;
  }

  for (const fraction of [0.25, 0.5, 0.75]) {
    await page.evaluate(
      ({ currentTime }) => {
        const animations = document.getAnimations().filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return (
            target instanceof Element &&
            target.closest(".reader-transition-layer") !== null
          );
        });

        for (const animation of animations) {
          animation.pause();
          animation.currentTime = currentTime;
        }
      },
      { currentTime: duration * fraction },
    );
    await page.screenshot({
      path: `D:\\tl-temp\\ebook-reader-stage10x-${mode}-${Math.round(fraction * 100)}.png`,
    });
  }

  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (
        target instanceof Element &&
        target.closest(".reader-transition-layer") !== null
      ) {
        animation.play();
      }
    }
  });
  return true;
}

async function expectNoSeriousAccessibilityViolations(
  page: Page,
  consoleIssues?: string[],
): Promise<void> {
  const issueCountBeforeAxe = consoleIssues?.length ?? 0;
  const results = await new AxeBuilder({ page }).setLegacyMode().analyze();
  const violations = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  expect(violations).toEqual([]);

  if (consoleIssues !== undefined) {
    const axeDiagnostics = consoleIssues
      .slice(issueCountBeforeAxe)
      .filter((issue) =>
        issue.includes(
          "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed",
        ),
      );

    for (const diagnostic of axeDiagnostics) {
      consoleIssues.splice(consoleIssues.indexOf(diagnostic), 1);
    }
  }
}

test("renders the bookshelf-first desktop UI", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ebook Reader" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import book" })).toBeVisible();
  await expect(page.locator(".import-button__icon")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Your library is empty" }),
  ).toBeVisible();
  await expect(page.getByText("Sorted by Recent reading")).toBeVisible();
  await expect(page.getByText("Desktop shell initialized.")).toHaveCount(0);
  const shelfResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(shelfResources.some((resource) => resource.includes("ReaderShell"))).toBe(
    false,
  );
  expect(shelfResources.some((resource) => resource.includes("epubjs"))).toBe(false);
  expect(
    shelfResources.some((resource) => resource.includes("pdfjs-dist/build/pdf.mjs")),
  ).toBe(false);
  await expectNoSeriousAccessibilityViolations(page);
});

test("shows the complete default-cover title in list view", async ({ page }) => {
  const title =
    "很长的中文书名与 A Deliberately Long English Book Title Rendered Above the Shared Cover Background";
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "reader:fallback:books",
      JSON.stringify([
        {
          id: "e2e-default-cover",
          title:
            "很长的中文书名与 A Deliberately Long English Book Title Rendered Above the Shared Cover Background",
          format: "txt",
          libraryPath: "D:\\library\\default-cover.txt",
          fileHash: "default-cover-hash",
          coverStatus: "fallback",
          createdAt: "2026-06-29T08:00:00.000Z",
          updatedAt: "2026-06-29T08:00:00.000Z",
        },
      ]),
    );
  });

  await page.goto("/");

  await page.getByRole("button", { name: "List" }).click();
  const card = page.getByRole("article", { name: `${title} book` });
  const cover = page.locator(".book-card__cover");
  const coverShell = card.locator(".book-card__cover-shell");
  const fullTitle = card.locator(".book-card__cover-title-popover");
  const cardBeforeHover = await card.boundingBox();

  await expect(cover.locator(".book-card__cover-title")).toHaveText(title);
  await expect(cover).toHaveCSS("background-image", /default-book-cover/);
  await expect(fullTitle).toBeHidden();
  await coverShell.hover();
  await expect(fullTitle).toBeVisible();
  await expect(fullTitle).toHaveText(title);
  await expect(card.locator(".book-card__body h2")).toHaveCSS("visibility", "hidden");
  await expect(fullTitle).toHaveCSS("white-space", "normal");
  await expect(fullTitle).toHaveCSS("overflow-wrap", "anywhere");

  const coverBox = await cover.boundingBox();
  const cardAfterHover = await card.boundingBox();
  expect(coverBox?.width).toBe(82);
  expect(coverBox?.height).toBe(123);
  expect(cardAfterHover?.height).toBe(cardBeforeHover?.height);
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
  await expect(
    page.getByRole("alertdialog", { name: "Remove from shelf?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(card).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your library is empty" }),
  ).toBeVisible();
});

test("opens a seeded TXT reader without rendering the whole document", async ({
  page,
}) => {
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
      lineCount:
        firstParagraphs.length + secondParagraphs.length + thirdParagraphs.length + 3,
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
  const txtResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(txtResources.some((resource) => resource.includes("epubjs"))).toBe(false);
  expect(
    txtResources.some((resource) => resource.includes("pdfjs-dist/build/pdf.mjs")),
  ).toBe(false);
  await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "第一章 长文本" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await expect(page.locator(".reader-viewport")).toHaveCSS("scroll-behavior", "auto");

  const renderedParagraphCount = await page
    .locator(".reader-virtual-row--paragraph")
    .count();
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
  await page.getByRole("button", { name: "Theme" }).click();

  const contentsResizer = page.getByRole("separator", {
    name: "Resize contents panel",
  });
  const resizerBox = await contentsResizer.boundingBox();
  expect(resizerBox).not.toBeNull();
  await page.mouse.move(
    (resizerBox?.x ?? 0) + (resizerBox?.width ?? 0) / 2,
    (resizerBox?.y ?? 0) + (resizerBox?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    (resizerBox?.x ?? 0) + (resizerBox?.width ?? 0) / 2 + 109,
    (resizerBox?.y ?? 0) + (resizerBox?.height ?? 0) / 2,
  );
  await page.mouse.up();
  await expect(page.getByRole("main", { name: "TXT reader" })).toHaveAttribute(
    "style",
    /--reader-sidebar-width: 401px/,
  );
  await expect(contentsResizer).toHaveAttribute("aria-valuenow", "401");
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("main", { name: "TXT reader" })).toHaveAttribute(
    "style",
    /--reader-sidebar-width: 401px/,
  );
  const firstTocItem = page.getByRole("button", { name: "第一章 长文本" });
  await expect(firstTocItem).toHaveCSS("white-space", "nowrap");
  await expect(firstTocItem).toHaveCSS("text-overflow", "ellipsis");

  await page.locator(".reader-viewport").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(page.getByRole("button", { name: "第三章 归来" })).toHaveAttribute(
    "aria-current",
    "location",
  );

  await page.setViewportSize({ width: 900, height: 640 });
  await expect(page.locator(".reader-sidebar")).toHaveCSS("width", "401px");

  await page.setViewportSize({ width: 899, height: 640 });
  const mediumSidebar = await page.locator(".reader-sidebar").boundingBox();
  expect(mediumSidebar?.width).toBeLessThanOrEqual(899 * 0.4);

  await page.setViewportSize({ width: 640, height: 640 });
  await expect(page.locator(".reader-sidebar")).toHaveCSS("position", "fixed");
  await expect(contentsResizer).toBeHidden();

  await page.setViewportSize({ width: 375, height: 760 });
  await expect(page.locator(".reader-sidebar")).toHaveCSS("position", "fixed");
  await expect(contentsResizer).toBeHidden();
  const narrowLayout = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".reader-sidebar");
    const main = document.querySelector<HTMLElement>(".reader-main");

    return {
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      mainLeft: main?.getBoundingClientRect().left ?? -1,
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(narrowLayout.bodyScrollWidth).toBe(narrowLayout.bodyClientWidth);
  expect(narrowLayout.mainLeft).toBe(0);
  expect(narrowLayout.sidebarWidth).toBeLessThanOrEqual(360);
  await page.locator(".reader-sidebar__close").click();
  await expect(page.locator(".reader-sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Contents" }).click();
  await expect(page.locator(".reader-sidebar")).toBeVisible();

  await page.getByRole("button", { name: "Back to shelf" }).click();
  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
});

test("opens a generated EPUB reader and uses contents and theme controls", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const consoleIssues = collectConsoleIssues(page);

  await page.addInitScript(() => {
    const encoder = new TextEncoder();
    const book = {
      id: "e2e-minimal-epub",
      title: "Minimal EPUB",
      format: "epub",
      sourcePath: "D:\\books\\minimal.epub",
      libraryPath: "D:\\library\\minimal.epub",
      fileHash: "minimal-epub-hash",
      createdAt: "2026-06-20T08:00:00.000Z",
      updatedAt: "2026-06-20T08:00:00.000Z",
    };
    const chapterOneParagraphs = Array.from(
      { length: 80 },
      (_, index) =>
        `<p>Chapter one generated reading sample paragraph ${index + 1}. This public domain test text gives epub locations enough material for synthetic page calculation.</p>`,
    ).join("");
    const chapterTwoParagraphs = Array.from(
      { length: 80 },
      (_, index) =>
        `<p>Chapter two generated reading sample paragraph ${index + 1}. This second section verifies progress dragging, table-of-contents syncing, and text selection.</p>`,
    ).join("");
    const entries = [
      {
        name: "mimetype",
        content: "application/epub+zip",
      },
      {
        name: "META-INF/container.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      },
      {
        name: "OPS/package.opf",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:e2e-minimal-epub</dc:identifier>
    <dc:title>Minimal EPUB</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-06-20T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>
    <item id="plate" href="plate.svg" media-type="image/svg+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter-one"/>
    <itemref idref="chapter-two"/>
  </spine>
</package>`,
      },
      {
        name: "OPS/nav.xhtml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <ol>
        <li><a href="chapter-one.xhtml">Chapter One</a></li>
        <li><a href="chapter-two.xhtml">Chapter Two</a></li>
      </ol>
    </nav>
    <nav epub:type="page-list" id="pages">
      <ol>
        <li><a href="chapter-one.xhtml">i</a></li>
        <li><a href="chapter-two.xhtml#page-10">10</a></li>
      </ol>
    </nav>
  </body>
</html>`,
      },
      {
        name: "OPS/chapter-one.xhtml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter One</title></head>
  <body>
    <h1 id="page-i">Chapter One</h1>
    <figure>
      <img src="plate.svg" alt="Botanical test plate" title="Generated illustration" style="display:block;width:360px;max-width:90%;margin:1rem auto" />
      <figcaption>Botanical illustration fixture</figcaption>
    </figure>
    ${chapterOneParagraphs}
  </body>
</html>`,
      },
      {
        name: "OPS/plate.svg",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#f7f1e3"/>
  <path d="M410 520C390 400 420 260 510 90" fill="none" stroke="#405a38" stroke-width="18"/>
  <g fill="#d98f9a" stroke="#8d5962" stroke-width="5">
    <ellipse cx="510" cy="150" rx="95" ry="52" transform="rotate(-18 510 150)"/>
    <ellipse cx="515" cy="150" rx="95" ry="52" transform="rotate(54 515 150)"/>
    <ellipse cx="515" cy="150" rx="95" ry="52" transform="rotate(126 515 150)"/>
    <ellipse cx="510" cy="150" rx="95" ry="52" transform="rotate(198 510 150)"/>
    <ellipse cx="510" cy="150" rx="95" ry="52" transform="rotate(270 510 150)"/>
  </g>
  <circle cx="510" cy="150" r="38" fill="#d8b256"/>
  <g fill="#66805b" stroke="#405a38" stroke-width="4">
    <ellipse cx="365" cy="350" rx="105" ry="42" transform="rotate(24 365 350)"/>
    <ellipse cx="510" cy="305" rx="110" ry="44" transform="rotate(-28 510 305)"/>
  </g>
  <text x="36" y="554" font-family="Georgia, serif" font-size="30" fill="#463e32">Plate IV — Rosa canina</text>
</svg>`,
      },
      {
        name: "OPS/chapter-two.xhtml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter Two</title></head>
  <body>
    <h1 id="page-10">Chapter Two</h1>
    ${chapterTwoParagraphs}
  </body>
</html>`,
      },
    ];

    function writeUint16(target: Uint8Array, offset: number, value: number): void {
      target[offset] = value & 0xff;
      target[offset + 1] = (value >>> 8) & 0xff;
    }

    function writeUint32(target: Uint8Array, offset: number, value: number): void {
      target[offset] = value & 0xff;
      target[offset + 1] = (value >>> 8) & 0xff;
      target[offset + 2] = (value >>> 16) & 0xff;
      target[offset + 3] = (value >>> 24) & 0xff;
    }

    function crc32(bytes: Uint8Array): number {
      let crc = 0xffffffff;

      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
          crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
      }

      return (crc ^ 0xffffffff) >>> 0;
    }

    function createStoredZipUrl(): string {
      const localParts: Uint8Array[] = [];
      const centralParts: Uint8Array[] = [];
      let offset = 0;

      for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const dataBytes = encoder.encode(entry.content);
        const checksum = crc32(dataBytes);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        writeUint32(localHeader, 0, 0x04034b50);
        writeUint16(localHeader, 4, 20);
        writeUint16(localHeader, 8, 0);
        writeUint32(localHeader, 14, checksum);
        writeUint32(localHeader, 18, dataBytes.length);
        writeUint32(localHeader, 22, dataBytes.length);
        writeUint16(localHeader, 26, nameBytes.length);
        localHeader.set(nameBytes, 30);
        localParts.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        writeUint32(centralHeader, 0, 0x02014b50);
        writeUint16(centralHeader, 4, 20);
        writeUint16(centralHeader, 6, 20);
        writeUint16(centralHeader, 10, 0);
        writeUint32(centralHeader, 16, checksum);
        writeUint32(centralHeader, 20, dataBytes.length);
        writeUint32(centralHeader, 24, dataBytes.length);
        writeUint16(centralHeader, 28, nameBytes.length);
        writeUint32(centralHeader, 42, offset);
        centralHeader.set(nameBytes, 46);
        centralParts.push(centralHeader);

        offset += localHeader.length + dataBytes.length;
      }

      const centralStart = offset;
      const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
      const endRecord = new Uint8Array(22);
      writeUint32(endRecord, 0, 0x06054b50);
      writeUint16(endRecord, 8, entries.length);
      writeUint16(endRecord, 10, entries.length);
      writeUint32(endRecord, 12, centralSize);
      writeUint32(endRecord, 16, centralStart);

      const zipBytes = new Uint8Array(offset + centralSize + endRecord.length);
      let cursor = 0;
      for (const part of [...localParts, ...centralParts, endRecord]) {
        zipBytes.set(part, cursor);
        cursor += part.length;
      }

      return URL.createObjectURL(
        new Blob([zipBytes], { type: "application/epub+zip" }),
      );
    }

    window.localStorage.setItem("reader:fallback:books", JSON.stringify([book]));
    window.localStorage.setItem(
      "reader:fallback:epubSources",
      JSON.stringify({
        "e2e-minimal-epub": createStoredZipUrl(),
      }),
    );
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Minimal EPUB" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  const reader = page.getByRole("main", { name: "EPUB reader" });
  await expect(reader).toBeVisible();
  await expect(page.locator(".reader-epub-host iframe")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Chapter One" })).toBeVisible();

  const progressSlider = page.getByRole("slider", { name: "EPUB reading progress" });
  const epubLocationInput = page.getByRole("spinbutton", {
    name: "EPUB location number",
  });
  await expect(progressSlider).toBeEnabled({
    timeout: 20000,
  });
  await expect(epubLocationInput).toBeEnabled();
  await expect(page.getByText("Page i").first()).toBeVisible();

  await page.evaluate(() => {
    const transitionModes: string[] = [];
    Object.assign(window, { __readerTransitionModes: transitionModes });
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof HTMLElement &&
            node.classList.contains("reader-transition-layer")
          ) {
            transitionModes.push(node.dataset.mode ?? "unknown");
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  const initialTransitionLocation = await epubLocationInput.inputValue();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(epubLocationInput).not.toHaveValue(initialTransitionLocation);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __readerTransitionModes?: string[] })
          .__readerTransitionModes ?? [],
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(epubLocationInput).toHaveValue(initialTransitionLocation);

  await page.getByRole("button", { name: "Theme" }).click();
  const transitionSettings = page.getByRole("radiogroup", {
    name: "EPUB page transition",
  });
  await expect(transitionSettings).toBeVisible();
  await expect(transitionSettings.getByRole("radio")).toHaveCount(4);
  await expect(transitionSettings.getByRole("radio", { name: "None" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  if (process.env.READER_VISUAL_QA === "1") {
    await page.screenshot({
      path: "D:\\tl-temp\\ebook-reader-stage10x-transition-settings-desktop.png",
    });
  }
  await transitionSettings.getByRole("radio", { name: "Smooth" }).click();
  await page.getByRole("button", { name: "Theme" }).click();
  await page.evaluate(() => {
    const state = window as typeof window & { __readerTransitionModes?: string[] };
    if (state.__readerTransitionModes !== undefined) {
      state.__readerTransitionModes.length = 0;
    }
  });
  await page.getByRole("button", { name: "Next" }).click();
  expect(await captureTransitionKeyframes(page, "slide", 280)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __readerTransitionModes?: string[] })
            .__readerTransitionModes ?? [],
      ),
    )
    .toContain("slide");
  await expect(page.locator(".reader-transition-layer")).toHaveCount(0);
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(epubLocationInput).toHaveValue(initialTransitionLocation);
  await expect(page.locator(".reader-transition-layer")).toHaveCount(0);

  await page.getByRole("button", { name: "Theme" }).click();
  await transitionSettings.getByRole("radio", { name: "Cover" }).click();
  await expect(
    transitionSettings.getByRole("radio", { name: "Cover" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Theme" }).click();
  await page.evaluate(() => {
    const state = window as typeof window & { __readerTransitionModes?: string[] };
    if (state.__readerTransitionModes !== undefined) {
      state.__readerTransitionModes.length = 0;
    }
  });
  await page.getByRole("button", { name: "Next" }).click();
  expect(await captureTransitionKeyframes(page, "cover", 320)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __readerTransitionModes?: string[] })
            .__readerTransitionModes ?? [],
      ),
    )
    .toContain("cover");
  await expect(page.locator(".reader-transition-layer")).toHaveCount(0);
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(epubLocationInput).toHaveValue(initialTransitionLocation);
  await expect(page.locator(".reader-transition-layer")).toHaveCount(0);

  await expect(
    page
      .frameLocator('.reader-epub-host iframe[title="Chapter One content"]')
      .getByRole("heading", { name: "Chapter One" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Theme" }).click();
  await transitionSettings.getByRole("radio", { name: "Realistic" }).click();
  await expect(
    transitionSettings.getByRole("radio", { name: "Realistic" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Theme" }).click();
  await expect(page.locator(".reader-viewport--epub")).toHaveAttribute(
    "data-page-transition",
    "page-curl",
  );
  await expect(page.locator(".reader-viewport--epub")).toHaveAttribute(
    "data-page-curl-blocked",
    "false",
  );
  let pageCurlVerified = false;
  for (let attempt = 0; attempt < 3 && !pageCurlVerified; attempt += 1) {
    await page.evaluate(() => {
      const state = window as typeof window & {
        __readerTransitionModes?: string[];
      };
      if (state.__readerTransitionModes !== undefined) {
        state.__readerTransitionModes.length = 0;
      }
    });
    await page.getByRole("button", { name: "Next" }).click();
    const captured = await captureTransitionKeyframes(page, "page-curl", 650);
    await expect(epubLocationInput).not.toHaveValue(initialTransitionLocation);
    await expect(page.locator(".reader-transition-layer")).toHaveCount(0);
    const observed = await page.evaluate(
      () =>
        (
          window as typeof window & { __readerTransitionModes?: string[] }
        ).__readerTransitionModes?.includes("page-curl") === true,
    );
    pageCurlVerified = observed && captured;

    if (!pageCurlVerified) {
      await page.getByRole("button", { name: "Previous" }).click();
      await expect(epubLocationInput).toHaveValue(initialTransitionLocation);
      await expect(page.locator(".reader-transition-layer")).toHaveCount(0);
    }
  }
  expect(pageCurlVerified).toBe(true);
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(epubLocationInput).toHaveValue(initialTransitionLocation);
  await expect(page.locator(".reader-transition-layer")).toHaveCount(0);

  const reducedMotionStartLocation = await epubLocationInput.inputValue();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const state = window as typeof window & { __readerTransitionModes?: string[] };
    if (state.__readerTransitionModes !== undefined) {
      state.__readerTransitionModes.length = 0;
    }
  });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(epubLocationInput).not.toHaveValue(reducedMotionStartLocation);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __readerTransitionModes?: string[] })
          .__readerTransitionModes ?? [],
    ),
  ).toEqual([]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(epubLocationInput).toHaveValue(reducedMotionStartLocation);
  await expect(page.locator(".reader-transition-layer")).toHaveCount(0);

  const imageFrame = page.frameLocator(".reader-epub-host iframe");
  const viewableImage = imageFrame.getByRole("button", {
    name: "Botanical test plate",
  });
  await expect(viewableImage).toBeVisible();
  await viewableImage.click();
  const imageDialog = page.getByRole("dialog");
  await expect(imageDialog).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Botanical test plate" }),
  ).toBeVisible();
  const locationBeforeBlockedNavigation = await epubLocationInput.inputValue();
  await page.evaluate(() => {
    const state = window as typeof window & { __readerTransitionModes?: string[] };
    if (state.__readerTransitionModes !== undefined) {
      state.__readerTransitionModes.length = 0;
    }
  });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(550);
  await expect(epubLocationInput).toHaveValue(locationBeforeBlockedNavigation);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __readerTransitionModes?: string[] })
          .__readerTransitionModes ?? [],
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("125%")).toBeVisible();
  const imageStage = page.getByRole("region", {
    name: "Zoomed image: Botanical test plate",
  });
  const imageStageBox = await imageStage.boundingBox();
  expect(imageStageBox).not.toBeNull();
  if (imageStageBox !== null) {
    await page.mouse.move(
      imageStageBox.x + imageStageBox.width / 2,
      imageStageBox.y + imageStageBox.height / 2,
    );
    await page.mouse.wheel(0, -100);
    await expect(page.getByText("150%")).toBeVisible();
    const initialPan = await page
      .locator(".epub-image-viewer__image-shell")
      .evaluate((element) => element.getAttribute("style"));
    await page.mouse.down();
    await page.mouse.move(
      imageStageBox.x + imageStageBox.width / 2 + 70,
      imageStageBox.y + imageStageBox.height / 2 + 40,
    );
    await page.mouse.up();
    await expect
      .poll(() =>
        page
          .locator(".epub-image-viewer__image-shell")
          .evaluate((element) => element.getAttribute("style")),
      )
      .not.toBe(initialPan);
  }
  if (process.env.READER_VISUAL_QA === "1") {
    await page.screenshot({
      path: "D:\\tl-temp\\ebook-reader-stage10-image-viewer-desktop.png",
    });
  }
  await page.keyboard.press("Escape");
  await expect(imageDialog).toBeHidden();
  await expect
    .poll(() =>
      viewableImage.evaluate((image) => image.ownerDocument.activeElement === image),
    )
    .toBe(true);

  const initialEpubLocationState = await readEpubLocationState(page);
  const targetEpubLocation = Math.min(
    initialEpubLocationState.totalLocations,
    Math.max(2, Math.ceil(initialEpubLocationState.totalLocations / 3)),
  );
  await epubLocationInput.fill(String(targetEpubLocation));
  await epubLocationInput.press("Enter");
  await expect(epubLocationInput).toHaveValue(String(targetEpubLocation));

  await page.getByRole("button", { name: "Chapter Two" }).click();
  await expect(page.getByRole("button", { name: "Chapter Two" })).toHaveAttribute(
    "aria-current",
    "location",
  );

  const beforeSliderValue = Number(await progressSlider.inputValue());
  const sliderBox = await progressSlider.boundingBox();
  expect(sliderBox).not.toBeNull();

  if (sliderBox !== null) {
    await page.mouse.move(
      sliderBox.x + sliderBox.width * 0.72,
      sliderBox.y + sliderBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      sliderBox.x + sliderBox.width * 0.82,
      sliderBox.y + sliderBox.height / 2,
    );
    await expect(page.locator(".reader-epub-progress__tooltip")).toContainText(
      /Page (?:i|10)/,
    );
    await page.mouse.up();
  }

  await expect
    .poll(async () => Number(await progressSlider.inputValue()))
    .toBeGreaterThan(beforeSliderValue);

  const { totalLocations } = await readEpubLocationState(page);
  expect(totalLocations).toBeGreaterThan(2);

  const penultimateSliderValue = Math.round(
    ((totalLocations - 2.5) / (totalLocations - 1)) * 1000,
  );
  await progressSlider.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    valueSetter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, penultimateSliderValue);
  await expect(epubLocationInput).toHaveValue(String(totalLocations - 1));

  await page.getByRole("button", { name: "Next" }).click();
  await expect(epubLocationInput).toHaveValue(String(totalLocations));
  await expect(page.getByText("100%").first()).toBeVisible();

  await page.getByRole("button", { name: "Double" }).click();
  await expect(page.getByRole("button", { name: "Double" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".reader-epub-host iframe")).toBeVisible();

  const epubIframe = page.locator(".reader-epub-host iframe");
  const epubFrame = await (await epubIframe.elementHandle())?.contentFrame();
  expect(epubFrame).not.toBeNull();

  if (epubFrame !== null) {
    const selectedText = await epubFrame.evaluate(() => {
      const paragraph = Array.from(document.querySelectorAll("p")).find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const frameRect = window.frameElement?.getBoundingClientRect();

        if (frameRect === undefined) {
          return false;
        }

        const globalLeft = frameRect.left + rect.left;
        const globalRight = frameRect.left + rect.right;
        const globalTop = frameRect.top + rect.top;
        const globalBottom = frameRect.top + rect.bottom;

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          globalLeft >= 0 &&
          globalTop >= 0 &&
          globalRight <= window.parent.innerWidth &&
          globalBottom <= window.parent.innerHeight
        );
      });
      const textNode = paragraph?.firstChild;
      const selection = window.getSelection();

      if (textNode === null || textNode === undefined || selection === null) {
        return "";
      }

      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(24, textNode.textContent?.length ?? 0));
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    });
    expect(selectedText.length).toBeGreaterThan(0);

    const selectionMenu = page.locator(".reader-selection-menu");
    await expect(selectionMenu).toBeVisible();
    const selectionAnchor = await epubIframe.evaluate((iframe) => {
      const frame = (iframe as HTMLIFrameElement).getBoundingClientRect();
      const selection = (iframe as HTMLIFrameElement).contentWindow?.getSelection();
      const rangeRect = selection?.rangeCount
        ? selection.getRangeAt(0).getClientRects()[0]
        : undefined;

      return rangeRect
        ? {
            left: frame.left + rangeRect.left,
            top: frame.top + rangeRect.top,
            width: rangeRect.width,
          }
        : null;
    });
    const menuRect = await selectionMenu.boundingBox();
    expect(selectionAnchor).not.toBeNull();
    expect(menuRect).not.toBeNull();

    if (selectionAnchor !== null && menuRect !== null) {
      const menuGap = selectionAnchor.top - (menuRect.y + menuRect.height);
      expect(menuGap).toBeGreaterThanOrEqual(4);
      expect(menuGap).toBeLessThanOrEqual(10);
      expect(
        Math.abs(
          selectionAnchor.left +
            selectionAnchor.width / 2 -
            (menuRect.x + menuRect.width / 2),
        ),
      ).toBeLessThanOrEqual(2);
    }

    await selectionMenu.getByRole("button", { name: "Note" }).click();
    const noteEditor = page.locator(".reader-note-editor");
    await expect(noteEditor).toBeVisible();
    await noteEditor.locator("textarea").fill("EPUB annotation note");
    await noteEditor.getByRole("button", { name: "Save" }).click();

    const noteUnderline = page.locator("g.reader-epub-note-underline");
    await expect(noteUnderline).toHaveCount(1);
    const underlineStyles = await noteUnderline.evaluate((element) => {
      return {
        lineDashes: Array.from(element.querySelectorAll("line")).map(
          (line) => window.getComputedStyle(line).strokeDasharray,
        ),
        lineStrokes: Array.from(element.querySelectorAll("line")).map(
          (line) => window.getComputedStyle(line).stroke,
        ),
        rectStrokes: Array.from(element.querySelectorAll("rect")).map(
          (rect) => window.getComputedStyle(rect).stroke,
        ),
      };
    });
    expect(underlineStyles.rectStrokes.length).toBeGreaterThan(0);
    expect(underlineStyles.rectStrokes.every((stroke) => stroke === "none")).toBe(true);
    expect(underlineStyles.lineStrokes.length).toBeGreaterThan(0);
    expect(underlineStyles.lineStrokes.every((stroke) => stroke !== "none")).toBe(true);
    expect(underlineStyles.lineDashes.every((dash) => dash !== "none")).toBe(true);
  }

  await page.getByRole("button", { name: "Chapter One" }).click();
  await expect(viewableImage).toBeVisible();
  for (const mode of ["light", "sepia", "green", "dark"]) {
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("button", { name: mode }).click();
    await expect(reader).toHaveAttribute("data-reader-theme", mode);
    await viewableImage.click();
    await expect(imageDialog).toBeVisible();

    if (mode !== "dark") {
      await page.keyboard.press("Escape");
      await expect(imageDialog).toBeHidden();
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page
        .locator(".epub-image-viewer__image-shell img")
        .evaluate(
          (image) =>
            Number.parseFloat(getComputedStyle(image).transitionDuration) <= 0.00001,
        ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 375, height: 760 });
  await expect(imageDialog).toHaveCSS("width", "375px");
  const mobileViewerLayout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    buttonHeights: Array.from(
      document.querySelectorAll(".epub-image-viewer-modal button"),
    ).map((button) => Math.round(button.getBoundingClientRect().height)),
    closeRight:
      document
        .querySelector<HTMLButtonElement>(
          '.epub-image-viewer-modal button[aria-label="Close image viewer"]',
        )
        ?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
    footerRight:
      document
        .querySelector<HTMLElement>(".epub-image-viewer__footer")
        ?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
    modalRight:
      document
        .querySelector<HTMLElement>(".epub-image-viewer-modal")
        ?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
    panHintRight:
      document
        .querySelector<HTMLElement>(".epub-image-viewer__pan-hint")
        ?.getBoundingClientRect().right ?? 0,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(mobileViewerLayout.bodyWidth).toBeLessThanOrEqual(
    mobileViewerLayout.viewportWidth,
  );
  expect(mobileViewerLayout.buttonHeights.every((height) => height >= 44)).toBe(true);
  expect(mobileViewerLayout.modalRight).toBeLessThanOrEqual(
    mobileViewerLayout.viewportWidth,
  );
  expect(mobileViewerLayout.closeRight).toBeLessThanOrEqual(
    mobileViewerLayout.viewportWidth,
  );
  expect(mobileViewerLayout.footerRight).toBeLessThanOrEqual(
    mobileViewerLayout.viewportWidth,
  );
  expect(mobileViewerLayout.panHintRight).toBeLessThanOrEqual(
    mobileViewerLayout.viewportWidth,
  );
  if (process.env.READER_VISUAL_QA === "1") {
    await page.screenshot({
      path: "D:\\tl-temp\\ebook-reader-stage10-image-viewer-mobile.png",
    });
  }
  await page.keyboard.press("Escape");
  await expect(imageDialog).toBeHidden();
  await expect(page.locator(".reader-epub-host")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Contents" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("button", { name: "Theme" }).click();
  const mobileTransitionSettings = page.getByRole("radiogroup", {
    name: "EPUB page transition",
  });
  await expect(mobileTransitionSettings).toBeVisible();
  const mobileTransitionLayout = await page.evaluate(() => ({
    cardHeights: Array.from(
      document.querySelectorAll<HTMLButtonElement>(".reader-transition-option"),
    ).map((button) => Math.round(button.getBoundingClientRect().height)),
    panelRight:
      document
        .querySelector<HTMLElement>(".reader-theme-panel")
        ?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(mobileTransitionLayout.cardHeights).toHaveLength(4);
  expect(mobileTransitionLayout.cardHeights.every((height) => height >= 44)).toBe(true);
  expect(mobileTransitionLayout.panelRight).toBeLessThanOrEqual(
    mobileTransitionLayout.viewportWidth,
  );
  expect(mobileTransitionLayout.scrollWidth).toBeLessThanOrEqual(
    mobileTransitionLayout.viewportWidth,
  );
  if (process.env.READER_VISUAL_QA === "1") {
    await page.screenshot({
      path: "D:\\tl-temp\\ebook-reader-stage10x-transition-settings-mobile.png",
    });
  }
  await page.keyboard.press("Escape");
  await expect(mobileTransitionSettings).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(viewableImage).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, consoleIssues);

  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("button", { name: "Back to shelf" }).click();
  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
  expect(consoleIssues).toEqual([]);
});

test("opens a generated PDF reader and uses page and zoom controls", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);

  await page.setViewportSize({
    width: 1440,
    height: 900,
  });
  await page.addInitScript(() => {
    const book = {
      id: "e2e-generated-pdf",
      title: "Generated PDF",
      format: "pdf",
      sourcePath: "D:\\books\\generated.pdf",
      libraryPath: "D:\\library\\generated.pdf",
      fileHash: "generated-pdf-hash",
      coverStatus: "pending",
      createdAt: "2026-06-20T08:00:00.000Z",
      updatedAt: "2026-06-20T08:00:00.000Z",
    };

    function padOffset(offset: number): string {
      return String(offset).padStart(10, "0");
    }

    function createPageStream(pageNumber: number): string {
      return [
        "BT",
        "/F1 28 Tf",
        "72 720 Td",
        `(PDF Page ${pageNumber}) Tj`,
        "0 -46 Td",
        "(Generated Playwright fixture) Tj",
        "ET",
      ].join("\n");
    }

    function createStreamObject(stream: string): string {
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }

    function createGeneratedPdfUrl(): string {
      const pageOneStream = createPageStream(1);
      const pageTwoStream = createPageStream(2);
      const pageThreeStream = createPageStream(3);
      const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
        createStreamObject(pageOneStream),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>",
        createStreamObject(pageTwoStream),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 9 0 R >>",
        createStreamObject(pageThreeStream),
      ];
      const offsets: number[] = [0];
      let pdf = "%PDF-1.4\n% Generated test fixture\n";

      for (const [index, object] of objects.entries()) {
        offsets[index + 1] = pdf.length;
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      }

      const xrefOffset = pdf.length;
      pdf += `xref\n0 ${objects.length + 1}\n`;
      pdf += "0000000000 65535 f \n";

      for (let index = 1; index <= objects.length; index += 1) {
        pdf += `${padOffset(offsets[index])} 00000 n \n`;
      }

      pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
      pdf += `startxref\n${xrefOffset}\n%%EOF`;

      return URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    }

    window.localStorage.setItem("reader:fallback:books", JSON.stringify([book]));
    window.localStorage.setItem(
      "reader:fallback:pdfSources",
      JSON.stringify({
        "e2e-generated-pdf": createGeneratedPdfUrl(),
      }),
    );
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Generated PDF" })).toBeVisible();
  await expect(page.locator(".book-card__cover img")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  const reader = page.getByRole("main", { name: "PDF reader" });
  await expect(reader).toBeVisible();
  await expect(page.getByRole("button", { name: "Page 1" })).toBeVisible();
  await expect(page.locator(".reader-pdf-canvas").first()).toBeVisible();
  await expect(page.getByText("Page 1 / 3")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await expect.poll(() => firstPdfCanvasHasInk(page), { timeout: 20_000 }).toBe(true);

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 / 3")).toBeVisible();

  const pageInput = page.getByRole("spinbutton", { name: "PDF page number" });
  await pageInput.fill("3");
  await pageInput.press("Enter");
  await expect(page.getByText("Page 3 / 3")).toBeVisible();

  await pageInput.fill("1");
  await pageInput.press("Enter");
  await expect(page.getByText("Page 1 / 3")).toBeVisible();

  const pdfProgressSlider = page.getByRole("slider", { name: "PDF reading progress" });
  await expect(pdfProgressSlider).toBeEnabled();
  await pdfProgressSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    valueSetter?.call(input, "1000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect(page.getByText("Page 3 / 3")).toBeVisible();

  await pageInput.fill("1");
  await pageInput.press("Enter");
  await expect(page.getByText("Page 1 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("button", { name: "Double" }).click();
  await expect(page.getByRole("button", { name: "Double" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Pages 1-2 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Fit width" }).click();
  await expect(page.locator(".reader-pdf-zoom-group strong")).not.toHaveText("100%");
  await expect.poll(() => firstPdfCanvasHasInk(page), { timeout: 20_000 }).toBe(true);

  await page.getByRole("button", { name: "Shelf", exact: true }).click();
  await expect(
    page.getByRole("main", { name: "Ebook Reader bookshelf" }),
  ).toBeVisible();
  expect(
    consoleIssues.filter(
      (issue) =>
        !issue.includes("Canvas2D: Multiple readback operations using getImageData"),
    ),
  ).toEqual([]);
});

async function firstPdfCanvasHasInk(page: Page): Promise<boolean> {
  return page
    .locator(".reader-pdf-canvas")
    .first()
    .evaluate((canvasElement) => {
      const canvas = canvasElement as HTMLCanvasElement;

      if (canvas.width === 0 || canvas.height === 0) {
        return false;
      }

      const context = canvas.getContext("2d");

      if (context === null) {
        return false;
      }

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

      for (let index = 0; index < pixels.length; index += 4) {
        if (
          pixels[index + 3] !== 0 &&
          (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245)
        ) {
          return true;
        }
      }

      return false;
    });
}
