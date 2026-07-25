import { createHash } from "node:crypto";
import { log } from "node:console";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { URL, fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const readText = (relativePath) =>
  readFileSync(join(repositoryRoot, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const requireCondition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectedSourceVersion = "0.2.0";
const packageVersions = [
  ["package.json", readJson("package.json").version],
  ["packages/core/package.json", readJson("packages/core/package.json").version],
  ["apps/desktop/package.json", readJson("apps/desktop/package.json").version],
  [
    "apps/desktop/src-tauri/tauri.conf.json",
    readJson("apps/desktop/src-tauri/tauri.conf.json").version,
  ],
];

for (const [source, version] of packageVersions) {
  requireCondition(
    version === expectedSourceVersion,
    `${source} must remain at ${expectedSourceVersion} until the v0.3 release stage`,
  );
}

const cargoManifest = readText("apps/desktop/src-tauri/Cargo.toml");
requireCondition(
  /^version = "0\.2\.0"$/m.test(cargoManifest),
  "Cargo.toml must remain at 0.2.0 until the v0.3 release stage",
);

for (const migration of [
  "0006_book_derivatives.sql",
  "0007_custom_fonts.sql",
  "0008_library_search.sql",
  "0009_reading_history.sql",
]) {
  const body = readText(`apps/desktop/src-tauri/migrations/${migration}`);
  requireCondition(body.trim().length > 0, `${migration} is missing or empty`);
}

const tauriConfig = readJson("apps/desktop/src-tauri/tauri.conf.json");
const associatedExtensions = new Set(
  tauriConfig.bundle.fileAssociations.flatMap(({ ext }) => ext),
);
for (const extension of ["epub", "txt", "pdf", "mobi", "azw3"]) {
  requireCondition(
    associatedExtensions.has(extension),
    `Tauri file associations are missing .${extension}`,
  );
}
requireCondition(
  tauriConfig.bundle.externalBin.includes("binaries/mobitool"),
  "Tauri externalBin must include the pinned mobitool sidecar",
);

const libmobi = readJson("third_party/libmobi/component.json");
requireCondition(libmobi.version === "0.12", "libmobi must remain pinned to 0.12");
requireCondition(
  libmobi.license === "LGPL-3.0-or-later",
  "libmobi license metadata must remain LGPL-3.0-or-later",
);
requireCondition(
  libmobi.build.encryption === false,
  "The bundled libmobi build must keep encryption support disabled",
);

const sidecar = readFileSync(
  join(
    repositoryRoot,
    "apps/desktop/src-tauri/binaries/mobitool-x86_64-pc-windows-msvc.exe",
  ),
);
const sidecarHash = createHash("sha256").update(sidecar).digest("hex").toUpperCase();
requireCondition(
  sidecarHash === libmobi.binarySha256,
  `mobitool SHA-256 mismatch: expected ${libmobi.binarySha256}, received ${sidecarHash}`,
);
requireCondition(
  sidecar.length === libmobi.binaryBytes,
  `mobitool byte length mismatch: expected ${libmobi.binaryBytes}, received ${sidecar.length}`,
);

const notices = readText("THIRD_PARTY_NOTICES.md");
requireCondition(
  /libmobi[\s\S]*LGPL-3\.0-or-later/i.test(notices),
  "THIRD_PARTY_NOTICES.md must disclose libmobi and its LGPL license",
);

const core = readText("packages/core/src/index.ts");
requireCondition(
  /"mobi"/.test(core) && /"azw3"/.test(core),
  "Core BookFormat must retain MOBI and AZW3",
);
requireCondition(
  /ReaderFormat/.test(core),
  "Core must retain the source-format/reader-format boundary",
);

log(
  `Stage 14 contracts verified: version ${expectedSourceVersion}, migrations 0006-0009, ` +
    `MOBI/AZW3 associations, libmobi ${libmobi.version} ${sidecar.length} bytes ${sidecarHash}`,
);
