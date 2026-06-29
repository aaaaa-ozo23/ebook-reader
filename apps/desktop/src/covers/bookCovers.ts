import type { Book } from "@reader/core";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

import { getEpubBookSource, getPdfBookSource } from "../tauri/reader";
import { markBookCoverFallback, saveBookCover } from "../tauri/library";

const COVER_WIDTH = 480;
const COVER_HEIGHT = 720;
const COVER_QUALITY = 0.82;

export async function prepareBookCover(book: Book): Promise<Book> {
  if (book.coverStatus !== "pending") {
    return book;
  }

  if (book.format === "txt") {
    return markBookCoverFallback(book.id);
  }

  try {
    const coverBytes = await generateBookCoverBytes(book);

    return saveBookCover(book.id, Array.from(coverBytes), "webp");
  } catch {
    return markBookCoverFallback(book.id);
  }
}

export async function generateBookCoverBytes(book: Book): Promise<Uint8Array> {
  if (book.format === "epub") {
    return extractEpubCover(book);
  }

  if (book.format === "pdf") {
    return renderPdfCover(book);
  }

  throw new Error("TXT books use the shared fallback cover.");
}

async function extractEpubCover(book: Book): Promise<Uint8Array> {
  const sourceUrl = await getEpubBookSource(book);
  const { default: createEpub } = await import("epubjs");
  const epub = createEpub(sourceUrl, {
    openAs: "epub",
    replacements: "blobUrl",
  });

  try {
    await epub.ready;
    const coverUrl = await epub.coverUrl();

    if (coverUrl === null || coverUrl.length === 0) {
      throw new Error("The EPUB does not contain a cover image.");
    }

    const response = await fetch(coverUrl);

    if (!response.ok) {
      throw new Error(`The EPUB cover could not be loaded (${response.status}).`);
    }

    return normalizeImageBlob(await response.blob());
  } finally {
    epub.destroy();
  }
}

async function renderPdfCover(book: Book): Promise<Uint8Array> {
  const sourceUrl = await getPdfBookSource(book);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ url: sourceUrl });

  try {
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const unitViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      COVER_WIDTH / unitViewport.width,
      COVER_HEIGHT / unitViewport.height,
    );
    const viewport = page.getViewport({ scale });
    const canvas = createCoverCanvas();
    const context = getCanvasContext(canvas);
    const offsetX = (COVER_WIDTH - viewport.width) / 2;
    const offsetY = (COVER_HEIGHT - viewport.height) / 2;

    context.fillStyle = "#f8f3e8";
    context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
    context.save();
    context.translate(offsetX, offsetY);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    context.restore();

    return canvasToWebp(canvas);
  } finally {
    await loadingTask.destroy();
  }
}

async function normalizeImageBlob(blob: Blob): Promise<Uint8Array> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl);
    const canvas = createCoverCanvas();
    const context = getCanvasContext(canvas);
    const scale = Math.min(
      COVER_WIDTH / image.naturalWidth,
      COVER_HEIGHT / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;

    context.fillStyle = "#243438";
    context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
    context.drawImage(
      image,
      (COVER_WIDTH - width) / 2,
      (COVER_HEIGHT - height) / 2,
      width,
      height,
    );

    return canvasToWebp(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createCoverCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  return canvas;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("A 2D canvas context is required to create a cover.");
  }

  return context;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The cover image could not be decoded."));
    image.src = source;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("The cover image could not be encoded."));
          return;
        }

        void blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      "image/webp",
      COVER_QUALITY,
    );
  });
}
