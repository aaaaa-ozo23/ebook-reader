/* global console, process */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const flavor = process.argv[2];
if (flavor !== "nsis" && flavor !== "msi") {
  console.error("Usage: node scripts/build-windows-flavor.mjs <nsis|msi>");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps", "desktop");
const env = {
  ...process.env,
  EBOOK_READER_BUILD_FLAVOR: flavor,
};

if (
  flavor === "nsis" &&
  !env.TAURI_SIGNING_PRIVATE_KEY &&
  !env.TAURI_SIGNING_PRIVATE_KEY_PATH
) {
  const home = env.USERPROFILE ?? env.HOME;
  const defaultKey = home
    ? join(home, ".codex", "secrets", "ebook-reader-updater.key")
    : null;
  if (defaultKey && existsSync(defaultKey)) {
    env.TAURI_SIGNING_PRIVATE_KEY_PATH = defaultKey;
  }
}

if (
  flavor === "nsis" &&
  !env.TAURI_SIGNING_PRIVATE_KEY &&
  !env.TAURI_SIGNING_PRIVATE_KEY_PATH
) {
  console.error(
    "NSIS updater builds require TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH. The private key must remain outside the repository.",
  );
  process.exit(3);
}

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  executable,
  ["tauri", "build", "--config", `src-tauri/tauri.${flavor}.conf.json`],
  { cwd: desktop, env, stdio: "inherit", shell: process.platform === "win32" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
