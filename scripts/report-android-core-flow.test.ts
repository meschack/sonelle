import { describe, expect, it } from "vitest";
import {
  assessAndroidProof,
  createDeviceTemplate,
  renderAndroidProofReport,
  requiredBookFlows,
  requiredBooks,
  requiredGates,
  validateDeviceReport
} from "./report-android-core-flow.mjs";

function complete(role) {
  const report = createDeviceTemplate(role);
  report.capturedAt = "2026-08-11T20:00:00.000Z";
  report.tester = "Sonelle QA";
  report.evidenceRoot = `artifacts/${role}`;
  report.build = {
    version: "0.2.0",
    commitRevision: "a".repeat(40),
    buildType: "internal-release",
    abi: "arm64-v8a",
    artifactSha256: "b".repeat(64),
    narrationCatalogSha256: "c".repeat(64)
  };
  Object.assign(report.device, {
    serialSuffix: "123456",
    buildFingerprint: "vendor/device/build",
    webViewVersion: "com.google.android.webview 140"
  });
  for (const book of requiredBooks) {
    for (const flow of requiredBookFlows) {
      report.books[book.id].flows[flow] = {
        status: "pass",
        evidence: [`${book.id}/${flow}.md`],
        measurement: "",
        followUpIssue: ""
      };
    }
  }
  for (const gate of requiredGates) {
    report.gates[gate] = {
      status: "pass",
      evidence: [`gates/${gate}.json`],
      measurement: "within contract",
      followUpIssue: ""
    };
  }
  return report;
}

describe("Android core-flow architecture report", () => {
  it("creates complete pending templates for both exact baseline devices", () => {
    const pixel = createDeviceTemplate("midrange");
    const galaxy = createDeviceTemplate("lower-cost");
    expect(pixel.device).toMatchObject({
      manufacturer: "Google",
      model: "Pixel 8a",
      apiLevel: "36"
    });
    expect(galaxy.device).toMatchObject({
      manufacturer: "Samsung",
      model: "SM-A166B",
      apiLevel: "34"
    });
    expect(Object.keys(pixel.gates)).toEqual(requiredGates);
    expect(Object.keys(pixel.books)).toHaveLength(3);
  });

  it("accepts only complete evidence from the same signed build", () => {
    const midrange = complete("midrange");
    const lowerCost = complete("lower-cost");
    expect(validateDeviceReport(midrange, "midrange")).toEqual([]);
    expect(assessAndroidProof(midrange, lowerCost)).toMatchObject({
      eligible: true,
      failureCount: 0,
      pendingCount: 0
    });
    lowerCost.build.artifactSha256 = "different";
    expect(assessAndroidProof(midrange, lowerCost).validationErrors).toContain(
      "devices used different build.artifactSha256"
    );
  });

  it("requires raw evidence, numeric measurements, and an issue for every failure", () => {
    const midrange = complete("midrange");
    midrange.gates["cold-launch"].evidence = [];
    midrange.gates["warm-launch"].measurement = "";
    midrange.gates["background-playback"] = {
      status: "fail",
      evidence: ["background/log.txt"],
      measurement: "",
      followUpIssue: ""
    };
    expect(validateDeviceReport(midrange, "midrange")).toEqual(
      expect.arrayContaining([
        "gates.cold-launch passed without raw evidence",
        "gates.warm-launch passed without a measurement",
        "gates.background-playback failed without a focused Sonelle follow-up issue"
      ])
    );
  });

  it("renders an eligibility verdict without making the architecture decision", () => {
    const midrange = complete("midrange");
    const lowerCost = complete("lower-cost");
    const report = renderAndroidProofReport(
      midrange,
      lowerCost,
      assessAndroidProof(midrange, lowerCost)
    );
    expect(report).toContain("eligible for the Tauri continuation decision");
    expect(report).toContain("prepared-narration-handoff");
    expect(report).toContain("does not make the Tauri-versus-native decision");
  });
});
