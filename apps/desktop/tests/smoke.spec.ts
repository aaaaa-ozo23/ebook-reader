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

test("opens a generated EPUB reader and uses contents and theme controls", async ({ page }) => {
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
    <p>This generated EPUB fixture is public domain test text.</p>
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
    <p>The second chapter verifies table-of-contents navigation.</p>
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

      return URL.createObjectURL(new Blob([zipBytes], { type: "application/epub+zip" }));
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

  await page.getByRole("button", { name: "Chapter Two" }).click();
  await expect(page.getByRole("button", { name: "Chapter Two" })).toHaveAttribute(
    "aria-current",
    "location",
  );

  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "dark" }).click();
  await expect(reader).toHaveAttribute("data-reader-theme", "dark");

  await page.getByRole("button", { name: "Back to shelf" }).click();
  await expect(page.getByRole("main", { name: "Ebook Reader bookshelf" })).toBeVisible();
  expect(consoleIssues).toEqual([]);
});
