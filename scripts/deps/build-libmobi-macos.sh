#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS." >&2
  exit 1
fi

for command in curl gpg make shasum tar clang lipo file strip; do
  command -v "$command" >/dev/null || {
    echo "Required build tool is missing: $command" >&2
    exit 1
  }
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workspace="${LIBMOBI_WORKSPACE:-$repo_root/.tools/libmobi-v0.12-macos}"
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
deployment_target="12.0"

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

actual_source_sha256="$(shasum -a 256 "$archive" | awk '{print $1}')"
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

build_arch() {
  local clang_arch="$1"
  local host="$2"
  local rust_target="$3"
  local source_root="$build_root/libmobi-$rust_target"

  mkdir -p "$source_root"
  tar -xzf "$archive" -C "$source_root" --strip-components=1
  pushd "$source_root" >/dev/null
  export SOURCE_DATE_EPOCH="$source_date_epoch"
  export MACOSX_DEPLOYMENT_TARGET="$deployment_target"
  export CC=clang
  export ARFLAGS=crD
  export CFLAGS="-arch $clang_arch -mmacosx-version-min=$deployment_target -O2 -DNDEBUG -ffile-prefix-map=$source_root=/usr/src/libmobi-0.12"
  export LDFLAGS="-arch $clang_arch -mmacosx-version-min=$deployment_target"
  ./configure \
    --host="$host" \
    --disable-dependency-tracking \
    --disable-shared \
    --enable-static \
    --enable-tools-static \
    --disable-encryption \
    --without-libxml2 \
    --without-zlib
  make -j"$(sysctl -n hw.logicalcpu)"
  strip -x tools/mobitool
  cp tools/mobitool "$output_dir/mobitool-$rust_target"
  chmod 755 "$output_dir/mobitool-$rust_target"
  popd >/dev/null
}

build_arch x86_64 x86_64-apple-darwin x86_64-apple-darwin
build_arch arm64 aarch64-apple-darwin aarch64-apple-darwin

universal="$output_dir/mobitool-universal-apple-darwin"
lipo -create \
  "$output_dir/mobitool-x86_64-apple-darwin" \
  "$output_dir/mobitool-aarch64-apple-darwin" \
  -output "$universal"
chmod 755 "$universal"
lipo -verify_arch x86_64 arm64 "$universal"

manifest="$output_dir/libmobi-macos-build.json"
compiler="$(clang --version | head -n 1)"
for binary in \
  "$output_dir/mobitool-x86_64-apple-darwin" \
  "$output_dir/mobitool-aarch64-apple-darwin" \
  "$universal"; do
  file "$binary" >&2
done

cat >"$manifest" <<EOF
{
  "version": "0.12",
  "sourceSha256": "$actual_source_sha256",
  "primaryFingerprint": "$primary_fingerprint",
  "signingFingerprint": "$signing_fingerprint",
  "compiler": "$compiler",
  "deploymentTarget": "$deployment_target",
  "targets": {
    "x86_64-apple-darwin": {
      "bytes": $(stat -f %z "$output_dir/mobitool-x86_64-apple-darwin"),
      "sha256": "$(shasum -a 256 "$output_dir/mobitool-x86_64-apple-darwin" | awk '{print $1}')"
    },
    "aarch64-apple-darwin": {
      "bytes": $(stat -f %z "$output_dir/mobitool-aarch64-apple-darwin"),
      "sha256": "$(shasum -a 256 "$output_dir/mobitool-aarch64-apple-darwin" | awk '{print $1}')"
    },
    "universal-apple-darwin": {
      "bytes": $(stat -f %z "$universal"),
      "sha256": "$(shasum -a 256 "$universal" | awk '{print $1}')",
      "architectures": ["x86_64", "arm64"]
    }
  }
}
EOF

cat "$manifest"
