#!/usr/bin/env bash
set -euo pipefail

appimage="${1:?usage: smoke-linux-packages.sh <AppImage> <deb>}"
deb="${2:?usage: smoke-linux-packages.sh <AppImage> <deb>}"
for command in dpkg-deb xvfb-run timeout; do
  command -v "$command" >/dev/null || {
    echo "Required smoke-test command is missing: $command" >&2
    exit 1
  }
done

data_root="$(mktemp -d)"
runtime_root="$(mktemp -d)"
cleanup() {
  rm -rf "$data_root" "$runtime_root"
}
trap cleanup EXIT
chmod 700 "$runtime_root"
export XDG_DATA_HOME="$data_root"
export XDG_RUNTIME_DIR="$runtime_root"
export NO_AT_BRIDGE=1
if [[ "$(id -u)" -eq 0 ]]; then
  sudo_command=()
else
  sudo_command=(sudo)
fi

run_gui_smoke() {
  local executable="$1"
  set +e
  timeout --signal=TERM 20s xvfb-run -a "$executable"
  local status=$?
  set -e
  if [[ $status -ne 0 && $status -ne 124 ]]; then
    echo "Native GUI smoke exited unexpectedly with status $status." >&2
    exit 1
  fi
}

chmod 755 "$appimage"
APPIMAGE_EXTRACT_AND_RUN=1 run_gui_smoke "$appimage"

package_name="$(dpkg-deb --field "$deb" Package)"
"${sudo_command[@]}" apt-get install -y "$deb"
installed_executable="$(command -v ebook-reader-desktop)"
if [[ -z "$installed_executable" ]]; then
  echo "deb did not install the application executable." >&2
  exit 1
fi
run_gui_smoke "$installed_executable"

sentinel="$data_root/stage15-user-data-sentinel"
printf 'preserve\n' >"$sentinel"
"${sudo_command[@]}" apt-get install --reinstall -y "$deb"
test -f "$sentinel"
"${sudo_command[@]}" apt-get remove -y "$package_name"
test -f "$sentinel"

echo "Linux AppImage/deb smoke and data-retention checks passed."
