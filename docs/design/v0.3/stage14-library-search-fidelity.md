# Stage 14.5 library search fidelity ledger

## Approved specification

The four approved boards in `stage14-library-search-concepts/` remain the visual contract. The
scope includes both whole-library search and the existing per-book search for TXT, EPUB, PDF,
MOBI and AZW3.

## Production comparison

| Contract | Production result | Evidence |
|----------|-------------------|----------|
| Desktop Search rail and grouped results | Search is a lazy bookshelf destination with warm-paper workspace, deep-ink rail, source-format badges and grouped hit rows | In-app Browser at 1280px; Playwright desktop library-search flow |
| Multilingual correctness | One normalized query maps excerpts and locators back to original text; EPUB ranges cross inline nodes and PDF fragments use geometry | `searchText`, EPUB/PDF/TXT unit fixtures and Rust index tests |
| Soft in-book highlight | Dark sidebar uses a low-opacity teal mist; light results use a 22% teal highlight with a fine lower edge | computed styles and Playwright highlight assertion |
| Index operations and failures | Rebuild/cancel uses operation IDs; missing files and no-text PDFs remain explicit; one book cannot block another | Rust status/index tests and React progress tests |
| 375px full-screen layout | Sticky 44px back/close controls, focused search input, 44px filters, no horizontal overflow | In-app Browser 375×812 and Playwright mobile/axe test |
| Keyboard and focus | `Ctrl+Shift+F` opens library search; `Ctrl+F` remains in-book search; Escape restores a live shelf target after remount | Browser keyboard pass and Playwright focus assertion |

## Closed implementation differences

- The first mobile pass retained 36px filter chips. Production now uses 44px controls and the
  browser geometry assertion reports `44/44/44`.
- The first close path retained a reference to an unmounted shelf button. Focus restoration now
  resolves the newly mounted Search trigger, with the bookshelf main region as the 375px
  fallback.
- A library result originally identified only a chapter or page. Targets now retain occurrence
  order and source offset, so repeated matches reopen the intended occurrence.

## Acceptance

- In-app Browser: 1280 and 375 layouts, zero warning/error logs, no horizontal overflow, correct
  initial focus, 44px mobile filters and Escape focus restoration.
- `pnpm.cmd check`: Core 9/9 and Desktop 206/206, lint, Prettier, TypeScript and production build.
- Cargo fmt and Rust 74/74.
- Playwright 33/33 across Chromium, DPR2, reduced motion, accessibility and the isolated 500-page
  PDF performance track.
- `git diff --check` passed.
