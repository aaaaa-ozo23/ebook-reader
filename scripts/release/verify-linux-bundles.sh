#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Linux bundle verification requires Linux x86_64." >&2
  exit 1
fi

bundle_root="${1:?usage: verify-linux-bundles.sh <bundle-root>}"
appimage_candidates=("$bundle_root"/appimage/*.AppImage)
signature_candidates=("$bundle_root"/appimage/*.AppImage.sig)
deb_candidates=("$bundle_root"/deb/*.deb)
if [[ ${#appimage_candidates[@]} -ne 1 || ! -f "${appimage_candidates[0]}" ]]; then
  echo "Expected exactly one AppImage." >&2
  exit 1
fi
if [[ ${#signature_candidates[@]} -ne 1 || ! -s "${signature_candidates[0]}" ]]; then
  echo "Expected exactly one non-empty AppImage updater signature." >&2
  exit 1
fi
if [[ ${#deb_candidates[@]} -ne 1 || ! -f "${deb_candidates[0]}" ]]; then
  echo "Expected exactly one deb." >&2
  exit 1
fi
appimage="${appimage_candidates[0]}"
deb="${deb_candidates[0]}"

chmod 755 "$appimage"
if [[ ! -x "$appimage" ]]; then
  echo "AppImage is not executable." >&2
  exit 1
fi

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

pushd "$workdir" >/dev/null
"$appimage" --appimage-extract >/dev/null
popd >/dev/null
dpkg-deb --extract "$deb" "$workdir/deb-root"
dpkg-deb --info "$deb" | grep -q 'libwebkit2gtk-4.1-0'

required_mime_types=(
  application/epub+zip
  text/plain
  application/pdf
  application/x-mobipocket-ebook
  application/vnd.amazon.ebook
)

verify_tree() {
  local root="$1"
  local label="$2"
  local sidecar
  local desktop

  sidecar="$(find "$root" -type f -name mobitool -print -quit)"
  desktop="$(find "$root" -type f -name '*.desktop' -print -quit)"
  if [[ -z "$sidecar" || ! -x "$sidecar" ]]; then
    echo "$label does not contain an executable mobitool sidecar." >&2
    exit 1
  fi
  file "$sidecar" | grep -Eq 'ELF 64-bit LSB.*x86-64'
  if [[ -z "$desktop" ]]; then
    echo "$label does not contain a desktop entry." >&2
    exit 1
  fi
  grep -Eq '^Exec=.*%F([[:space:]]|$)' "$desktop"
  for mime_type in "${required_mime_types[@]}"; do
    grep -Fq "$mime_type" "$desktop"
  done
  if find "$root" -type f \( -name '*.sqlite*' -o -name '*.epub' -o -name '*.pdf' -o -name '*.mobi' -o -name '*.azw3' -o -path '*/library/*.txt' \) -print -quit | grep -q .; then
    echo "$label contains user or test data." >&2
    exit 1
  fi
}

verify_tree "$workdir/squashfs-root" AppImage
verify_tree "$workdir/deb-root" deb

echo "Linux bundle verification passed."
