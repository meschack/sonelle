export type NarrationPlaybackActivity = "idle" | "paused" | "playing" | "preparing";

export interface NarrationStorageSnapshot {
  availableBytes: number;
  preparedAudio: readonly PreparedAudioStorageEntry[];
  voicePacks: readonly VoicePackStorageEntry[];
}

export interface PreparedAudioStorageEntry {
  bookId: string;
  sizeBytes: number;
}

export interface VoicePackStorageEntry {
  packId: string;
  sizeBytes: number;
  verified: boolean;
}

export interface NarrationStorageActivity {
  playback: NarrationPlaybackActivity;
  activeBookId: string | null;
  activeVoicePackId: string | null;
}

export interface VoicePackInstallationRequest {
  packId: string;
  downloadSizeBytes: number;
  stagedBytes?: number;
  minimumFreeBytesAfterInstall?: number;
}

export type VoicePackInstallationPreflight =
  | {
      status: "ready";
      requiredBytes: number;
      availableBytes: number;
    }
  | {
      status: "needs-attention";
      requiredBytes: number;
      availableBytes: number;
      message: string;
    };

export type NarrationStorageRemovalRequest =
  | { kind: "prepared-audio"; bookId: string; confirmed: boolean }
  | { kind: "voice-pack"; packId: string; confirmed: boolean };

export type NarrationStorageRemovalTarget =
  { kind: "prepared-audio"; bookId: string } | { kind: "voice-pack"; packId: string };

export type NarrationStorageRemovalPlan =
  | { status: "needs-confirmation"; message: string }
  | { status: "needs-attention"; message: string }
  | { status: "not-found" }
  | { status: "approved"; target: NarrationStorageRemovalTarget; expectedReclaimedBytes: number };

const DEFAULT_FREE_SPACE_RESERVE_BYTES = 32 * 1024 * 1024;

export function preflightVoicePackInstallation(
  snapshot: NarrationStorageSnapshot,
  request: VoicePackInstallationRequest
): VoicePackInstallationPreflight {
  const downloadSizeBytes = validByteCount(request.downloadSizeBytes);
  const stagedBytes = Math.min(downloadSizeBytes, validByteCount(request.stagedBytes ?? 0));
  const reserveBytes = validByteCount(
    request.minimumFreeBytesAfterInstall ?? DEFAULT_FREE_SPACE_RESERVE_BYTES
  );
  const requiredBytes = downloadSizeBytes - stagedBytes + reserveBytes;

  if (snapshot.availableBytes < requiredBytes) {
    return {
      status: "needs-attention",
      requiredBytes,
      availableBytes: snapshot.availableBytes,
      message: "Sonelle needs more free space before it can add this offline voice."
    };
  }

  return { status: "ready", requiredBytes, availableBytes: snapshot.availableBytes };
}

export function planNarrationStorageRemoval(
  snapshot: NarrationStorageSnapshot,
  activity: NarrationStorageActivity,
  request: NarrationStorageRemovalRequest
): NarrationStorageRemovalPlan {
  if (request.kind === "prepared-audio") {
    const preparedAudio = snapshot.preparedAudio.find((entry) => entry.bookId === request.bookId);
    if (preparedAudio == null) return { status: "not-found" };
    if (activity.activeBookId === request.bookId && activity.playback !== "idle") {
      return {
        status: "needs-attention",
        message: "Stop listening before removing this book’s prepared audio."
      };
    }
    if (!request.confirmed) {
      return {
        status: "needs-confirmation",
        message: "Remove prepared audio for this book? The book and reading progress stay safe."
      };
    }
    return {
      status: "approved",
      target: { kind: "prepared-audio", bookId: request.bookId },
      expectedReclaimedBytes: validByteCount(preparedAudio.sizeBytes)
    };
  }

  const pack = snapshot.voicePacks.find((candidate) => candidate.packId === request.packId);
  if (pack == null) return { status: "not-found" };
  if (!pack.verified) {
    return {
      status: "needs-attention",
      message: "These offline voice files need attention and cannot be removed as a ready voice."
    };
  }
  if (activity.activeVoicePackId === request.packId) {
    return {
      status: "needs-attention",
      message: "Choose another offline voice before removing this one."
    };
  }
  if (!request.confirmed) {
    return {
      status: "needs-confirmation",
      message: "Remove this offline voice? Your books and reading progress stay safe."
    };
  }
  return {
    status: "approved",
    target: { kind: "voice-pack", packId: request.packId },
    expectedReclaimedBytes: validByteCount(pack.sizeBytes)
  };
}

function validByteCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
