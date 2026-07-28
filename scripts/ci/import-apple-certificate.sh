#!/usr/bin/env bash
set -euo pipefail
set +x

for variable in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_API_KEY APPLE_API_KEY_BASE64 KEYCHAIN_PASSWORD GITHUB_ENV RUNNER_TEMP; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required CI secret or environment variable is missing: $variable" >&2
    exit 1
  fi
done

certificate_path="$RUNNER_TEMP/ebook-reader-developer-id.p12"
keychain_path="$RUNNER_TEMP/ebook-reader-signing.keychain-db"
default_keychain_path="$RUNNER_TEMP/ebook-reader-default-keychain.txt"
api_key_path="$RUNNER_TEMP/AuthKey_${APPLE_API_KEY}.p8"

umask 077
security default-keychain -d user >"$default_keychain_path"
printf '%s' "$APPLE_CERTIFICATE" | openssl base64 -d -A >"$certificate_path"
printf '%s' "$APPLE_API_KEY_BASE64" | openssl base64 -d -A >"$api_key_path"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$keychain_path"
security default-keychain -d user -s "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$keychain_path"
security import "$certificate_path" \
  -k "$keychain_path" \
  -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security >/dev/null
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$KEYCHAIN_PASSWORD" \
  "$keychain_path" >/dev/null

identity="$(
  security find-identity -v -p codesigning "$keychain_path" |
    awk -F'"' '/Developer ID Application/ { print $2; exit }'
)"
if [[ -z "$identity" ]]; then
  echo "No Developer ID Application identity was imported." >&2
  exit 1
fi

echo "::add-mask::$identity"
printf 'APPLE_SIGNING_IDENTITY=%s\n' "$identity" >>"$GITHUB_ENV"
printf 'EBOOK_READER_KEYCHAIN_PATH=%s\n' "$keychain_path" >>"$GITHUB_ENV"
printf 'EBOOK_READER_CERTIFICATE_PATH=%s\n' "$certificate_path" >>"$GITHUB_ENV"
printf 'EBOOK_READER_DEFAULT_KEYCHAIN_PATH=%s\n' "$default_keychain_path" >>"$GITHUB_ENV"
printf 'APPLE_API_KEY_PATH=%s\n' "$api_key_path" >>"$GITHUB_ENV"
printf 'EBOOK_READER_API_KEY_PATH=%s\n' "$api_key_path" >>"$GITHUB_ENV"
