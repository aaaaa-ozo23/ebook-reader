# App-local custom fonts

Stage 14.4 adds static TTF and OTF fonts for TXT and EPUB reading without installing anything into
Windows. **Settings → Reading & Fonts** is the only management surface. PDF keeps using fonts
embedded by the document and is never restyled by this feature.

## Import and validation

- Static `.ttf` and `.otf` files are accepted up to 20 MiB.
- TTC/OTC, WOFF/WOFF2, empty, truncated, and unsupported containers are rejected before copying.
- The Rust backend checks the SFNT container, table boundaries, duplicate tables, required name,
  cmap, head and outline tables, and parses the family/style name table.
- The file is hashed with SHA-256, staged beside the destination, and atomically moved into the
  app-data `fonts/` directory. Reimporting the same hash returns the existing registration.
- A stable internal family alias is derived from the hash. The original path is not retained in
  portable data and the font is not registered system-wide.

The app cannot determine whether a font license permits embedding or personal use. The import
review explicitly asks the user to import only files they have permission to use. No font is sent
to a network service.

## Reader behavior

The selected `fontId` is stored alongside the existing `fontFamily` fallback. TXT uses a loaded
app-local `FontFace`; EPUB receives a scoped `@font-face` rule inside each rendition iframe. A
missing, disabled, deleted, or unreadable selected font immediately falls back to the built-in
Lora-compatible serif stack and saves that safe preference. Reader startup and the EPUB lazy
boundary remain available when an individual font fails to load.

Disabling or deleting the selected font performs the same fallback. Deleting removes both the
database registration and managed file through a rollback-safe tombstone operation.

## Backup and restore

`.erbackup` format v2 includes font registration metadata and the content-addressed static font
files with core data by default. Restore validates path, size, and SHA-256, deduplicates by file
hash, and remaps the selected font ID. Version 1 archives remain valid and simply contain no
custom-font records.
