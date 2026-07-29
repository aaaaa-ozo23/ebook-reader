/* global console, process */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { assembleReleaseCandidate } from "./assemble-cross-platform-rc.mjs";

const version = "0.4.0";
const generatedAt = "2026-07-28T00:00:00.000Z";
const fixtureRoot = await mkdtemp(resolve(tmpdir(), "ebook-reader-rc-assembler-"));

try {
  const inputs = {
    windows: resolve(fixtureRoot, "windows"),
    macos: resolve(fixtureRoot, "macos"),
    linux: resolve(fixtureRoot, "linux"),
  };
  await Promise.all(
    Object.values(inputs).map((path) => mkdir(path, { recursive: true })),
  );
  await createFixtures(inputs);

  const firstOutput = resolve(fixtureRoot, "output-a");
  const secondOutput = resolve(fixtureRoot, "output-b");
  const options = { generatedAt, inputs, version };
  await assembleReleaseCandidate({ ...options, output: firstOutput });
  await assembleReleaseCandidate({ ...options, output: secondOutput });

  const latest = JSON.parse(
    await readFile(resolve(firstOutput, "latest.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(latest.platforms), [
    "windows-x86_64",
    "darwin-x86_64",
    "darwin-aarch64",
    "linux-x86_64",
  ]);
  assert.deepEqual(
    latest.platforms["darwin-x86_64"],
    latest.platforms["darwin-aarch64"],
  );
  assert.match(
    latest.platforms["linux-x86_64"].url,
    /Ebook\.Reader_0\.4\.0_amd64\.AppImage$/,
  );

  const firstInventory = await hashDirectory(firstOutput);
  const secondInventory = await hashDirectory(secondOutput);
  assert.deepEqual(firstInventory, secondInventory);
  assert.ok(firstInventory["SHA256SUMS.txt"]);
  assert.ok(firstInventory["artifact-manifest.json"]);
  assert.ok(firstInventory["Ebook.Reader_0.4.0_universal.dmg"]);
  assert.ok(firstInventory["Ebook.Reader_0.4.0_amd64.deb"]);

  const checksumLines = (
    await readFile(resolve(firstOutput, "SHA256SUMS.txt"), "ascii")
  )
    .trim()
    .split("\n");
  assert.equal(checksumLines.length, Object.keys(firstInventory).length - 1);
  execFileSync(
    process.execPath,
    [
      resolve(import.meta.dirname, "verify-release-security.mjs"),
      firstOutput,
      "--complete",
    ],
    { stdio: "pipe" },
  );
  console.log("Cross-platform RC assembler self-test passed.");
} finally {
  await rm(fixtureRoot, { force: true, recursive: true });
}

async function createFixtures(inputs) {
  const sbom = JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    components: [],
  });
  const fixtures = {
    [resolve(inputs.windows, "Ebook.Reader_0.4.0_x64-setup.exe")]: "nsis",
    [resolve(inputs.windows, "Ebook.Reader_0.4.0_x64-setup.exe.sig")]:
      "windows-signature",
    [resolve(inputs.windows, "Ebook.Reader_0.4.0_x64_en-US.msi")]: "msi",
    [resolve(inputs.windows, "sbom-source.cdx.json")]: sbom,
    [resolve(inputs.windows, "sbom-windows-artifacts.cdx.json")]: sbom,
    [resolve(inputs.windows, "license-audit.json")]: "{}",
    [resolve(inputs.windows, "authenticode-status.json")]: "[]",
    [resolve(inputs.windows, "libmobi-0.12.tar.gz")]: "source",
    [resolve(inputs.windows, "libmobi-0.12.tar.gz.asc")]: "source-signature",
    [resolve(inputs.macos, "bundle", "dmg", "Ebook Reader.dmg")]: "dmg",
    [resolve(inputs.macos, "bundle", "macos", "Ebook Reader.app.tar.gz")]:
      "macos-updater",
    [resolve(inputs.macos, "bundle", "macos", "Ebook Reader.app.tar.gz.sig")]:
      "macos-signature",
    [resolve(inputs.macos, "sbom-macos-artifacts.cdx.json")]: sbom,
    [resolve(inputs.linux, "bundle", "appimage", "ebook-reader.AppImage")]: "appimage",
    [resolve(inputs.linux, "bundle", "appimage", "ebook-reader.AppImage.sig")]:
      "linux-signature",
    [resolve(inputs.linux, "bundle", "deb", "ebook-reader.deb")]: "deb",
    [resolve(inputs.linux, "sbom-linux-artifacts.cdx.json")]: sbom,
  };
  for (const [path, contents] of Object.entries(fixtures)) {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, contents, "utf8");
  }
}

async function hashDirectory(directory) {
  const inventory = {};
  for (const name of (await readdir(directory)).sort()) {
    const contents = await readFile(resolve(directory, name));
    inventory[name] = createHash("sha256").update(contents).digest("hex");
  }
  return inventory;
}
