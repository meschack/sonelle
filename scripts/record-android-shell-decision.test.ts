import { describe, expect, it } from "vitest";
import {
  createDeviceTemplate,
  requiredBookFlows,
  requiredBooks,
  requiredGates
} from "./report-android-core-flow.mjs";
import {
  renderArchitectureDecision,
  validateArchitectureDecision
} from "./record-android-shell-decision.mjs";

function complete(role: "midrange" | "lower-cost") {
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

function decision(kind: "continue-tauri" | "native-reader-fallback") {
  return {
    schemaVersion: 1,
    decision: kind,
    evidenceReport: "https://github.com/meschack/sonelle/issues/131#issuecomment-1",
    rustDomainBoundary: "shared-book-domain",
    failureAttributions: [] as Array<Record<string, string>>,
    acceptedLimitations: [] as string[],
    requiredRemediation: [] as string[],
    iosPlanning: kind === "continue-tauri" ? "ready" : "deferred"
  };
}

describe("Android shell architecture decision", () => {
  it("refuses to turn pending device work into an architecture opinion", () => {
    const midrange = createDeviceTemplate("midrange");
    const lowerCost = createDeviceTemplate("lower-cost");
    expect(
      validateArchitectureDecision(midrange, lowerCost, decision("continue-tauri")).errors
    ).toContain("physical-device evidence still has 96 pending results");
  });

  it("records Tauri continuation only from a fully passing two-device report", () => {
    const rendered = renderArchitectureDecision(
      complete("midrange"),
      complete("lower-cost"),
      decision("continue-tauri")
    );
    expect(rendered).toContain("continues with the Tauri mobile shell");
    expect(rendered).toContain("48 performance and reliability gate results passed");
    expect(rendered).toContain("sufficient to begin iOS planning");
  });

  it("does not authorize native fallback when both devices pass", () => {
    expect(
      validateArchitectureDecision(
        complete("midrange"),
        complete("lower-cost"),
        decision("native-reader-fallback")
      ).errors
    ).toContain("native fallback cannot be authorized by a passing report");
  });

  it("requires every failed result to be traced to an owning boundary", () => {
    const midrange = complete("midrange");
    midrange.gates["reader-scroll"] = {
      status: "fail",
      evidence: ["pixel/frame-timing.json"],
      measurement: "p95 22ms",
      followUpIssue: "https://github.com/meschack/sonelle/issues/200"
    };
    expect(
      validateArchitectureDecision(
        midrange,
        complete("lower-cost"),
        decision("native-reader-fallback")
      ).errors
    ).toContain("failed result midrange:gates.reader-scroll has no boundary attribution");
  });

  it("authorizes fallback only after measured WebView failure exhausts bounded remediation", () => {
    const midrange = complete("midrange");
    midrange.gates["reader-scroll"] = {
      status: "fail",
      evidence: ["pixel/frame-timing.json"],
      measurement: "p95 22ms after bounded rendering work",
      followUpIssue: "https://github.com/meschack/sonelle/issues/200"
    };
    const input = decision("native-reader-fallback");
    input.failureAttributions = [
      {
        deviceRole: "midrange",
        resultPath: "gates.reader-scroll",
        owner: "webview-reader",
        boundedRemediation: "exhausted",
        finding: "Perfetto traces isolate WebView layout and paint as the remaining blocker"
      }
    ];
    input.requiredRemediation = ["Build the Android reader in Kotlin over the shared Rust domain"];
    const rendered = renderArchitectureDecision(midrange, complete("lower-cost"), input);
    expect(rendered).toContain("authorizes a native Kotlin Android reader fallback");
    expect(rendered).toContain("shared Rust book domain");
    expect(rendered).toContain("iOS remains deferred");
  });

  it("does not mistake an adapter failure for evidence against Tauri", () => {
    const midrange = complete("midrange");
    midrange.gates["background-playback"] = {
      status: "fail",
      evidence: ["pixel/audio-focus.txt"],
      measurement: "playback stopped after focus return",
      followUpIssue: "https://github.com/meschack/sonelle/issues/201"
    };
    const input = decision("native-reader-fallback");
    input.failureAttributions = [
      {
        deviceRole: "midrange",
        resultPath: "gates.background-playback",
        owner: "playback-adapter",
        boundedRemediation: "pending",
        finding: "Audio-focus state restoration failed outside the reader"
      }
    ];
    input.requiredRemediation = ["Repair Android audio-focus restoration"];
    expect(validateArchitectureDecision(midrange, complete("lower-cost"), input).errors).toContain(
      "native fallback requires a measured WebView reader failure"
    );
  });
});
