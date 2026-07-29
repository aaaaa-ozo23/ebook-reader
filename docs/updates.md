# App updates

Ebook Reader uses Tauri's mandatory updater signature verification. The embedded public key is
safe to distribute; the private key exists only in the maintainer's protected local store and CI
secrets. Never put it in Git, logs, SBOM input, workflow artifacts, or release bundles.

The production feed is fixed to:

`https://github.com/aaaaa-ozo23/ebook-reader/releases/latest/download/latest.json`

Production does not enable insecure transport or an HTTP fallback. Checks are manual by default.
Users may opt into one check per day; this never downloads or installs an update without
confirmation. The last-check timestamp is machine state and does not enter portable backups.

## Distribution tracks

- **Windows NSIS:** updater enabled; downloads and verifies the signed NSIS updater asset.
- **Windows MSI:** updater disabled; close the app and install a newer MSI manually. Do not mix
  NSIS and MSI tracks.
- **macOS Universal:** updater enabled; both `darwin-x86_64` and `darwin-aarch64` feed keys point
  to the same signed Universal `.app.tar.gz`. The DMG must also be Developer ID signed,
  notarized, stapled, and accepted by Gatekeeper.
- **Linux AppImage:** updater enabled; downloads and verifies the signed x64 AppImage.
- **Linux deb:** updater disabled; close the app and install the newer deb manually. Do not use
  the AppImage in-place updater for a deb installation.

`latest.json` contains exactly `windows-x86_64`, `darwin-x86_64`,
`darwin-aarch64`, and `linux-x86_64`. MSI and deb are distributed and checksummed but do not
appear as updater targets.

## Native smoke isolation

Updater and upgrade smoke tests use independent identifiers/data roots. They exercise signed
installation, invalid-signature rejection, cancellation, retained data, and post-install version
without reading, migrating, deleting, or renaming the production
`com.ebookreader.desktop` profile.

Updater signatures are not Windows Authenticode or Apple Developer ID signatures. Each platform's
installer trust checks remain separate hard gates. Before an RC is accepted, the maintainer must
confirm a separate offline updater-key backup and record only that confirmation, never its
location or secret contents.

For rollback, export a portable backup, retain the current app-data directory, and install a
previously trusted artifact only according to the same distribution track. See
[Upgrade and rollback](upgrade-and-rollback.md).

Implementation follows the official [Tauri updater](https://v2.tauri.app/plugin/updater/),
[macOS signing](https://v2.tauri.app/es/distribute/sign/macos/), and
[Windows code-signing](https://v2.tauri.app/distribute/sign/windows/) guidance.
