# Stage 14 acceptance report

Status: `complete`

Stage 14 extends the local-first reader with offline MOBI/AZW3 conversion, app-local custom
fonts, multilingual in-book and whole-library search, reading history and Insights, plus the
approved reader/import fidelity fixes. This acceptance run does not change the formal `0.2.0`
source version and does not create a tag or release.

## Functional and UI gates

- `pnpm.cmd check`: Core 9/9 and Desktop 212/212; ESLint, Prettier, TypeScript and the production
  Vite build pass. `ReaderShell` remains an independent lazy chunk at 202.71 kB / 58.52 kB gzip.
- Playwright: all 35 tests explicitly reported `ok`, covering EPUB, TXT, PDF, MOBI, AZW3,
  folder import, custom fonts, multilingual in-book/library search, reading history, approved
  desktop/mobile surfaces, 1280/900/640/375, DPR2, reduced motion, keyboard focus and axe.
- The Windows Vite process retained its output handle after all 35 assertions and the outer command
  reached its 300-second cleanup limit. There was no failed test or error context; assertion result
  and process teardown are recorded separately.
- The first Stage 14.7 full run found a 53–63ms task when a DPR2 continuous 500-page PDF jumped
  directly to page 250. Position, virtualizer relocation, derived reader chrome and overscan canvas
  pre-warming were split across frames/transitions. The strict 50ms test then passed twice in
  isolation and in the final 35-test matrix; page count, backing pixels and visual quality gates
  were not reduced.

The approved Stage 14.3–14.6 boards and production comparison ledgers remain the visual source of
truth. The Stage 14.6 in-app Browser run additionally verified the real 1280px/375px Insights and
History surfaces, no horizontal overflow, relevant console warning/error count zero and 44px mobile
targets.

## Data and migration gates

- Cargo fmt passes and Rust is 81/81.
- A v0.2 database assembled from migrations 0001–0005 with an existing book, reading progress and
  bookmark was opened by the production migration runner. It reached schema v9 without losing the
  old records and created derivatives, fonts, search and reading-history tables.
- Backup v1 remains accepted by the explicit migrator; v2 covers source/reader derivatives,
  app-local fonts, reading sessions/preferences and the history clear tombstone. The rebuildable
  search index remains excluded.
- A native upgrade used ignored configs and the isolated identifier
  `com.ebookreader.desktop.stage14-acceptance`. A baseline 0.2.0 installation imported one TXT
  fixture; the 0.3.0-dev overlay installed with exit code 0 and retained schema v9, one book, one
  managed library file and reading-history preferences. The installed sidecar hash matched the
  pinned value. The test product and its dedicated app-data were then removed; formal user data was
  not targeted.

## libmobi, licensing and security

- Pinned sidecar: libmobi/mobitool 0.12, Windows x64, 296,129 bytes, SHA-256
  `438576B701C7BD706213D1FD9E717D671403D02FB90AB1D1655342838DB47CF1`.
- Verification confirms EPUB/KF8 conversion and no password/decryption option. DRM preflight
  remains in Rust before sidecar launch.
- Three real upstream fixtures converted in 56–211ms with peak working set 3,194,880–5,726,208
  bytes. The 120-second production timeout is unchanged.
- License audit: 291 JavaScript and 556 Cargo external packages, unknown license count zero;
  libmobi remains LGPL-3.0-or-later with source archive and detached signature included.
- Syft 1.44.0 generated non-empty CycloneDX source and Windows-artifact SBOMs. Artifact security
  verification passed the updater fingerprint, locked HTTPS endpoint, secret-marker, local-path,
  source-material and SBOM-schema gates.

## Windows bundles and size gates

The signed-updater NSIS and manual-track MSI were rebuilt from the final source. Authenticode remains
honestly reported as `NotSigned`; this does not weaken the required updater signature.

| Artifact | Bytes | SHA-256 | Delta from v0.2.0 final |
| --- | ---: | --- | ---: |
| NSIS | 8,019,737 | `134D4152D25C627DD7A13F195F2CBB9D31DB14A90A97BEC5978C7249E73683F3` | +646,045 |
| MSI | 10,403,840 | `583071C86D36F0AE8F28A3512A0A102ABF83D7FB6A0486A9B64FE859CACC6E9C` | +942,080 |
| NSIS updater signature | 424 | `4729F51EEDFE4D2115663DC6A45806298F40ABCB3A8890DD112F948FBC3F7390` | required |

MSI administrative images measured 21,616,128 bytes for v0.2.0 and 24,184,001 bytes for Stage 14,
an installed-footprint increase of 2,567,873 bytes. Both package deltas remain below 10 MiB and the
installed delta remains below 20 MiB.

The ignored evidence directory is `release-artifacts/stage14-acceptance/`. Its formal artifacts,
SBOMs, hashes and manifest are local acceptance evidence only. Temporary 0.3.0-dev installers must
not be published.

## Stop boundary

Stage 14 is complete. The repository formal version remains 0.2.0. No v0.3 tag or GitHub Release
was created, and Stage 15 has not started.
