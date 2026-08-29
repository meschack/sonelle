import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const applicationId = "app.sonelle.reader";
const candidateCatalogPath = "tools/narration-spike/android-supertonic-candidate.json";
const tauriConfigPath = "apps/desktop/src-tauri/tauri.conf.json";
const supportedProfiles = new Set(["reader-only", "offline-voice-candidate"]);

export function createAndroidBuildMetadata({
  artifactPath,
  commitRevision,
  createdAt,
  abi,
  buildType,
  profile,
  version
}) {
  if (!supportedProfiles.has(profile))
    throw new Error(`Unsupported Android build profile: ${profile}`);
  if (!/^[0-9a-f]{40}$/u.test(commitRevision)) {
    throw new Error("Android build metadata requires a full commit SHA.");
  }
  if (typeof abi !== "string" || abi.length === 0) throw new Error("Android ABI is required.");
  if (typeof buildType !== "string" || buildType.length === 0)
    throw new Error("Android build type is required.");
  const artifact = readFileSync(artifactPath);
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  const candidate = profile === "offline-voice-candidate";
  if (candidate && abi !== "arm64-v8a") {
    throw new Error("The offline-voice candidate requires arm64-v8a.");
  }
  const catalog = candidate ? readFileSync(candidateCatalogPath) : null;
  const catalogDocument = catalog == null ? null : JSON.parse(catalog.toString("utf8"));
  const candidateStatus = catalogDocument?.engines?.[0]?.model?.status ?? null;
  if (candidate && candidateStatus !== "candidate-not-accepted") {
    throw new Error("The internal offline-voice catalog lost its candidate status.");
  }

  return {
    schemaVersion: 2,
    applicationId,
    version: version ?? tauriConfig.version,
    commitRevision,
    buildType,
    abi,
    createdAt,
    artifact: {
      fileName: basename(artifactPath),
      sizeBytes: statSync(artifactPath).size,
      sha256: sha256(artifact)
    },
    narration: {
      profile,
      bundledRuntime: candidate,
      bundledModel: false,
      candidateStatus,
      catalog:
        catalog == null
          ? null
          : {
              sha256: sha256(catalog),
              engines: catalogDocument.engines.map((engine) => ({
                id: engine.id,
                modelRevision: engine.model.revision
              }))
            }
    }
  };
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      ![
        "--abi",
        "--artifact",
        "--build-type",
        "--commit",
        "--output",
        "--profile",
        "--version"
      ].includes(name) ||
      value == null
    ) {
      throw new Error(
        "Usage: node scripts/create-android-build-metadata.mjs --artifact <apk> --commit <revision> --abi <abi> --build-type <type> --profile <reader-only|offline-voice-candidate> [--version <version>] --output <json>"
      );
    }
    const key = name.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    options[key] = value;
  }
  if (
    options.abi == null ||
    options.artifact == null ||
    options.buildType == null ||
    options.commit == null ||
    options.output == null ||
    options.profile == null
  ) {
    throw new Error(
      "Usage: node scripts/create-android-build-metadata.mjs --artifact <apk> --commit <revision> --abi <abi> --build-type <type> --profile <reader-only|offline-voice-candidate> [--version <version>] --output <json>"
    );
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const metadata = createAndroidBuildMetadata({
    artifactPath: options.artifact,
    commitRevision: options.commit,
    createdAt: new Date().toISOString(),
    abi: options.abi,
    buildType: options.buildType,
    profile: options.profile,
    version: options.version
  });
  writeFileSync(options.output, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Wrote Android build metadata for ${metadata.commitRevision}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
