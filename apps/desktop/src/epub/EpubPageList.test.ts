import type { Book as EpubBook } from "epubjs";
import { describe, expect, it, vi } from "vitest";

import {
  findPublicationPageLabel,
  loadPublicationPageList,
  parseCachedPublicationPageList,
  parsePublicationPageItems,
  serializePublicationPageList,
  sortPublicationPageBoundaries,
  type EpubCfiComparator,
  type PublicationPageBoundary,
} from "./EpubPageList";

const lexicalComparator: EpubCfiComparator = {
  compare: (first, second) => first.localeCompare(second),
};

describe("EPUB publication page-list", () => {
  it("preserves EPUB 3 labels and rejects empty or external targets", () => {
    const document = parseXml(`
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body>
          <nav epub:type="page-list">
            <ol>
              <li><a href="chapter.xhtml#front-i"><span> i </span></a></li>
              <li><a href="chapter.xhtml#page-1">1</a></li>
              <li><a href="https://example.com/page">remote</a></li>
              <li><a href="">missing</a></li>
            </ol>
          </nav>
        </body>
      </html>
    `);

    expect(parsePublicationPageItems(document)).toEqual([
      { label: "i", sourceIndex: 0, target: "chapter.xhtml#front-i" },
      { label: "1", sourceIndex: 1, target: "chapter.xhtml#page-1" },
    ]);
  });

  it("preserves EPUB 2 NCX pageTarget labels", () => {
    const document = parseXml(`
      <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
        <pageList>
          <pageTarget><navLabel><text>xiv</text></navLabel><content src="chapter.xhtml#xiv" /></pageTarget>
          <pageTarget><navLabel><text>15</text></navLabel><content src="chapter.xhtml#p15" /></pageTarget>
        </pageList>
      </ncx>
    `);

    expect(parsePublicationPageItems(document)).toEqual([
      { label: "xiv", sourceIndex: 0, target: "chapter.xhtml#xiv" },
      { label: "15", sourceIndex: 1, target: "chapter.xhtml#p15" },
    ]);
  });

  it("returns no publication pages for absent or unusable page lists", () => {
    const withoutPageList = parseXml(`
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body>
      </html>
    `);
    const damagedPageList = parseXml(`
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body><nav epub:type="page-list"><ol>
          <li><a href="">empty target</a></li>
          <li><a href="chapter.xhtml">   </a></li>
          <li><a href="https://example.com/page">external</a></li>
        </ol></nav></body>
      </html>
    `);

    expect(parsePublicationPageItems(withoutPageList)).toEqual([]);
    expect(parsePublicationPageItems(damagedPageList)).toEqual([]);
  });

  it("resolves href, fragment, and package CFI targets into spine order", async () => {
    const navigationDocument = parseXml(`
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body><nav epub:type="page-list"><ol>
          <li><a href="chapter-one.xhtml#front-i">i</a></li>
          <li><a href="chapter-one.xhtml">1</a></li>
          <li><a href="package.opf#epubcfi(/6/4!/4/2)">2</a></li>
          <li><a href="missing.xhtml#page">broken</a></li>
        </ol></nav></body>
      </html>
    `);
    const chapterDocument = parseXml(`
      <html xmlns="http://www.w3.org/1999/xhtml"><body><p id="front-i">Front</p></body></html>
    `);
    const unloadOne = vi.fn();
    const sectionOne = {
      cfiFromElement: () => "epubcfi(/6/2!/4/4)",
      href: "chapter-one.xhtml",
      index: 0,
      load: vi.fn(() => Promise.resolve(chapterDocument)),
      unload: unloadOne,
    };
    const sectionTwo = {
      cfiFromElement: vi.fn(),
      href: "chapter-two.xhtml",
      index: 1,
      load: vi.fn(),
      unload: vi.fn(),
    };
    const book = {
      ready: Promise.resolve(),
      packaging: { navPath: "OPS/nav.xhtml", ncxPath: "" },
      load: vi.fn(() => Promise.resolve(navigationDocument)),
      spine: {
        get: vi.fn((target: string) => {
          if (target === "chapter-one.xhtml" || target === "OPS/chapter-one.xhtml") {
            return sectionOne;
          }

          if (target === "epubcfi(/6/4!/4/2)") {
            return sectionTwo;
          }

          return undefined;
        }),
      },
    } as unknown as EpubBook;

    const boundaries = await loadPublicationPageList(book, lexicalComparator);
    expect(boundaries).toEqual([
      expect.objectContaining({ label: "1", spineIndex: 0 }),
      expect.objectContaining({
        label: "i",
        spineIndex: 0,
        fragment: "front-i",
        cfi: "epubcfi(/6/2!/4/4)",
      }),
      expect.objectContaining({
        label: "2",
        spineIndex: 1,
        cfi: "epubcfi(/6/4!/4/2)",
      }),
    ]);
    expect(boundaries[0]).not.toHaveProperty("cfi");
    expect(sectionOne.load).toHaveBeenCalledTimes(1);
    expect(unloadOne).toHaveBeenCalledTimes(1);
  });

  it("round-trips versioned caches and rejects malformed data", () => {
    const boundaries = [createBoundary({ label: "iv" })];
    const serialized = serializePublicationPageList(boundaries);

    expect(parseCachedPublicationPageList(serialized, lexicalComparator)).toEqual(
      boundaries,
    );
    expect(
      parseCachedPublicationPageList(
        JSON.stringify({ version: 2, boundaries }),
        lexicalComparator,
      ),
    ).toBeNull();
    expect(
      parseCachedPublicationPageList(
        JSON.stringify({ version: 1, boundaries: [{ label: "" }] }),
        lexicalComparator,
      ),
    ).toBeNull();
  });

  it("uses the last boundary at or before the current CFI and falls back before it", () => {
    const boundaries = sortPublicationPageBoundaries(
      [
        createBoundary({ label: "2", cfi: "epubcfi(/6/2!/4/8)" }),
        createBoundary({ label: "i", cfi: "epubcfi(/6/2!/4/4)" }),
        createBoundary({ label: "10", spineIndex: 2, sourceIndex: 2 }),
      ],
      lexicalComparator,
    );

    expect(
      findPublicationPageLabel(
        boundaries,
        { spineIndex: 0, cfi: "epubcfi(/6/2!/4/2)" },
        lexicalComparator,
      ),
    ).toBeNull();
    expect(
      findPublicationPageLabel(
        boundaries,
        { spineIndex: 0, cfi: "epubcfi(/6/2!/4/6)" },
        lexicalComparator,
      ),
    ).toBe("i");
    expect(
      findPublicationPageLabel(
        boundaries,
        { spineIndex: 1, cfi: "epubcfi(/6/4!/4/2)" },
        lexicalComparator,
      ),
    ).toBe("2");
  });
});

function createBoundary(
  overrides: Partial<PublicationPageBoundary>,
): PublicationPageBoundary {
  return {
    label: "1",
    href: "chapter-one.xhtml",
    spineIndex: 0,
    sourceIndex: 0,
    cfi: "epubcfi(/6/2!/4/4)",
    ...overrides,
  };
}

function parseXml(source: string): Document {
  return new DOMParser().parseFromString(source, "application/xml");
}
