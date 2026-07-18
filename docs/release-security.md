# Release security

The Windows release pipeline is manual and reproducible. `scripts/release/build-release.ps1` runs
quality gates, locked-license audits, updater-key leak checks, two installer flavors, updater
signing, CycloneDX SBOM generation, Authenticode inspection, artifact inventory, and SHA-256 sums.
It writes only below the ignored `release-artifacts/` directory.

## SBOM tool trust

The pipeline pins Syft v1.44.0. `install-syft.ps1` downloads the immutable Anchore release checksum
manifest, verifies its hard-coded official SHA-256 (`FA24CE…BF4E`), extracts the Windows archive
checksum from that verified manifest, and downloads the archive only then. App-update checks and
cache writes are disabled during SBOM generation. Source/lockfiles and the final Windows installer
pair receive separate CycloneDX JSON documents.

See the official [Syft release](https://github.com/anchore/syft/releases/tag/v1.44.0) and
[installation guidance](https://oss.anchore.com/docs/installation/syft/).

## Two different signatures

The Tauri updater minisign signature is mandatory. The private key remains outside Git and release
artifacts; the committed public fingerprint is the only key identifier in reports. The verifier
rejects private-key markers, key/certificate filenames, insecure updater transport, unexpected
endpoints, invalid SBOM shape, and incomplete `latest.json`.

Authenticode is separate. Both current-user and local-machine stores were checked on 2026-07-16 and
contained no Code Signing certificate. The RC therefore reports `NotSigned` truthfully and retains
the SmartScreen warning; it never labels updater minisign as Authenticode. This follows Tauri's
[Windows code-signing guidance](https://v2.tauri.app/distribute/sign/windows/).

## CI publication boundary

`.github/workflows/v0.2-rc-artifacts.yml` is `workflow_dispatch` only. It builds and uploads a
short-retention workflow artifact called `draft`; it cannot create a tag or GitHub Release and has
read-only repository contents permission. Public release publication remains a separate explicit
authorization.
