import type { NarrationFailureOutcome } from "@sonelle/domain";

/**
 * Owns conversion from platform/provider diagnostics to Sonelle's stable narration failures.
 * It refuses installation, playback control, UI actions, and diagnostic persistence.
 * Adapters may throw NarrationFailureError; callers resolve unknown failures through
 * resolveNarrationFailure. Classification and humane copy are covered by narration-failure.test.ts.
 */

export interface ResolvedNarrationFailure {
  outcome: NarrationFailureOutcome;
  message: string;
}

/** Lets platform adapters preserve a stable recovery outcome without leaking their diagnostics. */
export class NarrationFailureError extends Error {
  constructor(
    readonly outcome: NarrationFailureOutcome,
    message: string
  ) {
    super(message);
    this.name = "NarrationFailureError";
  }
}

export function resolveNarrationFailure(error: unknown): ResolvedNarrationFailure {
  const outcome =
    error instanceof NarrationFailureError ? error.outcome : classifyDiagnosticMessage(error);
  return { outcome, message: narrationFailureMessage(outcome) };
}

export function narrationFailureMessage(outcome: NarrationFailureOutcome): string {
  switch (outcome) {
    case "voice-files-missing":
      return "Download the offline voice to continue listening.";
    case "voice-files-invalid":
      return "The offline voice needs repair before narration can continue.";
    case "storage-full":
      return "Sonelle needs more free space to prepare narration.";
    case "preparation-failed":
      return "Narration couldn't be prepared. Please try again.";
    case "audio-unavailable":
      return "Prepared narration couldn't be opened. Please try again.";
    case "device-voice-unavailable":
      return "This device voice isn't available. Choose another voice.";
    case "unknown":
      return "Narration needs attention. Please try again.";
  }
}

function classifyDiagnosticMessage(error: unknown): NarrationFailureOutcome {
  const message = diagnosticMessage(error).toLocaleLowerCase();

  if (matchesAny(message, ["no space", "enospc", "disk full", "storage full"])) {
    return "storage-full";
  }
  if (
    matchesAny(message, [
      "checksum",
      "integrity",
      "verification failed",
      "catalog verification",
      "couldn't verify",
      "could not verify",
      "files changed",
      "corrupt"
    ])
  ) {
    return "voice-files-invalid";
  }
  if (
    matchesAny(message, [
      "voice pack is not installed",
      "voice files are not installed",
      "voice pack missing",
      "model is not installed",
      "model file missing",
      "offline voice is not installed"
    ])
  ) {
    return "voice-files-missing";
  }
  if (
    matchesAny(message, [
      "open prepared audio",
      "prepared narration is not available",
      "audio source",
      "media source"
    ])
  ) {
    return "audio-unavailable";
  }
  if (matchesAny(message, ["inference", "synthesis", "phonem", "onnx", "model runtime"])) {
    return "preparation-failed";
  }
  if (matchesAny(message, ["device speech", "device voice", "text to speech"])) {
    return "device-voice-unavailable";
  }
  return "unknown";
}

function matchesAny(message: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => message.includes(candidate));
}

function diagnosticMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "";
}
