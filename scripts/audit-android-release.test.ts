import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditAndroidCargoMetadata,
  auditAndroidCandidateCatalog,
  auditNarrationLicenseCatalog,
  auditPnpmLicenses
} from "./audit-android-release.mjs";

describe("Android release disclosure audit", () => {
  it("accepts the approved permissive and file-level copyleft license set", () => {
    expect(
      auditAndroidCargoMetadata(
        {
          packages: [
            { name: "one", version: "1.0.0", license: "MIT OR Apache-2.0" },
            { name: "two", version: "1.0.0", license: "MPL-2.0" },
            { name: "three", version: "1.0.0", license: "(MIT OR Apache-2.0) AND Unicode-3.0" },
            { name: "four", version: "1.0.0", license: "Apache-2.0 AND ISC" },
            { name: "five", version: "1.0.0", license: "CDLA-Permissive-2.0" },
            { name: "six", version: "1.0.0", license: "BSD-2-Clause OR MIT" }
          ]
        },
        { status: "reader-only" }
      )
    ).toEqual([]);
  });

  it("rejects missing, unapproved, and reader-only narration dependencies", () => {
    expect(
      auditAndroidCargoMetadata(
        {
          packages: [
            { name: "mystery", version: "1.0.0", license: null },
            { name: "copyleft", version: "1.0.0", license: "GPL-3.0-only" },
            { name: "ort", version: "2.0.0-rc.12", license: "MIT OR Apache-2.0" }
          ]
        },
        { status: "reader-only" }
      )
    ).toEqual(
      expect.arrayContaining([
        "mystery@1.0.0 has no declared license",
        "copyleft@1.0.0 uses unapproved license expression GPL-3.0-only",
        "reader-only Android release unexpectedly includes ort"
      ])
    );
  });

  it("requires the native runtime only for the explicit offline-voice candidate", () => {
    const packages = [
      { name: "sonelle", version: "0.1.0", license: "MIT" },
      { name: "ort", version: "2.0.0-rc.12", license: "MIT OR Apache-2.0" },
      { name: "ort-sys", version: "2.0.0-rc.12", license: "MIT OR Apache-2.0" }
    ];
    expect(auditAndroidCargoMetadata({ packages }, { status: "offline-voice-candidate" })).toEqual(
      []
    );
    expect(
      auditAndroidCargoMetadata(
        { packages: packages.filter((entry) => entry.name !== "ort") },
        { status: "offline-voice-candidate" }
      )
    ).toContain("offline-voice candidate is missing ort");
  });

  it("uses the same allowlist for production JavaScript packages", () => {
    expect(auditPnpmLicenses({ MIT: [{ name: "solid-js" }] })).toEqual([]);
    expect(auditPnpmLicenses({ "GPL-3.0-only": [{ name: "surprise" }] })).toEqual([
      "production JavaScript dependency uses unapproved license expression GPL-3.0-only"
    ]);
  });

  it("pins and preserves the standard voice model license", () => {
    const catalog = JSON.parse(readFileSync("tools/narration-spike/engines.json", "utf8"));
    expect(auditNarrationLicenseCatalog(catalog)).toEqual([]);
    const supertonic = catalog.engines.find((engine: { id: string }) => engine.id === "supertonic");
    expect(supertonic.model.license).toEqual({
      id: "OpenRAIL-M",
      file: "assets/LICENSE",
      sha256: "0d944a9110fed9a9602d60e0423a272903e7bd21ab060490774efc77c2275e9f"
    });
  });

  it("audits the tracked Android candidate instead of the desktop catalog", () => {
    const catalog = JSON.parse(
      readFileSync("tools/narration-spike/android-supertonic-candidate.json", "utf8")
    );
    expect(auditNarrationLicenseCatalog(catalog)).toEqual([]);
    expect(catalog.engines.map((engine: { id: string }) => engine.id)).toEqual(["supertonic"]);
    expect(catalog.engines[0].model.status).toBe("candidate-not-accepted");
    expect(auditAndroidCandidateCatalog(catalog)).toEqual([]);
    expect(
      auditAndroidCandidateCatalog({
        ...catalog,
        engines: [
          {
            ...catalog.engines[0],
            model: {
              ...catalog.engines[0].model,
              status: "accepted",
              artifacts: [{ ...catalog.engines[0].model.artifacts[0], url: "file:///tmp/model" }]
            }
          }
        ]
      })
    ).toEqual(
      expect.arrayContaining([
        "Android Supertonic catalog must remain candidate-not-accepted",
        "Android Supertonic catalog must pin ten artifacts"
      ])
    );
  });
});
