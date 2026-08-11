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
      commitRevision: "0123456789abcdef",
      createdAt: "2026-08-11T18:00:00.000Z"
    });

    expect(metadata).toMatchObject({
      schemaVersion: 1,
      applicationId: "app.sonelle.reader",
      commitRevision: "0123456789abcdef",
      buildType: "internal-release",
      abi: "arm64-v8a",
      createdAt: "2026-08-11T18:00:00.000Z",
      artifact: {
        fileName: "sonelle-internal.apk",
        sizeBytes: 18
      }
    });
    expect(metadata.artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(metadata.narrationCatalog.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(metadata.narrationCatalog.engines).toEqual([
      expect.objectContaining({ id: "kokoro", modelRevision: expect.any(String) }),
      expect.objectContaining({ id: "supertonic", modelRevision: expect.any(String) })
    ]);

    rmSync(root, { recursive: true });
  });
});
