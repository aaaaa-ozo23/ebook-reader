# Changelog

All notable changes to Ebook Reader are documented in this file.

## [0.4.0] - 2026-07-29

### Added

- macOS 12+ Universal support for Intel and Apple Silicon with a signed/notarized DMG track and
  one Universal updater asset shared by both Darwin architecture keys.
- Linux x64 support built on Ubuntu 22.04 with AppImage automatic updates and manual deb upgrades;
  runtime acceptance covers Ubuntu 22.04/24.04 and Debian 12.
- A compile-time desktop platform capability contract for platform, architecture, primary
  modifier, five-format support, and NSIS/MSI/macOS/AppImage/deb distribution tracks.
- Target-triple libmobi 0.12 sidecars, native macOS menus and file-open handling, Linux MIME
  integration, cross-platform SBOMs, and deterministic RC assembly.

### Changed

- EPUB, TXT, PDF, MOBI, and AZW3 now share the same supported-format contract on Windows, macOS,
  and Linux; macOS uses Command while Windows/Linux use Control for primary shortcuts.
- The manual-only Actions workflow now gates Windows x64, macOS Intel/Apple Silicon, and Ubuntu
  22.04 quality before signed package jobs and Ubuntu 24.04/Debian 12 runtime acceptance.
- NSIS, macOS, and AppImage use signed updater artifacts; MSI and deb explicitly remain manual
  upgrade tracks.

### Security

- Sidecars resolve only from trusted bundled resources and are checked for target architecture,
  permissions, source provenance, and SHA-256.
- macOS packaging fails closed unless Developer ID signing, notarization, stapling, Gatekeeper,
  Universal slices, and updater verification all succeed.
- Release assembly validates all four CycloneDX SBOMs, updater signatures, secret/path scans,
  deterministic asset names, the four-platform feed, and SHA-256 inventory.

## [0.3.0] - 2026-07-25

### Added

- Offline import and reading for DRM-free MOBI and AZW3 through the bundled, pinned libmobi
  sidecar; source files remain the library identity while verified derived EPUB files reuse the
  existing EPUB reader and locator model.
- App-local TTF/OTF custom fonts for TXT and EPUB, including validation, enable/disable, removal,
  fallback, hash deduplication, and portable-backup support.
- Multilingual whole-library search across metadata and readable book text, with exact in-book
  jumps, cancellable rebuilds, missing-file handling, and a rebuildable local FTS index.
- Local reading history and Insights with active-time heartbeats, daily and per-book summaries,
  privacy controls, clear tombstones, CSV export, and portable-backup merge behavior.
- `.erbackup` format v2 for source/reader derivatives, custom fonts, and reading history while
  retaining an explicit v1 migrator.

### Changed

- Folder import now reports real scanning stages and always reaches a selectable preview instead
  of presenting a completed progress bar while discovery is still running.
- Previous/Next controls, typography icons, margins, bookmark empty states, search highlights,
  and desktop/mobile reader fidelity now share the approved Stage 13 visual system.
- EPUB, MOBI/AZW3, TXT, and PDF search share Unicode normalization and original-offset mapping for
  Chinese, English, accented Latin, Japanese, Arabic, and other mainstream scripts.
- EPUB and PDF double-page mode now uses the actual available reading stage outside Focus mode;
  large continuous PDF jumps keep the strict 50 ms long-task budget.

### Security

- MOBI/AZW3 conversion is local-only, rejects DRM before launching the sidecar, uses isolated
  staging, validates the derived EPUB, and cleans up on cancellation, timeout, crash, or rollback.
- The bundled libmobi 0.12 binary is hash-pinned and shipped with LGPL source material and
  detached signature; release SBOM and license gates include the component.

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
