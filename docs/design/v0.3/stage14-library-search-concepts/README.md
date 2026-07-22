# Stage 14.5 library and in-book search concept review set

Status: `partial_approval_revision_requested`

This review set covers both the new whole-library search experience and the user-reported correctness repair for existing TXT, EPUB, PDF, MOBI and AZW3 in-book search. It is design/specification only: no `0008_library_search.sql`, production search code, Tauri command or React/CSS is included yet.

| Board | File | Review scope |
| --- | --- | --- |
| 01 | `01-desktop-library-results.png` | Desktop rail entry, title/author/body query, grouped local results and exact jump affordance |
| 02 | `02-multilingual-search-accuracy.png` | Shared in-book/library semantics for CJK, case, accents, cross-HTML/PDF text items and locator fidelity |
| 03 | `03-index-operations-and-errors.png` | Rebuild progress/cancel, no results, missing file, damaged cache repair, partial no-text PDF result |
| 04 | `04-mobile-search-sheet.png` | 375px full-screen result and rebuild sheets with 44px targets and local-only disclosure |

Review status: boards 01, 03 and 04 are approved. Board 02 is being revised only to use a softer, lighter in-book result highlight on the deep-ink sidebar; its information architecture and correctness contract are otherwise approved.

The revised board 02 now uses a low-opacity teal mist plus a fine underline on the deep-ink sidebar, while retaining bright readable text. The light content cards keep their existing highlight treatment. This is the only visual change awaiting final confirmation.

The editable static source is `index.html`; use `?board=desktop`, `accuracy`, `operations` or `mobile`. No bitmap or remote visual assets are required.

## Locked interaction and correctness proposal

- `Ctrl+Shift+F` opens library search. Existing `Ctrl+F` remains search in the current book.
- Title, author and content search share one request surface but results are grouped by book and retain the source format label.
- TXT uses stable character offsets; EPUB/MOBI/AZW3 use spine/href plus an exact CFI range; PDF uses page and original text span. A visible excerpt and the jump locator must describe the same match.
- Unicode normalization preserves a map to original offsets. Chinese/CJK does not require spaces; English case, composed/decomposed accents and mainstream non-Latin scripts are covered by explicit fixtures.
- EPUB-derived formats match text across inline HTML nodes. PDF reconstructs reading text from positioned items rather than inserting unconditional spaces; scanned PDFs without a text layer say so explicitly and do not imply OCR.
- Indexing is local, cancellable, incremental and repairable. Finished books remain searchable after cancellation; a single failed book does not block the library.
- Missing restored books keep metadata-only results marked `File needed`; search never exposes internal paths.
- The index is disposable cache, excluded from backup, and keyed by `readerHash`. Books, annotations, progress and backups remain unchanged when it is cleared or rebuilt.
- Desktop inherits the warm-paper/deep-ink rail system. At 375px search and rebuild are full-screen sheets with 44px targets, focus restoration, Escape/back, gesture damping and reduced-motion behavior.
