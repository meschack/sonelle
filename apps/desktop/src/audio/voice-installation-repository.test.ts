import { describe, expect, it } from "vitest";
import { failedVoiceInstallation } from "./voice-installation-repository";

describe("offline voice installation", () => {
  it("projects retryable failures without exposing native details", () => {
    expect(failedVoiceInstallation("en_US-amy-medium", "Please retry.")).toEqual({
      voiceId: "en_US-amy-medium",
      status: "failed",
      downloadSizeBytes: 0,
      progress: null,
      message: "Please retry."
    });
  });
});
