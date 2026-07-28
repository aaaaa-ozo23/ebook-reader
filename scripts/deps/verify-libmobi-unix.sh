#!/usr/bin/env bash
set -euo pipefail

binary="${1:?usage: verify-libmobi-unix.sh <mobitool>}"
if [[ ! -x "$binary" ]]; then
  echo "mobitool is missing or not executable." >&2
  exit 1
fi

version="$("$binary" -v 2>&1)"
help="$("$binary" -h 2>&1)"
grep -Fq 'libmobi: 0.12' <<<"$version"
grep -Fq -- '-e        create EPUB file' <<<"$help"
grep -Fq -- '-7' <<<"$help"
if grep -Eiq 'password|decrypt|[[:space:]]-p[[:space:]]|[[:space:]]-P[[:space:]]' <<<"$help"; then
  echo "mobitool unexpectedly exposes a DRM/password option." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture_root="$repo_root/apps/desktop/src-tauri/tests/fixtures/libmobi"
scratch="$(mktemp -d)"
cleanup() {
  rm -rf "$scratch"
}
trap cleanup EXIT

for fixture in sample-ncx.mobi sample-multimedia.mobi sample-unicode-uncompressed.mobi; do
  output="$scratch/${fixture%.mobi}"
  mkdir -p "$output"
  timeout_seconds=120
  if command -v timeout >/dev/null; then
    timeout "$timeout_seconds" "$binary" -e -o "$output" "$fixture_root/$fixture"
  else
    "$binary" -e -o "$output" "$fixture_root/$fixture"
  fi
  epubs=("$output"/*.epub)
  if [[ ${#epubs[@]} -ne 1 || ! -s "${epubs[0]}" ]]; then
    echo "Expected exactly one non-empty EPUB for $fixture." >&2
    exit 1
  fi
  unzip -tq "${epubs[0]}" >/dev/null
done

echo "libmobi 0.12 Unix conversion verification passed."
