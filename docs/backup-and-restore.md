# Backup and restore

Ebook Reader backups are user-initiated, local files. The v1 archive format uses the
`.erbackup` extension and standard ZIP storage so the app can validate and migrate it without
depending on machine-specific paths.

## Export defaults

- Core reading data: included and required.
- Managed covers: included by default.
- Original EPUB, TXT, and PDF library copies: excluded by default and available as an explicit
  option.
- Reader caches, absolute source/library paths, update-check timestamps, logs, and other
  machine-only state: always excluded.

The suggested file name is `ebook-reader-backup-YYYY-MM-DD.erbackup`.

## Format version 1

Every archive contains:

- `manifest.json`: format identifier, `formatVersion: 1`, app/schema versions, UTC export time,
  selected options, record counts, and a path/size/SHA-256 descriptor for every payload.
- `data.json`: portable book identity and metadata, reader settings/layout/theme, progress,
  bookmarks, annotations, and annotation deletion tombstones.
- `covers/`: optional managed cover payloads, addressed by the book file hash.
- `books/`: optional managed original book payloads, addressed by the book file hash.

`manifest.json` does not include a checksum for itself, avoiding a circular signature. Payload
paths use `/` separators and never contain absolute paths.

## Write and cancellation guarantees

Export runs as a registered background operation and publishes structured progress with an
operation ID. The archive is written to a same-directory temporary file. On success it is
atomically renamed to the selected `.erbackup` path. Failure or cancellation removes the
temporary file and never modifies the database.

## Security boundary

Version 1 backups are **not encrypted**. A backup may contain copyrighted book files, reading
history, bookmarks, and private annotations. Keep it in a trusted location and apply operating
system or storage encryption when confidentiality is required.

Restore inspection, safe extraction, merge rules, and result reporting are introduced in Stage
13.4. Until then, the product exposes export only.
