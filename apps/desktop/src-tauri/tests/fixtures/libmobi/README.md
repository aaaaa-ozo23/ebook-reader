# libmobi conversion fixtures

These synthetic fixtures are copied without modification from the verified libmobi 0.12 source
archive under `tests/samples/`. They are part of libmobi's LGPL-3.0-or-later test suite; the exact
license text is available at `third_party/libmobi/COPYING`.

| Fixture | Purpose |
|---------|---------|
| `sample-ncx.mobi` | MOBI 8 hybrid, default KF8 selection, metadata and NCX/TOC |
| `sample-multimedia.mobi` | Embedded image and multimedia resource extraction |
| `sample-unicode-uncompressed.mobi` | UTF-8/uncompressed conversion; tests replace equal-length text in a temporary copy with Chinese content |
| `sample-drm-v1.mobi` | Preflight rejection before the sidecar is launched |

Do not replace these with commercial ebooks. AZW3 extension handling is tested by copying the
hybrid sample to an isolated `.azw3` path at runtime; the source bytes are not duplicated in Git.
