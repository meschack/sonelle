import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { loadNarrationSpikeConfig, setupNarrationSpike } from "./setup-narration-spike.mjs";
import {
  pythonPackageVersionCheckScript,
  resolvePythonCommand,
  resolveVenvPythonPath
} from "./setup-kokoro-reference.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_PATHS = new Set([
  "assets/onnx/duration_predictor.onnx",
  "assets/onnx/text_encoder.onnx",
  "assets/onnx/vector_estimator.onnx",
  "assets/onnx/vocoder.onnx"
]);
const ONNX_VERSION = "1.17.0";
const ONNX_RUNTIME_VERSION = "1.20.1";
const MANIFEST_FILE = "candidate-manifest.json";
const CATALOG_FILE = "engine-catalog.json";

export const MAX_STANDARD_PACK_BYTES = 175_000_000;

export function collectCandidateArtifacts(root, descriptors) {
  const artifacts = descriptors.map((descriptor) => {
    const path = join(root, descriptor.targetPath);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`Candidate artifact is missing: ${descriptor.targetPath}`);
    }

    const sizeBytes = statSync(path).size;
    if (descriptor.sizeBytes != null && descriptor.sizeBytes !== sizeBytes) {
      throw new Error(
        `Candidate artifact ${descriptor.targetPath} does not match its measured size.`
      );
    }

    return {
      remotePath: descriptor.remotePath,
      targetPath: descriptor.targetPath,
      sizeBytes,
      sha256: sha256(path),
      sourceSha256: descriptor.sourceSha256 ?? descriptor.sha256,
      transformation: descriptor.transformation
    };
  });

  const totalSizeBytes = artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0);
  if (totalSizeBytes > MAX_STANDARD_PACK_BYTES) {
    throw new Error(
      `The candidate is ${totalSizeBytes} bytes, above the ${MAX_STANDARD_PACK_BYTES}-byte standard pack gate.`
    );
  }
  return artifacts;
}

export function buildCandidateDocuments({ artifacts, catalog, outputDirectory, quantizerVersion }) {
  const sourceEngine = catalog.engines.find((engine) => engine.id === "supertonic");
  if (sourceEngine == null) throw new Error("The narration catalog does not define Supertonic.");

  const artifactSetSha256 = candidateArtifactSetSha256(artifacts);
  const candidateRevision = artifactSetSha256.slice(0, 40);
  const totalSizeBytes = artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0);
  const manifest = {
    schemaVersion: 1,
    id: "supertonic-3-android-int8-candidate",
    status: "candidate-not-accepted",
    target: "android-arm64",
    candidateRevision,
    artifactSetSha256,
    totalSizeBytes,
    maximumStandardPackBytes: MAX_STANDARD_PACK_BYTES,
    source: {
      repository: sourceEngine.model.repository,
      revision: sourceEngine.model.revision
    },
    quantization: {
      method: "dynamic",
      weightType: "QInt8",
      format: "QOperator",
      onnxRuntimeVersion: quantizerVersion
    },
    compatibility: {
      rustOrtCrate: "2.0.0-rc.12",
      acceptanceRequired: ["baseline-device-benchmark", "listening-and-pronunciation-corpus"]
    },
    artifacts
  };
  const candidateModel = {
    ...sourceEngine.model,
    repository: "local/sonelle-supertonic-android-int8-candidate",
    revision: candidateRevision,
    quantization: "dynamic-int8-qoperator",
    status: "candidate-not-accepted",
    artifacts: artifacts.map((artifact) => ({
      remotePath: artifact.remotePath,
      targetPath: artifact.targetPath,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256,
      url: pathToFileURL(join(outputDirectory, artifact.targetPath)).href
    }))
  };
  const candidateCatalog = {
    ...catalog,
    engines: catalog.engines.map((engine) =>
      engine.id === "supertonic" ? { ...engine, model: candidateModel } : engine
    )
  };

  return { manifest, catalog: candidateCatalog };
}

export function validateCandidateArtifacts(root, artifacts) {
  for (const artifact of artifacts) {
    const path = join(root, artifact.targetPath);
    if (
      !existsSync(path) ||
      statSync(path).size !== artifact.sizeBytes ||
      sha256(path) !== artifact.sha256
    ) {
      throw new Error(`Candidate artifact failed verification: ${artifact.targetPath}`);
    }
  }
}

export function validateCandidateDirectory(outputDirectory) {
  const manifestPath = join(outputDirectory, MANIFEST_FILE);
  const catalogPath = join(outputDirectory, CATALOG_FILE);
  if (!existsSync(manifestPath) || !existsSync(catalogPath)) {
    throw new Error("The Supertonic INT8 candidate metadata is incomplete.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.status !== "candidate-not-accepted" ||
    manifest.target !== "android-arm64" ||
    !Array.isArray(manifest.artifacts)
  ) {
    throw new Error("The Supertonic INT8 candidate manifest is invalid.");
  }
  validateCandidateArtifacts(outputDirectory, manifest.artifacts);
  const measuredTotal = manifest.artifacts.reduce(
    (total, artifact) => total + artifact.sizeBytes,
    0
  );
  const measuredArtifactSet = candidateArtifactSetSha256(manifest.artifacts);
  if (
    manifest.totalSizeBytes !== measuredTotal ||
    manifest.artifactSetSha256 !== measuredArtifactSet ||
    manifest.candidateRevision !== measuredArtifactSet.slice(0, 40)
  ) {
    throw new Error("The Supertonic INT8 candidate identity is invalid.");
  }
  if (measuredTotal > MAX_STANDARD_PACK_BYTES) {
    throw new Error("The Supertonic INT8 candidate exceeds the standard mobile pack gate.");
  }
  return { manifest, manifestPath, catalogPath };
}

export async function prepareSupertonicInt8Candidate(options = {}) {
  const config = loadNarrationSpikeConfig(options.configPath);
  const supertonic = config.engines.find((engine) => engine.id === "supertonic");
  if (supertonic == null) throw new Error("The narration spike does not define Supertonic.");

  const workspace = resolve(repoRoot, config.workspace);
  const sourceDirectory = join(workspace, "sources", "supertonic");
  const outputDirectory = resolve(
    options.outputDirectory ?? join(workspace, "mobile-candidates", "supertonic-android-int8")
  );
  if (options.verifyOnly) return validateCandidateDirectory(outputDirectory);

  await setupNarrationSpike({
    configPath: options.configPath,
    engine: "supertonic",
    models: true,
    verifyOnly: true
  });
  if (existsSync(outputDirectory) && !options.replace) {
    throw new Error(
      `A candidate already exists at ${outputDirectory}. Verify it or pass --replace deliberately.`
    );
  }

  const python = ensureQuantizerEnvironment({
    workspace,
    env: options.env ?? process.env,
    platform: options.platform,
    run: options.run
  });
  mkdirSync(dirname(outputDirectory), { recursive: true });
  const temporary = mkdtempSync(join(dirname(outputDirectory), ".supertonic-int8-preparing-"));
  try {
    const descriptors = supertonic.model.artifacts.map((artifact) => ({
      remotePath: artifact.remotePath,
      targetPath: artifact.targetPath,
      sourceSha256: artifact.sha256,
      transformation: MODEL_PATHS.has(artifact.targetPath) ? "dynamic-int8" : "copied"
    }));
    for (const artifact of descriptors.filter(
      ({ transformation }) => transformation === "copied"
    )) {
      const target = join(temporary, artifact.targetPath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(sourceDirectory, artifact.targetPath), target);
    }

    runCommand(
      python,
      [
        "tools/narration-spike/quantize_supertonic.py",
        "--source",
        sourceDirectory,
        "--output",
        temporary
      ],
      "quantizing the pinned Supertonic graphs",
      options.env ?? process.env,
      options.run
    );

    const artifacts = collectCandidateArtifacts(temporary, descriptors);
    validateCandidateArtifacts(temporary, artifacts);
    if (!options.skipNativeSmoke) {
      runCommand(
        "cargo",
        [
          "test",
          "--workspace",
          "--locked",
          "--lib",
          "supertonic_narration::tests::renders_real_supertonic_audio_from_local_assets",
          "--",
          "--ignored",
          "--exact",
          "--nocapture",
          "--test-threads=1"
        ],
        "rendering real audio with the candidate and Sonelle's pinned native runtime",
        {
          ...(options.env ?? process.env),
          SONELLE_SUPERTONIC_FIXTURE_ROOT: temporary,
          SONELLE_SUPERTONIC_ONNX_THREADS: "1"
        },
        options.run
      );
    }
    const documents = buildCandidateDocuments({
      artifacts,
      catalog: config,
      outputDirectory,
      quantizerVersion: ONNX_RUNTIME_VERSION
    });
    writeFileSync(
      join(temporary, MANIFEST_FILE),
      `${JSON.stringify(documents.manifest, null, 2)}\n`
    );
    writeFileSync(join(temporary, CATALOG_FILE), `${JSON.stringify(documents.catalog, null, 2)}\n`);

    mkdirSync(dirname(outputDirectory), { recursive: true });
    if (existsSync(outputDirectory)) rmSync(outputDirectory, { recursive: true });
    renameSync(temporary, outputDirectory);
    return validateCandidateDirectory(outputDirectory);
  } catch (error) {
    rmSync(temporary, { force: true, recursive: true });
    throw error;
  }
}

function ensureQuantizerEnvironment({ workspace, env, platform, run }) {
  const venvDirectory = join(workspace, "mobile-int8-venv");
  const python = resolveVenvPythonPath(venvDirectory, platform);
  if (!existsSync(python)) {
    runCommand(
      resolvePythonCommand(env, platform),
      ["-m", "venv", venvDirectory],
      "creating the mobile model environment",
      env,
      run
    );
  }
  for (const [packageName, version] of [
    ["onnx", ONNX_VERSION],
    ["onnxruntime", ONNX_RUNTIME_VERSION]
  ]) {
    const check = spawnSync(python, ["-c", pythonPackageVersionCheckScript(packageName, version)], {
      cwd: repoRoot,
      env,
      stdio: "ignore"
    });
    if (check.status !== 0) {
      runCommand(
        python,
        ["-m", "pip", "install", `${packageName}==${version}`],
        `installing pinned ${packageName}`,
        env,
        run
      );
    }
  }
  return python;
}

function runCommand(command, args, label, env, injectedRun) {
  if (injectedRun != null) return injectedRun(command, args, label);
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { cwd: repoRoot, env, stdio: "inherit" });
  if (result.error != null) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function candidateArtifactSetSha256(artifacts) {
  return createHash("sha256")
    .update(
      artifacts
        .map((artifact) => `${artifact.targetPath}:${artifact.sizeBytes}:${artifact.sha256}`)
        .join("\n")
    )
    .digest("hex");
}

function parseArguments(args) {
  const output = args.find((argument) => argument.startsWith("--output="));
  return {
    outputDirectory: output?.slice("--output=".length),
    replace: args.includes("--replace"),
    verifyOnly: args.includes("--verify-only")
  };
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareSupertonicInt8Candidate(parseArguments(process.argv.slice(2)))
    .then(({ manifest, manifestPath, catalogPath }) => {
      console.log(`\nSupertonic Android INT8 candidate: ${manifest.candidateRevision}`);
      console.log(`Pack size: ${manifest.totalSizeBytes} bytes`);
      console.log(`Manifest: ${manifestPath}`);
      console.log(`Local catalog: ${catalogPath}`);
      console.log("Status: candidate only; #102 and #103 still decide whether it ships.");
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
