/* global console */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..", "..");
const metadata = JSON.parse(
  readFileSync(resolve(root, "third_party/libmobi/component.json"), "utf8"),
);
const binaryPath = resolve(
  root,
  "apps/desktop/src-tauri/binaries/mobitool-x86_64-pc-windows-msvc.exe",
);
const binary = readFileSync(binaryPath);
const hash = createHash("sha256").update(binary).digest("hex").toUpperCase();

if (binary.length !== metadata.binaryBytes) {
  throw new Error(`mobitool size mismatch: ${binary.length}`);
}
if (hash !== metadata.binarySha256) {
  throw new Error(`mobitool hash mismatch: ${hash}`);
}

const peOffset = binary.readUInt32LE(0x3c);
if (binary.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
  throw new Error("mobitool is not a PE executable");
}
if (binary.readUInt16LE(peOffset + 4) !== 0x8664) {
  throw new Error("mobitool is not a Windows x64 executable");
}

const version = run("-v");
if (!version.includes("libmobi: 0.12")) {
  throw new Error(`unexpected mobitool version:\n${version}`);
}
const help = run("-h");
if (!help.includes("-e        create EPUB file") || !help.includes("-7")) {
  throw new Error("mobitool does not expose the required EPUB/KF8 behavior");
}
if (/password|decrypt|\s-p\s|\s-P\s/i.test(help)) {
  throw new Error("mobitool unexpectedly exposes a DRM/password option");
}

console.log(
  JSON.stringify({
    version: metadata.version,
    bytes: binary.length,
    sha256: hash,
    target: metadata.target,
    epubConversion: true,
    encryptionOptions: false,
  }),
);

function run(argument) {
  const result = spawnSync(binaryPath, [argument], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`mobitool ${argument} failed: ${result.stderr || result.stdout}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}
