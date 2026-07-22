# Stage 14.4 custom font fidelity ledger

Status: `complete`

The four approved boards in `stage14-custom-font-concepts/` are the production specification. This ledger records the final runtime comparison rather than treating component presence as visual acceptance.

| Approved requirement | Runtime result | Evidence |
| --- | --- | --- |
| Reading & Fonts uses the existing warm-paper settings center | Passed | 1280px Chromium shows the deep-ink rail, warm paper content, teal primary action, amber active marker and a single desktop title hierarchy. |
| Fonts are app-local and PDF behavior is explicit | Passed | Desktop notice states that files stay in the private font library; the persistent format note states that PDF uses document-embedded fonts. |
| Preview, library rows and selected state match the approved hierarchy | Passed | Built-in Lora appears as the selected fallback, preview and metadata are separated, and custom-font actions are secondary to the selected reading font. |
| 375px uses the approved full-screen sheet | Passed | Mobile renders a 78px handle/header, 44px back and close targets, compact preview/library rows and a fixed 44px Import font action without horizontal overflow. |
| Import, duplicate, unsupported and active-font removal are safe | Passed | Vitest covers preview-before-import, license responsibility, content-hash duplicate feedback, unsupported input, removal confirmation and immediate Lora fallback. |
| Motion and accessibility remain aligned with Stage 13 | Passed | Reduced-motion removes sheet animation; dialog dismissal restores focus; Axe reports no serious or critical violations; console warning/error collection is empty. |

## Closed runtime differences

- The first desktop render exposed both the desktop and mobile title/copy because a broader header selector overrode the mobile hidden rule. The final selector is scoped with equal specificity, so only the correct breakpoint copy is in layout.
- The first mobile render inherited solid SVG fill in the sheet header. Back and close now use the same 20px stroked icon contract, verified from computed style.
- The first Axe pass found the 11.2px fallback metadata at 4.29:1. The final text color is darker and passes WCAG AA.

## Verification

- `pnpm.cmd check`: Core 9/9; Desktop 184/184; ESLint, Prettier and production build passed.
- `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: 65/65.
- Full Playwright: 31/31 across Chromium, DPR2, TXT and the isolated 500-page PDF performance project.
- Runtime screenshots are emitted by `apps/desktop/tests/stage14-custom-fonts.spec.ts` for 1280, 900, 640 and 375px.
