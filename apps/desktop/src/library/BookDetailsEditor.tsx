import { useEffect, useId, useRef, useState } from "react";
import type { Book, BookDetails, BookMetadataOverridePatch } from "@reader/core";

import {
  getBookDetails,
  resetBookOverrides,
  saveBookMetadataOverrides,
  saveUserBookCover,
} from "../tauri/library";

const MAX_COVER_BYTES = 10 * 1024 * 1024;

export function BookDetailsEditor({
  book,
  onClose,
  onSaved,
}: {
  book: Book | null;
  onClose: () => void;
  onSaved: (book: Book) => void;
}) {
  const [details, setDetails] = useState<BookDetails | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (book === null) return;
    let active = true;
    void getBookDetails(book.id).then(
      (next) => {
        if (!active) return;
        setDetails(next);
        setTitle(next.book.title);
        setAuthor(next.book.author ?? "");
        window.setTimeout(() => titleInputRef.current?.focus(), 0);
      },
      (nextError) => active && setError(errorMessage(nextError)),
    );
    return () => {
      active = false;
    };
  }, [book]);

  useEffect(() => {
    if (book === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [book, isSaving, onClose]);

  useEffect(
    () => () => {
      if (coverUrl !== null) URL.revokeObjectURL(coverUrl);
    },
    [coverUrl],
  );

  if (book === null) return null;

  const handleCoverSelection = (file: File | undefined) => {
    setError(null);
    if (file === undefined) return;
    if (!/^image\/(?:png|jpeg|webp)$/.test(file.type) || file.size > MAX_COVER_BYTES) {
      setError("Choose a PNG, JPEG, or WebP image no larger than 10 MiB.");
      return;
    }
    if (coverUrl !== null) URL.revokeObjectURL(coverUrl);
    setCoverFile(file);
    setCoverUrl(URL.createObjectURL(file));
    setZoom(1);
    setPositionX(50);
    setPositionY(50);
  };

  const handleSave = async () => {
    if (details === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const patch: BookMetadataOverridePatch = {
        title:
          title.trim() === details.book.title
            ? { action: "unchanged" }
            : { action: "set", value: title.trim() },
        author:
          author.trim() === (details.book.author ?? "")
            ? { action: "unchanged" }
            : { action: "set", value: author.trim() },
      };
      let next = await saveBookMetadataOverrides(book.id, patch);
      if (coverFile !== null) {
        const bytes = await cropCoverToWebp(
          coverFile,
          zoom,
          positionX / 100,
          positionY / 100,
        );
        next = await saveUserBookCover(book.id, Array.from(bytes));
      }
      onSaved(next.book);
      onClose();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async (field: "title" | "author" | "cover") => {
    setIsSaving(true);
    setError(null);
    try {
      const next = await resetBookOverrides(book.id, [field]);
      setDetails(next);
      setTitle(next.book.title);
      setAuthor(next.book.author ?? "");
      if (field === "cover") {
        setCoverFile(null);
        setCoverUrl(null);
      }
      onSaved(next.book);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="details-dialog-backdrop" role="presentation">
      <section
        className="details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <p>Library details</p>
            <h2 id={titleId}>Edit details</h2>
          </div>
          <button type="button" aria-label="Close edit details" onClick={onClose}>
            ×
          </button>
        </header>
        {details === null ? (
          <p role="status">Loading book details…</p>
        ) : (
          <div className="details-dialog__content">
            <div className="details-cover-editor">
              <div className="details-cover-editor__preview">
                {coverUrl === null ? (
                  <span>{book.title}</span>
                ) : (
                  <img
                    src={coverUrl}
                    alt="Custom cover crop preview"
                    style={{
                      objectPosition: `${positionX}% ${positionY}%`,
                      transform: `scale(${zoom})`,
                    }}
                  />
                )}
              </div>
              <label className="details-file-button">
                Choose custom cover
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => handleCoverSelection(event.target.files?.[0])}
                />
              </label>
              {coverUrl !== null ? (
                <div className="details-crop-controls">
                  <label>
                    Zoom{" "}
                    <input
                      type="range"
                      min="1"
                      max="2.5"
                      step="0.05"
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Horizontal{" "}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={positionX}
                      onChange={(event) => setPositionX(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Vertical{" "}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={positionY}
                      onChange={(event) => setPositionY(Number(event.target.value))}
                    />
                  </label>
                </div>
              ) : null}
              <button
                type="button"
                className="details-reset"
                disabled={isSaving || details.coverOrigin !== "user"}
                onClick={() => void handleReset("cover")}
              >
                Restore automatic cover
              </button>
            </div>
            <div className="details-fields">
              <label>
                <span>Title</span>
                <input
                  ref={titleInputRef}
                  aria-label="Title"
                  value={title}
                  maxLength={500}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <small>Automatic: {details.automaticTitle}</small>
              </label>
              <button
                type="button"
                className="details-reset"
                disabled={isSaving || details.titleOverrideUpdatedAt === undefined}
                onClick={() => void handleReset("title")}
              >
                Restore automatic title
              </button>
              <label>
                <span>Author</span>
                <input
                  aria-label="Author"
                  value={author}
                  maxLength={500}
                  onChange={(event) => setAuthor(event.target.value)}
                />
                <small>Automatic: {details.automaticAuthor ?? "Unknown author"}</small>
              </label>
              <button
                type="button"
                className="details-reset"
                disabled={isSaving || details.authorOverrideUpdatedAt === undefined}
                onClick={() => void handleReset("author")}
              >
                Restore automatic author
              </button>
              {error === null ? null : (
                <div className="details-error" role="alert">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
        <footer>
          <button
            type="button"
            className="dialog-button"
            disabled={isSaving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-button dialog-button--primary"
            disabled={isSaving || details === null || title.trim().length === 0}
            onClick={() => void handleSave()}
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </section>
    </div>
  );
}

async function cropCoverToWebp(
  file: File,
  zoom: number,
  x: number,
  y: number,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Cover cropping is unavailable.");
    const baseScale = Math.max(
      canvas.width / bitmap.width,
      canvas.height / bitmap.height,
    );
    const scale = baseScale * zoom;
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const left = -(width - canvas.width) * x;
    const top = -(height - canvas.height) * y;
    context.drawImage(bitmap, left, top, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value === null ? reject(new Error("Cover encoding failed.")) : resolve(value),
        "image/webp",
        0.9,
      ),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error).replace(/^\[[^\]]+\]\s*/, "");
}
