# Ebook Reader v0.4.0 RC checklist

This checklist governs the private Stage 15 release candidate. It does not authorize a tag,
public GitHub Release, `release/v0.4.0` branch, or merge to `main`.

## Source and shared gates

- [x] root, core, desktop, Cargo, Cargo lock, Tauri, and release verifier report `0.4.0`.
- [x] core, desktop, Rust, lint, format, and production build gates pass.
- [x] Windows x64, Ubuntu 22.04, macOS Intel, and macOS Apple Silicon quality matrix passes.
- [x] EPUB/TXT/PDF/MOBI/AZW3 shared tests and target-specific sidecar conversion tests pass.
- [x] source, Windows, macOS, and Linux CycloneDX SBOM contracts are enforced.
- [x] RC assembler emits deterministic names, four updater keys, manifest, acceptance report, and
  SHA-256 inventory.

## External credentials

- [ ] Tauri updater private key and password are configured as masked CI secrets.
- [ ] Apple Developer ID certificate/password and temporary keychain password are configured.
- [ ] App Store Connect issuer, key ID, and base64 API key are configured.
- [ ] Updater private key has a separately confirmed offline backup.

## Windows x64

- [ ] NSIS and MSI are built from the Stage 15 integration commit.
- [ ] NSIS updater signature verifies; MSI presents a manual upgrade path.
- [ ] Clean install and v0.3 upgrade retain books, annotations, fonts, index, and history.
- [ ] Five file associations and uninstall-with-data-retention pass.

## macOS Universal

- [ ] The same Universal app launches on Intel and Apple Silicon.
- [ ] Developer ID signing, notarization, app/DMG stapling, Gatekeeper, and both architecture
  slices pass.
- [ ] Finder/Open With, second-open queue, Dock reopen, menu actions, and five formats pass.
- [ ] Clean install, v0.3 upgrade, updater verification, and uninstall data retention pass.

## Linux x64

- [ ] AppImage and deb are built on Ubuntu 22.04 with executable x86-64 sidecar.
- [ ] AppImage updater signature and no-FUSE mode pass; deb manual install/upgrade/removal pass.
- [ ] Ubuntu 22.04/24.04 and Debian 12 launch, MIME `%F`, X11/Wayland, and five formats pass.
- [ ] Clean install, v0.3 upgrade, and uninstall data retention pass.

## Data and publication boundary

- [ ] All native acceptance uses an isolated identifier/data root and proves the production
  `com.ebookreader.desktop` profile was neither read nor modified.
- [ ] Final `SHA256SUMS.txt`, `latest.json`, four SBOMs, artifact manifest, and acceptance report
  match the uploaded short-lived Actions artifact.
- [ ] No tag, public Release, `release/v0.4.0` branch, or `main` merge exists.

Stage 15 may be marked complete only when every checkbox above is checked.
