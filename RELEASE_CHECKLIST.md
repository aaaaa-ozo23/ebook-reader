# Ebook Reader v0.1.0 release checklist

## Source and metadata

- [x] Root package, desktop package, Cargo package, and Tauri bundle report `0.1.0`.
- [x] Product name is `Ebook Reader`; identifier remains `com.ebookreader.desktop`.
- [x] The formal orange open-book icon replaces the Tauri default icon at all bundle sizes.
- [x] EPUB, TXT, and PDF associations and single-instance open routing are configured.
- [x] Downgrades are disabled; v0.1.0 uses manual cover installation without an updater.

## Legal and user documentation

- [x] Project license is MIT and package metadata uses the MIT SPDX identifier.
- [x] Locked pnpm and Cargo dependency licenses have no unknown or missing dependency entry.
- [x] `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, and README installation/data guidance exist.
- [x] README and release notes disclose that Windows installers are not code-signed.

## Quality gates

- [x] `pnpm.cmd install --frozen-lockfile`
- [x] `pnpm.cmd run format`
- [x] `pnpm.cmd --filter @reader/core build`
- [x] `pnpm.cmd --filter @reader/desktop lint`
- [x] `pnpm.cmd --filter @reader/desktop test`
- [x] `pnpm.cmd --filter @reader/desktop build`
- [x] `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`
- [x] `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [x] `pnpm.cmd --filter @reader/desktop test:e2e`
- [x] Build Web Apps Browser QA: empty shelf, desktop/mobile layout, interaction, console, overlay.

## Native acceptance

- [x] NSIS and MSI install, launch, and uninstall as current-user installations.
- [x] NSIS and MSI 0.0.0 to 0.1.0 upgrades retain books, files, progress, bookmarks,
  annotations, theme, and layout.
- [x] EPUB cold-start association and TXT/PDF running-instance associations pass.
- [x] Final clean NSIS/MSI/EXE build is newer than the release commit and reports 0.1.0.
- [x] Final NSIS install starts with zero books and no app-managed test book files.

## Artifacts and publication

- [ ] Generate `SHA256SUMS.txt` for only the final NSIS and MSI installers.
- [ ] Verify installer names, sizes, timestamps, versions, and SHA-256 values.
- [ ] Create and validate `release/v0.1.0`, then merge it to `main`.
- [ ] Create and push annotated tag `v0.1.0` plus integration, release, and main branches.
- [ ] Create GitHub Release `Ebook Reader v0.1.0` from `v0.1.0` on `main`.
- [ ] Upload NSIS, MSI, and `SHA256SUMS.txt`; publish as non-prerelease and Latest.
- [ ] Reopen the public release page and verify the tag, Latest status, and all three assets.

## Final local state

- [x] QA data is deleted; the pre-release user-data backup remains outside the repository.
- [x] Final NSIS v0.1.0 remains installed with an empty shelf.
- [ ] Git working tree is clean.
