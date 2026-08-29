import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Android release workflow profiles", () => {
  it("builds the internal artifact with the explicit arm64 voice candidate", () => {
    const workflow = readFileSync(".github/workflows/android-internal.yml", "utf8");

    expect(workflow).toContain("--features android-offline-voice-candidate");
    expect(workflow).toContain("--profile offline-voice-candidate");
    expect(workflow).toContain("SONELLE_BUILD_TYPE: internal-release");
    expect(workflow).toContain("android-supertonic-candidate.json");
    expect(workflow).toContain('apksigner" verify --verbose');
    expect(workflow).toContain("if: always()");
  });

  it("keeps the store artifact reader-only and emits matching metadata", () => {
    const workflow = readFileSync(".github/workflows/android-store-candidate.yml", "utf8");

    expect(workflow).not.toContain("--features android-offline-voice-candidate");
    expect(workflow).toContain("--profile reader-only");
    expect(workflow).toContain("SONELLE_BUILD_TYPE: store-release");
    expect(workflow).toContain("--abi universal");
    expect(workflow).toContain("jarsigner -verify -strict");
  });

  it("builds separate reader-only APKs for old and new ARM phones", () => {
    const workflow = readFileSync(".github/workflows/mobile-artifacts.yml", "utf8");

    expect(workflow).toContain("target: armv7");
    expect(workflow).toContain("abi: armeabi-v7a");
    expect(workflow).toContain("target: aarch64");
    expect(workflow).toContain("abi: arm64-v8a");
    expect(workflow).not.toContain("--features android-offline-voice-candidate");
    expect(workflow).toContain("--profile reader-only");
    expect(workflow).toContain('apksigner" verify --verbose');
  });

  it("packages an unsigned arm64 iOS archive without pretending it is installable", () => {
    const workflow = readFileSync(".github/workflows/mobile-artifacts.yml", "utf8");

    expect(workflow).toContain("--target aarch64");
    expect(workflow).toContain("--archive-only");
    expect(workflow).toContain("--no-sign");
    expect(workflow).toContain('test ! -d "$APP_PATH/_CodeSignature"');
    expect(workflow).toContain("Payload sonelle-ios-arm64-unsigned.ipa");
  });
});
