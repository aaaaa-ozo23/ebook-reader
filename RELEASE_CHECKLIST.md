# Ebook Reader v0.2.0 RC checklist

This checklist separates reproducible repository gates from native Windows checks. A checked item
must have current-run evidence; draft artifacts alone do not authorize a tag or public Release.

## Source and data contract

- [x] Root, core, desktop, Cargo, Tauri, and release verifier report `0.2.0`.
- [x] Product name remains `Ebook Reader`; identifier remains `com.ebookreader.desktop`.
- [x] EPUB, TXT, and PDF associations, stable app-data location, and reader lazy boundary remain.
- [x] Migrations `0004_backup_portability.sql` and `0005_book_user_metadata.sql` are transactional.
- [x] `.erbackup` v1 excludes absolute paths, reader caches, and update-check timestamps.

## Backup, import, and updater security

- [x] Backup round-trip, checksum/size/version rejection, traversal/bomb limits, cancellation,
  merge conflicts, missing-file repair, and rollback cleanup have automated Rust coverage.
- [x] Custom cover validation and metadata set/reset/backup merge have automated coverage.
- [x] Batch scanning enforces depth/item/canonical/reparse limits and partial-result semantics.
- [x] NSIS embeds the locked updater public key and HTTPS endpoint; MSI disables updater commands.
- [x] Updater private-key material is absent from tracked files, SBOM, and draft artifacts.
- [ ] Maintainer has completed and privately recorded an offline backup of the updater private key.

## Reproducible quality gates

- [x] `pnpm.cmd install --frozen-lockfile`
- [x] `pnpm.cmd check`
- [x] `pnpm.cmd --filter @reader/desktop test:e2e` at 1280/900/640/375, DPR2,
  reduced-motion, keyboard focus, modal/sheet, drop overlay, and axe serious/critical.
- [x] `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`
- [x] `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [x] `pnpm.cmd release:audit` reports no unknown locked licenses.
- [x] `pnpm.cmd verify:release` and `pnpm.cmd release:security` pass.
- [x] `git diff --check` passes.

## Draft artifacts

- [x] NSIS, MSI, NSIS updater `.sig`, `latest.json`, CycloneDX source/artifact SBOMs,
  `SHA256SUMS.txt`, artifact manifest, Authenticode report, and acceptance report exist under
  ignored `release-artifacts/v0.2.0-rc/`.
- [x] Syft is exactly v1.44.0 and both its official manifest and archive checksum are verified.
- [x] NSIS updater signature is present and `latest.json` schema/signature fields validate.
- [x] NSIS/MSI Authenticode status is truthfully `NotSigned`; SmartScreen guidance is present.
- [x] No private key, certificate, local repository path, or secret marker exists in release artifacts.

## Isolated native updater smoke

- [ ] Uses `com.ebookreader.desktop.updater-test`, never the production identifier or user data.
- [ ] Signed old test version discovers, downloads, and installs the signed v0.2 artifact.
- [ ] Invalid signature is rejected.
- [ ] Throttled download can be canceled and leaves no partial install state.
- [ ] Test data survives installation and post-install version reports `0.2.0`.

## Windows installation matrix

- [ ] Clean NSIS installation launches with zero books.
- [ ] Clean MSI installation launches with zero books.
- [ ] v0.1.0 → v0.2.0 NSIS preserves books, settings, progress, bookmarks, annotations, and covers.
- [ ] v0.1.0 → v0.2.0 MSI manual upgrade preserves the same data.
- [ ] NSIS updater performs the signed upgrade; MSI remains manual and tracks are not mixed.
- [ ] Uninstall preserves app data and never deletes original imported book files.

## Branch and publication boundary

- [ ] Stage branch is merged with `--no-ff` into `codex/v0.2.0-integration` and pushed.
- [ ] `release/v0.2.0` is created from that integration head and pushed.
- [x] Workflow is manual, contents-read-only, and uploads draft workflow artifacts only.
- [x] No formal tag or GitHub Release is created or published in this stage.
