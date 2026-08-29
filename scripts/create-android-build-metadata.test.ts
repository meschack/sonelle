import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAndroidBuildMetadata } from "./create-android-build-metadata.mjs";

describe("Android internal build metadata", () => {
  it("identifies the signed artifact, source revision, release profile, and pinned models", () => {
    const root = mkdtempSync(join(tmpdir(), "sonelle-android-metadata-"));
    const artifactPath = join(root, "sonelle-internal.apk");
    writeFileSync(artifactPath, "signed-apk-fixture");

    const metadata = createAndroidBuildMetadata({
      artifactPath,
      commitRevision: "a".repeat(40),
      createdAt: "2026-08-11T18:00:00.000Z",
      abi: "arm64-v8a",
      buildType: "internal-release",
      profile: "offline-voice-candidate"
    });

    expect(metadata).toMatchObject({
      schemaVersion: 2,
      applicationId: "app.sonelle.reader",
      commitRevision: "a".repeat(40),
      buildType: "internal-release",
      abi: "arm64-v8a",
      createdAt: "2026-08-11T18:00:00.000Z",
      artifact: {
        fileName: "sonelle-internal.apk",
        sizeBytes: 18
      },
      narration: {
        profile: "offline-voice-candidate",
        bundledRuntime: true,
        bundledModel: false,
        candidateStatus: "candidate-not-accepted"
      }
    });
    expect(metadata.artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(metadata.narration.catalog.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(metadata.narration.catalog.engines).toEqual([
      expect.objectContaining({ id: "supertonic", modelRevision: expect.any(String) })
    ]);

    rmSync(root, { recursive: true });
  });

  it("does not attach desktop model identities to a reader-only build", () => {
    const root = mkdtempSync(join(tmpdir(), "sonelle-android-reader-metadata-"));
    const artifactPath = join(root, "sonelle-reader.apk");
    writeFileSync(artifactPath, "reader-apk-fixture");

    const metadata = createAndroidBuildMetadata({
      artifactPath,
      commitRevision: "f".repeat(40),
      createdAt: "2026-08-11T18:00:00.000Z",
      abi: "armeabi-v7a",
      buildType: "store-release",
      profile: "reader-only"
    });

    expect(metadata.abi).toBe("armeabi-v7a");
    expect(metadata.narration).toEqual({
      profile: "reader-only",
      bundledRuntime: false,
      bundledModel: false,
      candidateStatus: null,
      catalog: null
    });
    rmSync(root, { recursive: true });
  });

  it("rejects mutable revisions and impossible candidate targets", () => {
    const root = mkdtempSync(join(tmpdir(), "sonelle-android-invalid-metadata-"));
    const artifactPath = join(root, "sonelle.apk");
    writeFileSync(artifactPath, "apk");

    expect(() =>
      createAndroidBuildMetadata({
        artifactPath,
        commitRevision: "main",
        createdAt: "2026-08-11T18:00:00.000Z",
        abi: "arm64-v8a",
        buildType: "internal-release",
        profile: "offline-voice-candidate"
      })
    ).toThrow(/full commit SHA/u);
    expect(() =>
      createAndroidBuildMetadata({
        artifactPath,
        commitRevision: "a".repeat(40),
        createdAt: "2026-08-11T18:00:00.000Z",
        abi: "armeabi-v7a",
        buildType: "internal-release",
        profile: "offline-voice-candidate"
      })
    ).toThrow(/requires arm64-v8a/u);
    rmSync(root, { recursive: true });
  });
});
