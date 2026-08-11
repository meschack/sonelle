import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const allowedLicenseIds = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-3-Clause",
  "CC0-1.0",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Unicode-3.0",
  "Unlicense",
  "Zlib"
]);
const expressionOperators = new Set(["AND", "OR", "WITH"]);
const desktopNarrationPackages = new Set(["grapheme_to_phoneme", "misaki-rs", "ort", "ort-sys"]);

export function auditAndroidCargoMetadata(metadata, releaseScope) {
  const errors = [];
  for (const packageMetadata of metadata.packages ?? []) {
    const license = packageMetadata.license?.trim();
    if (!license) {
      errors.push(`${packageMetadata.name}@${packageMetadata.version} has no declared license`);
      continue;
    }
    const tokens = license.replaceAll("/", " OR ").match(/[A-Za-z0-9.+-]+/gu) ?? [];
    const unknown = tokens.filter(
      (token) => !expressionOperators.has(token) && !allowedLicenseIds.has(token)
    );
    if (unknown.length > 0) {
      errors.push(
        `${packageMetadata.name}@${packageMetadata.version} uses unapproved license expression ${license}`
      );
    }
  }
  if (releaseScope.status === "reader-only") {
    const unexpected = (metadata.packages ?? [])
      .map((packageMetadata) => packageMetadata.name)
      .filter((name) => desktopNarrationPackages.has(name));
    if (unexpected.length > 0) {
      errors.push(`reader-only Android release unexpectedly includes ${unexpected.join(", ")}`);
    }
  }
  return errors;
}

export function auditPnpmLicenses(licenseGroups) {
  const errors = [];
  for (const license of Object.keys(licenseGroups)) {
    const tokens = license.replaceAll("/", " OR ").match(/[A-Za-z0-9.+-]+/gu) ?? [];
    if (tokens.some((token) => !expressionOperators.has(token) && !allowedLicenseIds.has(token))) {
      errors.push(`production JavaScript dependency uses unapproved license expression ${license}`);
    }
  }
  return errors;
}

export function auditNarrationLicenseCatalog(catalog) {
  const errors = [];
  const supertonic = catalog.engines?.find((engine) => engine.id === "supertonic");
  if (supertonic?.source?.license?.id !== "MIT") {
    errors.push("Supertonic source license is not pinned as MIT");
  }
  if (supertonic?.model?.license?.id !== "OpenRAIL-M") {
    errors.push("Supertonic 3 model license is not pinned as OpenRAIL-M");
  }
  const license = supertonic?.model?.license;
  const licenseArtifact = supertonic?.model?.artifacts?.find(
    (artifact) => artifact.targetPath === license?.file
  );
  if (licenseArtifact?.sha256 !== license?.sha256) {
    errors.push("Supertonic 3 pack does not preserve its pinned license artifact");
  }
  return errors;
}

function main() {
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--locked",
        "--filter-platform",
        "aarch64-linux-android",
        "--format-version",
        "1"
      ],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "inherit"]
      }
    )
  );
  const releaseScope = JSON.parse(
    readFileSync("apps/desktop/src/legal/android-release-scope.json", "utf8")
  );
  const catalog = JSON.parse(readFileSync("tools/narration-spike/engines.json", "utf8"));
  const pnpmLicenses = JSON.parse(
    execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"]
    })
  );
  const errors = [
    ...auditAndroidCargoMetadata(metadata, releaseScope),
    ...auditPnpmLicenses(pnpmLicenses),
    ...auditNarrationLicenseCatalog(catalog)
  ];
  if (errors.length > 0) throw new Error(`Android release audit failed:\n- ${errors.join("\n- ")}`);
  console.log(
    `Android release audit passed for ${metadata.packages.length} Rust packages, ${Object.values(pnpmLicenses).flat().length} production JavaScript packages, and the pinned Supertonic license artifact.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
