#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS bundle verification must run on macOS." >&2
  exit 1
fi

bundle_root="${1:?usage: verify-macos-bundle.sh <bundle-root>}"
app_bundle="$bundle_root/macos/Ebook Reader.app"

if [[ ! -d "$app_bundle" ]]; then
  echo "Missing macOS application bundle." >&2
  exit 1
fi

dmg_candidates=("$bundle_root"/dmg/*.dmg)
updater_candidates=("$bundle_root"/macos/*.app.tar.gz)
signature_candidates=("$bundle_root"/macos/*.app.tar.gz.sig)
if [[ ${#dmg_candidates[@]} -ne 1 || ! -f "${dmg_candidates[0]}" ]]; then
  echo "Expected exactly one DMG." >&2
  exit 1
fi
if [[ ${#updater_candidates[@]} -ne 1 || ! -f "${updater_candidates[0]}" ]]; then
  echo "Expected exactly one macOS updater archive." >&2
  exit 1
fi
if [[ ${#signature_candidates[@]} -ne 1 || ! -s "${signature_candidates[0]}" ]]; then
  echo "Expected exactly one non-empty macOS updater signature." >&2
  exit 1
fi
dmg="${dmg_candidates[0]}"

codesign --verify --deep --strict --verbose=2 "$app_bundle"
spctl --assess --type execute --verbose=2 "$app_bundle"
xcrun stapler validate "$app_bundle"
xcrun stapler validate "$dmg"

main_executable="$app_bundle/Contents/MacOS/ebook-reader-desktop"
sidecar="$app_bundle/Contents/MacOS/mobitool"
for binary in "$main_executable" "$sidecar"; do
  if [[ ! -x "$binary" ]]; then
    echo "Missing executable bundle member: $(basename "$binary")" >&2
    exit 1
  fi
  architectures="$(lipo -archs "$binary")"
  grep -qw x86_64 <<<"$architectures"
  grep -qw arm64 <<<"$architectures"
  codesign --verify --strict --verbose=2 "$binary"
done

if find "$app_bundle" -type f \( -name '*.sqlite*' -o -name '*.epub' -o -name '*.txt' -o -name '*.pdf' -o -name '*.mobi' -o -name '*.azw3' \) -print -quit | grep -q .; then
  echo "The macOS application bundle contains user or test data." >&2
  exit 1
fi

echo "macOS bundle verification passed."
