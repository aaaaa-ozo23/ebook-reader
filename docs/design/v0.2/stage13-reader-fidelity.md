# Stage 13.2 Reader Fidelity Ledger

## Scope

This ledger closes the approved Stage 13 reader concepts 05–15 against the implemented EPUB, TXT and PDF reader. Product data and capability checks remain authoritative; concept titles and artwork are presentation fixtures only.

## Approved contract

| Area | Implemented contract | Evidence |
|------|----------------------|----------|
| Desktop chrome | Deep-ink contents sidebar, three-part topbar, open reading stage and right-side settings | Seeded TXT desktop/settings screenshots; EPUB/PDF smoke |
| Contents and utilities | Four icon tabs, selected teal indicator, book title/author, existing resizer and real TOC data | TXT/EPUB/PDF contents tests and 900 px resize regression |
| Reading settings | Four `Aa` theme swatches, Lora font selector, size stepper, icon-segmented line/spacing/margin presets, and format-aware reading mode/transition/page-view controls | Theme unit tests plus TXT/EPUB/PDF interaction smoke |
| Responsive reader | 640 px persistent compact sidebar; 375 px white drawer, backdrop and bottom sheet | Compact/drawer/settings screenshots and overflow assertions |
| Reader formats | TXT continuous/paginated, EPUB single/double, PDF continuous/single/double retain existing adapters | Generated three-format smoke plus 500-page PDF virtualisation |
| Side-panel utilities | Bookmark add/jump/delete, note colour/excerpt/actions, search field/clear/loading/empty/results and truthful locator labels use real stored data | Generated EPUB bookmark/notes/search screenshots plus App interaction tests |
| System states | Format-specific EPUB/TXT/PDF skeletons, indeterminate opening copy, whole-book recovery and per-page PDF retry | Reader component tests and generated-format smoke |
| Overlays | Selection menu, annotation editor/list and destructive/system surfaces use neutral white utility surfaces | Existing annotation/search/modal tests and Stage 13 CSS |
| Image viewer | Dark modal, zoom/pan/reset controls, 100–500% range and mobile full-screen mode retained | Generated EPUB image-viewer desktop/mobile smoke |
| Motion | Short press, first-hover delayed/adjacent-immediate tooltips, origin-aware popover, 1:1 touch drawer/sheet tracking with velocity close and rubber-banding, reduced-motion crossfade | EPUB tooltip timing plus TXT drawer/sheet pointer smoke and reduced-motion acceptance |

## Fidelity corrections made during QA

| Finding | Resolution |
|---------|------------|
| Default desktop sidebar rendered at the old 292/300 px width | Core default and CSS fallback aligned to 366 px |
| Opening settings at 1280 px caused title/tool overlap | Hide the repeated centered title below 1400 px while settings is open |
| 640 px topbar clipped Theme/Focus | Use a dedicated equal-width four-tool compact bar; title remains in the persistent sidebar |
| Dark reading theme leaked into the white settings controls | Theme swatches, select and steppers use a neutral utility palette independent of page theme |
| Generic page width forced PDF Double back to Single | Limit the 690 px editorial measure to TXT virtual content only |
| Sidebar/topbar controls had overlapping accessible names | Distinguish Shelf, Back to shelf and Close contents; restore focus to the trigger on close |
| The first 13.2 pass simplified line/spacing/margin to numeric controls and omitted format page view | Replaced them with the approved icon segments and wired EPUB/TXT/PDF Single/Double to real adapter preferences, including truthful Continuous-mode disabling |
| Mobile topbar exposed Focus instead of the approved overflow path | Mobile order is Back, Contents, Theme, Bookmark, More; More contains Notes, Search and Focus mode while desktop retains the four primary tools |
| Drawer and settings sheet only replayed CSS entrance animation | Added touch/pen presentation tracking, horizontal/vertical intent locking, progressive resistance, velocity-aware settle/close and safe pointer-capture fallback |
| Tooltip warm-up state rerendered the heavy reader tree | Moved the presentation state to the toolbar DOM class; first hover remains delayed and adjacent hover immediate without reader-content work |
| PDF theme changes could rerender all mounted Canvas surfaces in one frame | Render PDF ink over transparent Canvas, update mounted page backgrounds directly, and memoize continuous/paginated page trees; the unchanged 50 ms long-task gate passes at DPR1/DPR2 |

## Stable screenshot set

- `stage13-reader-desktop.png` — 1280 px TXT reader with 366 px sidebar.
- `stage13-reader-settings-desktop.png` — desktop Reading settings.
- `stage13-reader-compact.png` — 640 px persistent sidebar and compact toolbar.
- `stage13-reader-mobile-drawer.png` — 375 px contents drawer.
- `stage13-reader-mobile-settings.png` — 375 px bottom-sheet settings.
- `stage13-reader-bookmarks.png` — real bookmark action/list state.
- `stage13-reader-notes-empty.png` — notes empty state.
- `stage13-reader-search-empty.png` — search field/clear/no-result state.

The screenshots are generated by the seeded TXT Playwright flow under `apps/desktop/test-results`; EPUB/PDF visual states use their generated runtime fixtures and are not checked into source control.

## Accepted differences

- The implementation renders the user's real title, author, TOC, progress and document pages; approved mock content is never embedded.
- Format-specific controls appear only when the core capability and active adapter support them. Page view remains visible but truthfully disabled in Continuous TXT/PDF mode because the approved contract requires the reason to be explained.
- At 640 px the duplicated topbar identity block is removed because the persistent sidebar already carries it; this preserves all four operations without clipping.
- Browser isolation has no seeded local books, so Browser validates the live shell and overflow while Playwright supplies deterministic TXT/EPUB/PDF data.

No other visual or interaction deviation remains unrecorded. The follow-up fidelity audit re-opened all 15 approved boards at original resolution and closed every identified implementation gap. Stage 13.3 is intentionally not started.
