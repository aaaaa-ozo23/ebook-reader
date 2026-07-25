# Privacy and local data

Ebook Reader is local-first. The current MVP does not include telemetry, analytics, cloud
sync, automatic uploads, user accounts, or persistent application log files. Importing and
reading books, extracting covers, indexing navigation, saving progress, and creating notes all
happen on the device.

## Desktop data locations

The desktop app asks Tauri for its operating-system app data directory. The application
identifier is `com.ebookreader.desktop`. Typical locations are:

- Windows: `%APPDATA%\com.ebookreader.desktop`
- macOS: `~/Library/Application Support/com.ebookreader.desktop`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/com.ebookreader.desktop`

The exact base directory can vary with operating-system configuration. Inside that directory,
the app stores:

| Path | Contents |
|------|----------|
| `ebook-reader.sqlite3` | Automatic and user-overridden book metadata, reading progress, bookmarks, annotations, preferences, local reading-history sessions, cover state, versioned reader caches, and the rebuildable local full-text search index |
| `library/` | Private app-managed copies of imported EPUB, TXT, PDF, MOBI, and AZW3 files, plus verified MOBI/AZW3 reader derivatives |
| `library/covers/` | Locally extracted EPUB covers and locally rendered PDF first-page thumbnails |
| `library/fonts/` | Content-addressed app-local TTF/OTF files; these fonts are not installed into Windows |

Repository development runs use the separate identifier `com.ebookreader.desktop.dev` and the
visible name `Ebook Reader Dev`. This prevents locally imported fixtures from appearing in the
packaged application's production data. Reinstalling or upgrading the production app intentionally
retains `%APPDATA%\com.ebookreader.desktop`; use the documented backup-and-reset procedure when a
completely empty local profile is required.

Reader caches contain generated EPUB locations and EPUB/PDF table-of-contents JSON. They do not
contain a cached copy of the full book text. The shared fallback-cover image is bundled with the
application and is not downloaded at runtime.

Whole-library search stores extracted text chunks and FTS5 terms inside the local database. This
derived index never leaves the device, is excluded from portable backups, and can be rebuilt from
the managed reader files. See [Local library and in-book search](library-search.md).

## Reading history

Reading history is enabled by default and remains completely local. A session starts only after a
book opens successfully. Effective time is counted in 30-second heartbeats only while the app
window is visible and focused and the reader has received an interaction within the last five
minutes. A heartbeat gap greater than 45 seconds is excluded, so sleep, suspension, background
time, and long inactivity are not presented as reading time.

**Settings → History & Privacy** can disable future collection, export the stored sessions as a
local CSV file, or clear the history. Disabling history immediately ends an active session but does
not silently delete earlier sessions. Clearing writes a local timestamp tombstone so an older
portable backup cannot reintroduce already-cleared sessions. Insights uses the existing saved
reading progress for completion percentages and does not infer streaks, productivity, or social
comparisons.

## Browser development fallback

When the React app runs in a normal browser instead of the Tauri desktop runtime, development and
automated tests use that browser origin's `localStorage`. Keys begin with `reader:fallback:` and
may contain mock books, document sources, progress, annotations, bookmarks, themes, layout
preferences, cover data URLs, and reader caches. This fallback is for development and testing;
the packaged desktop app uses SQLite and the app-managed library directory.

Clear the site's storage in the browser's developer tools to remove fallback data.

## Removing data

- **Remove one book:** use **More actions → Remove from shelf**. This deletes the app-managed
  library copy, its cached cover, metadata, progress, bookmarks, annotations, and reader caches.
- **Keep the original:** removing a book never deletes the original file that was selected during
  import.
- **Reset all desktop data:** close Ebook Reader, then delete its app data directory shown above.
  This permanently removes the local database, app-managed book copies, cover thumbnails, and
  reader caches, including app-local custom font copies.
- **Uninstalling:** operating systems or installer settings may preserve app data after uninstall.
  Delete the app data directory separately when a complete local-data removal is required.

Back up the app data directory before a manual reset if progress or annotations need to be kept.

## Portable backups

**Settings → Data & Backup** exports a versioned `.erbackup` archive. Core reading data and
managed covers are included by default; original book files are opt-in. Absolute paths, reader
caches, and the rebuildable full-text search index are never exported. App-local custom font
registrations and their content-addressed files, reading-history sessions, preferences, and the
history clear timestamp are included with core data by default. Export writes a temporary file and
only publishes the final archive after all payloads have been written successfully.

Portable backup archives are not encrypted. They can contain private annotations, reading history,
cover images, and—when selected—original book files. Users are responsible for storing and
sharing them securely. See [Backup and restore](backup-and-restore.md) for the portable data
contract.

## Network and logs

The app never sends imported books, reading activity, annotations, or diagnostic events to a
server. Manual update checks—and optional once-daily checks—request only the signed release
metadata from the locked HTTPS GitHub endpoint. Download starts only after user action and update
installation always requires confirmation. Update-check timestamps remain machine-local and are
excluded from portable backups. The app does not create a persistent application log file. Normal
operating-system, WebView, crash-reporting, or developer-tool behavior is controlled by the local
platform and is outside the app's own data model.

