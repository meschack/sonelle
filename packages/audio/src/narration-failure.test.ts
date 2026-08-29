import { describe, expect, it } from "vitest";
import { NarrationFailureError, resolveNarrationFailure } from "./narration-failure";

describe("narration failure outcomes", () => {
  it.each([
    ["The selected voice pack is not installed.", "voice-files-missing"],
    ["Voice files are not installed.", "voice-files-missing"],
    ["Voice pack checksum verification failed.", "voice-files-invalid"],
    ["Catalog verification rejected the voice pack.", "voice-files-invalid"],
    ["No space left on device (ENOSPC).", "storage-full"],
    ["ONNX inference failed.", "preparation-failed"],
    ["We couldn't open prepared audio.", "audio-unavailable"]
  ] as const)("maps %s to %s", (message, outcome) => {
    expect(resolveNarrationFailure(new Error(message)).outcome).toBe(outcome);
  });

  it("prefers an adapter's typed outcome over message matching", () => {
    expect(
      resolveNarrationFailure(
        new NarrationFailureError("audio-unavailable", "opaque platform failure")
      )
    ).toEqual({
      outcome: "audio-unavailable",
      message: "Prepared narration couldn't be opened. Please try again."
    });
  });

  it("keeps unknown provider details out of reader copy", () => {
    expect(
      resolveNarrationFailure(new Error("provider exploded at /private/cache/item.bin"))
    ).toEqual({
      outcome: "unknown",
      message: "Narration needs attention. Please try again."
    });
  });
});
