import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_STANDARD_PACK_BYTES,
  buildCandidateDocuments,
  collectCandidateArtifacts,
  validateCandidateArtifacts,
  validateCandidateDirectory
} from "./prepare-supertonic-int8.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Supertonic Android INT8 candidate", () => {
  it("identifies every artifact and keeps the candidate explicitly unaccepted", () => {
    const root = fixtureDirectory();
    const artifacts = collectCandidateArtifacts(root, sourceArtifacts());
    const { manifest, catalog } = buildCandidateDocuments({
      artifacts,
      catalog: sourceCatalog(),
      outputDirectory: root,
      quantizerVersion: "1.20.1"
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      id: "supertonic-3-android-int8-candidate",
      status: "candidate-not-accepted",
      target: "android-arm64",
      quantization: {
        method: "dynamic",
        weightType: "QInt8",
        format: "QOperator",
        onnxRuntimeVersion: "1.20.1"
      },
      source: {
        repository: "Supertone/supertonic-3",
        revision: "3".repeat(40)
      }
    });
    expect(manifest.totalSizeBytes).toBe(38);
    expect(manifest.totalSizeBytes).toBeLessThanOrEqual(MAX_STANDARD_PACK_BYTES);
    expect(manifest.candidateRevision).toMatch(/^[a-f0-9]{40}$/u);
    expect(manifest.artifacts).toHaveLength(2);

    const candidate = catalog.engines.find((engine: { id: string }) => engine.id === "supertonic");
    expect(candidate.model.revision).toBe(manifest.candidateRevision);
    expect(candidate.model.quantization).toBe("dynamic-int8-qoperator");
    expect(candidate.model.artifacts[0].url).toBe(
      new URL("assets/config.json", `file://${resolve(root)}/`).href
    );
  });

  it("rejects a changed artifact instead of blessing a corrupt candidate", () => {
    const root = fixtureDirectory();
    const artifacts = collectCandidateArtifacts(root, sourceArtifacts());

    expect(() => validateCandidateArtifacts(root, artifacts)).not.toThrow();
    writeFileSync(join(root, "assets", "onnx", "model.onnx"), "tampered");
    expect(() => validateCandidateArtifacts(root, artifacts)).toThrow(
      "Candidate artifact failed verification: assets/onnx/model.onnx"
    );
  });

  it("rejects metadata whose aggregate identity no longer matches its artifacts", () => {
    const root = fixtureDirectory();
    const artifacts = collectCandidateArtifacts(root, sourceArtifacts());
    const { manifest, catalog } = buildCandidateDocuments({
      artifacts,
      catalog: sourceCatalog(),
      outputDirectory: root,
      quantizerVersion: "1.20.1"
    });
    writeFileSync(
      join(root, "candidate-manifest.json"),
      JSON.stringify({ ...manifest, totalSizeBytes: 1 })
    );
    writeFileSync(join(root, "engine-catalog.json"), JSON.stringify(catalog));

    expect(() => validateCandidateDirectory(root)).toThrow("candidate identity is invalid");
  });

  it("refuses a candidate larger than the standard mobile pack gate", () => {
    const root = fixtureDirectory();
    const path = join(root, "assets", "onnx", "oversized.onnx");
    writeFileSync(path, "");
    truncateSync(path, MAX_STANDARD_PACK_BYTES + 1);

    expect(() =>
      collectCandidateArtifacts(root, [
        {
          remotePath: "onnx/oversized.onnx",
          targetPath: "assets/onnx/oversized.onnx",
          transformation: "dynamic-int8"
        }
      ])
    ).toThrow("above the 175000000-byte standard pack gate");
  });
});

function fixtureDirectory() {
  const root = mkdtempSync(join(tmpdir(), "sonelle-supertonic-int8-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, "assets", "onnx"), { recursive: true });
  writeFileSync(join(root, "assets", "config.json"), "candidate config");
  writeFileSync(join(root, "assets", "onnx", "model.onnx"), "quantized model output");
  return root;
}

function sourceArtifacts() {
  return [
    artifact("assets/config.json", "candidate config", "copied"),
    artifact("assets/onnx/model.onnx", "quantized model output", "dynamic-int8")
  ];
}

function artifact(targetPath: string, contents: string, transformation: string) {
  return {
    remotePath: targetPath.replace(/^assets\//u, ""),
    targetPath,
    sizeBytes: Buffer.byteLength(contents),
    sha256: createHash("sha256").update(contents).digest("hex"),
    transformation
  };
}

function sourceCatalog() {
  return {
    schemaVersion: 1,
    workspace: ".sonelle/narration-spike",
    engines: [
      {
        id: "supertonic",
        source: { repository: "https://example.test/supertonic", revision: "d".repeat(40) },
        model: {
          repository: "Supertone/supertonic-3",
          revision: "3".repeat(40),
          artifacts: sourceArtifacts()
        }
      }
    ]
  };
}
