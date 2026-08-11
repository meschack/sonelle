import { createDomainEvent, type DomainEventDispatcher, type EntityId } from "@sonelle/domain";
import type {
  NarrationChapterOutline,
  NarrationEngineId,
  NarrationPassage,
  NarrationPreparationAdapter,
  NarrationPreparationRequest,
  PreparedNarration
} from "./narration-contracts";
import { assertPreparedNarration } from "./narration-manifest";
import { digestNarrationPassageText } from "./narration-identity";
import { createNarrationPassages, type NarrationPassageOptions } from "./narration-outline";
import type { ManifestAwareNarrationPlayer, NarrationOutputSettings } from "./narration-player";

export interface NarrationSessionChapter {
  outline: NarrationChapterOutline;
  engineId: NarrationEngineId;
  modelRevision: string;
  voiceId: string;
  passageOptions?: NarrationPassageOptions;
}

export interface NarrationSession {
  open(chapter: NarrationSessionChapter): void;
  prepare(sentenceId: EntityId): Promise<void>;
  play(sentenceId: EntityId): Promise<void>;
  pause(): Promise<void>;
  moveTo(sentenceId: EntityId): Promise<void>;
  setOutput(settings: NarrationOutputSettings & { autoAdvance: boolean }): void;
  close(): void;
}

export interface NarrationSessionOptions {
  adapter: NarrationPreparationAdapter;
  player: ManifestAwareNarrationPlayer;
  eventDispatcher: Pick<DomainEventDispatcher, "dispatch">;
  onEventError?(error: unknown): void;
  onError?(error: unknown): void;
  createRequestId?: () => EntityId;
}

interface OpenChapter extends NarrationSessionChapter {
  passages: readonly NarrationPassage[];
  passageBySentenceId: ReadonlyMap<EntityId, NarrationPassage>;
}

interface ActivePlayback {
  passageId: EntityId;
  sentenceId: EntityId;
}

const defaultPrefetchLookaheadPassages = 3;
const heavyEnginePrefetchLookaheadPassages = 2;

export function createNarrationSession(options: NarrationSessionOptions): NarrationSession {
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  let chapter: OpenChapter | null = null;
  let output = { playbackRate: 1, volume: 1, autoAdvance: true };
  let active: ActivePlayback | null = null;
  let generation = 0;
  let preparedPassages = new Map<EntityId, Promise<PreparedNarration>>();
  let preparationControllers = new Set<AbortController>();

  const closeActive = () => {
    generation += 1;
    for (const controller of preparationControllers) {
      controller.abort(new StaleNarrationSessionPreparationError());
    }
    preparationControllers = new Set();
    preparedPassages = new Map();
    options.player.stop();
  };

  const publish = async (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) => {
    try {
      await options.eventDispatcher.dispatch(event);
    } catch (error) {
      try {
        options.onEventError?.(error);
      } catch {
        // Event diagnostics must never become playback control flow.
      }
    }
  };

  const reportError = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // Diagnostics are observers, never narration control flow.
    }
  };

  const startAt = async (sentenceId: EntityId): Promise<void> => {
    const currentChapter = requireOpenChapter(chapter);
    const passage = currentChapter.passageBySentenceId.get(sentenceId);
    if (passage == null) throw new Error("Sentence does not belong to the open narration chapter.");

    active = { passageId: passage.id, sentenceId };
    const run = ++generation;
    const preparedPassage = prepareAndReport(
      currentChapter,
      passage,
      sentenceId,
      () => run === generation
    );
    prefetchUpcomingPassages(currentChapter, passage);
    let prepared: PreparedNarration;

    try {
      prepared = await preparedPassage;
    } catch (error) {
      if (run !== generation) return;
      reportError(error);
      await publish(
        createDomainEvent("NarrationPlaybackFailed", {
          bookId: currentChapter.outline.bookId,
          chapterId: currentChapter.outline.chapterId,
          sentenceId,
          passageId: passage.id,
          reason: friendlyNarrationSessionError(error)
        })
      );
      return;
    }

    if (run !== generation) return;
    const firstSentenceId = passage.sentences[0]?.id;
    const lastSentenceId = passage.sentences[passage.sentences.length - 1]?.id;
    if (firstSentenceId == null || lastSentenceId == null) return;

    prefetchUpcomingPassages(currentChapter, passage);

    let pendingSentenceEvents = Promise.resolve();
    try {
      await options.player.play(
        {
          narration: prepared,
          startSentenceId: sentenceId,
          stopAfterSentenceId: output.autoAdvance ? null : sentenceId
        },
        {
          sentenceEntered(nextSentenceId) {
            if (run !== generation) return;
            active = { passageId: passage.id, sentenceId: nextSentenceId };
            pendingSentenceEvents = pendingSentenceEvents.then(() =>
              publish(
                createDomainEvent("NarrationSentenceEntered", {
                  bookId: passage.bookId,
                  chapterId: passage.chapterId,
                  passageId: passage.id,
                  sentenceId: nextSentenceId
                })
              )
            );
          }
        }
      );
      await pendingSentenceEvents;
    } catch (error) {
      if (run !== generation) return;
      reportError(error);
      await publish(
        createDomainEvent("NarrationPlaybackFailed", {
          bookId: passage.bookId,
          chapterId: passage.chapterId,
          passageId: passage.id,
          sentenceId,
          reason: friendlyNarrationSessionError(error)
        })
      );
      return;
    }

    if (run !== generation) return;
    await publish(
      createDomainEvent("PassageNarrationPlaybackEnded", {
        bookId: passage.bookId,
        chapterId: passage.chapterId,
        passageId: passage.id,
        lastSentenceId
      })
    );
    if (run !== generation) return;
    if (!output.autoAdvance) {
      await dispatchPaused(
        currentChapter,
        active ?? { passageId: passage.id, sentenceId },
        publish
      );
      return;
    }

    const nextSentenceId = nextSentenceAfterPassage(currentChapter, passage);
    if (nextSentenceId != null) {
      await startAt(nextSentenceId);
      return;
    }

    active = { passageId: passage.id, sentenceId: lastSentenceId };
    await publish(
      createDomainEvent("NarrationPlaybackEnded", {
        bookId: passage.bookId,
        chapterId: passage.chapterId,
        passageId: passage.id,
        lastSentenceId
      })
    );
  };

  return {
    open(nextChapter) {
      closeActive();
      const passages = createNarrationPassages(nextChapter.outline, nextChapter.passageOptions);
      chapter = {
        ...nextChapter,
        passages,
        passageBySentenceId: mapPassagesBySentenceId(passages)
      };
    },

    async prepare(sentenceId) {
      const currentChapter = requireOpenChapter(chapter);
      const passage = currentChapter.passageBySentenceId.get(sentenceId);
      if (passage == null)
        throw new Error("Sentence does not belong to the open narration chapter.");
      await prepareAndReport(currentChapter, passage, sentenceId);
      prefetchUpcomingPassages(currentChapter, passage);
    },

    play(sentenceId) {
      closeActive();
      return startAt(sentenceId);
    },

    async pause() {
      const currentChapter = chapter;
      const paused = active;
      closeActive();
      if (currentChapter != null && paused != null)
        await dispatchPaused(currentChapter, paused, publish);
    },

    moveTo(sentenceId) {
      closeActive();
      return startAt(sentenceId);
    },

    setOutput(settings) {
      output = {
        playbackRate: settings.playbackRate,
        volume: settings.volume,
        autoAdvance: settings.autoAdvance
      };
      options.player.setOutput({
        playbackRate: settings.playbackRate,
        volume: settings.volume
      });
    },

    close() {
      closeActive();
      active = null;
      chapter = null;
    }
  };

  function preparePassage(
    currentChapter: OpenChapter,
    passage: NarrationPassage
  ): Promise<PreparedNarration> {
    const existing = preparedPassages.get(passage.id);
    if (existing != null) return existing;

    const controller = new AbortController();
    preparationControllers.add(controller);
    const request = createPreparationRequest(currentChapter, passage, createRequestId());
    const prepared = options.adapter
      .prepare(request, controller.signal)
      .then((narration) => assertPreparedNarration(narration, request.passage.sentences))
      .catch((error) => {
        preparedPassages.delete(passage.id);
        throw error;
      })
      .finally(() => {
        preparationControllers.delete(controller);
      });
    preparedPassages.set(passage.id, prepared);
    return prepared;
  }

  async function prepareAndReport(
    currentChapter: OpenChapter,
    passage: NarrationPassage,
    sentenceId: EntityId,
    isCurrent: () => boolean = () => true
  ): Promise<PreparedNarration> {
    const preparedPassage = preparePassage(currentChapter, passage);
    await publish(
      createDomainEvent("NarrationPreparationStarted", {
        bookId: passage.bookId,
        chapterId: passage.chapterId,
        passageId: passage.id,
        sentenceId
      })
    );
    const prepared = await preparedPassage;
    const firstSentenceId = passage.sentences[0]?.id;
    const lastSentenceId = passage.sentences[passage.sentences.length - 1]?.id;
    if (isCurrent() && firstSentenceId != null && lastSentenceId != null) {
      await publish(
        createDomainEvent("PassageNarrationReady", {
          bookId: passage.bookId,
          chapterId: passage.chapterId,
          passageId: passage.id,
          firstSentenceId,
          lastSentenceId,
          voiceId: prepared.voiceId,
          engineId: prepared.engineId,
          source: prepared.cached ? "cache" : "prepared"
        })
      );
    }
    return prepared;
  }

  function prefetchUpcomingPassages(currentChapter: OpenChapter, passage: NarrationPassage) {
    const index = currentChapter.passages.findIndex((candidate) => candidate.id === passage.id);
    if (index < 0) return;

    const nextPassages = currentChapter.passages.slice(
      index + 1,
      index + 1 + prefetchLookaheadForEngine(currentChapter.engineId)
    );
    for (const nextPassage of nextPassages) {
      void preparePassage(currentChapter, nextPassage).catch(() => {
        // Prefetch is best-effort; foreground playback will surface any real error.
      });
    }
  }
}

function prefetchLookaheadForEngine(engineId: NarrationEngineId): number {
  return engineId === "supertonic"
    ? heavyEnginePrefetchLookaheadPassages
    : defaultPrefetchLookaheadPassages;
}

class StaleNarrationSessionPreparationError extends Error {
  constructor() {
    super("Narration preparation was superseded by a newer request.");
    this.name = "StaleNarrationSessionPreparationError";
  }
}

function dispatchPaused(
  chapter: OpenChapter,
  active: ActivePlayback,
  publish: (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) => Promise<void>
): Promise<void> {
  const passage = chapter.passages.find((candidate) => candidate.id === active.passageId);
  if (passage == null) return Promise.resolve();

  return publish(
    createDomainEvent("NarrationPlaybackPaused", {
      bookId: passage.bookId,
      chapterId: passage.chapterId,
      passageId: passage.id,
      sentenceId: active.sentenceId
    })
  );
}

function createPreparationRequest(
  chapter: OpenChapter,
  passage: NarrationPassage,
  requestId: EntityId
): NarrationPreparationRequest {
  return {
    requestId,
    passage,
    engineId: chapter.engineId,
    modelRevision: chapter.modelRevision,
    voiceId: chapter.voiceId,
    sourceTextDigest: digestNarrationPassageText(passage)
  };
}

function mapPassagesBySentenceId(
  passages: readonly NarrationPassage[]
): ReadonlyMap<EntityId, NarrationPassage> {
  const mapped = new Map<EntityId, NarrationPassage>();
  for (const passage of passages) {
    for (const sentence of passage.sentences) mapped.set(sentence.id, passage);
  }
  return mapped;
}

function nextSentenceAfterPassage(
  chapter: OpenChapter,
  passage: NarrationPassage
): EntityId | null {
  const lastSentence = passage.sentences[passage.sentences.length - 1];
  if (lastSentence == null) return null;
  return chapter.outline.sentences[lastSentence.index + 1]?.id ?? null;
}

function requireOpenChapter(chapter: OpenChapter | null): OpenChapter {
  if (chapter == null) throw new Error("Open a narration chapter before controlling playback.");
  return chapter;
}

function friendlyNarrationSessionError(error: unknown): string {
  void error;
  return "Narration needs attention. Please try again.";
}
