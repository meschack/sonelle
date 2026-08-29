import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const allowedLicenseIds = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "CDLA-Permissive-2.0",
  "ISC",
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
  } else if (releaseScope.status === "offline-voice-candidate") {
    const packageNames = new Set(
      (metadata.packages ?? []).map((packageMetadata) => packageMetadata.name)
    );
    for (const required of ["ort", "ort-sys"]) {
      if (!packageNames.has(required))
        errors.push(`offline-voice candidate is missing ${required}`);
    }
    for (const desktopOnly of ["grapheme_to_phoneme", "misaki-rs"]) {
      if (packageNames.has(desktopOnly)) {
        errors.push(`offline-voice candidate unexpectedly includes ${desktopOnly}`);
      }
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

export function auditAndroidCandidateCatalog(catalog) {
  const errors = [];
  const engines = catalog.engines ?? [];
  const supertonic = engines.find((engine) => engine.id === "supertonic");
  if (engines.length !== 1 || supertonic == null) {
    errors.push("Android candidate catalog must contain only Supertonic");
    return errors;
  }
  if (supertonic.model?.status !== "candidate-not-accepted") {
    errors.push("Android Supertonic catalog must remain candidate-not-accepted");
  }
  if (supertonic.model?.quantization !== "dynamic-int8-qoperator") {
    errors.push("Android Supertonic catalog has an unexpected quantization contract");
  }
  if (supertonic.source?.revision !== "dff55dc00064c398736080c78195f577527832ae") {
    errors.push("Android Supertonic source revision changed without review");
  }
  if (supertonic.model?.upstream?.revision !== "3cadd1ee6394adea1bd021217a0e650ede09a323") {
    errors.push("Android Supertonic model source revision changed without review");
  }
  const revision = supertonic.model?.revision ?? "";
  const releasePrefix = `https://github.com/meschack/sonelle/releases/download/narration-supertonic-${revision.slice(0, 8)}/`;
  const artifacts = supertonic.model?.artifacts ?? [];
  if (artifacts.length !== 10) errors.push("Android Supertonic catalog must pin ten artifacts");
  let totalSizeBytes = 0;
  for (const artifact of artifacts) {
    totalSizeBytes += artifact.sizeBytes ?? 0;
    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? "")) {
      errors.push(`Android candidate artifact ${artifact.targetPath ?? "unknown"} has no SHA-256`);
    }
    if (!(artifact.url ?? "").startsWith(releasePrefix)) {
      errors.push(
        `Android candidate artifact ${artifact.targetPath ?? "unknown"} is not pinned to its release`
      );
    }
  }
  if (totalSizeBytes > 175 * 1024 * 1024) {
    errors.push("Android Supertonic catalog exceeds the 175 MB pack limit");
  }
  return errors;
}

function main() {
  const profileIndex = process.argv.indexOf("--profile");
  const profile = profileIndex < 0 ? "reader-only" : process.argv[profileIndex + 1];
  if (!new Set(["reader-only", "offline-voice-candidate"]).has(profile)) {
    throw new Error(
      "Usage: node scripts/audit-android-release.mjs [--profile reader-only|offline-voice-candidate]"
    );
  }
  const cargoArguments = [
    "metadata",
    "--locked",
    "--filter-platform",
    "aarch64-linux-android",
    "--format-version",
    "1"
  ];
  if (profile === "offline-voice-candidate") {
    cargoArguments.push("--features", "android-offline-voice-candidate");
  }
  const metadata = JSON.parse(
    execFileSync("cargo", cargoArguments, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"]
    })
  );
  const releaseScope =
    profile === "reader-only"
      ? JSON.parse(readFileSync("apps/desktop/src/legal/android-release-scope.json", "utf8"))
      : { status: "offline-voice-candidate" };
  const catalogPath =
    profile === "offline-voice-candidate"
      ? "tools/narration-spike/android-supertonic-candidate.json"
      : "tools/narration-spike/engines.json";
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
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
    ...auditNarrationLicenseCatalog(catalog),
    ...(profile === "offline-voice-candidate" ? auditAndroidCandidateCatalog(catalog) : [])
  ];
  if (errors.length > 0) throw new Error(`Android release audit failed:\n- ${errors.join("\n- ")}`);
  console.log(
    `Android ${profile} audit passed for ${metadata.packages.length} Rust packages, ${Object.values(pnpmLicenses).flat().length} production JavaScript packages, and the pinned Supertonic license artifact.`
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
