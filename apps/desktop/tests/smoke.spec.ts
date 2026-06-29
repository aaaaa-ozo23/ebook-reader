import { expect, test, type Page } from "@playwright/test";

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

async function readEpubPageState(
  page: Page,
): Promise<{ currentPage: number; totalPages: number }> {
  const pageText = await page
    .getByText(/Page \d+ \/ \d+/)
    .first()
    .textContent();
  const match = pageText?.match(/Page\s+(\d+)\s+\/\s+(\d+)/);

  if (match === undefined || match === null) {
    throw new Error(`Unable to read EPUB page state from: ${pageText ?? ""}`);
  }

  return {
    currentPage: Number(match[1]),
    totalPages: Number(match[2]),
  };
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
});

test("renders the shared default cover with a long HTML title", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "reader:fallback:books",
      JSON.stringify([
        {
          id: "e2e-default-cover",
          title:
            "A Deliberately Long Book Title Rendered Above the Shared Cover Background",
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

  const cover = page.locator(".book-card__cover");
  await expect(cover.locator("strong")).toHaveText(/A Deliberately Long Book Title/);
  await expect(cover).toHaveCSS("background-image", /default-book-cover/);
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

  const contentsWidth = page.getByRole("slider", { name: "Contents width" });
  await contentsWidth.fill("400");
  await expect(page.getByRole("main", { name: "TXT reader" })).toHaveAttribute(
    "style",
    /--reader-sidebar-width: 400px/,
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

  await page.setViewportSize({ width: 375, height: 760 });
  await expect(page.locator(".reader-sidebar")).toHaveCSS("position", "fixed");
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
  </body>
</html>`,
      },
      {
        name: "OPS/chapter-one.xhtml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter One</title></head>
  <body>
    <h1>Chapter One</h1>
    ${chapterOneParagraphs}
  </body>
</html>`,
      },
      {
        name: "OPS/chapter-two.xhtml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter Two</title></head>
  <body>
    <h1>Chapter Two</h1>
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
  const epubPageInput = page.getByRole("spinbutton", { name: "EPUB page number" });
  await expect(progressSlider).toBeEnabled({
    timeout: 20000,
  });
  await expect(epubPageInput).toBeEnabled();
  await expect(page.getByText(/Page \d+ \/ \d+/).first()).toBeVisible();

  const initialEpubPageState = await readEpubPageState(page);
  const targetEpubPage = Math.min(
    initialEpubPageState.totalPages,
    Math.max(2, Math.ceil(initialEpubPageState.totalPages / 3)),
  );
  await epubPageInput.fill(String(targetEpubPage));
  await epubPageInput.press("Enter");
  await expect(epubPageInput).toHaveValue(String(targetEpubPage));

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
      /Page \d+/,
    );
    await page.mouse.up();
  }

  await expect
    .poll(async () => Number(await progressSlider.inputValue()))
    .toBeGreaterThan(beforeSliderValue);

  const { totalPages } = await readEpubPageState(page);
  expect(totalPages).toBeGreaterThan(2);

  const penultimateSliderValue = Math.round(
    ((totalPages - 2.5) / (totalPages - 1)) * 1000,
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
  await expect(
    page.getByText(new RegExp(`Page ${totalPages - 1} / ${totalPages}`)).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByText(new RegExp(`Page ${totalPages} / ${totalPages}`)).first(),
  ).toBeVisible();
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

  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "dark" }).click();
  await expect(reader).toHaveAttribute("data-reader-theme", "dark");

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
