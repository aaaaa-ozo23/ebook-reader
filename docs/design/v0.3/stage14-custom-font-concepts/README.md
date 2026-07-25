# Stage 14.4 custom font UI concept review set

Status: `approved_and_implemented`

These four boards extend the approved Stage 13 settings system. The user approved all four on 2026-07-22; the production implementation and its fidelity evidence are recorded in `../stage14-custom-font-fidelity.md`.

| Board | File | Review scope |
| --- | --- | --- |
| 01 | `01-desktop-font-library.png` | Reading & Fonts settings, active/default fonts, enable state and local-only explanation |
| 02 | `02-font-import-review.png` | TTF/OTF review, font metadata, license responsibility and explicit import confirmation |
| 03 | `03-duplicate-error-remove.png` | Duplicate/unsupported feedback plus removal of the active font with immediate fallback |
| 04 | `04-mobile-fonts-sheet.png` | 375px full-screen settings sheet, preview, compact font list and sticky import action |

The editable static source is `index.html`; use `?board=library`, `import`, `states` or `mobile`. No bitmap assets or generated illustrations are required.

## Locked interaction notes proposed for approval

- Fonts remain app-local and are never installed into Windows.
- Only static TTF/OTF files are accepted in v0.3, up to 20 MiB each. TTC/OTC and WOFF/WOFF2 are rejected before import.
- The importer shows the parsed family/style and file size before the user confirms. It never trusts the filename as font identity.
- Users are responsible for having permission to use imported fonts; the notice is visible before confirmation, not buried in documentation.
- Disabling or deleting the currently selected font immediately falls back to the built-in reading font and saves that fallback.
- Duplicate files are identified by content hash and point to the existing font instead of creating a second record.
- TXT and EPUB use the selected custom font. PDF keeps document-embedded fonts and says so plainly.
- Desktop uses the existing settings center and modal. At 375px the page becomes the existing full-screen sheet with 44px targets, sticky action, focus restoration, Escape/back handling, interruptible drag and reduced-motion crossfade.
