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

## Restore workflow and safety

Restore is always explicit: choose a file, run a read-only safety inspection, review version,
contents and conflicts, confirm, stage verified files, merge in a database transaction, then
review the itemized report. Inspection rejects absolute or traversing paths, duplicate entries,
unsupported major versions, undeclared or missing payloads, checksum/declared-size mismatch,
excessive entry counts or sizes, and unsafe compression ratios. Unknown optional fields are
ignored; older supported formats must pass an explicit migrator before merge.

Files are first extracted beneath app-data staging. Verified books and covers are moved into the
managed library by content address without overwriting different content. If the database merge
fails, the transaction rolls back and files newly introduced by that restore are removed.
Cancellation stops new work and performs the same cleanup.

## Merge rules

- Books match by `file_hash`; an existing local book ID wins and the backup ID is mapped to it.
- Progress, bookmarks and annotations match by UUID. A strictly newer `updatedAt` wins; equal
  timestamps keep the local record.
- Annotation `deletedAt` tombstones participate in that comparison so deleted notes do not
  reappear.
- Settings match by key with the same timestamp rule; `lastOpenedAt` keeps the newer value.
- If an original file is absent and no matching local file exists, the book remains visible as
  `availability: "missing"` with **File needed**. Importing the same hash later repairs the managed
  file while preserving its progress, bookmarks and annotations.

The result report classifies each item as `restored`, `merged`, `local-kept`, `missing-file`,
`skipped`, or `failed`.
