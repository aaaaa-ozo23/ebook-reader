# Ebook Reader v0.3.0 release checklist

This checklist separates reproducible repository gates, isolated native Windows checks, and
external publication. A checked item must have current-run evidence from the final publication
source. Acceptance or development artifacts do not authorize a tag or public Release.

## Source and Stage 14 contract

- [x] Root, core, desktop, Cargo, Tauri, release verifier, and Stage 14 verifier report `0.3.0`.
- [x] Product name remains `Ebook Reader`; production identifier remains
  `com.ebookreader.desktop`.
- [x] EPUB, TXT, PDF, MOBI, and AZW3 associations are present; `mobitool` is bundled as an external
  binary and matches the pinned libmobi 0.12 hash.
- [x] Migrations 0001–0009 run transactionally and a v0.2 database retains books, settings,
  progress, bookmarks, annotations, covers, and user metadata.
- [x] `.erbackup` v1 migrates in memory; v2 includes source/reader derivatives, custom fonts, and
  reading history while excluding the rebuildable search index.

## Quality, search, conversion, and privacy

- [x] `pnpm.cmd install --frozen-lockfile`
- [x] `pnpm.cmd check`
- [x] Full Playwright matrix passes for 1280/900/640/375, DPR2, reduced motion, keyboard focus,
  axe, EPUB/TXT/PDF/MOBI/AZW3, folder import, fonts, multilingual in-book/library search, and
  reading history.
- [x] `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`
- [x] `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [x] libmobi verification and conversion benchmarks pass without DRM/decryption capability.
- [x] `pnpm.cmd release:audit` reports no unknown locked licenses.
- [x] `pnpm.cmd verify:release`, `pnpm.cmd verify:stage14`, and release security checks pass.
- [x] `git diff --check` passes.

## Final Windows artifacts

- [x] Final NSIS, MSI, updater `.sig`, `latest.json`, CycloneDX source/artifact SBOMs,
  `SHA256SUMS.txt`, artifact manifest, Authenticode report, acceptance report, and LGPL libmobi
  source/signature exist under ignored `release-artifacts/v0.3.0-final/`.
- [x] NSIS updater signature validates; `latest.json` reports `0.3.0` and points only to the
  v0.3.0 NSIS artifact over HTTPS.
- [x] MSI keeps the manual-update track and is not mixed with NSIS.
- [x] Authenticode remains truthfully `NotSigned`; SmartScreen guidance is present.
- [x] No updater private key, local repository path, user data, test book, database, or secret
  marker exists in release artifacts.
- [x] Maintainer's previously recorded offline backup of the updater private key remains the
  trusted recovery copy; only the public fingerprint is recorded.

## Isolated installation and upgrade

- [x] Clean NSIS installation launches with version `0.3.0`, zero books, zero reading records, and
  zero managed library files.
- [x] Clean MSI administrative image contains only expected application/runtime files and no user
  database or book payload.
- [x] Isolated v0.2.0 → v0.3.0 upgrade retains library records, managed files, settings, progress,
  bookmarks, annotations, covers, and metadata.
- [x] Stage 14 schema reaches v9; MOBI/AZW3 derivatives, custom fonts, search index, and history can
  be created after upgrade.
- [x] Installed `mobitool` matches the committed SHA-256.
- [x] Uninstall targets only the isolated test product and preserves original imported files;
  production app-data is not read, deleted, or overwritten.

## GitHub publication

- [x] `release/v0.3.0` is created from the accepted `codex/v0.3.0-integration` head and pushed.
- [x] Publication commit contains the 0.3.0 version contract and final release documentation.
- [x] Annotated `v0.3.0` tag targets the accepted publication commit and is pushed.
- [x] Chrome draft is based on `v0.3.0`, is non-prerelease, marked Latest, and contains every
  final uploaded asset.
- [x] GitHub Release `Ebook Reader v0.3.0` is public.
- [x] Public asset names, sizes, SHA-256 digests, updater signature, and `latest.json` match local
  final artifacts.
- [x] `release/v0.3.0` is merged into `main` with `--no-ff`; `main` and publication tracking docs
  are pushed.
- [x] Stage 15 has not started.

## Post-publication empty-state audit

- [x] Public NSIS SHA-256 still matches the verified local final installer.
- [x] NSIS application payload contains only the main executable and pinned `mobitool`; no
  database, managed library, or ebook fixture is bundled.
- [x] Books reported on the maintainer machine predate v0.3.0 publication and belong to the
  existing `%APPDATA%\com.ebookreader.desktop` profile retained across reinstall and upgrade.
- [x] `tauri:dev` uses `Ebook Reader Dev` / `com.ebookreader.desktop.dev`; a real first launch
  creates schema v9 with zero books and zero managed files without changing production app-data.
- [x] The public v0.3.0 Release is retained because rebuilding the same production installer
  would not clear an existing user profile and must not replace the documented upgrade behavior.
