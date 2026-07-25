/* global console, process */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const expectedVersion = "0.3.0";

const readJson = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));

const [
  rootPackage,
  desktopPackage,
  corePackage,
  tauriConfig,
  tauriDevConfig,
  cargoManifest,
] = await Promise.all([
  readJson("package.json"),
  readJson("apps/desktop/package.json"),
  readJson("packages/core/package.json"),
  readJson("apps/desktop/src-tauri/tauri.conf.json"),
  readJson("apps/desktop/src-tauri/tauri.dev.conf.json"),
  readFile(resolve(root, "apps/desktop/src-tauri/Cargo.toml"), "utf8"),
]);

const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLicense = cargoManifest.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
const versions = {
  "package.json": rootPackage.version,
  "packages/core/package.json": corePackage.version,
  "apps/desktop/package.json": desktopPackage.version,
  "apps/desktop/src-tauri/Cargo.toml": cargoVersion,
  "apps/desktop/src-tauri/tauri.conf.json": tauriConfig.version,
};

const mismatches = Object.entries(versions).filter(
  ([, version]) => version !== expectedVersion,
);

const releaseConfigErrors = [];
for (const [path, license] of Object.entries({
  "package.json": rootPackage.license,
  "apps/desktop/package.json": desktopPackage.license,
  "packages/core/package.json": corePackage.license,
  "apps/desktop/src-tauri/Cargo.toml": cargoLicense,
})) {
  if (license !== "MIT") {
    releaseConfigErrors.push(`${path}: license must be MIT`);
  }
}
if (tauriConfig.productName !== "Ebook Reader") {
  releaseConfigErrors.push("productName must be Ebook Reader");
}
if (tauriConfig.identifier !== "com.ebookreader.desktop") {
  releaseConfigErrors.push("identifier must remain com.ebookreader.desktop");
}
if (tauriDevConfig.productName !== "Ebook Reader Dev") {
  releaseConfigErrors.push("development productName must be Ebook Reader Dev");
}
if (tauriDevConfig.identifier !== "com.ebookreader.desktop.dev") {
  releaseConfigErrors.push(
    "development identifier must be com.ebookreader.desktop.dev",
  );
}
if (
  desktopPackage.scripts?.["tauri:dev"] !==
  "tauri dev --config src-tauri/tauri.dev.conf.json"
) {
  releaseConfigErrors.push("tauri:dev must use the isolated development configuration");
}
if (tauriDevConfig.identifier === tauriConfig.identifier) {
  releaseConfigErrors.push("development identifier must not share production app data");
}
if (JSON.stringify(tauriConfig.bundle?.targets) !== JSON.stringify(["nsis", "msi"])) {
  releaseConfigErrors.push("bundle targets must be nsis and msi");
}
if (tauriConfig.bundle?.windows?.allowDowngrades !== false) {
  releaseConfigErrors.push("Windows downgrades must be disabled");
}
if (tauriConfig.bundle?.windows?.nsis?.installMode !== "currentUser") {
  releaseConfigErrors.push("NSIS installMode must be currentUser");
}
const associatedExtensions = new Set(
  (tauriConfig.bundle?.fileAssociations ?? []).flatMap(
    (association) => association.ext ?? [],
  ),
);
for (const extension of ["epub", "txt", "pdf", "mobi", "azw3"]) {
  if (!associatedExtensions.has(extension)) {
    releaseConfigErrors.push(`missing .${extension} file association`);
  }
}
if (!tauriConfig.bundle?.externalBin?.includes("binaries/mobitool")) {
  releaseConfigErrors.push("bundle must include the pinned mobitool sidecar");
}

for (const path of [
  "LICENSE",
  "CHANGELOG.md",
  "THIRD_PARTY_NOTICES.md",
  "RELEASE_CHECKLIST.md",
  "apps/desktop/src-tauri/icons/icon.png",
]) {
  try {
    await readFile(resolve(root, path));
  } catch {
    releaseConfigErrors.push(`${path}: required release file is missing`);
  }
}

if (mismatches.length > 0) {
  for (const [path, version] of mismatches) {
    console.error(
      `${path}: expected ${expectedVersion}, found ${version ?? "missing"}`,
    );
  }
}

for (const error of releaseConfigErrors) {
  console.error(error);
}

if (mismatches.length > 0 || releaseConfigErrors.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`Release version verified: ${expectedVersion}`);
}
