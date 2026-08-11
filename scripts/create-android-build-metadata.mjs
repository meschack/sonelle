import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const applicationId = "app.sonelle.reader";
const catalogPath = "tools/narration-spike/engines.json";
const tauriConfigPath = "apps/desktop/src-tauri/tauri.conf.json";

export function createAndroidBuildMetadata({ artifactPath, commitRevision, createdAt }) {
  const artifact = readFileSync(artifactPath);
  const catalog = readFileSync(catalogPath);
  const catalogDocument = JSON.parse(catalog.toString("utf8"));
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));

  return {
    schemaVersion: 1,
    applicationId,
    version: tauriConfig.version,
    commitRevision,
    buildType: "internal-release",
    abi: "arm64-v8a",
    createdAt,
    artifact: {
      fileName: basename(artifactPath),
      sizeBytes: statSync(artifactPath).size,
      sha256: sha256(artifact)
    },
    narrationCatalog: {
      sha256: sha256(catalog),
      engines: catalogDocument.engines.map((engine) => ({
        id: engine.id,
        modelRevision: engine.model.revision
      }))
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
    if (!["--artifact", "--commit", "--output"].includes(name) || value == null) {
      throw new Error(
        "Usage: node scripts/create-android-build-metadata.mjs --artifact <apk> --commit <revision> --output <json>"
      );
    }
    options[name.slice(2)] = value;
  }
  if (options.artifact == null || options.commit == null || options.output == null) {
    throw new Error(
      "Usage: node scripts/create-android-build-metadata.mjs --artifact <apk> --commit <revision> --output <json>"
    );
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const metadata = createAndroidBuildMetadata({
    artifactPath: options.artifact,
    commitRevision: options.commit,
    createdAt: new Date().toISOString()
  });
  writeFileSync(options.output, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Wrote Android build metadata for ${metadata.commitRevision}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
