import { describe, expect, it } from "vitest";
import { narrationRecoveryFor } from "./reader-narration-recovery";

describe("reader narration recovery", () => {
  it.each([
    ["voice-files-missing", "Download voice", "install-voice"],
    ["voice-files-invalid", "Repair voice", "repair-voice"],
    ["storage-full", "Manage storage", "manage-storage"],
    ["preparation-failed", "Retry narration", "retry"],
    ["audio-unavailable", "Retry narration", "retry"],
    ["device-voice-unavailable", "Choose another voice", "choose-voice"],
    ["unknown", "Retry narration", "retry"]
  ] as const)("maps %s to only its relevant primary action", (outcome, label, action) => {
    expect(narrationRecoveryFor(outcome, false)).toEqual({
      primary: { kind: action, label },
      secondary: null
    });
  });

  it("offers an explicit device-voice fallback only for a failed Sonelle voice", () => {
    expect(narrationRecoveryFor("preparation-failed", true).secondary).toEqual({
      kind: "choose-voice",
      label: "Choose device voice"
    });
    expect(narrationRecoveryFor("device-voice-unavailable", true).secondary).toBeNull();
  });
});
