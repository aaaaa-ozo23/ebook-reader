/* global console, process */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const artifactRoot = process.argv[2] ? resolve(root, process.argv[2]) : null;
if (artifactRoot === null || !statSync(artifactRoot).isDirectory()) {
  throw new Error(
    "Usage: node scripts/release/scan-artifacts.mjs <artifact-directory>",
  );
}

const failures = [];
const forbiddenNames = /\.(key|pfx|p12|pem)$/i;
const secretPatterns = [
  /minisign (encrypted )?secret key/i,
  /-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----/,
  /APPLE_CERTIFICATE\s*[:=]/i,
  /TAURI_SIGNING_PRIVATE_KEY\s*[:=]/i,
];

for (const path of walk(artifactRoot)) {
  const name = relative(artifactRoot, path).replaceAll("\\", "/");
  if (forbiddenNames.test(name)) failures.push(`Secret-like artifact name: ${name}`);
  const stats = statSync(path);
  if (stats.size > 4 * 1024 * 1024) continue;
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 8192).includes(0)) continue;
  const text = buffer.toString("utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) failures.push(`Secret marker in artifact: ${name}`);
  }
  for (const localPrefix of [root, process.env.RUNNER_TEMP].filter(Boolean)) {
    if (text.includes(localPrefix))
      failures.push(`Machine-local path in artifact: ${name}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}
console.log("Cross-platform artifact secret scan passed.");

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
