import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Android release workflow profiles", () => {
  it.each([
    ".github/workflows/android-internal.yml",
    ".github/workflows/android-store-candidate.yml",
    ".github/workflows/mobile-artifacts.yml"
  ])("sets up the Android command-line tools before using sdkmanager in %s", (path) => {
    const workflow = readFileSync(path, "utf8");
    const sdkSetup = workflow.indexOf("uses: android-actions/setup-android@v4");
    const sdkInstall = workflow.indexOf("sdkmanager");

    expect(sdkSetup).toBeGreaterThan(-1);
    expect(sdkInstall).toBeGreaterThan(sdkSetup);
  });

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
    const sdkSetup = workflow.indexOf("uses: android-actions/setup-android@v4");
    const sdkInstall = workflow.indexOf('sdkmanager \\\n            "platform-tools"');

    expect(workflow).toContain("target: armv7");
    expect(workflow).toContain("abi: armeabi-v7a");
    expect(workflow).toContain("target: aarch64");
    expect(workflow).toContain("abi: arm64-v8a");
    expect(workflow).not.toContain("--features android-offline-voice-candidate");
    expect(workflow).toContain("--profile reader-only");
    expect(workflow).toContain('apksigner" verify --verbose');
    expect(sdkSetup).toBeGreaterThan(-1);
    expect(sdkInstall).toBeGreaterThan(sdkSetup);
  });

  it("packages an unsigned arm64 iOS archive without pretending it is installable", () => {
    const workflow = readFileSync(".github/workflows/mobile-artifacts.yml", "utf8");

    expect(workflow).toContain("--target aarch64");
    expect(workflow).toContain("--archive-only");
    expect(workflow).toContain("--no-sign");
    expect(workflow).toContain('test ! -d "$APP_PATH/_CodeSignature"');
    expect(workflow).toContain("Payload sonelle-ios-arm64-unsigned.ipa");
  });

  it("promotes successful mobile CI artifacts into the matching GitHub release", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("uses: actions/download-artifact@v8");
    expect(workflow).toContain("run-id: ${{ github.event.workflow_run.id }}");
    expect(workflow).toContain("pattern: sonelle-*");
    expect(workflow).toContain("merge-multiple: true");
    expect(workflow).toContain("tagName: ${{ needs.version.outputs.tag }}");
    expect(workflow).not.toContain("tagName: ${{ steps.version.outputs.tag }}");
    expect(workflow).toContain('gh release upload "$RELEASE_TAG" artifacts/mobile/* --clobber');
  });
});
