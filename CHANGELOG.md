# Changelog

All notable changes to Ebook Reader are documented in this file.

## [0.2.0] - 2026-07-16

### Added

- Unified warm-paper bookshelf and reader UI across desktop and mobile layouts, with refined
  focus, reduced-motion, responsive sheets, and touch targets.
- Portable `.erbackup` export and guarded restore for books, covers, reading preferences,
  progress, bookmarks, annotations, and deletion tombstones.
- Per-field title and author overrides plus cropped custom WebP covers and automatic-value reset.
- Multi-file, folder, and drag-and-drop import through one previewed, cancellable import service.
- Signed NSIS in-app updates with manual-by-default checks and an optional daily check; MSI stays
  on the manual upgrade track.
- Reproducible RC tooling for updater signatures, SHA-256 sums, CycloneDX SBOMs, locked-license
  audit, private-key leak checks, and artifact inventory.

### Changed

- Missing backed-up books remain repairable placeholders and recover their reading data when a
  file with the same hash is imported later.
- Windows x64 packaging is split into NSIS updater and MSI manual tracks to avoid mixed installs.

### Security

- Backup restore rejects traversal, duplicates, checksum/size mismatch, unsupported versions,
  excessive expansion, and compression bombs before changing local data.
- NSIS update artifacts require the independently generated updater signature and HTTPS feed.
- Windows installers remain unsigned by Authenticode and may show a SmartScreen warning.

## [0.1.0] - 2026-07-01

### Added

- Local-first EPUB, TXT, and PDF library with app-managed copies and cover extraction.
- Format-specific readers with navigation, themes, progress restoration, bookmarks,
  highlights, and notes.
- Responsive bookshelf and reader layouts, keyboard navigation, focus mode, and
  accessibility checks.
- Windows x64 NSIS and MSI installers with EPUB, TXT, and PDF file associations.
- Single-instance cold-start and running-app file-open handling.
- Stable `com.ebookreader.desktop` data location and tested 0.0.0 to 0.1.0 cover upgrade.
- Formal application icon, release checks, third-party notices, and SHA-256 release sums.

### Known limitations

- Windows installers are not code-signed and may trigger a SmartScreen warning.
- Updates are installed manually; there is no in-app updater in v0.1.0.
- v0.1.0 is distributed for Windows x64 only.
