#!/usr/bin/env bash
set -euo pipefail
set +x

if [[ -n "${EBOOK_READER_DEFAULT_KEYCHAIN_PATH:-}" && -f "$EBOOK_READER_DEFAULT_KEYCHAIN_PATH" ]]; then
  previous_default="$(sed 's/^"//; s/"$//' "$EBOOK_READER_DEFAULT_KEYCHAIN_PATH")"
  if [[ -n "$previous_default" ]]; then
    security default-keychain -d user -s "$previous_default" >/dev/null 2>&1 || true
  fi
fi
if [[ -n "${EBOOK_READER_KEYCHAIN_PATH:-}" ]]; then
  security delete-keychain "$EBOOK_READER_KEYCHAIN_PATH" >/dev/null 2>&1 || true
fi
if [[ -n "${EBOOK_READER_CERTIFICATE_PATH:-}" ]]; then
  rm -f "$EBOOK_READER_CERTIFICATE_PATH"
fi
if [[ -n "${EBOOK_READER_DEFAULT_KEYCHAIN_PATH:-}" ]]; then
  rm -f "$EBOOK_READER_DEFAULT_KEYCHAIN_PATH"
fi
