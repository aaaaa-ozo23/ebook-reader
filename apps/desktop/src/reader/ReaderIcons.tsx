export type ReaderIconName =
  | "back"
  | "book"
  | "bookmark"
  | "close"
  | "contents"
  | "external"
  | "focus"
  | "more"
  | "notes"
  | "plus"
  | "search"
  | "theme"
  | "trash";

export function ReaderIcon({ name }: { name: ReaderIconName }) {
  return (
    <svg className="reader-icon" aria-hidden="true" viewBox="0 0 24 24">
      {name === "back" ? <path d="m15 5-7 7 7 7M8 12h11" /> : null}
      {name === "book" ? (
        <path d="M4 5.5c2.8-.8 5.5-.3 8 1.6v11.4c-2.5-1.9-5.2-2.4-8-1.6V5.5Zm16 0c-2.8-.8-5.5-.3-8 1.6v11.4c2.5-1.9 5.2-2.4 8-1.6V5.5Z" />
      ) : null}
      {name === "bookmark" ? <path d="M7 4.5h10v15l-5-3.4-5 3.4v-15Z" /> : null}
      {name === "close" ? <path d="m6 6 12 12M18 6 6 18" /> : null}
      {name === "contents" ? (
        <path d="M9 6h10M9 12h10M9 18h10M5 6h.01M5 12h.01M5 18h.01" />
      ) : null}
      {name === "external" ? (
        <path d="M13 5h6v6M19 5l-8 8M11 7H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5" />
      ) : null}
      {name === "focus" ? (
        <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4M9 9h6v6H9z" />
      ) : null}
      {name === "more" ? <path d="M6 12h.01M12 12h.01M18 12h.01" /> : null}
      {name === "notes" ? (
        <path d="m5 17-.8 3.8L8 20l10.6-10.6-3-3L5 17Zm8.8-8.8 3 3M5 21h14" />
      ) : null}
      {name === "plus" ? <path d="M12 5v14M5 12h14" /> : null}
      {name === "search" ? (
        <path d="m20 20-4.3-4.3M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
      ) : null}
      {name === "theme" ? (
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
      ) : null}
      {name === "trash" ? (
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
      ) : null}
    </svg>
  );
}
