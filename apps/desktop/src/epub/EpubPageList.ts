import type { Book as EpubBook } from "epubjs";

export const EPUB_PAGE_LIST_CACHE_VERSION = 1;

export interface PublicationPageBoundary {
  label: string;
  href: string;
  spineIndex: number;
  sourceIndex: number;
  fragment?: string;
  cfi?: string;
}

export interface PublicationPageListCache {
  version: typeof EPUB_PAGE_LIST_CACHE_VERSION;
  boundaries: PublicationPageBoundary[];
}

export interface EpubCfiComparator {
  compare(first: string, second: string): number;
}

interface RawPublicationPageItem {
  label: string;
  target: string;
  sourceIndex: number;
}

interface ResolvableSection {
  cfiFromElement(element: Element): string;
  href: string;
  index: number;
  load(request?: EpubBook["load"]): Document | Promise<Document>;
  unload(): void;
}

interface PublicationPagePosition {
  cfi?: string;
  spineIndex: number;
}

const EPUB_TYPE_NAMESPACE = "http://www.idpf.org/2007/ops";
const EXTERNAL_TARGET_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

export async function loadPublicationPageList(
  book: EpubBook,
  comparator: EpubCfiComparator,
): Promise<PublicationPageBoundary[]> {
  await book.ready;
  const navigationPath = book.packaging.navPath || book.packaging.ncxPath;

  if (navigationPath === "") {
    return [];
  }

  const loadXml = book.load as unknown as (
    path: string,
    type?: string,
  ) => Promise<unknown>;
  const loadedDocument = await loadXml.call(book, navigationPath, "xml");

  if (!isDocument(loadedDocument)) {
    return [];
  }

  const rawItems = parsePublicationPageItems(loadedDocument);
  const sectionDocumentPromises = new Map<number, Promise<Document>>();
  const loadedSections = new Set<ResolvableSection>();

  const getSectionDocument = (section: ResolvableSection) => {
    const existing = sectionDocumentPromises.get(section.index);

    if (existing !== undefined) {
      return existing;
    }

    loadedSections.add(section);
    const loading = Promise.resolve(section.load(book.load.bind(book)));
    sectionDocumentPromises.set(section.index, loading);
    return loading;
  };

  try {
    const resolved = await Promise.all(
      rawItems.map((item) =>
        resolvePublicationPageItem(book, navigationPath, item, getSectionDocument),
      ),
    );

    return sortPublicationPageBoundaries(
      resolved.filter(
        (boundary): boundary is PublicationPageBoundary => boundary !== null,
      ),
      comparator,
    );
  } finally {
    for (const section of loadedSections) {
      section.unload();
    }
  }
}

export function parsePublicationPageItems(
  document: Document,
): RawPublicationPageItem[] {
  const pageNavigation = getElementsByLocalName(document, "nav").find((element) =>
    getEpubTypes(element).includes("page-list"),
  );

  if (pageNavigation !== undefined) {
    return getElementsByLocalName(pageNavigation, "li").flatMap((item, sourceIndex) => {
      const anchor = Array.from(item.children).find(
        (element) => element.localName.toLowerCase() === "a",
      );

      return anchor === undefined
        ? []
        : normalizeRawItem(
            anchor.textContent ?? "",
            anchor.getAttribute("href") ?? "",
            sourceIndex,
          );
    });
  }

  const pageList = getElementsByLocalName(document, "pageList")[0];

  if (pageList === undefined) {
    return [];
  }

  return getElementsByLocalName(pageList, "pageTarget").flatMap(
    (target, sourceIndex) => {
      const label = getElementsByLocalName(target, "text")[0]?.textContent ?? "";
      const href =
        getElementsByLocalName(target, "content")[0]?.getAttribute("src") ?? "";
      return normalizeRawItem(label, href, sourceIndex);
    },
  );
}

export function serializePublicationPageList(
  boundaries: PublicationPageBoundary[],
): string {
  return JSON.stringify({
    version: EPUB_PAGE_LIST_CACHE_VERSION,
    boundaries,
  } satisfies PublicationPageListCache);
}

export function parseCachedPublicationPageList(
  value: string | undefined,
  comparator: EpubCfiComparator,
): PublicationPageBoundary[] | null {
  if (value === undefined) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!isRecord(parsed) || parsed.version !== EPUB_PAGE_LIST_CACHE_VERSION) {
      return null;
    }

    if (!Array.isArray(parsed.boundaries)) {
      return null;
    }

    const boundaries: PublicationPageBoundary[] = [];

    for (const valueBoundary of parsed.boundaries) {
      if (!isPublicationPageBoundary(valueBoundary)) {
        return null;
      }

      boundaries.push({
        label: valueBoundary.label,
        href: valueBoundary.href,
        spineIndex: valueBoundary.spineIndex,
        sourceIndex: valueBoundary.sourceIndex,
        ...(valueBoundary.fragment === undefined
          ? {}
          : { fragment: valueBoundary.fragment }),
        ...(valueBoundary.cfi === undefined ? {} : { cfi: valueBoundary.cfi }),
      });
    }

    return sortPublicationPageBoundaries(boundaries, comparator);
  } catch {
    return null;
  }
}

export function findPublicationPageLabel(
  boundaries: readonly PublicationPageBoundary[],
  position: PublicationPagePosition,
  comparator: EpubCfiComparator,
): string | null {
  let currentLabel: string | null = null;

  for (const boundary of boundaries) {
    if (boundary.spineIndex < position.spineIndex) {
      currentLabel = boundary.label;
      continue;
    }

    if (boundary.spineIndex > position.spineIndex) {
      break;
    }

    if (boundary.cfi === undefined) {
      currentLabel = boundary.label;
      continue;
    }

    if (position.cfi === undefined) {
      break;
    }

    try {
      if (comparator.compare(boundary.cfi, position.cfi) <= 0) {
        currentLabel = boundary.label;
        continue;
      }
    } catch {
      // A malformed CFI never promotes a publication page label.
    }

    break;
  }

  return currentLabel;
}

export function sortPublicationPageBoundaries(
  boundaries: PublicationPageBoundary[],
  comparator: EpubCfiComparator,
): PublicationPageBoundary[] {
  return [...boundaries].sort((first, second) => {
    if (first.spineIndex !== second.spineIndex) {
      return first.spineIndex - second.spineIndex;
    }

    if (first.cfi === undefined || second.cfi === undefined) {
      if (first.cfi === second.cfi) {
        return first.sourceIndex - second.sourceIndex;
      }

      return first.cfi === undefined ? -1 : 1;
    }

    try {
      const comparison = comparator.compare(first.cfi, second.cfi);
      return comparison === 0 ? first.sourceIndex - second.sourceIndex : comparison;
    } catch {
      return first.sourceIndex - second.sourceIndex;
    }
  });
}

async function resolvePublicationPageItem(
  book: EpubBook,
  navigationPath: string,
  item: RawPublicationPageItem,
  getSectionDocument: (section: ResolvableSection) => Promise<Document>,
): Promise<PublicationPageBoundary | null> {
  const parsedTarget = parsePublicationTarget(item.target);

  if (parsedTarget === null) {
    return null;
  }

  if (parsedTarget.cfi !== undefined) {
    const section = getSpineSection(book, parsedTarget.cfi);

    return section === null
      ? null
      : {
          label: item.label,
          href: section.href,
          cfi: parsedTarget.cfi,
          spineIndex: section.index,
          sourceIndex: item.sourceIndex,
        };
  }

  const candidates = getHrefCandidates(navigationPath, parsedTarget.href);
  const section = candidates
    .map((candidate) => getSpineSection(book, candidate))
    .find((candidate): candidate is ResolvableSection => candidate !== null);

  if (section === undefined) {
    return null;
  }

  if (parsedTarget.fragment === undefined) {
    return {
      label: item.label,
      href: section.href,
      spineIndex: section.index,
      sourceIndex: item.sourceIndex,
    };
  }

  try {
    const sectionDocument = await getSectionDocument(section);
    const element = sectionDocument.getElementById(parsedTarget.fragment);

    if (element === null) {
      return null;
    }

    return {
      label: item.label,
      href: section.href,
      fragment: parsedTarget.fragment,
      cfi: section.cfiFromElement(element),
      spineIndex: section.index,
      sourceIndex: item.sourceIndex,
    };
  } catch {
    return null;
  }
}

function normalizeRawItem(
  labelValue: string,
  targetValue: string,
  sourceIndex: number,
): RawPublicationPageItem[] {
  const label = labelValue.replace(/\s+/g, " ").trim();
  const target = targetValue.trim();

  return label === "" || target === "" || EXTERNAL_TARGET_PATTERN.test(target)
    ? []
    : [{ label, target, sourceIndex }];
}

function parsePublicationTarget(target: string): {
  href: string;
  fragment?: string;
  cfi?: string;
} | null {
  const hashIndex = target.indexOf("#");
  const href = (hashIndex === -1 ? target : target.slice(0, hashIndex)).trim();
  const encodedFragment = hashIndex === -1 ? "" : target.slice(hashIndex + 1).trim();
  const fragment = decodeUriComponent(encodedFragment);

  if (fragment.startsWith("epubcfi(")) {
    return { href, cfi: fragment };
  }

  if (href === "") {
    return null;
  }

  return fragment === "" ? { href } : { href, fragment };
}

function getHrefCandidates(navigationPath: string, href: string): string[] {
  const decodedHref = decodeUriComponent(href).replaceAll("\\", "/");
  const resolved = resolveRelativePublicationPath(navigationPath, decodedHref);
  return Array.from(
    new Set([decodedHref, decodedHref.replace(/^\/+/, ""), resolved]),
  ).filter((candidate) => candidate !== "");
}

function resolveRelativePublicationPath(basePath: string, href: string): string {
  if (href.startsWith("/")) {
    return href.replace(/^\/+/, "");
  }

  const baseParts = basePath.replaceAll("\\", "/").split("/");
  baseParts.pop();

  for (const part of href.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
}

function getSpineSection(book: EpubBook, target: string): ResolvableSection | null {
  try {
    const section = book.spine.get(target) as unknown as ResolvableSection | undefined;
    return section === undefined ? null : section;
  } catch {
    return null;
  }
}

function getEpubTypes(element: Element): string[] {
  const value =
    element.getAttributeNS(EPUB_TYPE_NAMESPACE, "type") ??
    element.getAttribute("epub:type") ??
    element.getAttribute("type") ??
    "";
  return value.split(/\s+/).filter(Boolean);
}

function getElementsByLocalName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}

function isPublicationPageBoundary(value: unknown): value is PublicationPageBoundary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.label === "string" &&
    value.label.trim() !== "" &&
    typeof value.href === "string" &&
    value.href !== "" &&
    Number.isInteger(value.spineIndex) &&
    Number(value.spineIndex) >= 0 &&
    Number.isInteger(value.sourceIndex) &&
    Number(value.sourceIndex) >= 0 &&
    (value.fragment === undefined || typeof value.fragment === "string") &&
    (value.cfi === undefined || typeof value.cfi === "string")
  );
}

function isDocument(value: unknown): value is Document {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 9 &&
    "getElementsByTagNameNS" in value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
