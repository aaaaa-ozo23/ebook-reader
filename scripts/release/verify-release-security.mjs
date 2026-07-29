/* global console, process */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..", "..");
const completeArtifactSet = process.argv.includes("--complete");
const artifactArgument = process.argv
  .slice(2)
  .find((argument) => argument !== "--complete");
const artifactRoot = artifactArgument ? resolve(root, artifactArgument) : null;
const failures = [];

const libmobiComponent = JSON.parse(
  readFileSync(resolve(root, "third_party/libmobi/component.json"), "utf8"),
);
const libmobiBinary = resolve(
  root,
  "apps/desktop/src-tauri/binaries/mobitool-x86_64-pc-windows-msvc.exe",
);
if (!statSafe(libmobiBinary)) {
  failures.push("Pinned libmobi sidecar is missing.");
} else {
  const binary = readFileSync(libmobiBinary);
  const hash = createHash("sha256").update(binary).digest("hex").toUpperCase();
  if (hash !== libmobiComponent.binarySha256) {
    failures.push("Pinned libmobi sidecar hash does not match component metadata.");
  }
  if (binary.length !== libmobiComponent.binaryBytes) {
    failures.push("Pinned libmobi sidecar size does not match component metadata.");
  }
}

const publicKeyPath = resolve(
  root,
  "apps/desktop/src-tauri/updater/ebook-reader-updater.pub",
);
const fingerprintPath = resolve(
  root,
  "apps/desktop/src-tauri/updater/FINGERPRINT.sha256",
);
const canonicalKey = readFileSync(publicKeyPath, "utf8").trim();
const fingerprint = createHash("sha256")
  .update(canonicalKey)
  .digest("hex")
  .toUpperCase();
if (!readFileSync(fingerprintPath, "utf8").startsWith(fingerprint)) {
  failures.push("Updater public-key fingerprint does not match the committed key.");
}

const git = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (git.status !== 0) failures.push("Could not enumerate tracked files.");
const tracked = git.stdout.split("\0").filter(Boolean);
const forbiddenNames = /\.(key|pfx|p12|pem)$/i;
const secretPattern = new RegExp(
  "minisign " +
    "(encrypted )?" +
    "secret key" +
    "|" +
    ["TAURI", "SIGNING", "PRIVATE", "KEY"].join("_") +
    "\\s*=",
  "i",
);
for (const file of tracked) {
  if (forbiddenNames.test(file))
    failures.push(`Forbidden secret-like tracked file: ${file}`);
  const path = resolve(root, file);
  if (statSync(path).size <= 4 * 1024 * 1024) {
    const text = readFileSync(path, "utf8");
    if (secretPattern.test(text))
      failures.push(`Private key material marker found: ${file}`);
  }
}

const tauri = JSON.parse(
  readFileSync(resolve(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
);
const endpoints = tauri.plugins?.updater?.endpoints ?? [];
if (
  endpoints.length !== 1 ||
  endpoints[0] !==
    "https://github.com/aaaaa-ozo23/ebook-reader/releases/latest/download/latest.json"
) {
  failures.push("Production updater endpoint is not the locked HTTPS GitHub endpoint.");
}
if (tauri.plugins?.updater?.dangerousInsecureTransportProtocol === true) {
  failures.push("Production updater enables insecure transport.");
}

if (artifactRoot) {
  if (!statDirectorySafe(artifactRoot)) {
    failures.push(`Release artifact directory is missing: ${artifactRoot}`);
  }
  const files = walk(artifactRoot);
  for (const path of files) {
    const name = relative(artifactRoot, path).replaceAll("\\", "/");
    if (forbiddenNames.test(name))
      failures.push(`Secret-like release artifact: ${name}`);
    if (statSync(path).size <= 4 * 1024 * 1024) {
      const text = readFileSync(path, "utf8");
      if (secretPattern.test(text))
        failures.push(`Private key marker in artifact: ${name}`);
      if (text.includes(root) || text.includes(root.replaceAll("\\", "\\\\")))
        failures.push(`Local repository path in artifact: ${name}`);
    }
  }
  const sbomNames = [
    "sbom-source.cdx.json",
    "sbom-windows-artifacts.cdx.json",
    ...(completeArtifactSet
      ? ["sbom-macos-artifacts.cdx.json", "sbom-linux-artifacts.cdx.json"]
      : []),
  ];
  for (const name of sbomNames) {
    verifyCycloneDx(resolve(artifactRoot, name), name);
  }
  const latest = readJsonSafe(resolve(artifactRoot, "latest.json"), "latest.json");
  if (latest) {
    verifyLatest(latest, completeArtifactSet);
  }
  for (const name of ["libmobi-0.12.tar.gz", "libmobi-0.12.tar.gz.asc"]) {
    if (!statSafe(resolve(artifactRoot, name))) {
      failures.push(`Release artifact is missing LGPL source material: ${name}`);
    }
  }
  if (completeArtifactSet) {
    verifyCompleteArtifactSet(artifactRoot, latest);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}
console.log("Release security verification passed.");

function statSafe(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function statDirectorySafe(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function walk(directory) {
  if (!statDirectorySafe(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readJsonSafe(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${label} is missing or invalid JSON: ${error.message}`);
    return null;
  }
}

function verifyCycloneDx(path, name) {
  const sbom = readJsonSafe(path, name);
  if (sbom && (sbom.bomFormat !== "CycloneDX" || !Array.isArray(sbom.components))) {
    failures.push(`${name} is not a valid CycloneDX document.`);
  }
}

function verifyLatest(latest, complete) {
  const windows = latest.platforms?.["windows-x86_64"];
  if (!latest.version || !windows?.url || !windows?.signature) {
    failures.push("latest.json is missing required Windows updater fields.");
  }
  if (!complete) return;

  const expectedKeys = [
    "windows-x86_64",
    "darwin-x86_64",
    "darwin-aarch64",
    "linux-x86_64",
  ];
  const actualKeys = Object.keys(latest.platforms ?? {}).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedKeys].sort())) {
    failures.push(
      "latest.json does not contain exactly the four supported platform keys.",
    );
  }
  for (const key of expectedKeys) {
    const entry = latest.platforms?.[key];
    if (!entry?.url || !entry?.signature) {
      failures.push(`latest.json is missing updater fields for ${key}.`);
    }
  }
  const darwinX64 = latest.platforms?.["darwin-x86_64"];
  const darwinArm = latest.platforms?.["darwin-aarch64"];
  if (
    darwinX64?.url !== darwinArm?.url ||
    darwinX64?.signature !== darwinArm?.signature
  ) {
    failures.push("Darwin updater keys must point to the same Universal asset.");
  }

  if (!/^\d+\.\d+\.\d+$/.test(latest.version)) {
    failures.push("latest.json version must be a stable semantic version.");
  }
  if (!latest.pub_date || Number.isNaN(Date.parse(latest.pub_date))) {
    failures.push("latest.json pub_date must be an ISO-compatible timestamp.");
  }
  const expectedNames = {
    "windows-x86_64": `Ebook.Reader_${latest.version}_x64-setup.exe`,
    "darwin-x86_64": `Ebook.Reader_${latest.version}_universal.app.tar.gz`,
    "darwin-aarch64": `Ebook.Reader_${latest.version}_universal.app.tar.gz`,
    "linux-x86_64": `Ebook.Reader_${latest.version}_amd64.AppImage`,
  };
  for (const [key, name] of Object.entries(expectedNames)) {
    const expectedUrl =
      `https://github.com/aaaaa-ozo23/ebook-reader/releases/download/` +
      `v${latest.version}/${name}`;
    if (latest.platforms?.[key]?.url !== expectedUrl) {
      failures.push(`latest.json ${key} URL must be ${expectedUrl}.`);
    }
  }
}

function verifyCompleteArtifactSet(directory, latest) {
  if (!latest?.version) return;
  const version = latest.version;
  const required = [
    `Ebook.Reader_${version}_x64-setup.exe`,
    `Ebook.Reader_${version}_x64-setup.exe.sig`,
    `Ebook.Reader_${version}_x64_en-US.msi`,
    `Ebook.Reader_${version}_universal.dmg`,
    `Ebook.Reader_${version}_universal.app.tar.gz`,
    `Ebook.Reader_${version}_universal.app.tar.gz.sig`,
    `Ebook.Reader_${version}_amd64.AppImage`,
    `Ebook.Reader_${version}_amd64.AppImage.sig`,
    `Ebook.Reader_${version}_amd64.deb`,
    "artifact-manifest.json",
    "acceptance-report.md",
    "SHA256SUMS.txt",
  ];
  for (const name of required) {
    if (!statSafe(resolve(directory, name))) {
      failures.push(`Complete RC is missing required artifact: ${name}`);
    }
  }
  for (const name of [
    `Ebook.Reader_${version}_x64-setup.exe.sig`,
    `Ebook.Reader_${version}_universal.app.tar.gz.sig`,
    `Ebook.Reader_${version}_amd64.AppImage.sig`,
  ]) {
    const path = resolve(directory, name);
    if (statSafe(path) && readFileSync(path, "utf8").trim().length === 0) {
      failures.push(`Updater signature is empty: ${name}`);
    }
  }

  const manifest = readJsonSafe(
    resolve(directory, "artifact-manifest.json"),
    "artifact-manifest.json",
  );
  if (manifest && manifest.version !== version) {
    failures.push("Artifact manifest version does not match latest.json.");
  }
  if (manifest) {
    const expectedPlatforms = [
      "windows-x86_64",
      "darwin-x86_64",
      "darwin-aarch64",
      "linux-x86_64",
    ];
    if (
      JSON.stringify(manifest.updaterPlatforms) !== JSON.stringify(expectedPlatforms)
    ) {
      failures.push("Artifact manifest has the wrong updater platform order.");
    }
    if (!Array.isArray(manifest.artifacts)) {
      failures.push("Artifact manifest is missing its artifact inventory.");
    } else {
      for (const entry of manifest.artifacts) {
        verifyManifestEntry(directory, entry);
      }
    }
  }
  verifyChecksums(directory);
}

function verifyChecksums(directory) {
  const checksumPath = resolve(directory, "SHA256SUMS.txt");
  if (!statSafe(checksumPath)) return;
  const lines = readFileSync(checksumPath, "ascii")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const checkedNames = new Set();
  for (const line of lines) {
    const match = line.match(/^([a-fA-F0-9]{64}) {2}([^\r\n]+)$/);
    if (!match) {
      failures.push(`Invalid SHA256SUMS entry: ${line}`);
      continue;
    }
    const [, expected, name] = match;
    if (checkedNames.has(name)) {
      failures.push(`SHA256SUMS contains a duplicate file: ${name}`);
      continue;
    }
    checkedNames.add(name);
    if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      failures.push(`SHA256SUMS contains an unsafe path: ${name}`);
      continue;
    }
    const path = resolve(directory, name);
    if (!statSafe(path)) {
      failures.push(`SHA256SUMS references a missing file: ${name}`);
      continue;
    }
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      failures.push(`SHA-256 mismatch for ${name}.`);
    }
  }
  const expectedNames = readdirSync(directory)
    .filter((name) => name !== "SHA256SUMS.txt")
    .filter((name) => statSync(resolve(directory, name)).isFile())
    .sort();
  if (JSON.stringify([...checkedNames].sort()) !== JSON.stringify(expectedNames)) {
    failures.push("SHA256SUMS does not cover exactly every other RC file.");
  }
}

function verifyManifestEntry(directory, entry) {
  if (
    typeof entry?.name !== "string" ||
    entry.name.includes("/") ||
    entry.name.includes("\\") ||
    entry.name === "." ||
    entry.name === ".."
  ) {
    failures.push("Artifact manifest contains an unsafe or invalid name.");
    return;
  }
  const path = resolve(directory, entry.name);
  if (!statSafe(path)) {
    failures.push(`Artifact manifest references a missing file: ${entry.name}`);
    return;
  }
  const contents = readFileSync(path);
  const hash = createHash("sha256").update(contents).digest("hex");
  if (entry.bytes !== contents.length) {
    failures.push(`Artifact manifest byte size mismatch for ${entry.name}.`);
  }
  if (String(entry.sha256).toLowerCase() !== hash.toLowerCase()) {
    failures.push(`Artifact manifest SHA-256 mismatch for ${entry.name}.`);
  }
}
