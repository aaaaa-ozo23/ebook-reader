# Stage 13.1 bookshelf fidelity ledger

Status: `implemented_and_verified`

Reference boards: `01-bookshelf-grid-desktop.png`, `02-bookshelf-list-actions-v2.png`, `03-bookshelf-system-states.png`, `04-bookshelf-responsive-v2.png`, `14-motion-storyboard.png`, and `15-control-interaction-states.png`.

This ledger records the final direct comparison between the approved Stage 13.1 boards and the production bookshelf. Concept book names and generated cover art are not product fixtures: the implementation renders the user's real local books, extracted/fallback covers, persisted progress, and actual loading/error/import outcomes inside the approved visual system.

## Direct comparison

| Comparison point | Approved contract | Production result | Status |
| --- | --- | --- | --- |
| Structural frame | 106 px deep-ink rail, open `#FCFBF8` workspace, Shelf/Recent only | 106 px desktop rail; responsive 92/76 px rail; rail removed at 375 px; no reader navigation leaked into the shelf | matched |
| Desktop Grid | Three columns, two visible rows, cover-led open layout, title/author/format/progress and overflow action | Three-column identity-preserving grid; 172×280 cover geometry at 1536 px; information and progress align to the approved columns | matched |
| Desktop List | Compact 70×105 covers, title/author/format grouped together, progress at right, separated destructive menu | 70×105 covers; two-column information/progress body; origin-aware menu; centered one-step confirmation | matched |
| Header/actions | Editorial heading, count/sort pills, teal segmented Grid/List and terracotta Import | Approved hierarchy, labels, color tokens, 56 px desktop controls and 44 px compact controls | matched |
| System states | Six skeletons, empty line art/CTA, load error/retry, importing and success/cancel/failure feedback | All states are rendered in the real shell and covered by App tests; no state is a standalone demo surface | matched |
| Responsive | 900 px three columns, 640 px two columns, 375 px three-column cover grid and compact list, no horizontal overflow | Automated geometry checks at 900/640/375 plus DPR2; mobile rail removed and all visible controls meet 44 px | matched |
| Interaction/focus | Immediate press feedback, visible amber focus, menu focus transfer, Cancel-first destructive dialog | `scale(0.97)` press; 3 px amber focus; menu first item and dialog Cancel receive focus; Escape/focus restoration retained | matched |
| Motion | 180–220 ms Grid/List continuity, 150–180 ms origin-aware popover, initial 30–45 ms stagger, reduced-motion crossfade | View Transition identity per book, 38 ms initial stagger, 170 ms popover and transform/opacity feedback; reduced motion removes translation/stagger | matched |
| Data/runtime boundary | Real local EPUB/TXT/PDF data; reader runtimes remain lazy | No demo books or generated concept covers ship; persisted progress is loaded with six-request concurrency and record-level failure isolation; ReaderShell remains lazy | matched |

## Mismatch corrections made during QA

- Removed a 20 px Grid card inset that shifted every desktop cover away from the approved column origin.
- Re-grouped List format metadata with title/author instead of leaving it as a detached center column on wide windows.
- Corrected desktop cover ratio and vertical rhythm to align 1536 px row starts with the approved board.
- Limited desktop Grid progress tracks to the approved information-column width instead of stretching to the full card remainder.
- Hid overflow buttons in the 375 px Grid state while retaining them in List and retaining context-menu access, matching the approved compact surface.
- Finished entry/layout animations before automated contrast analysis so DPR2 checks measure the stable visual state rather than a partially transparent transition frame.

## Verification evidence

- Production build and all desktop unit tests pass: 18 files, 158 tests.
- Stage 13.1 Chromium visual/interaction suite passes: Grid/List, menu/dialog, Recent, 900/640/375, axe serious/critical, reduced motion.
- Chromium DPR2 suite passes all responsive and Stage 13.1 checks.
- Existing bookshelf smoke coverage passes for empty shelf, long fallback-cover title, and right-click removal.
- The in-app Browser verified the real Vite page identity, exact-width no-overflow geometry, Grid/List and Shelf/Recent state changes, empty-state copy, and a fresh console containing no warnings or errors.
- Final visual evidence was inspected at original resolution against the approved boards: `D:\tl-temp\ebook-reader-stage13-13.1-grid.png`, `D:\tl-temp\ebook-reader-stage13-13.1-list.png`, and `D:\tl-temp\ebook-reader-stage13-13.1-mobile.png`.

There are no unrecorded Stage 13.1 visual deviations. Stage 13.2 may reuse the approved tokens and motion primitives but must not alter the verified bookshelf information architecture.
