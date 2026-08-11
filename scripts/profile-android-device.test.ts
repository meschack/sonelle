import { describe, expect, it } from "vitest";
import {
  parseConnectedDevices,
  parseStartTime,
  renderWorksheet,
  selectPhysicalDevice,
  summarizeSamples
} from "./profile-android-device.mjs";

describe("Android physical-device profiler", () => {
  it("selects one physical device and rejects an emulator", () => {
    const physical = parseConnectedDevices(
      "List of devices attached\nR5CT123456 device product:a16 model:SM_A166B device:a16x\n"
    );
    expect(selectPhysicalDevice(physical, undefined).serial).toBe("R5CT123456");

    const emulator = parseConnectedDevices(
      "List of devices attached\nemulator-5554 device product:sdk_phone model:sdk_x86 device:emu64x\n"
    );
    expect(() => selectPhysicalDevice(emulator, undefined)).toThrow(/physical hardware/u);
  });

  it("requires an explicit serial when more than one device is ready", () => {
    const devices = parseConnectedDevices(
      "List of devices attached\nPIXEL device model:Pixel_8a\nGALAXY device model:SM_A166B\n"
    );
    expect(() => selectPhysicalDevice(devices, undefined)).toThrow(/exactly one/u);
    expect(selectPhysicalDevice(devices, "GALAXY").serial).toBe("GALAXY");
  });

  it("summarizes Android startup timings without flattering interpolation", () => {
    expect(parseStartTime("Status: ok\nTotalTime: 842\nWaitTime: 850\n")).toBe(842);
    expect(summarizeSamples([120, 80, 100, 140, 90])).toEqual({
      count: 5,
      min: 80,
      p50: 100,
      p95: 140,
      max: 140
    });
  });

  it("renders a worksheet that links every resource capture", () => {
    const worksheet = renderWorksheet({
      metadata: {
        capturedAt: "2026-08-11T00:00:00.000Z",
        manufacturer: "Samsung",
        model: "SM-A166B",
        device: "a16x",
        serialSuffix: "123456",
        androidVersion: "14",
        apiLevel: "34",
        securityPatch: "2026-07-01",
        fingerprint: "samsung/a16",
        webViewVersion: "com.google.android.webview 140",
        commit: "abc123",
        artifactSha256: "deadbeef",
        outputDirectory: "/tmp/evidence"
      },
      cold: { count: 10, min: 800, p50: 900, p95: 1100, max: 1100 },
      warm: { count: 10, min: 200, p50: 250, p95: 300, max: 300 },
      artifactName: "sonelle.apk"
    });
    expect(worksheet).toContain("SM-A166B");
    expect(worksheet).toContain("frame-timing.txt");
    expect(worksheet).toContain("startup-cold.json");
    expect(worksheet).toContain("Manual fixture-reader check");
  });
});
