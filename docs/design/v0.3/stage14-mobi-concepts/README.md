# Stage 14.3 MOBI/AZW3 UI concept review set

Status: `awaiting_review`

These four boards extend the approved Stage 13 visual system without changing its information architecture, palette, control geometry or motion language. They are design assets only; production React/CSS must not be implemented until the user approves them.

| Board | File | Review scope |
| --- | --- | --- |
| 01 | `01-desktop-import-preview.png` | Desktop preview, real source-format badges, local conversion explanation, duplicate/unsupported states |
| 02 | `02-conversion-progress.png` | Current file, item count, truthful stage-only progress, local-only notice, 44px cancel action |
| 03 | `03-drm-partial-results.png` | Explicit no-DRM boundary, per-item partial success/failure, no-residue copy |
| 04 | `04-mobile-sheet-drop-overlay.png` | 375px full-screen review sheet, drag handle, sticky actions and drop overlay |

The editable static source is `index.html`; use `?board=preview`, `progress`, `results` or `mobile` at a 1440×900 viewport. No new bitmap assets are required.

## Locked interaction notes

- MOBI/AZW3 rows keep their source badges and say “Will convert locally to EPUB.”
- Conversion progress reports `scanning → hashing → converting → validating → committing → completed`; it does not invent a per-book percentage.
- Cancel remains available until commit begins. The active operation and current item are always named.
- DRM copy says the app will not attempt to remove protection and offers no password, decryption or online-conversion control.
- Partial success never rolls back successfully imported siblings; each failed item explains that no library record or managed file was kept.
- Desktop uses the existing centered modal. The 375px surface is the existing interruptible sheet pattern with at least 44px targets, focus restoration, Escape/backdrop close and reduced-motion crossfade.
