# Stage 13 Reader UI Fidelity Follow-up

## Scope

This follow-up closes the user-reported gaps that remained after Stage 13.2: Notes and Search, the selection/annotation surface, bookmark state, reading settings, paginated navigation, and stale EPUB multiple-note interactions. It changes reader presentation and event freshness only; EPUB/TXT/PDF adapters remain behind the existing lazy ReaderShell boundary.

## Before / after decision ledger

| Area | Before | After | Why |
|------|--------|-------|-----|
| Notes | Large Jump/Delete buttons, clipped excerpts, no current-location entry | Full wrapped excerpts, compact icon actions, Add note, bounded vertical scrolling | Matches the approved dense utility sidebar and keeps long Chinese notes usable |
| Search | Oversized split result layout and weak query emphasis | Single-column results with exact-term highlight, clear loading/empty states, bounded scrolling | Makes result scanning and location context immediate |
| EPUB note freshness | Iframe click handler captured an old annotations array until the reader remounted | Latest callback ref plus composite annotation signature; same-CFI notes are grouped under one hit target | New notes become available on the current page immediately without exit/re-entry |
| Saved notes popover | Fixed-height rows clipped long text and overflow had no usable wheel path | Viewport-bounded list, complete wrapping, styled scrollbar and mouse-wheel scrolling | Preserves every note while keeping the popover anchored to the underline |
| Selection menu | Functionally correct but visually detached from the approved utility surfaces | Compact neutral popover remains anchored to the first selection rect with approved action order | Keeps the action close to context without obscuring the selected text |
| Bookmark state | Sidebar record existed but page state was easy to miss | Top action exposes `aria-pressed`; content edge renders a matching amber bookmark indicator | The current page and stored bookmark state now agree visually and semantically |
| Font control | Native Windows popup leaked platform selection styling outside the design system | Controlled rounded listbox with keyboard navigation, focus treatment and selected state | Delivers consistent warm-paper utility styling across desktop environments |
| Reading settings | Core controls were long and Reset could displace the primary mobile controls | Theme-first mobile sheet; compact Font/Size and icon segmented Line height/Spacing/Margin; Reset at the end | Mirrors the approved control hierarchy while retaining 44 px targets |
| Paginated controls | Previous/Next and Single/Double read as one undifferentiated control group | Previous/current/Next form the main pill; Single/Double remain an adjacent two-segment group | Separates navigation from layout mode as shown in the approved concept |
| Dark active state | Active bookmark contrast could fall below axe expectations during dark theme | Brighter teal active indicator with unchanged amber focus ring | Retains the palette while meeting serious/critical accessibility checks |

## Interaction contract

- Adding multiple EPUB notes to one locator must update the current iframe interaction immediately.
- Clicking the shared underline opens all live notes for that locator; soft-deleted entries remain excluded.
- Notes and Saved notes must wrap arbitrary-length text, expose internal vertical scrolling, and respond to mouse wheel input.
- Theme and font controls retain keyboard operation, focus restoration, Escape close, and reduced-motion behavior.
- Mobile settings reset its scroll position on every open so Theme is always the first visible decision.
- TXT/EPUB paginated navigation and layout mode remain separate semantic groups.

## Stable screenshot set

The final Playwright run writes these screenshots beneath `apps/desktop/test-results`:

- `stage13-reader-desktop.png`
- `stage13-reader-search-result.png`
- `stage13-reader-settings-desktop.png`
- `stage13-reader-font-menu-desktop.png`
- `stage13-reader-mobile-settings.png`
- `stage13-reader-selection-menu.png`
- `stage13-reader-bookmarks.png`
- `stage13-reader-notes-live.png`
- `stage13-reader-notes-sidebar.png`
- `txt-paginated-double.png`

## Verification

- `pnpm.cmd check`: core 8 tests; desktop 24 files / 176 tests; lint, format and production build passed.
- `pnpm.cmd --filter @reader/desktop test:e2e`: 26/26 across Chromium, DPR2, responsive, reduced-motion and axe coverage.
- `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml --check`: passed.
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`: 51/51 passed.
- `git diff --check`: passed.

## Accepted evidence boundary

The in-app Browser verified the real Vite shell and empty-library layout. Its isolated web context cannot complete a Tauri native file chooser, so deterministic TXT/EPUB/PDF books and annotation states are supplied by repository Playwright fixtures. This is a test-environment boundary, not an application fallback or a claimed native import success.
