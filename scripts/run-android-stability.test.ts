import { describe, expect, it } from "vitest";
import {
  evaluateStability,
  parseBatterySnapshot,
  parseThermalStatus,
  parseTotalPssKiB,
  renderReport,
  sessionSchedule,
  verifyBuildMetadata
} from "./run-android-stability.mjs";

describe("Android stability capture", () => {
  it("parses resource snapshots without substituting missing measurements", () => {
    expect(parseTotalPssKiB(" App Summary\n TOTAL PSS: 123,456 TOTAL RSS: 200000\n")).toBe(123456);
    expect(parseTotalPssKiB("  TOTAL  98765  123  456\n")).toBe(98765);
    expect(parseBatterySnapshot(" level: 82\n plugged: 0\n")).toEqual({ level: 82, plugged: 0 });
    expect(parseThermalStatus("Thermal Status: 1\nTemperature{mStatus=2}\n")).toBe(2);
    expect(() => parseTotalPssKiB("No process found")).toThrow(/TOTAL PSS/u);
  });

  it("binds a signed artifact to strict internal build metadata", () => {
    const metadata = {
      schemaVersion: 1,
      applicationId: "app.sonelle.reader",
      version: "0.2.0",
      commitRevision: "a".repeat(40),
      buildType: "internal-release",
      abi: "arm64-v8a",
      artifact: { fileName: "sonelle.apk", sizeBytes: 42, sha256: "deadbeef" }
    };
    expect(
      verifyBuildMetadata(metadata, { path: "/tmp/sonelle.apk", sizeBytes: 42, sha256: "deadbeef" })
    ).toBe(metadata);
    expect(() =>
      verifyBuildMetadata(metadata, { path: "/tmp/sonelle.apk", sizeBytes: 42, sha256: "wrong" })
    ).toThrow(/SHA-256 mismatch/u);
  });

  it("evaluates each device gate independently and requires the full hour", () => {
    const samples = Array.from({ length: 61 }, (_, minute) => ({
      elapsedMinutes: minute,
      totalPssKiB: minute < 46 ? 300_000 : 310_000 + (minute % 2) * 1_000,
      batteryLevel: 90 - Math.floor(minute / 10),
      plugged: 0,
      thermalStatus: 2,
      processId: 1234
    }));
    const result = evaluateStability({ samples, deviceRole: "lower-cost", durationMinutes: 60 });
    expect(result.automatedPassed).toBe(true);
    expect(result.finalRangePercent).toBeLessThan(5);
    expect(
      evaluateStability({
        samples: samples.map((sample, index) => ({
          ...sample,
          processId: index === 30 ? 5678 : sample.processId
        })),
        deviceRole: "lower-cost",
        durationMinutes: 60
      }).processStayedAlive
    ).toBe(false);
    expect(
      evaluateStability({
        samples: samples.map((sample, index) => ({
          ...sample,
          plugged: index === 30 ? 1 : sample.plugged
        })),
        deviceRole: "lower-cost",
        durationMinutes: 60
      }).stayedUnplugged
    ).toBe(false);
    expect(
      evaluateStability({
        samples: samples.slice(0, 2),
        deviceRole: "lower-cost",
        durationMinutes: 1
      }).automatedPassed
    ).toBe(false);
  });

  it("keeps the scripted interactions and manual correctness verdict visible", () => {
    expect(sessionSchedule.map(([minute]) => minute)).toEqual([
      0, 10, 20, 25, 30, 35, 40, 45, 50, 55, 60
    ]);
    const report = renderReport({
      metadata: {
        version: "0.2.0",
        commitRevision: "a".repeat(40),
        buildType: "internal-release",
        abi: "arm64-v8a",
        artifact: { fileName: "sonelle.apk", sha256: "deadbeef" }
      },
      device: {
        manufacturer: "Samsung",
        model: "SM-A166B",
        androidVersion: "14",
        apiLevel: "34",
        serialSuffix: "123456",
        role: "lower-cost"
      },
      samples: [{ elapsedMinutes: 60 }],
      evaluation: {
        automatedPassed: true,
        conformingDuration: true,
        peakPssPassed: true,
        peakPssMiB: 300,
        finalRangePassed: true,
        finalRangePercent: 2,
        batteryPassed: true,
        batteryUsed: 8,
        thermalPassed: true,
        maximumThermalStatus: 2,
        processStayedAlive: true,
        stayedUnplugged: true
      },
      outputDirectory: "/tmp/evidence"
    });
    expect(report).toContain("manual correctness review required");
    expect(report).toContain("No sentence skipped, repeated, or advanced twice");
    expect(report).toContain("issue #130");
  });
});
