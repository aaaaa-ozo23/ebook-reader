# App updates

Ebook Reader uses Tauri's mandatory updater signature verification on the Windows NSIS track.
The embedded public key is safe to distribute; the private key stays outside Git at
`C:\Users\许涵予xhy\.codex\secrets\ebook-reader-updater.key` and is restricted to the current
Windows user. Back it up offline before producing the release candidate. Losing it prevents future
updates for installed clients.

The production feed is fixed to:

`https://github.com/aaaaa-ozo23/ebook-reader/releases/latest/download/latest.json`

Production does not enable insecure transport or an HTTP fallback. Checks are manual by default.
Users may opt into one check per day; this never downloads or installs an update. The last-check
timestamp is machine state and does not enter portable backups.

## Windows tracks

- NSIS: `pnpm.cmd tauri:build:nsis` embeds updater support and creates a signed updater artifact.
- MSI: `pnpm.cmd tauri:build:msi` compiles the app with the in-app updater disabled. MSI users
  install a later MSI manually and should not mix installer types.

On Windows, confirming installation exits the running app. Check and download can be canceled;
once installation begins it cannot be canceled.

## Native smoke isolation

`tauri.updater-test.conf.json` uses the independent identifier
`com.ebookreader.desktop.updater-test` and an HTTPS loopback endpoint. The RC smoke harness must
serve a trusted local certificate and exercise old test version to signed v0.2, invalid signature
rejection, throttled cancellation, retained data, and post-install version. It must never reuse the
production identifier or production user data.

The updater signature is not Windows Authenticode. RC installers remain explicitly unsigned by
Authenticode unless a commercial Code Signing certificate is supplied.

Never copy the updater private key into the repository, logs, SBOM input, workflow artifacts, or
release bundles. Before an RC is accepted, the maintainer must confirm a separate offline backup
and record only that confirmation—not the backup location or secret—in the private release log.

For rollback, uninstall the newer build and install a previously trusted artifact only after
exporting a portable backup. The installer rejects in-place downgrades; do not delete the app-data
directory during uninstall. See [Upgrade and rollback](upgrade-and-rollback.md).

Implementation follows the official [Tauri updater](https://v2.tauri.app/plugin/updater/) and
[Windows code-signing](https://v2.tauri.app/distribute/sign/windows/) guidance.
