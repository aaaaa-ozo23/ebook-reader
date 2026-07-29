# Upgrade and rollback

## Supported v0.3 to v0.4 paths

| Installed track | v0.4 upgrade |
|-----------------|--------------|
| Windows NSIS | Use the signed in-app updater or install the v0.4 NSIS directly. |
| Windows MSI | Close the app and install the v0.4 MSI manually. |
| macOS Universal | Use the signed in-app updater or replace the app from the notarized DMG. |
| Linux AppImage | Use the signed in-app updater or replace the AppImage manually. |
| Linux deb | Close the app and install the v0.4 deb with the system package manager. |

Keep the original distribution family. Do not mix NSIS/MSI or AppImage/deb. The macOS Universal
package is the same application for Intel and Apple Silicon.

Database migrations are forward-only and transactional. The stable
`com.ebookreader.desktop` identifier preserves the database, managed books, reader derivatives,
covers, progress, bookmarks, annotations, custom fonts, search index, history, and settings.
Original imported files remain outside app ownership and are never removed by upgrade or
uninstall.

## Before upgrading

1. Export a `.erbackup` from **Settings → Data & Backup**. Include original books when the
   managed copies must be portable.
2. Verify the package against `SHA256SUMS.txt`; on macOS also require notarization/stapling and
   Gatekeeper success.
3. Close the reader and use the same distribution track as the installed version.

## Rollback

Export a v0.4 backup and preserve a pre-upgrade app-data snapshot before attempting rollback.
Uninstall or replace the v0.4 application package while retaining app data, then install the
previously trusted v0.3 artifact from the same track. v0.3 may not understand later schema or
backup additions, so binary rollback does not guarantee data compatibility; restore the
pre-upgrade snapshot only with the application fully stopped.

Do not overwrite an old profile over a running app and do not delete the current data directory
until the rollback launch and library inspection succeed.

## Acceptance boundary

The v0.4 RC is accepted only after [the v0.4 checklist](../RELEASE_CHECKLIST_V0.4.md) records clean
first launch, v0.3 upgrade retention, signed updater/manual-track behavior, uninstall data
retention, five-format file associations, and isolated production-profile checks on every
supported platform. Build and unit-test success cannot substitute for native package acceptance.
