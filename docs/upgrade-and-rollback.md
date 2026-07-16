# Upgrade and rollback

## Supported upgrade paths

- **NSIS v0.1.0 → v0.2.0:** install the v0.2 NSIS directly or use the signed in-app updater once
  a feed is published. The app exits when installation begins.
- **MSI v0.1.0 → v0.2.0:** close the app and run the v0.2 MSI manually.
- Keep the original installer family. NSIS and MSI are separate tracks and must not be mixed.

Database migrations are forward-only and run transactionally. The stable
`com.ebookreader.desktop` identifier preserves the existing database, managed books, covers,
progress, bookmarks, annotations, and settings. Original imported files remain outside app
ownership and are never removed by upgrade or uninstall.

## Before upgrading

1. Export a `.erbackup` from **Settings → Data & Backup**. Include original books when the
   managed copies must be portable.
2. Verify the installer against `SHA256SUMS.txt`.
3. Close the reader and use the same NSIS or MSI track as the installed version.

## Rollback

Windows installers reject an in-place downgrade. To return to v0.1.0, first export a v0.2 backup,
uninstall v0.2 while retaining `%APPDATA%\com.ebookreader.desktop`, then install the previously
trusted v0.1.0 artifact. Because v0.1.0 does not understand all v0.2 schema and backup fields, this
is an emergency binary rollback—not a guarantee that newer metadata editing, missing-file state,
or updater preferences can be edited by the old app. Restore the pre-upgrade app-data snapshot if
a full data rollback is required.

Do not restore an old app-data snapshot over a running app. Keep the current data directory until
the rollback launch and library inspection have succeeded.

## Acceptance matrix

The RC is accepted only after `RELEASE_CHECKLIST.md` records clean NSIS/MSI installation, v0.1.0
upgrade retention, NSIS signed updater behavior, MSI manual upgrade, uninstall data retention, and
an empty initial shelf under isolated test user data. Automated build verification does not
substitute for these native checks.
