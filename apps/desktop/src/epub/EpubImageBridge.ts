export interface EpubImageResource {
  sourceUrl: string;
  accessibleName: string;
  description?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  trigger: Element;
}

export type EpubImageActivateHandler = (resource: EpubImageResource) => void;

interface OriginalImageAttributes {
  ariaHasPopup: string | null;
  ariaLabel: string | null;
  role: string | null;
  tabIndex: string | null;
}

const VIEWABLE_IMAGE_CLASS = "reader-epub-viewable-image";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

export function registerEpubImageBridge(
  document: Document,
  onActivate: EpubImageActivateHandler,
): () => void {
  const originalAttributes = new Map<Element, OriginalImageAttributes>();
  const candidates = getImageCandidates(document);

  for (const candidate of candidates) {
    decorateImageCandidate(candidate, originalAttributes);
  }

  const handleClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    activateImageTarget(event, onActivate);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    activateImageTarget(event, onActivate);
  };

  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyDown);

  return () => {
    document.removeEventListener("click", handleClick);
    document.removeEventListener("keydown", handleKeyDown);

    for (const [candidate, attributes] of originalAttributes) {
      restoreAttribute(candidate, "aria-haspopup", attributes.ariaHasPopup);
      restoreAttribute(candidate, "aria-label", attributes.ariaLabel);
      restoreAttribute(candidate, "role", attributes.role);
      restoreAttribute(candidate, "tabindex", attributes.tabIndex);
      candidate.classList.remove(VIEWABLE_IMAGE_CLASS);
    }
  };
}

export function resolveEpubImageResource(candidate: Element): EpubImageResource | null {
  if (!isSupportedImage(candidate) || isDecorativeImage(candidate)) {
    return null;
  }

  const sourceUrl = getResolvedImageSource(candidate);

  if (sourceUrl === null) {
    return null;
  }

  const accessibleName = getAccessibleImageName(candidate);
  const description = getImageDescription(candidate, accessibleName);
  const dimensions = getNaturalImageDimensions(candidate);

  if (candidate instanceof HTMLImageElement) {
    if (candidate.complete && candidate.naturalWidth <= 0) {
      return null;
    }
  }

  return {
    sourceUrl,
    accessibleName,
    trigger: candidate,
    ...dimensions,
    ...(description === undefined ? {} : { description }),
  };
}

function activateImageTarget(
  event: MouseEvent | KeyboardEvent,
  onActivate: EpubImageActivateHandler,
) {
  const candidate = findImageCandidate(event.target);

  if (candidate === null) {
    return;
  }

  const resource = resolveEpubImageResource(candidate);

  if (resource === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  focusImageCandidate(candidate);
  onActivate(resource);
}

function decorateImageCandidate(
  candidate: Element,
  originalAttributes: Map<Element, OriginalImageAttributes>,
) {
  if (isDecorativeImage(candidate) || getResolvedImageSource(candidate) === null) {
    return;
  }

  originalAttributes.set(candidate, {
    ariaHasPopup: candidate.getAttribute("aria-haspopup"),
    ariaLabel: candidate.getAttribute("aria-label"),
    role: candidate.getAttribute("role"),
    tabIndex: candidate.getAttribute("tabindex"),
  });
  candidate.setAttribute("aria-haspopup", "dialog");
  candidate.setAttribute("role", "button");
  candidate.setAttribute("tabindex", "0");

  if (!candidate.hasAttribute("aria-label")) {
    candidate.setAttribute("aria-label", getAccessibleImageName(candidate));
  }

  candidate.classList.add(VIEWABLE_IMAGE_CLASS);
}

function getImageCandidates(document: Document): Element[] {
  return Array.from(document.querySelectorAll("img, svg image"));
}

function findImageCandidate(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return isSupportedImage(target) ? target : null;
}

function isSupportedImage(candidate: Element): boolean {
  return (
    candidate instanceof HTMLImageElement ||
    (candidate.namespaceURI === "http://www.w3.org/2000/svg" &&
      candidate.localName.toLowerCase() === "image")
  );
}

function isDecorativeImage(candidate: Element): boolean {
  const role = candidate.getAttribute("role")?.toLowerCase();
  return (
    candidate.getAttribute("aria-hidden") === "true" ||
    role === "none" ||
    role === "presentation" ||
    candidate.closest("[hidden]") !== null
  );
}

function getResolvedImageSource(candidate: Element): string | null {
  const value =
    candidate instanceof HTMLImageElement
      ? candidate.currentSrc || candidate.getAttribute("src") || ""
      : getSvgImageHref(candidate);
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  try {
    return new URL(trimmedValue, candidate.ownerDocument.baseURI).href;
  } catch {
    return trimmedValue;
  }
}

function getSvgImageHref(candidate: Element): string {
  const svgHref = candidate as Element & {
    href?: { baseVal?: string };
  };
  return (
    svgHref.href?.baseVal ??
    candidate.getAttribute("href") ??
    candidate.getAttributeNS(XLINK_NAMESPACE, "href") ??
    ""
  );
}

function getAccessibleImageName(candidate: Element): string {
  const ariaLabel = candidate.getAttribute("aria-label")?.trim();
  const alt = candidate.getAttribute("alt")?.trim();
  const title = candidate.getAttribute("title")?.trim();
  const svgLabel = candidate.closest("svg")?.getAttribute("aria-label")?.trim();
  const figureCaption = candidate
    .closest("figure")
    ?.querySelector("figcaption")
    ?.textContent?.replace(/\s+/g, " ")
    .trim();
  const svgTitle =
    candidate.closest("svg")?.querySelector(":scope > title")?.textContent?.trim() ??
    undefined;

  return (
    ariaLabel || alt || title || figureCaption || svgLabel || svgTitle || "EPUB image"
  );
}

function getImageDescription(
  candidate: Element,
  accessibleName: string,
): string | undefined {
  const values = [
    candidate.getAttribute("title"),
    candidate.closest("figure")?.querySelector("figcaption")?.textContent,
  ]
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter(
      (value): value is string =>
        value !== undefined && value !== "" && value !== accessibleName,
    );
  return values[0];
}

function getNaturalImageDimensions(candidate: Element): {
  naturalWidth?: number;
  naturalHeight?: number;
} {
  if (candidate instanceof HTMLImageElement) {
    return candidate.naturalWidth > 0 && candidate.naturalHeight > 0
      ? {
          naturalWidth: candidate.naturalWidth,
          naturalHeight: candidate.naturalHeight,
        }
      : {};
  }

  const svgImage = candidate as Element & {
    width?: { baseVal?: { value?: number } };
    height?: { baseVal?: { value?: number } };
  };
  const naturalWidth = svgImage.width?.baseVal?.value;
  const naturalHeight = svgImage.height?.baseVal?.value;
  return typeof naturalWidth === "number" &&
    naturalWidth > 0 &&
    typeof naturalHeight === "number" &&
    naturalHeight > 0
    ? { naturalWidth, naturalHeight }
    : {};
}

function focusImageCandidate(candidate: Element) {
  const focusableCandidate = candidate as Element & {
    focus?: (options?: FocusOptions) => void;
  };
  focusableCandidate.focus?.({ preventScroll: true });
}

function restoreAttribute(
  candidate: Element,
  name: string,
  originalValue: string | null,
) {
  if (originalValue === null) {
    candidate.removeAttribute(name);
  } else {
    candidate.setAttribute(name, originalValue);
  }
}
