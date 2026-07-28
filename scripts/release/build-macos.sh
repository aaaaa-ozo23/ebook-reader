#!/usr/bin/env bash
set -euo pipefail
set +x

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The macOS release build must run on macOS." >&2
  exit 1
fi

for variable in APPLE_SIGNING_IDENTITY APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH TAURI_SIGNING_PRIVATE_KEY; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required macOS release credential is missing: $variable" >&2
    exit 1
  fi
done
if [[ ! -f "$APPLE_API_KEY_PATH" ]]; then
  echo "APPLE_API_KEY_PATH does not point to a readable App Store Connect key." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

pnpm install --frozen-lockfile
pnpm check
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
scripts/deps/build-libmobi-macos.sh

export EBOOK_READER_BUILD_FLAVOR=macos
export MACOSX_DEPLOYMENT_TARGET=12.0
pnpm --filter @reader/desktop tauri build \
  --target universal-apple-darwin \
  --config src-tauri/tauri.macos.conf.json

bundle_root="apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle"
scripts/release/verify-macos-bundle.sh "$bundle_root"
