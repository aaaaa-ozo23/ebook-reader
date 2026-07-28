#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This script requires Linux x86_64." >&2
  exit 1
fi

for command in curl gpg gcc make sha256sum tar strip file readelf ldd; do
  command -v "$command" >/dev/null || {
    echo "Required build tool is missing: $command" >&2
    exit 1
  }
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workspace="${LIBMOBI_WORKSPACE:-$repo_root/.tools/libmobi-v0.12-linux}"
output_dir="${LIBMOBI_OUTPUT_DIR:-$repo_root/apps/desktop/src-tauri/binaries}"
archive="$workspace/libmobi-0.12.tar.gz"
signature="$workspace/libmobi-0.12.tar.gz.asc"
public_key="$workspace/bfabiszewski.github.gpg"
source_url="https://github.com/bfabiszewski/libmobi/releases/download/v0.12/libmobi-0.12.tar.gz"
public_key_url="https://github.com/bfabiszewski.gpg"
source_sha256="9a6fb2c56b916f8fa8b15e0c71008d908109508c944ea1d297881d4e277bf7e7"
primary_fingerprint="B1ED40082AF2D620370827C6734EF933CD41675C"
signing_fingerprint="DCBC81C5A4AC9C873F6FEA7F5C7E8917C4315322"
source_date_epoch="1718607591"
target="x86_64-unknown-linux-gnu"

mkdir -p "$workspace" "$output_dir"

download() {
  local url="$1"
  local destination="$2"
  if [[ ! -f "$destination" ]]; then
    curl --fail --location --silent --show-error \
      --user-agent "ebook-reader-libmobi-build" \
      "$url" --output "$destination"
  fi
}

download "$source_url" "$archive"
download "$source_url.asc" "$signature"
download "$public_key_url" "$public_key"

actual_source_sha256="$(sha256sum "$archive" | awk '{print $1}')"
if [[ "$actual_source_sha256" != "$source_sha256" ]]; then
  echo "libmobi source hash mismatch: expected $source_sha256, got $actual_source_sha256" >&2
  exit 1
fi

gnupg_home="$(mktemp -d "$workspace/gnupg.XXXXXX")"
build_root="$(mktemp -d "$workspace/build.XXXXXX")"
cleanup() {
  rm -rf "$gnupg_home" "$build_root"
}
trap cleanup EXIT
chmod 700 "$gnupg_home"
export GNUPGHOME="$gnupg_home"
gpg --batch --import "$public_key" >/dev/null 2>&1
fingerprints="$(gpg --batch --with-colons --fingerprint | awk -F: '$1 == "fpr" { print $10 }')"
grep -qx "$primary_fingerprint" <<<"$fingerprints"
grep -qx "$signing_fingerprint" <<<"$fingerprints"
gpg --batch --verify "$signature" "$archive"

source_root="$build_root/libmobi-0.12"
tar -xzf "$archive" -C "$build_root"
pushd "$source_root" >/dev/null
export SOURCE_DATE_EPOCH="$source_date_epoch"
export CFLAGS="-O2 -DNDEBUG -ffile-prefix-map=$source_root=/usr/src/libmobi-0.12"
export LDFLAGS="-Wl,--build-id=sha1"
export ARFLAGS=crD
./configure \
  --host=x86_64-unknown-linux-gnu \
  --disable-dependency-tracking \
  --disable-shared \
  --enable-static \
  --enable-tools-static \
  --disable-encryption \
  --without-libxml2 \
  --without-zlib
make -j"$(nproc)"
strip --strip-unneeded tools/mobitool
popd >/dev/null

output="$output_dir/mobitool-$target"
cp "$source_root/tools/mobitool" "$output"
chmod 755 "$output"

file "$output" | grep -Eq 'ELF 64-bit LSB.*x86-64'
readelf -h "$output" | grep -Eq 'Machine:[[:space:]]+Advanced Micro Devices X86-64'
if [[ ! -x "$output" ]]; then
  echo "Linux sidecar is not executable." >&2
  exit 1
fi

dependencies="$(ldd "$output" 2>&1 || true)"
if ! grep -q 'not a dynamic executable' <<<"$dependencies"; then
  unexpected="$(
    awk '{print $1}' <<<"$dependencies" |
      grep -Ev '^(linux-vdso|libc\.so|libm\.so|libgcc_s\.so|libpthread\.so|librt\.so|libdl\.so|/lib64/ld-linux-x86-64\.so)' ||
      true
  )"
  if [[ -n "$unexpected" ]]; then
    echo "Unexpected Linux sidecar dynamic dependencies were found." >&2
    exit 1
  fi
fi

manifest="$output_dir/libmobi-linux-build.json"
cat >"$manifest" <<EOF
{
  "version": "0.12",
  "sourceSha256": "$actual_source_sha256",
  "primaryFingerprint": "$primary_fingerprint",
  "signingFingerprint": "$signing_fingerprint",
  "compiler": "$(gcc --version | head -n 1)",
  "target": "$target",
  "bytes": $(stat -c %s "$output"),
  "sha256": "$(sha256sum "$output" | awk '{print $1}')",
  "executable": true
}
EOF

cat "$manifest"
