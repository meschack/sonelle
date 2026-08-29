import { describe, expect, it } from "vitest";
import {
  planNarrationStorageRemoval,
  preflightVoicePackInstallation,
  type NarrationStorageActivity,
  type NarrationStorageSnapshot
} from "./narration-storage-maintenance";

const mib = 1024 * 1024;
const idle: NarrationStorageActivity = {
  playback: "idle",
  activeBookId: null,
  activeVoicePackId: null
};

describe("narration storage maintenance", () => {
  it("accounts for resumable staging and a free-space reserve before installation", () => {
    const snapshot = { availableBytes: 80 * mib, preparedAudio: [], voicePacks: [] };

    expect(
      preflightVoicePackInstallation(snapshot, {
        packId: "supertonic:standard",
        downloadSizeBytes: 100 * mib,
        stagedBytes: 60 * mib,
        minimumFreeBytesAfterInstall: 32 * mib
      })
    ).toEqual({ status: "ready", requiredBytes: 72 * mib, availableBytes: 80 * mib });
  });

  it("returns a recoverable state before a voice-pack write when space is insufficient", () => {
    const result = preflightVoicePackInstallation(
      { availableBytes: 50 * mib, preparedAudio: [], voicePacks: [] },
      { packId: "supertonic:standard", downloadSizeBytes: 100 * mib }
    );

    expect(result).toMatchObject({
      status: "needs-attention",
      requiredBytes: 132 * mib,
      availableBytes: 50 * mib
    });
    expect(result).toHaveProperty(
      "message",
      "Sonelle needs more free space before it can add this offline voice."
    );
  });

  it("requires confirmation and approves only the requested book’s prepared audio", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [
        { bookId: "book-1", sizeBytes: 12 * mib },
        { bookId: "book-2", sizeBytes: 8 * mib }
      ],
      voicePacks: []
    };

    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "prepared-audio",
        bookId: "book-1",
        confirmed: false
      })
    ).toMatchObject({ status: "needs-confirmation" });
    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "prepared-audio",
        bookId: "book-1",
        confirmed: true
      })
    ).toEqual({
      status: "approved",
      target: { kind: "prepared-audio", bookId: "book-1" },
      expectedReclaimedBytes: 12 * mib
    });
  });

  it("refuses to remove prepared audio used by active playback", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }],
      voicePacks: []
    };

    expect(
      planNarrationStorageRemoval(
        snapshot,
        {
          playback: "paused",
          activeBookId: "book-1",
          activeVoicePackId: "supertonic:standard"
        },
        { kind: "prepared-audio", bookId: "book-1", confirmed: true }
      )
    ).toEqual({
      status: "needs-attention",
      message: "Stop listening before removing this book’s prepared audio."
    });
  });

  it("requires confirmation and refuses removal of the active voice pack", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: [
        {
          packId: "supertonic:standard",
          revision: "rev-1",
          sizeBytes: 96 * mib,
          verified: true
        }
      ]
    };

    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "voice-pack",
        packId: "supertonic:standard",
        revision: "rev-1",
        confirmed: false
      })
    ).toMatchObject({ status: "needs-confirmation" });
    expect(
      planNarrationStorageRemoval(
        snapshot,
        {
          playback: "idle",
          activeBookId: "book-1",
          activeVoicePackId: "supertonic:standard"
        },
        { kind: "voice-pack", packId: "supertonic:standard", revision: "rev-1", confirmed: true }
      )
    ).toEqual({
      status: "needs-attention",
      message: "Choose another offline voice before removing this one."
    });
  });

  it("approves one inactive verified pack through a narration-only target", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: [
        { packId: "kokoro:standard", revision: "rev-2", sizeBytes: 96 * mib, verified: true },
        { packId: "supertonic:standard", revision: "rev-7", sizeBytes: 120 * mib, verified: true }
      ]
    };

    expect(
      planNarrationStorageRemoval(
        snapshot,
        {
          playback: "paused",
          activeBookId: "book-1",
          activeVoicePackId: "kokoro:standard"
        },
        { kind: "voice-pack", packId: "supertonic:standard", revision: "rev-7", confirmed: true }
      )
    ).toEqual({
      status: "approved",
      target: { kind: "voice-pack", packId: "supertonic:standard", revision: "rev-7" },
      expectedReclaimedBytes: 120 * mib
    });
  });

  it("does not treat unverified directories as removable voice packs", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: [
        { packId: "supertonic:partial", revision: "rev-1", sizeBytes: 4 * mib, verified: false }
      ]
    };

    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "voice-pack",
        packId: "supertonic:partial",
        revision: "rev-1",
        confirmed: true
      })
    ).toMatchObject({ status: "needs-attention" });
  });

  it("returns no deletion target when narration storage does not contain the request", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: []
    };

    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "prepared-audio",
        bookId: "missing-book",
        confirmed: true
      })
    ).toEqual({ status: "not-found" });
    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "voice-pack",
        packId: "missing-pack",
        revision: "rev-1",
        confirmed: true
      })
    ).toEqual({ status: "not-found" });
  });

  it("does not resolve a stale revision request to a newly installed revision", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: [
        { packId: "supertonic:standard", revision: "rev-9", sizeBytes: 120 * mib, verified: true }
      ]
    };

    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "voice-pack",
        packId: "supertonic:standard",
        revision: "rev-8",
        confirmed: true
      })
    ).toEqual({ status: "not-found" });
  });

  it("does not remove a different pack that happens to share the requested revision", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: [
        { packId: "kokoro:standard", revision: "rev-1", sizeBytes: 96 * mib, verified: true }
      ]
    };

    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "voice-pack",
        packId: "supertonic:standard",
        revision: "rev-1",
        confirmed: true
      })
    ).toEqual({ status: "not-found" });
  });

  it("fails closed when the inventory holds ambiguous copies of the same identity", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: [
        { packId: "supertonic:standard", revision: "rev-1", sizeBytes: 10 * mib, verified: true },
        { packId: "supertonic:standard", revision: "rev-1", sizeBytes: 12 * mib, verified: true }
      ]
    };

    expect(
      planNarrationStorageRemoval(snapshot, idle, {
        kind: "voice-pack",
        packId: "supertonic:standard",
        revision: "rev-1",
        confirmed: true
      })
    ).toMatchObject({ status: "needs-attention" });
  });

  it("keeps the approved voice-pack target free of filesystem paths", () => {
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000 * mib,
      preparedAudio: [],
      voicePacks: [
        { packId: "supertonic:standard", revision: "rev-1", sizeBytes: 96 * mib, verified: true }
      ]
    };

    const plan = planNarrationStorageRemoval(snapshot, idle, {
      kind: "voice-pack",
      packId: "supertonic:standard",
      revision: "rev-1",
      confirmed: true
    });
    expect(plan.status).toBe("approved");
    if (plan.status !== "approved") return;
    expect(JSON.stringify(plan.target)).not.toMatch(/[\\/]/);
    expect(plan.target).toEqual({
      kind: "voice-pack",
      packId: "supertonic:standard",
      revision: "rev-1"
    });
  });
});
