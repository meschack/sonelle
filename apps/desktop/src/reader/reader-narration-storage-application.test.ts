import { describe, expect, it, vi, type Mock } from "vitest";
import {
  createDomainEvent,
  createDomainEventDispatcher,
  type AnyDomainEvent
} from "@sonelle/domain";
import type { NarrationStorageActivity, NarrationStorageSnapshot } from "@sonelle/audio/narration";
import type { NarrationStorageMaintenanceRepository } from "../audio/narration-storage-maintenance-repository";

function last<T>(values: readonly T[]): T | undefined {
  return values[values.length - 1];
}
import {
  createReaderNarrationStorageApplication,
  removableNarrationVoicePacks,
  type NarrationStorageRemovalPrompt
} from "./reader-narration-storage-application";

const mib = 1024 * 1024;

function snapshotWith(overrides: Partial<NarrationStorageSnapshot> = {}): NarrationStorageSnapshot {
  return {
    availableBytes: 1_000 * mib,
    preparedAudio: [],
    voicePacks: [],
    ...overrides
  };
}

function idleActivity(overrides: Partial<NarrationStorageActivity> = {}): NarrationStorageActivity {
  return {
    playback: "idle",
    activeBookId: "book-1",
    activeVoicePackId: null,
    ...overrides
  };
}

interface Harness {
  repository: NarrationStorageMaintenanceRepository;
  dispatcher: ReturnType<typeof createDomainEventDispatcher>;
  events: AnyDomainEvent[];
  activity: () => NarrationStorageActivity;
  setActivity(activity: NarrationStorageActivity): void;
  setSnapshot(snapshot: NarrationStorageSnapshot): void;
  prompts: (NarrationStorageRemovalPrompt | null)[];
  notices: (string | null)[];
  busyChanges: boolean[];
  snapshots: NarrationStorageSnapshot[];
  installer: Mock<() => void>;
  application: ReturnType<typeof createReaderNarrationStorageApplication>;
  stop: () => void;
}

function createHarness(initialSnapshot: NarrationStorageSnapshot = snapshotWith()): Harness {
  const dispatcher = createDomainEventDispatcher();
  const events: AnyDomainEvent[] = [];
  for (const name of [
    "PreparedNarrationClearingRequested",
    "PreparedNarrationCleared",
    "PreparedNarrationClearingFailed"
  ] as const) {
    dispatcher.subscribe(name, (event) => {
      events.push(event as AnyDomainEvent);
    });
  }
  let activity = idleActivity();
  const storage: { snapshot: NarrationStorageSnapshot } = { snapshot: initialSnapshot };
  const harness: Harness = {
    repository: {
      inspect: vi.fn(async () => storage.snapshot),
      remove: vi.fn(async () => storage.snapshot)
    },
    dispatcher,
    events,
    activity: () => activity,
    setActivity(next) {
      activity = next;
    },
    setSnapshot(snapshot) {
      storage.snapshot = snapshot;
    },
    prompts: [null],
    notices: [null],
    busyChanges: [false],
    snapshots: [],
    installer: vi.fn((): void => undefined),
    application: undefined as unknown as Harness["application"],
    stop: () => undefined
  };
  harness.application = createReaderNarrationStorageApplication(
    {
      repository: harness.repository,
      eventDispatcher: dispatcher,
      friendlyError: () => "Narration needs attention. Please try again."
    },
    {
      currentActivity: harness.activity,
      projectPrompt: (prompt) => harness.prompts.push(prompt),
      projectNotice: (notice) => harness.notices.push(notice),
      projectBusy: (busy) => harness.busyChanges.push(busy),
      projectSnapshot: (snapshot) => harness.snapshots.push(snapshot)
    }
  );
  harness.stop = harness.application.start();
  return harness;
}

describe("reader narration storage application", () => {
  it("delegates to installation exactly once when space is sufficient", async () => {
    const harness = createHarness();
    await harness.application.refresh();

    const started = await harness.application.requestVoicePackInstallation(
      { packId: "supertonic", downloadSizeBytes: 100 * mib },
      harness.installer
    );

    expect(started).toBe(true);
    expect(harness.installer).toHaveBeenCalledExactlyOnceWith();
  });

  it("projects a humane needs-attention message and never installs when space is short", async () => {
    const harness = createHarness(snapshotWith({ availableBytes: 50 * mib }));
    await harness.application.refresh();

    const started = await harness.application.requestVoicePackInstallation(
      { packId: "supertonic", downloadSizeBytes: 100 * mib },
      harness.installer
    );

    expect(started).toBe(false);
    expect(harness.installer).not.toHaveBeenCalled();
    expect(last(harness.notices)).toBe(
      "Sonelle needs more free space before it can add this offline voice."
    );
  });

  it("credits staged bytes toward capacity without consuming the retained reserve", async () => {
    const harness = createHarness(snapshotWith({ availableBytes: 71 * mib }));
    await harness.application.refresh();

    const blocked = await harness.application.requestVoicePackInstallation(
      {
        packId: "supertonic",
        downloadSizeBytes: 100 * mib,
        stagedBytes: 60 * mib
      },
      harness.installer
    );

    expect(blocked).toBe(false);
    expect(harness.installer).not.toHaveBeenCalled();

    harness.setSnapshot(snapshotWith({ availableBytes: 72 * mib }));
    const started = await harness.application.requestVoicePackInstallation(
      {
        packId: "supertonic",
        downloadSizeBytes: 100 * mib,
        stagedBytes: 60 * mib
      },
      harness.installer
    );

    expect(started).toBe(true);
    expect(harness.installer).toHaveBeenCalledOnce();
  });

  it("opens a confirmation for prepared audio and removes nothing yet", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );

    await harness.application.requestPreparedAudioRemoval();

    expect(last(harness.prompts)).toMatchObject({
      title: "Remove prepared audio?",
      body: "This removes listening files for this book. The book, bookmarks, and reading position stay safe.",
      confirmAction: "Remove audio",
      cancelAction: "Keep audio"
    });
    expect(last(harness.prompts)?.target).toEqual({ kind: "prepared-audio", bookId: "book-1" });
    expect(harness.events.map((event) => event.name)).not.toContain(
      "PreparedNarrationClearingRequested"
    );
    expect(harness.repository.remove).not.toHaveBeenCalled();
  });

  it("closes the confirmation on cancel and removes nothing", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );
    await harness.application.requestPreparedAudioRemoval();

    harness.application.cancelRemoval();

    expect(last(harness.prompts)).toBeNull();
    expect(harness.events.map((event) => event.name)).not.toContain(
      "PreparedNarrationClearingRequested"
    );
  });

  it("re-inspects on confirmation and clears the exact approved book through the existing fact", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );
    // The production executor reacts to the clearing request and publishes the cleared fact.
    harness.dispatcher.subscribe("PreparedNarrationClearingRequested", async (event) => {
      harness.setSnapshot(snapshotWith());
      await harness.dispatcher.dispatch(
        createDomainEvent("PreparedNarrationCleared", {
          bookId: event.payload.bookId,
          sentenceCount: 0,
          sizeBytes: 0
        })
      );
    });
    await harness.application.requestPreparedAudioRemoval();
    const inspectMock = harness.repository.inspect as Mock;
    const inspectionsAfterRequest = inspectMock.mock.calls.length;

    await harness.application.confirmRemoval();

    expect(inspectMock.mock.calls.length).toBeGreaterThan(inspectionsAfterRequest);
    expect(harness.events.filter((e) => e.name === "PreparedNarrationClearingRequested")).toEqual([
      expect.objectContaining({
        name: "PreparedNarrationClearingRequested",
        payload: { bookId: "book-1" }
      })
    ]);
    expect(harness.repository.remove).not.toHaveBeenCalled();
    expect(last(harness.prompts)).toBeNull();
    expect(last(harness.busyChanges)).toBe(false);
  });

  it("blocks removal when playback becomes active between request and confirmation", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );
    await harness.application.requestPreparedAudioRemoval();
    harness.setActivity(idleActivity({ playback: "playing" }));

    await harness.application.confirmRemoval();

    expect(harness.events.map((event) => event.name)).not.toContain(
      "PreparedNarrationClearingRequested"
    );
    expect(last(harness.prompts)).toBeNull();
    expect(last(harness.notices)).toBe(
      "Stop listening before removing this book’s prepared audio."
    );
  });

  it("blocks removal while playback is paused for the active book", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );
    harness.setActivity(idleActivity({ playback: "paused" }));

    await harness.application.requestPreparedAudioRemoval();

    expect(last(harness.prompts)).toBeNull();
    expect(last(harness.notices)).toBe(
      "Stop listening before removing this book’s prepared audio."
    );
  });

  it("allows confirmed removal while playback is idle", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );
    harness.dispatcher.subscribe("PreparedNarrationClearingRequested", () =>
      harness.dispatcher.dispatch(
        createDomainEvent("PreparedNarrationCleared", {
          bookId: "book-1",
          sentenceCount: 0,
          sizeBytes: 0
        })
      )
    );

    await harness.application.requestPreparedAudioRemoval();
    await harness.application.confirmRemoval();

    expect(harness.events.map((event) => event.name)).toContain(
      "PreparedNarrationClearingRequested"
    );
  });

  it("removes an inactive verified pack through the repository after confirmation", async () => {
    const harness = createHarness(
      snapshotWith({
        voicePacks: [
          { packId: "supertonic:standard", revision: "rev-7", sizeBytes: 120 * mib, verified: true }
        ]
      })
    );

    await harness.application.requestVoicePackRemoval("supertonic:standard", "rev-7");
    await harness.application.confirmRemoval();

    expect(harness.repository.remove).toHaveBeenCalledExactlyOnceWith({
      kind: "voice-pack",
      packId: "supertonic:standard",
      revision: "rev-7"
    });
    expect(last(harness.prompts)).toBeNull();
    expect(last(harness.notices)).toBe("Offline voice removed.");
  });

  it("refuses to remove the selected voice pack", async () => {
    const harness = createHarness(
      snapshotWith({
        voicePacks: [
          { packId: "supertonic:standard", revision: "rev-7", sizeBytes: 120 * mib, verified: true }
        ]
      })
    );
    harness.setActivity(idleActivity({ activeVoicePackId: "supertonic:standard" }));

    await harness.application.requestVoicePackRemoval("supertonic:standard", "rev-7");

    expect(last(harness.prompts)).toBeNull();
    expect(last(harness.notices)).toBe("Choose another offline voice before removing this one.");
    expect(harness.repository.remove).not.toHaveBeenCalled();
  });

  it("prevents stale removal when the pack revision changes while confirmation is open", async () => {
    const harness = createHarness(
      snapshotWith({
        voicePacks: [
          { packId: "supertonic:standard", revision: "rev-7", sizeBytes: 120 * mib, verified: true }
        ]
      })
    );
    await harness.application.requestVoicePackRemoval("supertonic:standard", "rev-7");
    harness.setSnapshot(
      snapshotWith({
        voicePacks: [
          { packId: "supertonic:standard", revision: "rev-9", sizeBytes: 121 * mib, verified: true }
        ]
      })
    );

    await harness.application.confirmRemoval();

    expect(harness.repository.remove).not.toHaveBeenCalled();
    expect(last(harness.prompts)).toBeNull();
  });

  it("never passes an unverified pack to removal", async () => {
    const harness = createHarness(
      snapshotWith({
        voicePacks: [
          { packId: "supertonic:partial", revision: "rev-1", sizeBytes: 4 * mib, verified: false }
        ]
      })
    );

    await harness.application.requestVoicePackRemoval("supertonic:partial", "rev-1");

    expect(last(harness.prompts)).toBeNull();
    expect(harness.repository.remove).not.toHaveBeenCalled();
    expect(last(harness.notices)).toContain("need attention");
  });

  it("projects a retryable notice and clears busy state when the repository fails", async () => {
    const harness = createHarness(
      snapshotWith({
        voicePacks: [
          { packId: "supertonic:standard", revision: "rev-7", sizeBytes: 120 * mib, verified: true }
        ]
      })
    );
    harness.repository.remove = vi.fn(async () => {
      throw new Error("disk error");
    });

    await harness.application.requestVoicePackRemoval("supertonic:standard", "rev-7");
    await harness.application.confirmRemoval();

    expect(last(harness.notices)).toBe("Narration needs attention. Please try again.");
    expect(last(harness.busyChanges)).toBe(false);
    expect(last(harness.prompts)).toBeNull();
  });

  it("clears a pending prepared-audio confirmation when the reader opens another book", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );
    await harness.application.requestPreparedAudioRemoval();
    expect(last(harness.prompts)).not.toBeNull();

    await harness.dispatcher.dispatch(
      createDomainEvent("ReaderOpened", {
        bookId: "book-2",
        chapterId: "chapter-1",
        sentenceId: "sentence-1",
        sentenceIndex: 0,
        playbackStatus: "idle",
        source: "library",
        language: "en"
      })
    );

    expect(last(harness.prompts)).toBeNull();
  });

  it("performs at most one removal for concurrent confirmations", async () => {
    const harness = createHarness(
      snapshotWith({
        voicePacks: [
          { packId: "supertonic:standard", revision: "rev-7", sizeBytes: 120 * mib, verified: true }
        ]
      })
    );
    let releaseRemove!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRemove = resolve;
    });
    const removeMock = vi.fn(async () => {
      await gate;
      return snapshotWith();
    });
    harness.repository.remove = removeMock;

    await harness.application.requestVoicePackRemoval("supertonic:standard", "rev-7");
    const first = harness.application.confirmRemoval();
    const second = harness.application.confirmRemoval();
    releaseRemove();
    await Promise.all([first, second]);

    expect(removeMock).toHaveBeenCalledOnce();
  });

  it("refreshes readiness after successful prepared-audio removal", async () => {
    const harness = createHarness(
      snapshotWith({ preparedAudio: [{ bookId: "book-1", sizeBytes: 12 * mib }] })
    );
    harness.dispatcher.subscribe("PreparedNarrationClearingRequested", async () => {
      harness.setSnapshot(snapshotWith());
      await harness.dispatcher.dispatch(
        createDomainEvent("PreparedNarrationCleared", {
          bookId: "book-1",
          sentenceCount: 0,
          sizeBytes: 0
        })
      );
    });
    await harness.application.requestPreparedAudioRemoval();

    await harness.application.confirmRemoval();

    expect(last(harness.snapshots)).toEqual(snapshotWith());
  });

  it("never displays a fictional removable pack for an empty inventory", () => {
    expect(removableNarrationVoicePacks(snapshotWith(), idleActivity())).toEqual([]);
    expect(removableNarrationVoicePacks(null, idleActivity())).toEqual([]);
  });

  it("offers only verified inactive packs for removal", () => {
    const snapshot = snapshotWith({
      voicePacks: [
        { packId: "kokoro:standard", revision: "rev-2", sizeBytes: 96 * mib, verified: true },
        {
          packId: "supertonic:standard",
          revision: "rev-7",
          sizeBytes: 120 * mib,
          verified: true
        },
        { packId: "supertonic:partial", revision: "rev-1", sizeBytes: 4 * mib, verified: false }
      ]
    });

    expect(
      removableNarrationVoicePacks(snapshot, idleActivity({ activeVoicePackId: "kokoro:standard" }))
    ).toEqual([{ packId: "supertonic:standard", revision: "rev-7", sizeBytes: 120 * mib }]);
  });
});
