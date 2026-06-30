import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const expectedVersion = "0.1.0";

const readJson = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));

const [rootPackage, desktopPackage, tauriConfig, cargoManifest] = await Promise.all([
  readJson("package.json"),
  readJson("apps/desktop/package.json"),
  readJson("apps/desktop/src-tauri/tauri.conf.json"),
  readFile(resolve(root, "apps/desktop/src-tauri/Cargo.toml"), "utf8"),
]);

const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = {
  "package.json": rootPackage.version,
  "apps/desktop/package.json": desktopPackage.version,
  "apps/desktop/src-tauri/Cargo.toml": cargoVersion,
  "apps/desktop/src-tauri/tauri.conf.json": tauriConfig.version,
};

const mismatches = Object.entries(versions).filter(
  ([, version]) => version !== expectedVersion,
);

if (mismatches.length > 0) {
  for (const [path, version] of mismatches) {
    console.error(
      `${path}: expected ${expectedVersion}, found ${version ?? "missing"}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(`Release version verified: ${expectedVersion}`);
}
