/* global console, process */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];

const readText = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(readText(path));
const requireCondition = (condition, message) => {
  if (!condition) failures.push(message);
};

const platformSource = readText("packages/core/src/index.ts");
for (const value of [
  '"windows"',
  '"macos"',
  '"linux"',
  '"x86_64"',
  '"aarch64"',
  '"nsis"',
  '"msi"',
  '"appimage"',
  '"deb"',
]) {
  requireCondition(
    platformSource.includes(value),
    `Core platform contracts are missing ${value}.`,
  );
}

const tauri = readJson("apps/desktop/src-tauri/tauri.conf.json");
const associations = new Set(tauri.bundle.fileAssociations.flatMap(({ ext }) => ext));
for (const extension of ["epub", "txt", "pdf", "mobi", "azw3"]) {
  requireCondition(
    associations.has(extension),
    `Tauri file associations are missing .${extension}.`,
  );
}
requireCondition(
  tauri.bundle.externalBin.includes("binaries/mobitool"),
  "Tauri must bundle the target-triple mobitool sidecar.",
);

const overlays = [
  ["tauri.nsis.conf.json", ["nsis"], true],
  ["tauri.msi.conf.json", ["msi"], false],
  ["tauri.macos.conf.json", ["app", "dmg"], true],
  ["tauri.appimage.conf.json", ["appimage"], true],
  ["tauri.deb.conf.json", ["deb"], false],
];
for (const [name, targets, updater] of overlays) {
  const config = readJson(`apps/desktop/src-tauri/${name}`);
  requireCondition(
    JSON.stringify(config.bundle.targets) === JSON.stringify(targets),
    `${name} has the wrong bundle targets.`,
  );
  requireCondition(
    config.bundle.createUpdaterArtifacts === updater,
    `${name} has the wrong updater-artifact policy.`,
  );
}
const macos = readJson("apps/desktop/src-tauri/tauri.macos.conf.json");
requireCondition(
  macos.bundle.macOS?.minimumSystemVersion === "12.0" &&
    macos.bundle.macOS?.hardenedRuntime === true,
  "macOS packaging must require macOS 12.0 and hardened runtime.",
);

for (const path of [
  "scripts/deps/build-libmobi-macos.sh",
  "scripts/deps/build-libmobi-linux.sh",
  "scripts/release/build-macos.sh",
  "scripts/release/build-linux.sh",
  "scripts/release/verify-macos-bundle.sh",
  "scripts/release/verify-linux-bundles.sh",
  "scripts/ci/smoke-macos-app.sh",
  "scripts/ci/smoke-linux-packages.sh",
  "scripts/ci/smoke-windows-binary.ps1",
]) {
  requireCondition(
    existsSync(resolve(root, path)),
    `Required Stage 15 script is missing: ${path}`,
  );
}

const workflow = readText(".github/workflows/v0.4-cross-platform-rc.yml");
requireCondition(
  /^\s*workflow_dispatch:\s*$/m.test(workflow),
  "Stage 15 workflow must be manually dispatched.",
);
for (const forbiddenTrigger of ["push:", "pull_request:", "release:"]) {
  requireCondition(
    !new RegExp(`^\\s{2}${forbiddenTrigger}`, "m").test(workflow),
    `Stage 15 workflow must not enable ${forbiddenTrigger}`,
  );
}
for (const required of [
  "contents: read",
  "windows-2025",
  "macos-15-intel",
  "macos-15",
  "ubuntu-22.04",
  "ubuntu:24.04",
  "debian:12",
  "retention-days: 7",
  "playwright.webkit.config.ts",
]) {
  requireCondition(
    workflow.includes(required),
    `Stage 15 workflow is missing ${required}.`,
  );
}
for (const forbiddenPublication of [
  "softprops/action-gh-release",
  "gh release create",
  "git tag",
]) {
  requireCondition(
    !workflow.includes(forbiddenPublication),
    `Stage 15 workflow contains forbidden publication behavior: ${forbiddenPublication}.`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log("Stage 15 cross-platform contracts verified.");
