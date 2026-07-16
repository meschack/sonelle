import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const NARRATION_PROVIDER_SMOKE_TESTS = [
  "kokoro_manifest::tests::renders_real_kokoro_manifest_from_local_spike_assets",
  "supertonic_narration::tests::renders_real_supertonic_audio_from_local_assets",
  "narration_engine_pack::tests::installs_local_kokoro_catalog_and_renders_from_the_installed_pack",
  "narration_engine_pack::tests::installs_local_supertonic_catalog_and_renders_from_the_installed_pack"
];

export function narrationProviderSmokeEnvironment(environment = process.env) {
  const workspace = join(repoRoot, ".sonelle", "narration-spike");
  return {
    ...environment,
    SONELLE_KOKORO_FIXTURE_ROOT: join(workspace, "sources", "kokoro"),
    SONELLE_KOKORO_ONNX_THREADS: "1",
    SONELLE_SUPERTONIC_FIXTURE_ROOT: join(workspace, "sources", "supertonic"),
    SONELLE_SUPERTONIC_ONNX_THREADS: "1"
  };
}

export function runNarrationProviderSmoke(options = {}) {
  assertProviderFixtures();
  const spawn = options.spawn ?? spawnSync;
  const environment = narrationProviderSmokeEnvironment(options.env);

  for (const testName of NARRATION_PROVIDER_SMOKE_TESTS) {
    console.log(`\n> real narration provider smoke: ${testName}`);
    const result = spawn(
      "cargo",
      [
        "test",
        "--workspace",
        "--locked",
        "--lib",
        testName,
        "--",
        "--ignored",
        "--exact",
        "--nocapture",
        "--test-threads=1"
      ],
      { cwd: repoRoot, env: environment, stdio: "inherit" }
    );
    if (result.error != null) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Narration provider smoke failed: ${testName}`);
    }
  }
}

function assertProviderFixtures() {
  const workspace = join(repoRoot, ".sonelle", "narration-spike");
  const required = [
    join(workspace, "local-engine-catalog.json"),
    join(workspace, "sources", "kokoro", "assets", "kokoro.onnx"),
    join(workspace, "sources", "kokoro", "assets", "config.json"),
    join(workspace, "sources", "kokoro", "assets", "voices", "af_heart.bin"),
    join(workspace, "sources", "kokoro", "assets", "voices", "bf_emma.bin"),
    join(workspace, "sources", "supertonic", "assets", "onnx", "tts.json")
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(
      `Narration provider fixtures are missing:\n${missing.join("\n")}\n` +
        "Run the pinned model setup and local-catalog preparation first."
    );
  }
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runNarrationProviderSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
