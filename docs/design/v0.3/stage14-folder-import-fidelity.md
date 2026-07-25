# Stage 14.5a folder import fidelity ledger

Reference: `docs/design/v0.3/stage14-mobi-concepts/02-conversion-progress.png`

Runtime evidence: `apps/desktop/test-results/stage14-mobi-import-previe-3aaca-ess-and-partial-DRM-failure-chromium/stage14-folder-scan-hashing.png`

The folder scan is a preparatory state, not a libmobi conversion state. It therefore keeps the approved modal/component system while using the narrower truthful sequence `Scanning → Hashing → Preview`.

| Comparison point | Approved concept | Runtime evidence | Resolution |
| --- | --- | --- | --- |
| Container and palette | Centered warm-paper modal over blurred shelf; deep-ink text with teal/amber state | Same centered geometry, backdrop, paper surface, ink hierarchy and teal/amber progress treatment | Match |
| Current work row | Dark format tile, strong current label, muted supporting phase and count | `SCAN` tile, `Checking discovered books`, current safe filename and `1 of 2` | Match with scan-specific copy |
| Progress semantics | Count-based progress; no invented libmobi percentage | Indeterminate only while recursive total is unknown; exact 50% at hashing 1/2 | Intentional truthful specialization |
| Stage rail | Completed teal, active amber, pending neutral | Scanning complete, Hashing active, Preview pending; six conversion stages remain exclusive to actual import | Match at the scan lifecycle level |
| Privacy and cancellation | Local-only disclosure and 44px cancel action | Folder-local disclosure and 44px `Cancel scan`; closing also cancels the operation | Match |
| Responsive/motion | Existing Stage 13 modal/sheet and reduced-motion rules | Reuses the same dialog; indeterminate translation becomes a static muted fill under reduced motion | Match |

Above-the-fold copy adds only scan-specific functional text required by the approved import workflow. No decorative label, card family, remote service claim or new visual language was introduced.
