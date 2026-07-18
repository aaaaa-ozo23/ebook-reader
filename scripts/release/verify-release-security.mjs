/* global console, process */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..", "..");
const artifactRoot = process.argv[2] ? resolve(root, process.argv[2]) : null;
const failures = [];

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
  for (const name of ["sbom-source.cdx.json", "sbom-windows-artifacts.cdx.json"]) {
    const path = resolve(artifactRoot, name);
    const sbom = JSON.parse(readFileSync(path, "utf8"));
    if (sbom.bomFormat !== "CycloneDX" || !Array.isArray(sbom.components)) {
      failures.push(`${name} is not a valid CycloneDX document.`);
    }
  }
  const latest = JSON.parse(readFileSync(resolve(artifactRoot, "latest.json"), "utf8"));
  const windows = latest.platforms?.["windows-x86_64"];
  if (!latest.version || !windows?.url || !windows?.signature) {
    failures.push("latest.json is missing required Windows updater fields.");
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}
console.log("Release security verification passed.");

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
