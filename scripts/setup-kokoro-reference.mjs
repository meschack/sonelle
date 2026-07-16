import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { loadNarrationSpikeConfig } from "./setup-narration-spike.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const KOKORO_REFERENCE_PACKAGES = [
  "click==8.1.8",
  "misaki[en]==0.9.4",
  "numpy==1.26.4",
  "transformers==4.48.3",
  "onnx==1.17.0",
  "onnxruntime==1.20.1",
  "sounddevice==0.5.1",
  "soundfile==0.13.1"
];

export const KOKORO_ENGLISH_MODEL =
  "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/" +
  "en_core_web_sm-3.8.0-py3-none-any.whl#sha256=" +
  "1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85";

export function resolveVenvPythonPath(venvDir, platform = process.platform) {
  return platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

export function resolvePythonCommand(env = process.env, platform = process.platform) {
  return env.PYTHON ?? (platform === "win32" ? "python" : "python3");
}

export function pythonPackageVersionCheckScript(packageName, expectedVersion) {
  return (
    "import importlib.metadata, sys; " +
    `sys.exit(0 if importlib.metadata.version(${JSON.stringify(packageName)}) == ` +
    `${JSON.stringify(expectedVersion)} else 1)`
  );
}

export function setupKokoroReference(options = {}) {
  const config = loadNarrationSpikeConfig(options.configPath);
  const kokoro = config.engines.find((engine) => engine.id === "kokoro");
  if (kokoro == null) throw new Error("The narration spike does not define Kokoro.");

  const workspace = resolve(repoRoot, config.workspace);
  const sourceDir = join(workspace, "sources", "kokoro");
  const venvDir = join(workspace, "kokoro-reference-venv");
  const venvPython = resolveVenvPythonPath(venvDir, options.platform);
  const env = options.env ?? process.env;

  if (!existsSync(join(sourceDir, "pyproject.toml"))) {
    throw new Error("Kokoro source is missing. Run pnpm spike:narration:setup first.");
  }
  if (!existsSync(venvPython)) {
    run(
      resolvePythonCommand(env, options.platform),
      ["-m", "venv", venvDir],
      "creating Kokoro reference environment",
      repoRoot,
      env
    );
  }

  run(
    venvPython,
    ["-m", "pip", "install", "--upgrade", "pip"],
    "updating reference pip",
    repoRoot,
    env
  );
  run(
    venvPython,
    ["-m", "pip", "install", "torch==2.6.0", "--index-url", "https://download.pytorch.org/whl/cpu"],
    "installing CPU-only PyTorch",
    repoRoot,
    env
  );
  run(
    venvPython,
    ["-m", "pip", "install", "--upgrade", "--editable", sourceDir, ...KOKORO_REFERENCE_PACKAGES],
    "installing pinned Kokoro reference dependencies",
    repoRoot,
    env
  );
  if (!hasPythonPackageVersion(venvPython, "en_core_web_sm", "3.8.0", env)) {
    run(
      venvPython,
      ["-m", "pip", "install", KOKORO_ENGLISH_MODEL],
      "installing pinned Kokoro English parser",
      repoRoot,
      env
    );
  }
  run(
    venvPython,
    ["tools/narration-spike/kokoro_reference.py", "--smoke"],
    "verifying Kokoro reference environment",
    repoRoot,
    env
  );

  if (options.exportOnnx) {
    const outputDir = join(workspace, "kokoro-onnx");
    mkdirSync(outputDir, { recursive: true });
    run(
      venvPython,
      ["examples/export.py", "--output_dir", outputDir],
      "exporting Kokoro ONNX reference",
      sourceDir,
      env
    );
  }

  if (options.runCorpus) {
    run(
      venvPython,
      ["tools/narration-spike/kokoro_reference.py", "--corpus"],
      "running Kokoro alignment corpus",
      repoRoot,
      env
    );
  }

  if (options.writeNativeFixture) {
    run(
      venvPython,
      ["tools/narration-spike/kokoro_reference.py", "--native-fixture"],
      "writing native Kokoro fixture",
      repoRoot,
      env
    );
  }

  if (options.writeLocalEngineCatalog) {
    writeLocalNarrationEngineCatalog({ configPath: options.configPath });
  }

  return { sourceDir, venvDir };
}

export function writeLocalNarrationEngineCatalog(options = {}) {
  const config = loadNarrationSpikeConfig(options.configPath);
  const workspace = resolve(repoRoot, config.workspace);
  const kokoro = config.engines.find((engine) => engine.id === "kokoro");
  const supertonic = config.engines.find((engine) => engine.id === "supertonic");
  if (kokoro == null) throw new Error("The narration spike does not define Kokoro.");
  if (supertonic == null) throw new Error("The narration spike does not define Supertonic.");

  const runtimeArtifacts = (engine) =>
    engine.model.artifacts.map((artifact) =>
      localArtifact(
        artifact.remotePath,
        artifact.targetPath,
        join(workspace, "sources", engine.id, artifact.targetPath)
      )
    );
  const kokoroArtifacts = runtimeArtifacts(kokoro);
  const supertonicArtifacts = runtimeArtifacts(supertonic);
  const kokoroRevision = localRevision(kokoroArtifacts);
  const supertonicRevision = localRevision(supertonicArtifacts);
  const outputPath = options.outputPath ?? join(workspace, "local-engine-catalog.json");
  const localKokoro = {
    id: "kokoro",
    source: kokoro.source,
    model: {
      repository: "local/sonelle-kokoro-runtime",
      revision: kokoroRevision,
      artifacts: kokoroArtifacts
    }
  };
  const localSupertonic = {
    id: "supertonic",
    source: supertonic.source,
    model: {
      repository: "local/sonelle-supertonic-runtime",
      revision: supertonicRevision,
      artifacts: supertonicArtifacts
    }
  };
  const output = {
    schemaVersion: 1,
    workspace: config.workspace,
    engines: config.engines.map((engine) => {
      if (engine.id === "kokoro") return localKokoro;
      if (engine.id === "supertonic") return localSupertonic;
      return engine;
    })
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`\nLocal narration engine catalog: ${outputPath}`);
  console.log("Use SONELLE_NARRATION_ENGINE_CATALOG to point the desktop app at this file.");
  return {
    outputPath,
    revisions: { kokoro: kokoroRevision, supertonic: supertonicRevision },
    artifacts: { kokoro: kokoroArtifacts, supertonic: supertonicArtifacts }
  };
}

function localArtifact(remotePath, targetPath, path) {
  if (!existsSync(path)) {
    throw new Error(`Narration runtime artifact is missing: ${path}`);
  }
  return {
    remotePath,
    targetPath,
    sizeBytes: statSync(path).size,
    sha256: sha256(path),
    url: pathToFileURL(path).href
  };
}

function localRevision(artifacts) {
  return createHash("sha256")
    .update(artifacts.map((artifact) => artifact.sha256).join(""))
    .digest("hex")
    .slice(0, 40);
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function run(command, args, label, cwd, env) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error != null) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function hasPythonPackageVersion(python, packageName, expectedVersion, env) {
  const script = pythonPackageVersionCheckScript(packageName, expectedVersion);
  const result = spawnSync(python, ["-c", script], { cwd: repoRoot, env, stdio: "ignore" });
  return result.status === 0;
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exportOnnx = process.argv.includes("--export-onnx");
  const runCorpus = process.argv.includes("--corpus");
  const writeNativeFixture = process.argv.includes("--native-fixture");
  const writeLocalEngineCatalog = process.argv.includes("--local-engine-catalog");

  if (writeLocalEngineCatalog && !exportOnnx && !runCorpus && !writeNativeFixture) {
    writeLocalNarrationEngineCatalog();
  } else {
    setupKokoroReference({
      exportOnnx,
      runCorpus,
      writeNativeFixture,
      writeLocalEngineCatalog
    });
  }
}
