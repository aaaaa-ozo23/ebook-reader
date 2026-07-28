#!/usr/bin/env bash
set -euo pipefail

app_bundle="${1:?usage: smoke-macos-app.sh <Ebook Reader.app> <x86_64|arm64>}"
expected_arch="${2:?usage: smoke-macos-app.sh <Ebook Reader.app> <x86_64|arm64>}"
actual_arch="$(uname -m)"
if [[ "$actual_arch" != "$expected_arch" ]]; then
  echo "Expected $expected_arch runner, got $actual_arch." >&2
  exit 1
fi

main_executable="$app_bundle/Contents/MacOS/ebook-reader-desktop"
info_plist="$app_bundle/Contents/Info.plist"
test -x "$main_executable"
for arch in x86_64 arm64; do
  lipo -archs "$main_executable" | grep -qw "$arch"
done
for extension in epub txt pdf mobi azw3; do
  plutil -convert json -o - "$info_plist" | grep -Fq "\"$extension\""
done

log_file="$(mktemp)"
cleanup() {
  rm -f "$log_file"
}
trap cleanup EXIT

"$main_executable" >"$log_file" 2>&1 &
pid=$!
sleep 12
if ! kill -0 "$pid" >/dev/null 2>&1; then
  echo "Universal macOS application exited during native startup smoke." >&2
  sed -n '1,80p' "$log_file" >&2
  exit 1
fi
kill -TERM "$pid"
wait "$pid" 2>/dev/null || true

echo "Universal macOS startup smoke passed on $actual_arch."
