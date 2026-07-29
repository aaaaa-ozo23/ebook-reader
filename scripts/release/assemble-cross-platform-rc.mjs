/* global console, process */
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const defaultRepository = "aaaaa-ozo23/ebook-reader";

if (isMainModule()) {
  const {
    values: {
      version,
      windows,
      macos,
      linux,
      output,
      repository,
      "generated-at": generatedAt,
    },
  } = parseArgs({
    options: {
      version: { type: "string" },
      windows: { type: "string" },
      macos: { type: "string" },
      linux: { type: "string" },
      output: { type: "string" },
      repository: { type: "string", default: defaultRepository },
      "generated-at": { type: "string" },
    },
    strict: true,
  });

  for (const [name, value] of Object.entries({
    version,
    windows,
    macos,
    linux,
    output,
  })) {
    if (value === undefined || value.length === 0) {
      throw new Error(`Missing required --${name} argument.`);
    }
  }

  const root = resolve(import.meta.dirname, "..", "..");
  const sourceVersion = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  ).version;
  if (version !== sourceVersion) {
    throw new Error(
      `Requested version ${version} does not match source version ${sourceVersion}.`,
    );
  }
  const outputRoot = resolve(output);
  const allowedOutputRoot = resolve(root, "release-artifacts");
  if (!isWithin(outputRoot, allowedOutputRoot)) {
    throw new Error(`Output must stay under ${allowedOutputRoot}`);
  }

  await assembleReleaseCandidate({
    generatedAt,
    inputs: {
      linux: resolve(linux),
      macos: resolve(macos),
      windows: resolve(windows),
    },
    output: outputRoot,
    repository,
    version,
  });
  console.log(`Cross-platform RC assembled at ${outputRoot}`);
}

export async function assembleReleaseCandidate({
  generatedAt = new Date().toISOString(),
  inputs,
  output,
  repository = defaultRepository,
  version,
}) {
  assertVersion(version);
  assertTimestamp(generatedAt);
  assertRepository(repository);
  await assertInputDirectories(inputs);
  assertSafeOutput(output, inputs);

  await rm(output, { force: true, recursive: true });
  await mkdir(output, { recursive: true });

  const escapedVersion = escapeRegex(version);
  const sources = {
    windowsNsis: await findExactlyOne(
      inputs.windows,
      new RegExp(`^Ebook\\.Reader_${escapedVersion}_x64-setup\\.exe$`, "i"),
    ),
    windowsNsisSignature: await findExactlyOne(
      inputs.windows,
      new RegExp(`^Ebook\\.Reader_${escapedVersion}_x64-setup\\.exe\\.sig$`, "i"),
    ),
    windowsMsi: await findExactlyOne(
      inputs.windows,
      new RegExp(`^Ebook\\.Reader_${escapedVersion}_x64_en-US\\.msi$`, "i"),
    ),
    macosDmg: await findExactlyOne(inputs.macos, /\.dmg$/i),
    macosUpdater: await findExactlyOne(inputs.macos, /\.app\.tar\.gz$/i),
    macosUpdaterSignature: await findExactlyOne(inputs.macos, /\.app\.tar\.gz\.sig$/i),
    linuxAppImage: await findExactlyOne(inputs.linux, /\.AppImage$/),
    linuxAppImageSignature: await findExactlyOne(inputs.linux, /\.AppImage\.sig$/),
    linuxDeb: await findExactlyOne(inputs.linux, /\.deb$/i),
    sourceSbom: await findNamed(inputs.windows, "sbom-source.cdx.json"),
    windowsSbom: await findNamed(inputs.windows, "sbom-windows-artifacts.cdx.json"),
    macosSbom: await findNamed(inputs.macos, "sbom-macos-artifacts.cdx.json"),
    linuxSbom: await findNamed(inputs.linux, "sbom-linux-artifacts.cdx.json"),
    licenseAudit: await findNamed(inputs.windows, "license-audit.json"),
    authenticode: await findNamed(inputs.windows, "authenticode-status.json"),
    libmobiSource: await findNamed(inputs.windows, "libmobi-0.12.tar.gz"),
    libmobiSignature: await findNamed(inputs.windows, "libmobi-0.12.tar.gz.asc"),
  };

  await assertNonEmptySignature(sources.windowsNsisSignature);
  await assertNonEmptySignature(sources.macosUpdaterSignature);
  await assertNonEmptySignature(sources.linuxAppImageSignature);
  for (const source of [
    sources.sourceSbom,
    sources.windowsSbom,
    sources.macosSbom,
    sources.linuxSbom,
  ]) {
    await assertCycloneDx(source);
  }

  const names = {
    windowsNsis: `Ebook.Reader_${version}_x64-setup.exe`,
    windowsNsisSignature: `Ebook.Reader_${version}_x64-setup.exe.sig`,
    windowsMsi: `Ebook.Reader_${version}_x64_en-US.msi`,
    macosDmg: `Ebook.Reader_${version}_universal.dmg`,
    macosUpdater: `Ebook.Reader_${version}_universal.app.tar.gz`,
    macosUpdaterSignature: `Ebook.Reader_${version}_universal.app.tar.gz.sig`,
    linuxAppImage: `Ebook.Reader_${version}_amd64.AppImage`,
    linuxAppImageSignature: `Ebook.Reader_${version}_amd64.AppImage.sig`,
    linuxDeb: `Ebook.Reader_${version}_amd64.deb`,
  };
  const supportFiles = {
    sourceSbom: "sbom-source.cdx.json",
    windowsSbom: "sbom-windows-artifacts.cdx.json",
    macosSbom: "sbom-macos-artifacts.cdx.json",
    linuxSbom: "sbom-linux-artifacts.cdx.json",
    licenseAudit: "license-audit.json",
    authenticode: "authenticode-status.json",
    libmobiSource: "libmobi-0.12.tar.gz",
    libmobiSignature: "libmobi-0.12.tar.gz.asc",
  };

  for (const [sourceKey, outputName] of Object.entries({
    ...names,
    ...supportFiles,
  })) {
    await copyFile(sources[sourceKey], resolve(output, outputName));
  }

  const releaseBase = `https://github.com/${repository}/releases/download/v${version}`;
  const windowsSignature = await readSignature(
    resolve(output, names.windowsNsisSignature),
  );
  const macosSignature = await readSignature(
    resolve(output, names.macosUpdaterSignature),
  );
  const linuxSignature = await readSignature(
    resolve(output, names.linuxAppImageSignature),
  );
  const macosUpdater = {
    signature: macosSignature,
    url: `${releaseBase}/${names.macosUpdater}`,
  };
  const latest = {
    version,
    notes: `Ebook Reader v${version} release candidate`,
    pub_date: generatedAt,
    platforms: {
      "windows-x86_64": {
        signature: windowsSignature,
        url: `${releaseBase}/${names.windowsNsis}`,
      },
      "darwin-x86_64": macosUpdater,
      "darwin-aarch64": { ...macosUpdater },
      "linux-x86_64": {
        signature: linuxSignature,
        url: `${releaseBase}/${names.linuxAppImage}`,
      },
    },
  };
  await writeJson(resolve(output, "latest.json"), latest);

  const acceptanceReport = [
    `# v${version} cross-platform RC acceptance report`,
    "",
    `- Generated: ${generatedAt}`,
    "- Scope: Windows x64 NSIS/MSI, macOS Universal DMG/updater, Linux x64 AppImage/deb.",
    "- Automatic updater tracks: NSIS, macOS, AppImage.",
    "- Manual upgrade tracks: MSI, deb.",
    "- macOS package gate: Developer ID signing, notarization, stapling, Gatekeeper, Universal slices, and updater signature are required upstream inputs.",
    "- Linux package gate: Ubuntu 22.04 build, AppImage/deb extraction, executable sidecar, MIME integration, and Ubuntu 24.04/Debian 12 acceptance are required upstream inputs.",
    "- Data safety: native acceptance uses isolated identifiers/data roots and must not read or delete the production profile.",
    "- Publication boundary: this is an RC artifact set only; no tag or public GitHub Release is created by the workflow.",
    "",
  ].join("\n");
  await writeFile(resolve(output, "acceptance-report.md"), acceptanceReport, "utf8");

  const payloadEntries = await inventoryDirectory(output);
  const artifactManifest = {
    version,
    generatedAt,
    updaterPlatforms: Object.keys(latest.platforms),
    artifacts: payloadEntries,
  };
  await writeJson(resolve(output, "artifact-manifest.json"), artifactManifest);

  const checksumEntries = await inventoryDirectory(output);
  const checksumText = `${checksumEntries
    .map(({ name, sha256 }) => `${sha256.toLowerCase()}  ${name}`)
    .join("\n")}\n`;
  await writeFile(resolve(output, "SHA256SUMS.txt"), checksumText, "ascii");

  return {
    latest,
    names,
    output,
  };
}

async function assertInputDirectories(inputs) {
  for (const [platform, directory] of Object.entries(inputs)) {
    const metadata = await stat(directory).catch(() => null);
    if (metadata?.isDirectory() !== true) {
      throw new Error(`${platform} input is not a directory: ${directory}`);
    }
  }
}

function assertSafeOutput(output, inputs) {
  const outputRoot = resolve(output);
  if (outputRoot === dirname(outputRoot)) {
    throw new Error("Output cannot be a filesystem root.");
  }
  for (const [platform, directory] of Object.entries(inputs)) {
    const inputRoot = resolve(directory);
    if (
      outputRoot === inputRoot ||
      isWithin(inputRoot, outputRoot) ||
      isWithin(outputRoot, inputRoot)
    ) {
      throw new Error(`Output and the ${platform} input directory cannot overlap.`);
    }
  }
}

function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
}

function assertTimestamp(timestamp) {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Invalid generated timestamp: ${timestamp}`);
  }
}

function assertRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }
}

async function assertNonEmptySignature(path) {
  if ((await readSignature(path)).length === 0) {
    throw new Error(`Updater signature is empty: ${path}`);
  }
}

async function assertCycloneDx(path) {
  const document = JSON.parse(await readFile(path, "utf8"));
  if (document.bomFormat !== "CycloneDX" || !Array.isArray(document.components)) {
    throw new Error(`Invalid CycloneDX SBOM: ${path}`);
  }
}

async function readSignature(path) {
  return (await readFile(path, "utf8")).trim();
}

async function findNamed(root, expectedName) {
  return findExactlyOne(root, new RegExp(`^${escapeRegex(expectedName)}$`, "i"));
}

async function findExactlyOne(root, namePattern) {
  const matches = (await walk(root)).filter((path) => namePattern.test(basename(path)));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${namePattern} under ${root}, found ${matches.length}.`,
    );
  }
  return matches[0];
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function inventoryDirectory(directory) {
  const paths = (await walk(directory)).sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  return Promise.all(
    paths.map(async (path) => {
      const contents = await readFile(path);
      return {
        name: relative(directory, path).replaceAll("\\", "/"),
        bytes: contents.length,
        sha256: createHash("sha256").update(contents).digest("hex").toUpperCase(),
      };
    }),
  );
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isWithin(path, parent) {
  const child = relative(parent, path);
  return child === "" || (!child.startsWith("..") && !child.startsWith("/"));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(import.meta.filename)
  );
}
