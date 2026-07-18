# MOBI/AZW3 isolated conversion spike

Status: Stage 14.2 go

Engine: libmobi `v0.12` / bundled `mobitool`

Scope: DRM-free `.mobi` and `.azw3` only

## Boundary

`MobiConversionService` is an internal Rust service. It accepts a normalized source path, an operation ID, a staging root, a cancellation token and the bundled converter path. It returns a validated temporary EPUB descriptor and never writes the database or managed library.

Each operation receives its own UUID staging directory. The sidecar is launched directly with `Command`, fixed `-e -o` arguments and no shell interpolation. Cancellation or the 120-second default timeout kills and waits for the child. Any error removes the operation directory; a successful caller must explicitly clean or commit the returned artifact.

Before launch, the service reads the PalmDB/PalmDOC header. Non-zero encryption types return `mobi-drm-unsupported`; no password or decryption path is exposed. Windows verbatim paths remain canonical for validation and are converted to equivalent normal drive/UNC paths only at the MinGW process-argument boundary.

## EPUB validation

The converter output is accepted only when exactly one EPUB is produced and all of these checks pass:

- readable ZIP with at most 20,000 unique, relative entries;
- no traversal, drive-prefix, backslash, NUL or duplicate names;
- bounded entry, aggregate and compression-ratio limits;
- first uncompressed `mimetype` entry exactly equals `application/epub+zip`;
- UTF-8 `META-INF/container.xml` with a safe, present OPF rootfile;
- OPF package, manifest and spine plus at least one HTML/XHTML document;
- SHA-256 and byte size computed only after validation.

## Fixture evidence

The committed fixtures are synthetic test files from the signed libmobi `v0.12` source release and retain the upstream LGPL-3.0-or-later provenance. Coverage includes a MOBI 8 hybrid (default KF8 extraction), an `.azw3` extension path, NCX/metadata, multimedia resources, UTF-8 Chinese text injected into an equal-length temporary copy, and PalmDOC DRM v1.

Eight Rust tests cover successful conversion, preflight, DRM rejection before sidecar launch, missing/non-zero converter cleanup, cancellation, timeout, traversal, incomplete package, duplicate ZIP names and compression-bomb rejection. Tests leave no database, managed-library or staging residue.

## Measurement

Run `pnpm.cmd deps:measure-libmobi` to reproduce the local measurement. The script verifies the bundled converter hash, uses no shell for the converter, records real peak working set and deletes its workspace-local scratch directory after success.

| Fixture | Source | EPUB | Elapsed | Peak working set | EPUB SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `sample-ncx.mobi` | 28,999 B | 2,403 B | 181 ms | 3,194,880 B | `811787DADCDDE92AF8E0A66CC0228B25EBF724EDC0F80EC730384B16E33DDD2E` |
| `sample-multimedia.mobi` | 565,041 B | 131,459 B | 59 ms | 5,787,648 B | `AA6F8B3EF5D916AC5552A04C0CBE10F81950E60218E2951A3F1DE4BEE2EE95B7` |
| `sample-unicode-uncompressed.mobi` | 658,770 B | 74,454 B | 53 ms | 5,885,952 B | `B48DCB269A8E310AFCFD5CF5380110E005551DB62D7FE60753331D562C099D14` |

These small synthetic fixtures establish the process and cleanup budget, not a universal performance guarantee. Production keeps a 120-second timeout and stage-only progress because libmobi does not expose a reliable conversion percentage.

The sidecar remains 296,129 bytes with SHA-256 `438576B701C7BD706213D1FD9E717D671403D02FB90AB1D1655342838DB47CF1`. Stage 14.1 measured package deltas of +111,310 bytes (NSIS), +139,264 bytes (MSI) and +296,129 installed, all below the approved limits.

## Known limitations and Stage 14.3 contract

- DRM-encrypted content is rejected and never decrypted.
- Only `.mobi` and `.azw3` are accepted; `.azw`, `.azw4` and `.prc` remain unsupported.
- Hybrid files use libmobi's default KF8 rendition; legacy content is used only when KF8 is absent.
- Conversion fidelity depends on source quality and libmobi support; invalid output is rejected rather than partially imported.
- Existing derivatives will not be regenerated automatically when the converter changes, because that could move EPUB CFIs and reading data.

Stage 14.2 is a **go** for the Stage 14.3 import integration. Production wiring must preserve this service boundary and add the planned transaction, derivative record, backup v2 and approved UI states without changing the application version.
