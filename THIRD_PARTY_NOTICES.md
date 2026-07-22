# Third-party notices

Ebook Reader is distributed under the MIT License. It incorporates open-source software
under compatible licenses. This summary is informational and does not replace the license
files and notices supplied by each upstream project.

## Runtime components

| Component | Use | License |
|-----------|-----|---------|
| React and React DOM | Application UI | MIT |
| TanStack Virtual | Long-document virtualization | MIT |
| Tauri, Tauri API, and Tauri plugins | Desktop runtime and native integration | MIT OR Apache-2.0 |
| Tauri updater and minisign-verify | Signed update retrieval and verification | MIT OR Apache-2.0 |
| epub.js | EPUB parsing and rendering | BSD-2-Clause |
| PDF.js (`pdfjs-dist`) | PDF parsing and rendering | Apache-2.0 |
| pdf-extract 0.12.0 | Local PDF text extraction for the rebuildable library index | MIT |
| unicode-normalization 0.1.25 | Unicode normalization for multilingual local search | MIT OR Apache-2.0 |
| libmobi `mobitool` 0.12 | Offline MOBI/AZW3 to EPUB conversion sidecar | LGPL-3.0-or-later |
| JSZip | EPUB ZIP container support; used under its MIT option | MIT OR GPL-3.0-or-later |
| pako | Compression support used by EPUB dependencies | MIT AND Zlib |
| rusqlite and SQLite | Local database; rusqlite is MIT, bundled SQLite is public domain | MIT / Public Domain |
| encoding_rs and chardetng | Text decoding and character-set detection | MIT OR Apache-2.0 |
| serde, serde_json, regex, sha2, uuid, anyhow, thiserror | Rust application support | MIT OR Apache-2.0 compatible terms |

Transitive Rust packages `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, and
`selectors` are licensed under MPL-2.0. Ebook Reader does not modify those packages.

The formal application icon and bundled fallback cover are original project assets generated
for Ebook Reader; they are not copied from a third-party icon or artwork set.

## Full locked-dependency audit

The v0.2.0 release candidate was audited from the committed lockfiles and frozen install:

- `node scripts/release/audit-licenses.mjs`: 291 unique direct and transitive JavaScript packages
  across production and development scopes; no package without license metadata or a license file.
- `cargo metadata --format-version 1 --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`:
  529 external Cargo packages; no dependency with a missing license or license-file field.
- JavaScript license families observed: MIT, MIT-0, Apache-2.0, ISC, BSD-2-Clause,
  BSD-3-Clause, MPL-2.0, CC0-1.0, CC-BY-4.0, BlueOak-1.0.0, Zlib combinations, and
  compatible dual-license expressions.
- Cargo license families observed: MIT, Apache-2.0, BSD, ISC, MPL-2.0, Unicode-3.0,
  Zlib, 0BSD, CC0-1.0, Unlicense, and compatible multi-license expressions.

`@axe-core/playwright`, `axe-core` (MPL-2.0), and `caniuse-lite` data (CC-BY-4.0) are
development/test dependencies and are not application features. Build and test tooling is
not shipped as a standalone redistributable component of the installed application.

Syft v1.44.0 (Apache-2.0) is a release-only SBOM generator. Its Windows archive is downloaded from
Anchore's immutable GitHub release only after the official checksum manifest and the archive
checksum are verified; Syft is not bundled into Ebook Reader.

The bundled libmobi sidecar is built from the unmodified v0.12 release with encryption disabled,
static libmobi, the upstream bundled miniz, and the upstream internal XML writer. Its exact source
archive, detached signature, build instructions, SHA-256, maintainer key fingerprints, and LGPL
text are recorded under `third_party/libmobi/`. Public distributions that include the sidecar must
also distribute the corresponding source archive or a durable written source offer.

The Stage 14.5 development audit includes the locked `pdf-extract` and Unicode-normalization
dependency trees: 291 JavaScript packages and 556 Cargo packages, with no missing license or
license-file metadata. Final v0.3 release artifacts and SBOMs remain subject to the Stage 14.7
release audit.

Upstream source, copyright, and exact license texts are available through the package metadata
in `pnpm-lock.yaml`, `apps/desktop/src-tauri/Cargo.lock`, and the projects linked from their
package manifests.
