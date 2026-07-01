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
| epub.js | EPUB parsing and rendering | BSD-2-Clause |
| PDF.js (`pdfjs-dist`) | PDF parsing and rendering | Apache-2.0 |
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

The v0.1.0 release candidate was audited from the committed lockfiles:

- `pnpm.cmd licenses list --json`: 285 direct and transitive JavaScript packages across
  production and development scopes; no unknown license group.
- `cargo metadata --format-version 1 --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`:
  487 workspace and transitive Cargo packages; no dependency with a missing license field.
- JavaScript license families observed: MIT, MIT-0, Apache-2.0, ISC, BSD-2-Clause,
  BSD-3-Clause, MPL-2.0, CC0-1.0, CC-BY-4.0, BlueOak-1.0.0, Zlib combinations, and
  compatible dual-license expressions.
- Cargo license families observed: MIT, Apache-2.0, BSD, ISC, MPL-2.0, Unicode-3.0,
  Zlib, 0BSD, CC0-1.0, Unlicense, and compatible multi-license expressions.

`@axe-core/playwright`, `axe-core` (MPL-2.0), and `caniuse-lite` data (CC-BY-4.0) are
development/test dependencies and are not application features. Build and test tooling is
not shipped as a standalone redistributable component of the installed application.

Upstream source, copyright, and exact license texts are available through the package metadata
in `pnpm-lock.yaml`, `apps/desktop/src-tauri/Cargo.lock`, and the projects linked from their
package manifests.
