import { describe, expect, it, vi } from "vitest";
import type {
  AnyDomainEvent,
  DomainEvent,
  DomainEventDispatcher,
  DomainEventName
} from "@sonelle/domain";
import type {
  NarrationPreparationAdapter,
  NarrationPreparationRequest,
  PreparedNarration
} from "./narration-contracts";
import { FakePassageNarrationAdapter, FakeSentenceBatchNarrationAdapter } from "./narration-fakes";
import { createNarrationChapterOutline } from "./narration-outline";
import {
  FakeManifestNarrationPlayer,
  type ManifestAwareNarrationPlayer,
  type ManifestPlaybackHandlers,
  type ManifestPlaybackInput,
  type NarrationOutputSettings
} from "./narration-player";
import { createNarrationSession } from "./narration-session";

describe("narration session", () => {
  it("projects passage readiness, sentence entry, and chapter end from manifests", async () => {
    const events: AnyDomainEvent[] = [];
    const player = new FakeManifestNarrationPlayer();
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player,
      eventDispatcher: collectingEventDispatcher(events),
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });
    session.setOutput({ playbackRate: 1.1, volume: 0.8, autoAdvance: true });

    await session.play("s2");

    expect(events.map((event) => event.name)).toEqual([
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationSentenceEntered",
      "PassageNarrationPlaybackEnded",
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationSentenceEntered",
      "PassageNarrationPlaybackEnded",
      "NarrationPlaybackEnded"
    ]);
    expect(events[1].payload).toMatchObject({
      passageId: "chapter-1:p1:passage-1",
      firstSentenceId: "s1",
      lastSentenceId: "s2",
      source: "prepared"
    });
    expect(events[2].payload).toMatchObject({ sentenceId: "s2" });
    expect(events[5].payload).toMatchObject({
      passageId: "chapter-1:p2:passage-1",
      firstSentenceId: "s3",
      lastSentenceId: "s3"
    });
    expect(events[8].payload).toMatchObject({
      passageId: "chapter-1:p2:passage-1",
      lastSentenceId: "s3"
    });
    expect(player.getOutput()).toEqual({ playbackRate: 1.1, volume: 0.8 });
  });

  it("accepts sentence entry once in reading order and ignores late platform callbacks", async () => {
    const events: AnyDomainEvent[] = [];
    const player = new AdversarialManifestNarrationPlayer();
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player,
      eventDispatcher: collectingEventDispatcher(events),
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });

    await session.play("s1");
    player.emitLate("s1");
    await Promise.resolve();

    expect(
      events
        .filter((event) => event.name === "NarrationSentenceEntered")
        .map((event) => event.payload.sentenceId)
    ).toEqual(["s1", "s2", "s3"]);
    expect(events.filter((event) => event.name === "NarrationPlaybackEnded")).toHaveLength(1);
  });

  it("invalidates sentence callbacks after playback fails", async () => {
    const events: AnyDomainEvent[] = [];
    const player = new FailingManifestNarrationPlayer();
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player,
      eventDispatcher: collectingEventDispatcher(events),
      createRequestId: createIncrementingIds()
    });
    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });

    await session.play("s1");
    player.emitLate("s2");
    await Promise.resolve();

    expect(
      events
        .filter((event) => event.name === "NarrationSentenceEntered")
        .map((event) => event.payload.sentenceId)
    ).not.toContain("s2");
    expect(events.at(-1)?.name).toBe("NarrationPlaybackFailed");
    expect(events.filter((event) => event.name === "NarrationPlaybackEnded")).toHaveLength(0);
  });

  it("fails closed when playback completes without every expected sentence callback", async () => {
    const events: AnyDomainEvent[] = [];
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player: new IncompleteManifestNarrationPlayer(),
      eventDispatcher: collectingEventDispatcher(events),
      createRequestId: createIncrementingIds()
    });
    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });

    await session.play("s1");

    expect(events.at(-1)?.name).toBe("NarrationPlaybackFailed");
    expect(events.filter((event) => event.name === "PassageNarrationPlaybackEnded")).toHaveLength(
      0
    );
    expect(events.filter((event) => event.name === "NarrationPlaybackEnded")).toHaveLength(0);
  });

  it("keeps the entered sentence valid when playback stops between sentence callbacks", async () => {
    const events: AnyDomainEvent[] = [];
    const player = new ControlledManifestNarrationPlayer();
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player,
      eventDispatcher: collectingEventDispatcher(events),
      createRequestId: createIncrementingIds()
    });
    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });

    const playback = session.play("s1");
    await player.waitForPlayCount(1);
    await session.pause();
    await playback;

    expect(
      events
        .filter((event) => event.name === "NarrationSentenceEntered")
        .map((event) => event.payload.sentenceId)
    ).not.toContain("s2");
    expect(events.at(-1)).toMatchObject({
      name: "NarrationPlaybackPaused",
      payload: { sentenceId: "s1" }
    });
    expect(events.filter((event) => event.name === "NarrationPlaybackEnded")).toHaveLength(0);
  });

  it("stops at the requested sentence when auto-advance is off", async () => {
    const events: AnyDomainEvent[] = [];
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player: new FakeManifestNarrationPlayer(),
      eventDispatcher: collectingEventDispatcher(events),
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });
    session.setOutput({ playbackRate: 1, volume: 1, autoAdvance: false });

    await session.play("s1");

    expect(events.map((event) => event.name)).toEqual([
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationSentenceEntered",
      "PassageNarrationPlaybackEnded",
      "NarrationPlaybackPaused"
    ]);
    expect(events[4].payload).toMatchObject({
      passageId: "chapter-1:p1:passage-1",
      sentenceId: "s1"
    });
  });

  it("moves to a clicked sentence by starting the containing passage at that sentence", async () => {
    const events: AnyDomainEvent[] = [];
    const player = new FakeManifestNarrationPlayer();
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player,
      eventDispatcher: collectingEventDispatcher(events),
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });

    await session.moveTo("s3");

    expect(player.played[0]).toMatchObject({
      startSentenceId: "s3",
      stopAfterSentenceId: null
    });
    expect(events.map((event) => event.name)).toEqual([
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationSentenceEntered",
      "PassageNarrationPlaybackEnded",
      "NarrationPlaybackEnded"
    ]);
  });

  it("starts preparing upcoming passages before the current passage finishes playing", async () => {
    const adapter = new ObservedNarrationAdapter(new FakePassageNarrationAdapter());
    const player = new ControlledManifestNarrationPlayer();
    const session = createNarrationSession({
      adapter,
      player,
      eventDispatcher: silentEventDispatcher,
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });
    session.setOutput({ playbackRate: 1, volume: 1, autoAdvance: true });

    const playback = session.play("s1");
    await player.waitForPlayCount(1);

    expect(adapter.preparedPassageIds()).toContain("chapter-1:p2:passage-1");

    player.finishCurrentPlayback();
    await player.waitForPlayCount(2);
    player.finishCurrentPlayback();
    await playback;
  });

  it("reuses the prefetched passage instead of preparing it again at the boundary", async () => {
    const adapter = new ObservedNarrationAdapter(new FakePassageNarrationAdapter());
    const session = createNarrationSession({
      adapter,
      player: new FakeManifestNarrationPlayer(),
      eventDispatcher: silentEventDispatcher,
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });
    session.setOutput({ playbackRate: 1, volume: 1, autoAdvance: true });

    await session.play("s1");

    expect(adapter.prepareCountForPassage("chapter-1:p1:passage-1")).toBe(1);
    expect(adapter.prepareCountForPassage("chapter-1:p2:passage-1")).toBe(1);
  });

  it("does not enter the next passage when an event listener stops the session", async () => {
    const events: AnyDomainEvent[] = [];
    const player = new FakeManifestNarrationPlayer();
    let session: ReturnType<typeof createNarrationSession>;
    session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player,
      eventDispatcher: {
        async dispatch(event) {
          events.push(event as AnyDomainEvent);
          if (event.name === "PassageNarrationPlaybackEnded") await session.pause();
        }
      },
      createRequestId: createIncrementingIds()
    });
    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });
    session.setOutput({ playbackRate: 1, volume: 1, autoAdvance: true });

    await session.play("s1");

    expect(player.played).toHaveLength(1);
    expect(events.filter((event) => event.name === "NarrationPreparationStarted")).toHaveLength(1);
  });

  it("keeps two bounded Supertonic passages ready without unbounded CPU work", async () => {
    const adapter = new ObservedNarrationAdapter(new FakeSentenceBatchNarrationAdapter());
    const player = new ControlledManifestNarrationPlayer();
    const session = createNarrationSession({
      adapter,
      player,
      eventDispatcher: silentEventDispatcher,
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createFourParagraphOutline(),
      engineId: "supertonic",
      modelRevision: "fake-supertonic",
      voiceId: "supertonic:F1"
    });
    session.setOutput({ playbackRate: 1, volume: 1, autoAdvance: true });

    const playback = session.play("s1");
    await player.waitForPlayCount(1);

    expect(adapter.preparedPassageIds()).toEqual([
      "chapter-1:p1:passage-1",
      "chapter-1:p2:passage-1",
      "chapter-1:p3:passage-1"
    ]);

    session.pause();
    await playback;
  });

  it("keeps playback independent from failed event reactions", async () => {
    const player = new FakeManifestNarrationPlayer();
    const onEventError = vi.fn();
    const session = createNarrationSession({
      adapter: new FakePassageNarrationAdapter(),
      player,
      eventDispatcher: {
        async dispatch() {
          throw new Error("projection failed");
        }
      },
      onEventError,
      createRequestId: createIncrementingIds()
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });

    await expect(session.play("s1")).resolves.toBeUndefined();

    expect(player.played).toHaveLength(2);
    expect(onEventError).toHaveBeenCalled();
  });

  it("projects preparation failures even when diagnostics throw", async () => {
    const events: AnyDomainEvent[] = [];
    const session = createNarrationSession({
      adapter: {
        async prepare() {
          throw new Error("provider detail");
        }
      },
      player: new FakeManifestNarrationPlayer(),
      eventDispatcher: collectingEventDispatcher(events),
      onError() {
        throw new Error("logger failed");
      }
    });

    session.open({
      outline: createOutline(),
      engineId: "kokoro",
      modelRevision: "fake-kokoro",
      voiceId: "kokoro-en"
    });

    await expect(session.play("s1")).resolves.toBeUndefined();
    expect(events.at(-1)).toMatchObject({
      name: "NarrationPlaybackFailed",
      payload: { reason: "Narration needs attention. Please try again." }
    });
  });
});

const silentEventDispatcher = {
  async dispatch() {
    return undefined;
  }
};

function collectingEventDispatcher(
  events: AnyDomainEvent[]
): Pick<DomainEventDispatcher, "dispatch"> {
  return {
    async dispatch<TName extends DomainEventName>(event: DomainEvent<TName>) {
      events.push(event as AnyDomainEvent);
    }
  };
}

function createOutline() {
  return createNarrationChapterOutline({
    bookId: "book-1",
    chapterId: "chapter-1",
    language: "en",
    sentences: [
      { id: "s1", index: 0, text: "The first sentence has enough words." },
      { id: "s2", index: 1, text: "The second sentence keeps the same paragraph." },
      { id: "s3", index: 2, text: "The third sentence starts a new paragraph." }
    ],
    paragraphs: [
      { id: "p1", index: 0, startSentenceIndex: 0, endSentenceIndex: 2 },
      { id: "p2", index: 1, startSentenceIndex: 2, endSentenceIndex: 3 }
    ]
  });
}

function createFourParagraphOutline() {
  return createNarrationChapterOutline({
    bookId: "book-1",
    chapterId: "chapter-1",
    language: "fr",
    sentences: [
      { id: "s1", index: 0, text: "Le premier paragraphe commence doucement." },
      { id: "s2", index: 1, text: "Le second paragraphe continue la lecture." },
      { id: "s3", index: 2, text: "Le troisième paragraphe reste en attente." },
      { id: "s4", index: 3, text: "Le quatrième paragraphe attend aussi." }
    ],
    paragraphs: [
      { id: "p1", index: 0, startSentenceIndex: 0, endSentenceIndex: 1 },
      { id: "p2", index: 1, startSentenceIndex: 1, endSentenceIndex: 2 },
      { id: "p3", index: 2, startSentenceIndex: 2, endSentenceIndex: 3 },
      { id: "p4", index: 3, startSentenceIndex: 3, endSentenceIndex: 4 }
    ]
  });
}

function createIncrementingIds() {
  let nextId = 0;
  return () => `request-${(nextId += 1)}`;
}

class ObservedNarrationAdapter implements NarrationPreparationAdapter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly adapter: NarrationPreparationAdapter) {}

  async prepare(
    request: NarrationPreparationRequest,
    signal?: AbortSignal
  ): Promise<PreparedNarration> {
    this.counts.set(request.passage.id, this.prepareCountForPassage(request.passage.id) + 1);
    return this.adapter.prepare(request, signal);
  }

  prepareCountForPassage(passageId: string): number {
    return this.counts.get(passageId) ?? 0;
  }

  preparedPassageIds(): string[] {
    return [...this.counts.keys()];
  }
}

class ControlledManifestNarrationPlayer implements ManifestAwareNarrationPlayer {
  private playbackRate = 1;
  private volume = 1;
  private active: {
    resolve: () => void;
    input: ManifestPlaybackInput;
    handlers: ManifestPlaybackHandlers;
  } | null = null;
  private playCount = 0;
  private playWaiters: Array<() => void> = [];

  play(input: ManifestPlaybackInput, handlers: ManifestPlaybackHandlers): Promise<void> {
    this.playCount += 1;
    this.playWaiters.splice(0).forEach((resolve) => resolve());
    handlers.sentenceEntered(input.startSentenceId);

    return new Promise<void>((resolve) => {
      this.active = { resolve, input, handlers };
    });
  }

  setOutput(settings: NarrationOutputSettings): void {
    this.playbackRate = settings.playbackRate;
    this.volume = settings.volume;
  }

  stop(): void {
    this.finishCurrentPlayback();
  }

  finishCurrentPlayback(): void {
    const active = this.active;
    this.active = null;
    if (active != null) {
      const sentenceIds = active.input.narration.sentences.map((sentence) => sentence.sentenceId);
      const startIndex = sentenceIds.indexOf(active.input.startSentenceId);
      for (const sentenceId of sentenceIds.slice(startIndex + 1)) {
        if (active.input.stopAfterSentenceId === active.input.startSentenceId) break;
        active.handlers.sentenceEntered(sentenceId);
        if (active.input.stopAfterSentenceId === sentenceId) break;
      }
    }
    active?.resolve();
  }

  waitForPlayCount(count: number): Promise<void> {
    if (this.playCount >= count) return Promise.resolve();
    return new Promise((resolve) => this.playWaiters.push(resolve));
  }

  getOutput(): NarrationOutputSettings {
    return { playbackRate: this.playbackRate, volume: this.volume };
  }
}

class AdversarialManifestNarrationPlayer implements ManifestAwareNarrationPlayer {
  private readonly completedHandlers: ManifestPlaybackHandlers[] = [];

  async play(input: ManifestPlaybackInput, handlers: ManifestPlaybackHandlers): Promise<void> {
    const sentenceIds = input.narration.sentences.map((sentence) => sentence.sentenceId);
    const startIndex = sentenceIds.indexOf(input.startSentenceId);
    const expected = sentenceIds.slice(startIndex);
    const first = expected[0];
    const second = expected[1];

    if (second != null) handlers.sentenceEntered(second);
    if (first != null) {
      handlers.sentenceEntered(first);
      handlers.sentenceEntered(first);
    }
    if (second != null) handlers.sentenceEntered(second);
    for (const sentenceId of expected.slice(2)) handlers.sentenceEntered(sentenceId);
    this.completedHandlers.push(handlers);
  }

  setOutput(): void {}

  stop(): void {}

  emitLate(sentenceId: string): void {
    for (const handlers of this.completedHandlers) handlers.sentenceEntered(sentenceId);
  }
}

class FailingManifestNarrationPlayer implements ManifestAwareNarrationPlayer {
  private handlers: ManifestPlaybackHandlers | null = null;

  async play(input: ManifestPlaybackInput, handlers: ManifestPlaybackHandlers): Promise<void> {
    this.handlers = handlers;
    handlers.sentenceEntered(input.startSentenceId);
    throw new Error("platform playback failed");
  }

  setOutput(): void {}

  stop(): void {}

  emitLate(sentenceId: string): void {
    this.handlers?.sentenceEntered(sentenceId);
  }
}

class IncompleteManifestNarrationPlayer implements ManifestAwareNarrationPlayer {
  async play(input: ManifestPlaybackInput, handlers: ManifestPlaybackHandlers): Promise<void> {
    handlers.sentenceEntered(input.startSentenceId);
  }

  setOutput(): void {}

  stop(): void {}
}
