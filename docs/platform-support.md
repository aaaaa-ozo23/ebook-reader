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

## Data safety

Installer and updater acceptance must use an isolated identifier and data root. Tests
must never delete, rename, replace, or migrate the production
`com.ebookreader.desktop` profile. Uninstalling an application package does not remove
the user's library or settings unless a future flow obtains separate, explicit consent.
