import type { NarrationFailureOutcome } from "@sonelle/domain";

/**
 * Owns reader-facing recovery actions for stable narration failure outcomes.
 * It refuses playback control, voice installation, storage mutation, and platform navigation;
 * ReaderExperience performs the selected semantic action. Policy is covered by
 * reader-narration-recovery.test.ts and the reader integration test.
 */

export type NarrationRecoveryActionKind =
  "retry" | "install-voice" | "repair-voice" | "manage-storage" | "choose-voice";

export interface NarrationRecoveryAction {
  kind: NarrationRecoveryActionKind;
  label: string;
}

export interface NarrationRecoveryActions {
  primary: NarrationRecoveryAction;
  secondary: NarrationRecoveryAction | null;
}

/** Keeps failure-to-action policy out of reader rendering and platform adapters. */
export function narrationRecoveryFor(
  outcome: NarrationFailureOutcome,
  deviceVoiceFallbackAvailable: boolean
): NarrationRecoveryActions {
  const primary = primaryRecovery(outcome);
  const offersDeviceVoice = deviceVoiceFallbackAvailable && outcome !== "device-voice-unavailable";
  return {
    primary,
    secondary: offersDeviceVoice ? { kind: "choose-voice", label: "Choose device voice" } : null
  };
}

function primaryRecovery(outcome: NarrationFailureOutcome): NarrationRecoveryAction {
  switch (outcome) {
    case "voice-files-missing":
      return { kind: "install-voice", label: "Download voice" };
    case "voice-files-invalid":
      return { kind: "repair-voice", label: "Repair voice" };
    case "storage-full":
      return { kind: "manage-storage", label: "Manage storage" };
    case "device-voice-unavailable":
      return { kind: "choose-voice", label: "Choose another voice" };
    case "preparation-failed":
    case "audio-unavailable":
    case "unknown":
      return { kind: "retry", label: "Retry narration" };
  }
}
