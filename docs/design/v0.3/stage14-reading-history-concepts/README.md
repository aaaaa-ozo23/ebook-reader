# Stage 14.6 reading history and insights concept review set

Status: `awaiting_user_approval`

These four boards extend the approved Stage 13/14 warm-paper, deep-ink, teal and amber system.
They are design specifications only: no `0009_reading_history.sql`, production React/CSS or
Tauri session command is included on this branch yet.

| Board | File | Review scope |
| --- | --- | --- |
| 01 | `01-desktop-insights-dashboard.png` | Desktop Insights rail destination, Today/7 days/All time summaries, daily trend and per-book statistics |
| 02 | `02-history-privacy-settings.png` | History & Privacy settings, local-only explanation, enable toggle, CSV export and destructive clear action |
| 03 | `03-history-states-and-clear.png` | Disabled/empty state, active-session status, export success and explicit clear confirmation |
| 04 | `04-mobile-insights-and-history.png` | Two 375px full-screen states with 44px controls, compact trend, book rows and sticky settings action |

The editable static source is `index.html`; use `?board=insights`, `privacy`, `states`, or
`mobile`. No bitmap assets or generated illustrations are required.

## Interaction notes proposed for approval

- History is enabled by default and stays completely local. The UI does not imply sync,
  telemetry, social comparison, streak pressure or productivity scoring.
- A session begins only after a reader opens successfully. Counted time requires a visible,
  focused window and recent reading interaction; background, sleep and gaps over 45 seconds are
  excluded.
- Insights reports Today, recent 7 days, total effective time, daily minutes and per-book time.
  Completion percentages reuse existing saved reading progress.
- Turning history off ends an active session immediately and stops new heartbeats; existing
  history remains until explicitly cleared.
- CSV export is local and user initiated. Clear history uses a centered confirmation and writes a
  clear timestamp so older restored sessions do not reappear.
- Desktop uses the existing rail/settings center. At 375px both destinations use the existing
  full-screen sheet language, 44px targets, sticky actions, focus restoration, Escape/back,
  interruptible drag and reduced-motion crossfade.
