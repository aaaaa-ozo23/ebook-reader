# libmobi sidecar

Ebook Reader bundles the unmodified `mobitool` command-line utility from libmobi 0.12 as a
Windows x64 sidecar. It is used only to convert DRM-free MOBI and AZW3 source files into an
internal EPUB derivative. The application does not expose password, key, encryption, or DRM
removal options.

## Pinned upstream

- Project: <https://github.com/bfabiszewski/libmobi>
- Release: `v0.12` (2024-06-17)
- Source: `libmobi-0.12.tar.gz`
- SHA-256: `9A6FB2C56B916F8FA8B15E0C71008D908109508C944EA1D297881D4E277BF7E7`
- Detached signature: `libmobi-0.12.tar.gz.asc`
- Maintainer primary key: `B1ED40082AF2D620370827C6734EF933CD41675C`
- Release signing subkey: `DCBC81C5A4AC9C873F6FEA7F5C7E8917C4315322`
- License: LGPL-3.0-or-later; the exact upstream license text is in `COPYING`.

## Reproducible Windows build

Run from the repository root:

```powershell
pnpm.cmd deps:libmobi
```

The script downloads the immutable release archive, verifies its pinned SHA-256 and detached
signature in an isolated keyring, then builds with MinGW x64 using static libmobi, the bundled
miniz and XML writer, and encryption disabled. The generated Tauri sidecar is:

`apps/desktop/src-tauri/binaries/mobitool-x86_64-pc-windows-msvc.exe`

Set `-Offline` when the three verified download inputs are already present in
`.tools/libmobi-v0.12/`. Build timestamps and local source paths are normalized with
`SOURCE_DATE_EPOCH`, `--no-insert-timestamp`, and `-ffile-prefix-map`.

Two independent clean builds must produce 296,129 bytes and SHA-256
`438576B701C7BD706213D1FD9E717D671403D02FB90AB1D1655342838DB47CF1`. The script refuses to
replace the bundled sidecar if that reproducibility check fails.

The upstream source archive and detached signature must accompany any public release that
ships this binary, either as release assets or through a durable written source offer. The
application's MIT license does not replace libmobi's LGPL terms.
