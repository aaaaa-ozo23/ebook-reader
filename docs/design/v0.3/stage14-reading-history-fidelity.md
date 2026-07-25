# Stage 14.6 reading history fidelity and runtime evidence

Status: `implementation_complete`

The four approved boards in `stage14-reading-history-concepts/` were treated as production
specifications. No new bitmap or generated illustration was required; the shipped surfaces use the
existing warm-paper, deep-ink, teal, amber, focus-ring and motion tokens.

## Board-to-production mapping

| Approved board | Production surface | Result |
| --- | --- | --- |
| 01 desktop Insights | Shelf rail → Insights | Today, 7 days and All time summaries, daily trend, per-book effective time and saved completion are present. |
| 02 History & Privacy | Settings → History & Privacy | Local-only copy, enabled toggle, CSV export, Show in folder, and destructive clear action follow the approved hierarchy. |
| 03 states and clear | Insights and settings state variants | Disabled, empty, active, export-success and explicit clear confirmation are implemented without invented metrics. |
| 04 mobile | 375px full-screen destinations | Insights keeps the compact summaries/chart/book list; History keeps 44px controls and the existing mobile settings language. |

## Effective-time contract

- `0009_reading_history.sql` stores preferences, clear timestamp and UUID-based sessions.
- A session begins only after the reader reports ready. Heartbeats are sent every 30 seconds only
  while the document is visible, the window is focused, and interaction is no older than five
  minutes. Intervals over 45 seconds are excluded.
- Turning history off ends the current session. Clear removes sessions and advances a tombstone;
  backup restore cannot reintroduce sessions at or before the newer clear timestamp.
- The reader heartbeat hook keeps transient timestamps in refs and does not subscribe the heavy
  reader tree to per-interaction state. `ReaderShell` remains lazy-loaded.

## Runtime comparison and corrections

- In-app Browser: the real Vite app was inspected at 1280px and 375px. Page identity and non-empty
  rendering were correct, there was no framework overlay or horizontal overflow, and relevant
  console warning/error count was zero.
- The 375px back, close, history switch and export controls meet the 44px target. The switch was
  exercised and changed its accessible `aria-checked` state.
- Playwright's populated desktop fixture closed the browser-fallback data gap and verified the
  complete dashboard, Escape focus restoration, reduced motion and axe serious/critical zero.
- Initial implementation used low-contrast secondary chart copy and a 30px visual switch as the
  hit target. Production CSS separates the 44px target from its 30px track and raises text contrast
  to AA without changing the approved palette.
- Export success originally exposed only the path text. Production adds the approved **Show in
  folder** action through the existing opener plugin.

Final screenshots:

- `apps/desktop/test-results/stage14-reading-insights-desktop.png`
- `apps/desktop/test-results/stage14-reading-history-mobile.png`

The targeted Stage 14.6 Playwright scenarios both completed successfully. On Windows, the
temporary Vite child process retained its output handle after all assertions, matching the existing
repository teardown issue; no failed test or error context was produced.
