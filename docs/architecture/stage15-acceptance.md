# Stage 15 acceptance record

## Current status

Repository implementation for v0.4.0 cross-platform RC assembly is complete. Stage 15 remains
blocked at the external signed-package gate because the required Apple and updater credentials
are not configured. No signed RC package run has been dispatched.

## Verified evidence

- GitHub Actions run
  [30345615108](https://github.com/aaaaa-ozo23/ebook-reader/actions/runs/30345615108)
  passed on Windows x64, Ubuntu 22.04, macOS Intel, and macOS Apple Silicon.
- The matrix passed core 9 tests, desktop 219 tests, Rust/platform sidecar conversion gates,
  release security checks, Playwright WebKit on macOS, and Chromium/Xvfb on Linux.
- macOS uses one Universal libmobi sidecar and a minimum deployment target of 12.0.
- Linux builds its sidecar and packages on Ubuntu 22.04; Ubuntu 24.04 and Debian 12 are defined as
  post-package acceptance environments.
- The deterministic RC assembler is covered by an isolated fixture test and validates the four
  updater platform keys, identical Darwin Universal entries, signatures, SBOMs, and checksums.

## Pending hard gates

- Configure the Tauri updater signing key/password.
- Configure Developer ID certificate/password, temporary keychain password, and App Store
  Connect issuer/key/API key.
- Dispatch the manual workflow with `build_rc=true`.
- Require all Windows, macOS, Linux package and native acceptance jobs plus final `assemble-rc`
  to pass.
- Inspect the combined seven-day artifact and complete every unchecked item in
  `RELEASE_CHECKLIST_V0.4.md`.

Until those gates pass, the repository must not claim a distributable v0.4.0 RC or completed
Stage 15.

## Safety and stop boundary

Native acceptance must use isolated identifiers and data roots and must not read, migrate, rename,
or delete the real production profile. The Stage 15 branch stops at
`codex/v0.4.0-integration`; it does not create a tag, public Release, release branch, or merge to
`main`.
