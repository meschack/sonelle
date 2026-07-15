import { describe, expect, it } from "vitest";
import { createAppErrorReport } from "./error-reporting";

describe("app error reporting", () => {
  it("keeps useful error context without serializing nested application state", () => {
    const error = new Error("Playback failed");
    const report = createAppErrorReport("audio.playback", error, [
      { sentenceId: "sentence-4", request: { privateText: "book contents" } }
    ]);

    expect(report).toMatchObject({
      scope: "audio.playback",
      message: "Playback failed",
      details: "{sentenceId=sentence-4, request=[object]}"
    });
    expect(report.stack).toContain("Playback failed");
    expect(report.details).not.toContain("book contents");
  });

  it("bounds malformed diagnostic fields", () => {
    const report = createAppErrorReport(`scope\0${"x".repeat(200)}`, "y".repeat(5_000));

    expect(report.scope).not.toContain("\0");
    expect(report.scope.length).toBeLessThanOrEqual(120);
    expect(report.message.length).toBe(4_000);
  });
});
