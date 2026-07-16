import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  KOKORO_ENGLISH_MODEL,
  KOKORO_REFERENCE_PACKAGES,
  pythonPackageVersionCheckScript,
  resolvePythonCommand,
  resolveVenvPythonPath,
  writeLocalNarrationEngineCatalog
} from "./setup-kokoro-reference.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Kokoro reference environment", () => {
  it("uses the platform's virtual-environment layout", () => {
    expect(resolveVenvPythonPath("/tmp/kokoro", "linux")).toBe("/tmp/kokoro/bin/python");
    expect(resolveVenvPythonPath("C:\\kokoro", "win32")).toBe("C:\\kokoro/Scripts/python.exe");
  });

  it("honors an explicit Python command", () => {
    expect(resolvePythonCommand({ PYTHON: "/opt/python" }, "linux")).toBe("/opt/python");
    expect(resolvePythonCommand({}, "win32")).toBe("python");
  });

  it("checks the installed parser version without downloading it", () => {
    expect(pythonPackageVersionCheckScript("en_core_web_sm", "3.8.0")).toContain(
      'importlib.metadata.version("en_core_web_sm") == "3.8.0"'
    );
  });

  it("pins every reference dependency exactly", () => {
    expect(KOKORO_REFERENCE_PACKAGES).toContain("misaki[en]==0.9.4");
    expect(KOKORO_REFERENCE_PACKAGES.every((dependency) => dependency.includes("=="))).toBe(true);
    expect(KOKORO_ENGLISH_MODEL).toContain("en_core_web_sm-3.8.0");
    expect(KOKORO_ENGLISH_MODEL).toMatch(/#sha256=[a-f0-9]{64}$/u);
  });

  it("writes a local engine catalog for both native narration runtimes", () => {
    const root = mkdtempSync(join(tmpdir(), "sonelle-kokoro-catalog-"));
    temporaryDirectories.push(root);
    const workspace = join(root, "workspace");
    writeFileSync(
      join(root, "engines.json"),
      JSON.stringify({
        schemaVersion: 1,
        workspace,
        engines: [
          {
            id: "kokoro",
            source: {
              repository: "https://github.com/hexgrad/kokoro.git",
              revision: "0".repeat(40)
            },
            model: {
              repository: "robertknight/kokoro-onnx",
              revision: "1".repeat(40),
              artifacts: [
                {
                  remotePath: "kokoro.onnx",
                  targetPath: "assets/kokoro.onnx",
                  sizeBytes: 1,
                  sha256: "2".repeat(64)
                },
                {
                  remotePath: "config.json",
                  targetPath: "assets/config.json",
                  sizeBytes: 1,
                  sha256: "2".repeat(64)
                },
                {
                  remotePath: "voices/af_heart.bin",
                  targetPath: "assets/voices/af_heart.bin",
                  sizeBytes: 1,
                  sha256: "2".repeat(64)
                },
                {
                  remotePath: "voices/bf_emma.bin",
                  targetPath: "assets/voices/bf_emma.bin",
                  sizeBytes: 1,
                  sha256: "2".repeat(64)
                }
              ]
            }
          },
          {
            id: "supertonic",
            source: {
              repository: "https://github.com/supertone-inc/supertonic.git",
              revision: "3".repeat(40)
            },
            model: {
              repository: "Supertone/supertonic-3",
              revision: "4".repeat(40),
              artifacts: [
                {
                  remotePath: "config.json",
                  targetPath: "assets/config.json",
                  sizeBytes: 1,
                  sha256: "5".repeat(64)
                }
              ]
            }
          }
        ]
      }),
      "utf8"
    );
    mkdirSync(join(workspace, "sources", "kokoro", "assets", "voices"), { recursive: true });
    writeFileSync(join(workspace, "sources", "kokoro", "assets", "kokoro.onnx"), "onnx", "utf8");
    writeFileSync(join(workspace, "sources", "kokoro", "assets", "config.json"), "config", "utf8");
    writeFileSync(
      join(workspace, "sources", "kokoro", "assets", "voices", "af_heart.bin"),
      "heart",
      "utf8"
    );
    writeFileSync(
      join(workspace, "sources", "kokoro", "assets", "voices", "bf_emma.bin"),
      "emma",
      "utf8"
    );
    mkdirSync(join(workspace, "sources", "supertonic", "assets"), { recursive: true });
    writeFileSync(
      join(workspace, "sources", "supertonic", "assets", "config.json"),
      "supertonic-config",
      "utf8"
    );

    const { outputPath, revisions } = writeLocalNarrationEngineCatalog({
      configPath: join(root, "engines.json")
    });
    const catalog = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(revisions.kokoro).toMatch(/^[a-f0-9]{40}$/u);
    expect(revisions.supertonic).toMatch(/^[a-f0-9]{40}$/u);
    expect(catalog.engines).toHaveLength(2);
    expect(
      catalog.engines[0].model.artifacts.map(
        (artifact: { targetPath: string }) => artifact.targetPath
      )
    ).toEqual([
      "assets/kokoro.onnx",
      "assets/config.json",
      "assets/voices/af_heart.bin",
      "assets/voices/bf_emma.bin"
    ]);
    expect(catalog.engines[0].model.artifacts[0].url).toBe(
      pathToFileURL(join(workspace, "sources", "kokoro", "assets", "kokoro.onnx")).href
    );
    expect(catalog.engines[1].id).toBe("supertonic");
    expect(catalog.engines[1].model.repository).toBe("local/sonelle-supertonic-runtime");
    expect(catalog.engines[1].model.artifacts[0].url).toBe(
      pathToFileURL(join(workspace, "sources", "supertonic", "assets", "config.json")).href
    );
  });
});
