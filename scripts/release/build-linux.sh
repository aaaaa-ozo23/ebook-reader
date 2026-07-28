#!/usr/bin/env bash
set -euo pipefail
set +x

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "The Linux release build requires Linux x86_64." >&2
  exit 1
fi
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "TAURI_SIGNING_PRIVATE_KEY is required for the AppImage updater artifact." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

pnpm install --frozen-lockfile
pnpm check
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
scripts/deps/build-libmobi-linux.sh

export EBOOK_READER_BUILD_FLAVOR=appimage
pnpm --filter @reader/desktop tauri build \
  --config src-tauri/tauri.appimage.conf.json

export EBOOK_READER_BUILD_FLAVOR=deb
pnpm --filter @reader/desktop tauri build \
  --config src-tauri/tauri.deb.conf.json

bundle_root="apps/desktop/src-tauri/target/release/bundle"
scripts/release/verify-linux-bundles.sh "$bundle_root"
