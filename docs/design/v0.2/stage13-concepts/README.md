# Stage 13.1/13.2 UI concept review set

Status: `approved_for_implementation`

Approval date: 2026-07-16. The user approved all 15 active boards without requested visual changes. These boards are now binding implementation references for Stage 13.1 and 13.2; the product capability and copy corrections in `../README.md` remain authoritative where generated sample content differs from real library data.

This directory is the approved visual contract for Stage 13.1 bookshelf polish and Stage 13.2 reader polish. The user-provided four images are style and structure references; current EPUB/TXT/PDF capabilities and the product copy contract in `../README.md` remain authoritative. Implementation must preserve real user data and behavior while matching the approved layouts, component geometry, responsive states, palette, typography, icon treatment, interaction logic, and motion contract.

## Visual direction

The direction is a quiet editorial local library: true-white utility surfaces, warm paper only inside reading/content contexts, deep ink-charcoal structural chrome, restrained teal selection/progress, terracotta for the import action, and amber for focus/current-location cues. The interface should feel calm, precise, tactile, and desktop-native rather than like a card-heavy web dashboard.

### Core tokens

| Role | Concept value | Use |
| --- | --- | --- |
| App background | `#FCFBF8` | bookshelf workspace |
| Utility surface | `#FFFFFF` | panels, menus, dialogs |
| Reading paper | `#F7F2E8` | sepia/light reading stage only |
| Structural chrome | `#1F3035` | rail, reader sidebar, image viewer chrome |
| Primary ink | `#20211F` | headings and main UI text |
| Muted ink | `#667078` | metadata and secondary labels |
| Action teal | `#235F62` | selected control, progress, current item |
| Import terracotta | `#B94B35` | one primary bookshelf action |
| Focus amber | `#F2B84B` | focus-visible and sparse current markers |
| Border | `#DFE1DE` | restrained dividers and component edges |
| Danger | `#B33A2B` | destructive confirmation only |

Typography uses system UI for application chrome and a readable book serif for document content. Headings have tight tracking; labels and compact controls have deliberate 12–15 px sizing. Cards use 10–12 px radii only where containment is useful; open rails, lists, reading stages, and toolbars stay unboxed.

## Review boards

| File | Functional surface | Required states |
| --- | --- | --- |
| `01-bookshelf-grid-desktop.png` | Desktop bookshelf grid | shelf/recent navigation, count/sort, Grid/List, import, progress, overflow selected state |
| `02-bookshelf-list-actions-v2.png` | Desktop list and actions | compact list, open/remove menu, missing-cover fallback, delete confirmation |
| `03-bookshelf-system-states.png` | Bookshelf system states | loading, empty, library error/retry, importing, import success/cancel/error feedback |
| `04-bookshelf-responsive-v2.png` | Responsive bookshelf | 900/640/375 layouts, touch targets, mobile grid/list, no horizontal overflow |
| `05-epub-reader-desktop-v2.png` | EPUB reader | contents, top tools, chapter page, bottom navigation/progress, settings panel |
| `06-reader-library-panels-v2.png` | Reader side panels | contents, bookmarks, notes, search/result states and resizable desktop panel |
| `07-reader-format-settings-v2.png` | Format-aware settings | four themes; EPUB transition/spread; TXT continuous/paginated; PDF continuous/single/double |
| `08-txt-reader-desktop-v2.png` | TXT reader | continuous and paginated double, calculating status, metadata, selection/highlight state |
| `09-pdf-reader-desktop-v2.png` | PDF reader | continuous virtual pages, single/double, fit width/zoom, page input/progress, per-page retry |
| `10-reader-overlays-focus.png` | Reader overlays | focus mode, selection toolbar, note editor, saved notes popover, keyboard/focus treatment |
| `11-epub-image-viewer-v2.png` | EPUB image viewer | fit/100%, zoom out/in, reset, 100–500% range, drag-to-pan, desktop and narrow presentation |
| `12-reader-responsive-v2.png` | Responsive reader | 640 single sidebar, 375 contents drawer, settings bottom sheet and mobile progress |
| `13-reader-system-states.png` | Reader system states | EPUB/TXT/PDF opening, whole-book failure, progressive TXT pagination and PDF page retry |
| `14-motion-storyboard.png` | Motion specification | origin-aware popover, interruptible drawer, Grid/List layout animation, direction-aware page transition and reduced motion |
| `15-control-interaction-states.png` | Control interaction logic | buttons, icon buttons/tooltips, segmented controls, sliders/fields, menu and destructive dialog states |

The unversioned first-pass files for boards 02, 04–09, 11, and 12 are retained only as generation history. They are superseded because their first pass copied known reference-image deviations such as duplicated reader navigation or unsupported controls. Only the files listed in the table above are active review candidates.

## Motion contract

| Interaction | Motion vocabulary | Contract |
| --- | --- | --- |
| Button/tappable control | Press / Tap feedback | respond on pointer-down; `scale(0.97)` for 100–140 ms; no delayed click feedback |
| Overflow/popover | Origin-aware animation + Scale in + Fade in | start from trigger origin at `scale(0.97)`; 150–180 ms strong ease-out; faster exit |
| Desktop settings panel | Continuity transition | translate/fade from the right along a symmetric path; 220 ms; no bounce |
| Mobile contents/settings | Slide in + Spring + Rubber-banding | track gesture 1:1, pass velocity to an interruptible spring, progressively resist beyond bounds |
| Grid/List switch | Layout animation + Crossfade | preserve book identity and cover position; 180–220 ms ease-in-out; do not stagger after initial load |
| Initial library reveal | Stagger | optional 30–45 ms cover-to-cover delay, never blocks interaction |
| Selection/note surfaces | Origin-aware animation | attach to selection/note trigger; crossfade during re-target to mask discontinuity |
| Keyboard commands | none | high-frequency keyboard navigation and Escape close respond immediately |
| Reduced motion | Crossfade | remove translation, springs, parallax and page motion; retain 120–180 ms opacity/color feedback |

Animations should change only `transform` and `opacity` where possible. Drawer gestures use presentation values and preserve velocity when interrupted. Hover effects are gated behind `(hover: hover) and (pointer: fine)`.

## Interaction rules

- One obvious primary action per surface. `Import book` is the bookshelf primary action; reader chrome remains neutral.
- Destructive `Remove from shelf` is separated from normal actions and confirmed once in a centered alert dialog.
- Side panels answer where the user is, where they can go, and how to close. The desktop panel is resizable; the mobile equivalent is a dismissible drawer/sheet.
- Settings appear next to the content they affect and expose only the current format's capabilities.
- Focus mode removes side chrome while preserving title, progress, exit, and keyboard wayfinding.
- Tooltips delay only on the first hover; adjacent toolbar tooltips become immediate.
- Every visual state has a focus-visible outline, 44 px touch target on compact layouts, and a reduced-motion equivalent.

## Generation provenance

- Mode: built-in `image_gen`.
- Use case: `ui-mockup`.
- Input images: all four user images are reference images for palette, density, composition, and responsive behavior; none is an edit target.
- Constraints shared by every board: shippable product UI rather than concept art; preserve the current information architecture; no MOBI/AZW3, cloud, social, download, marketing panels, fake metrics, decorative pills, device chrome, watermarks, or unrelated features; practical React/CSS implementation; legible English UI labels; consistent icon family and component geometry.
