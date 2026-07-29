# Desktop platform support

This document defines the v0.4 desktop support contract. It does not authorize a public
release; Stage 15 stops after verified v0.4.0 release-candidate artifacts are available
on the integration branch.

## Supported matrix

| Platform | Architectures | Minimum | Packages | In-app updater |
|----------|---------------|---------|----------|----------------|
| Windows | x86_64 | Windows 10 | NSIS, MSI | NSIS only |
| macOS | x86_64 + arm64 Universal | macOS 12 | app, DMG | yes |
| Linux | x86_64 | Ubuntu 22.04 build baseline | AppImage, deb | AppImage only |

Linux runtime acceptance covers Ubuntu 22.04, Ubuntu 24.04, and Debian 12. RPM, Snap,
Flatpak, and Linux arm64 are outside v0.4.

EPUB, TXT, PDF, MOBI, and AZW3 are supported on every listed platform. MOBI/AZW3
conversion remains DRM-free only and uses the bundled, target-specific libmobi 0.12
sidecar.

## Runtime contract

- Application data, the managed library, custom fonts, indexes, and restore staging use
  Tauri's platform `app_data_dir`; code must not assemble AppData, Library, or XDG paths.
- The Rust `get_desktop_platform_capabilities` command is the source of truth for OS,
  architecture, primary shortcut modifier, formats, and distribution track. The frontend
  must not infer these values from the user agent.
- Sidecars are resolved only from the trusted Tauri resource directory, the installed
  executable directory, or the repository's target-triple-named development binary.
- macOS uses Command as its primary modifier. Windows and Linux use Control.
- NSIS, macOS, and AppImage consume signed updater artifacts. MSI and deb stay on explicit
  manual-upgrade tracks.

## macOS runtime

- The deployment target is macOS 12.0. The shipped application and `mobitool` sidecar are
  Universal binaries containing both `x86_64` and `arm64`; Rosetta is not a requirement on
  Apple Silicon.
- Finder launch services and a second file-open request enter the same ordered pending-file
  queue as command-line and single-instance requests. A Dock reopen shows, unminimizes, and
  focuses the existing main window.
- The native menu exposes Import Books, Import Folder, Settings, the standard Edit commands,
  standard Window commands, and Quit. Product actions emit typed events that reuse the same
  React handlers as toolbar actions.
- `scripts/deps/build-libmobi-macos.sh` verifies the pinned libmobi 0.12 source hash and
  maintainer fingerprints, builds both architectures with
  `MACOSX_DEPLOYMENT_TARGET=12.0`, creates the Universal sidecar with `lipo`, verifies its
  slices, and writes a build manifest containing target, compiler, byte size, and SHA-256.

The macOS acceptance runner must exercise TXT/EPUB/PDF/MOBI/AZW3 import and reading,
including EPUB iframe navigation, PDF worker startup, custom fonts, search, progress,
backup/restore, focus, scrolling, Command shortcuts, and reduced motion. Script or Windows
test success is not a substitute for this WKWebView runtime gate.

The macOS packaging overlay is `apps/desktop/src-tauri/tauri.macos.conf.json`. It replaces
the Windows bundle targets with `app` and `dmg`, enables updater artifacts, fixes the
minimum system to 12.0, and requires hardened runtime. Missing signing, notarization,
stapling, Gatekeeper, updater signature, or Universal-architecture evidence is a hard
failure rather than a warning.

## Linux runtime

- Linux x64 release binaries are built on Ubuntu 22.04 to preserve the glibc baseline;
  Ubuntu 24.04 and Debian 12 are runtime-acceptance targets, not build hosts.
- Application state is resolved through Tauri `app_data_dir`, which follows the desktop
  environment's XDG data location. The application never hard-codes `$HOME/.local/share`
  or redirects a production profile during tests.
- The dialog plugin remains the single file/folder picker API so its WebKitGTK portal
  backend can operate under both X11 and Wayland. File association launches pass all
  selected files through the existing ordered pending queue.
- `scripts/deps/build-libmobi-linux.sh` verifies the same pinned libmobi 0.12 source and
  signer fingerprints as Windows/macOS, produces
  `mobitool-x86_64-unknown-linux-gnu`, enforces ELF x86-64 and executable permissions,
  rejects unexpected dynamic libraries, and writes size/SHA-256 build evidence.

The Linux runner must verify WebKitGTK 4.1, system and custom fonts, portal selection,
X11/Wayland launch, `%F` multi-file opening, single instance behavior, five-format import
and reading, progress/search/backup restore, and data deletion.

AppImage and deb are compiled separately with `EBOOK_READER_BUILD_FLAVOR=appimage` and
`deb`, respectively. The AppImage config creates its mandatory `.AppImage.sig` updater
signature; deb disables updater artifacts and stays on a documented manual-upgrade path.
Package verification extracts both formats and requires an executable ELF x86-64 sidecar,
five MIME types, a desktop entry using `%F`, WebKitGTK 4.1 dependency metadata, and no
book/database payload. AppImage runtime smoke also runs with `APPIMAGE_EXTRACT_AND_RUN=1`
so CI does not depend on FUSE.

Installing, upgrading, or uninstalling the deb changes only application package files.
The XDG application-data directory is intentionally not a dpkg-owned path, so package
removal preserves the library, annotations, fonts, index, history, and settings. Users on
the deb track download and install the newer deb manually; the app never presents the
AppImage in-place installer for that track.

## Data safety

Installer and updater acceptance must use an isolated identifier and data root. Tests
must never delete, rename, replace, or migrate the production
`com.ebookreader.desktop` profile. Uninstalling an application package does not remove
the user's library or settings unless a future flow obtains separate, explicit consent.

## v0.4 RC artifact contract

The final short-lived Actions artifact contains Windows NSIS/signature/MSI, a notarized Universal
DMG and macOS updater archive/signature, Linux AppImage/signature/deb, source plus per-platform
CycloneDX SBOMs, libmobi source/signature, `artifact-manifest.json`, `latest.json`,
`SHA256SUMS.txt`, and an acceptance report.

`latest.json` contains exactly `windows-x86_64`, `darwin-x86_64`, `darwin-aarch64`, and
`linux-x86_64`. Both Darwin entries reference the same Universal updater archive and signature.
The workflow only assembles the combined RC after all platform package and native acceptance jobs
pass. It has `contents: read`, retains artifacts for seven days, and never creates a tag or GitHub
Release.

Apple Developer ID/App Store Connect credentials and the Tauri updater signing key are external
hard gates. Without them, repository implementation may be complete, but Stage 15 and a
distributable v0.4 RC must remain unaccepted.
