/* global console, process */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const outputPath = process.argv[2] ? resolve(root, process.argv[2]) : null;

function run(command, args) {
  const executable =
    process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: executable.endsWith(".cmd"),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

const pnpmStore = resolve(root, "node_modules", ".pnpm");
if (!existsSync(pnpmStore)) {
  throw new Error("node_modules/.pnpm is missing; run pnpm install --frozen-lockfile");
}
const installedPackages = discoverPnpmPackages(pnpmStore);
const unknownJs = installedPackages.filter((pkg) => pkg.license === null);
const jsLicenseGroups = [
  ...new Set(installedPackages.flatMap((pkg) => pkg.license ?? [])),
].sort();

const cargo = JSON.parse(
  run("cargo", [
    "metadata",
    "--locked",
    "--format-version",
    "1",
    "--manifest-path",
    "apps/desktop/src-tauri/Cargo.toml",
  ]),
);
const externalCargo = cargo.packages.filter((pkg) => pkg.source !== null);
const unknownCargo = externalCargo.filter(
  (pkg) => !pkg.license?.trim() && !pkg.license_file?.trim(),
);

const report = {
  generatedAt: new Date().toISOString(),
  javascript: {
    packageCount: installedPackages.length,
    licenseGroups: jsLicenseGroups,
    unknownPackages: unknownJs.map(({ name, version }) => `${name}@${version}`),
  },
  cargo: {
    packageCount: externalCargo.length,
    unknownPackages: unknownCargo.map(({ name, version }) => `${name}@${version}`),
  },
  bundledComponents: [readBundledComponent("third_party/libmobi/component.json")],
};

if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (unknownJs.length > 0 || unknownCargo.length > 0) process.exit(1);

function readBundledComponent(path) {
  const component = JSON.parse(readFileSync(resolve(root, path), "utf8"));
  for (const field of [
    "name",
    "version",
    "license",
    "sourceUrl",
    "sourceSha256",
    "binarySha256",
  ]) {
    if (!component[field]) throw new Error(`${path} is missing ${field}`);
  }
  return component;
}

function discoverPnpmPackages(store) {
  const packages = new Map();
  for (const entry of readdirSync(store, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const modules = resolve(store, entry.name, "node_modules");
    if (!existsSync(modules)) continue;
    for (const packageRoot of packageRoots(modules)) {
      const manifestPath = resolve(packageRoot, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!manifest.name || !manifest.version) continue;
      const licenseValue = manifest.license ?? manifest.licenses;
      const licenses = Array.isArray(licenseValue)
        ? licenseValue
            .map((value) => (typeof value === "string" ? value : value?.type))
            .filter(Boolean)
        : typeof licenseValue === "string"
          ? [licenseValue]
          : null;
      const hasLicenseFile = readdirSync(packageRoot).some((name) =>
        /^(license|licence|copying)(\.|$)/i.test(name),
      );
      packages.set(`${manifest.name}@${manifest.version}`, {
        name: manifest.name,
        version: manifest.version,
        license: licenses?.length ? licenses : hasLicenseFile ? ["LICENSE-FILE"] : null,
      });
    }
  }
  return [...packages.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}

function packageRoots(modules) {
  return readdirSync(modules, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(modules, entry.name);
    if (!entry.isDirectory()) return [];
    if (entry.name.startsWith("@")) {
      return readdirSync(path, { withFileTypes: true })
        .filter((child) => child.isDirectory())
        .map((child) => resolve(path, child.name));
    }
    return basename(path) === "node_modules" ? [] : [path];
  });
}
