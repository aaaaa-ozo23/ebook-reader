# MOBI/AZW3 offline engine evaluation

Date: 2026-07-19  
Stage: 14.1  
Decision: **GO — bundle libmobi 0.12 `mobitool` as a Windows x64 sidecar**

## Decision matrix

| Candidate | Offline/distribution | License and footprint | Reader impact | Decision |
|-----------|----------------------|-----------------------|---------------|----------|
| libmobi 0.12 | Native x64 sidecar; no user-installed runtime | LGPL-3.0-or-later; 296,129-byte reproducible binary | Converts to EPUB and preserves the lazy EPUB adapter boundary | Selected |
| Calibre `ebook-convert` | External installation or very large bundled runtime | GPL-3.0; substantially larger packaging surface | Converts well but broadens updater, audit, and process scope | Rejected |
| KindleUnpack | Python runtime or frozen application | GPL-3.0; older upstream release and additional runtime | Extracted output is not guaranteed to be a valid EPUB | Rejected |
| foliate-js | Direct JavaScript parsing | MIT; no native sidecar | Requires a new reader/locator adapter and weakens the existing EPUB boundary | Rejected |

## Pinned source and build

- Release archive: `libmobi-0.12.tar.gz`, 2,653,654 bytes.
- SHA-256: `9A6FB2C56B916F8FA8B15E0C71008D908109508C944EA1D297881D4E277BF7E7`.
- Detached signature verified with primary fingerprint
  `B1ED40082AF2D620370827C6734EF933CD41675C` and signing subkey
  `DCBC81C5A4AC9C873F6FEA7F5C7E8917C4315322`.
- Build: MinGW GCC 8.1.0, static libmobi, bundled miniz, internal XML writer,
  `--disable-encryption`, no non-system DLL.
- Two independent clean builds produced the same 296,129-byte binary with SHA-256
  `438576B701C7BD706213D1FD9E717D671403D02FB90AB1D1655342838DB47CF1`.
- `mobitool -h` exposes EPUB creation and default KF8 parsing; it exposes no password or decrypt
  option. The application will additionally reject encrypted PalmDOC headers before launch.

## Size gate against v0.2.0

| Artifact | v0.2.0 baseline | With sidecar | Delta | Gate |
|----------|----------------:|-------------:|------:|------|
| NSIS | 7,373,692 bytes | 7,485,002 bytes | +111,310 bytes | Pass (< 10 MiB) |
| MSI | 9,461,760 bytes | 9,601,024 bytes | +139,264 bytes | Pass (< 10 MiB) |
| Installed files | — | +296,129 bytes | +296,129 bytes | Pass (< 20 MiB) |

Both installer flavors were rebuilt from the same v0.2.0 application source with only the
sidecar bundle configuration added. NSIS required the existing updater signing key; MSI required
Windows Installer Service access. Neither build changed the application version.

## Distribution and security contract

- Only `.mobi` and `.azw3` are in product scope. `.azw`, `.azw4`, and `.prc` remain rejected.
- DRM-protected files return `mobi-drm-unsupported`; no password, key, or online service exists.
- The WebView cannot execute the sidecar. Rust owns canonical paths, staging, arguments,
  cancellation, timeout, output validation, and cleanup.
- Public packages include the exact LGPL text and component notice. Public release assets must
  include the verified source archive and detached signature or a durable source offer.
- The bundled binary hash is checked by both dependency verification and release security gates.

## Stage 14.2 entry gate

Source authenticity, reproducibility, DRM boundary, license notice, binary architecture, required
EPUB/KF8 behavior, package growth, full frontend checks, and locked dependency audit all pass.
Stage 14.2 may proceed with the isolated conversion service. This decision does not authorize
other Kindle extensions, DRM handling, a direct MOBI reader adapter, or Stage 14.4.
