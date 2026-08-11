import type {
  NarrationGateway,
  NarrationGatewayEvent,
  NarrationEngineId,
  NarrationReadiness,
  NarrationRoutingMode,
  NarrationSession
} from "@sonelle/audio/narration";
import type { AudioSettings } from "@sonelle/audio";
import { createDomainEvent, type DomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type { ReaderView } from "./reader-view";
import { createReaderNarrationSessionChapter } from "./reader-narration";
import type { ReaderNarrationPrefetchWorkflow } from "./reader-narration-prefetch-workflow";

export type ReaderNarrationProjectionEvent =
  | DomainEvent<"NarrationSentenceEntered">
  | DomainEvent<"NarrationPlaybackPaused">
  | DomainEvent<"NarrationPlaybackEnded">
  | DomainEvent<"NarrationPlaybackFailed">
  | DomainEvent<"NarrationPlaybackInterrupted">;

export interface DesktopNarrationGatewayOptions {
  currentReader(): ReaderView;
  currentSettings(): AudioSettings;
  engineInstallations(): Partial<Record<NarrationEngineId, { modelRevision: string }>>;
  projectPlayback(event: ReaderNarrationProjectionEvent): void;
  projectPreparing(preparing: boolean): void;
  projectAudible(audible: boolean): void;
  projectNotice(message: string | null): void;
  reportError(error: unknown, stage: "playback" | "prefetch", sentenceId: string): void;
}

interface DesktopNarrationGatewayDependencies {
  eventDispatcher: DomainEventDispatcher;
  prefetchWorkflow: ReaderNarrationPrefetchWorkflow;
  routingMode: NarrationRoutingMode;
  session: NarrationSession;
}

/**
 * Adapts the desktop narration session and prefetch flow to the platform-neutral gateway.
 * Engine routing is resolved here; reader state and rendering remain outside this module.
 * Lifecycle facts are published as domain events and mirrored to gateway subscribers.
 */
export function createDesktopNarrationGateway(
  dependencies: DesktopNarrationGatewayDependencies,
  options: DesktopNarrationGatewayOptions
): NarrationGateway {
  let currentReadiness: NarrationReadiness = "idle";
  let lastSentenceId: string | null = null;
  let activeSentenceId: string | null = null;
  let openSessionKey: string | null = null;
  const listeners = new Set<(event: NarrationGatewayEvent) => void>();

  const publish = async (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) => {
    try {
      await dependencies.eventDispatcher.dispatch(event);
    } catch (error) {
      reportErrorSafely(options, error, "playback", "unknown");
    }
  };

  const ensureSessionOpen = () => {
    const reader = options.currentReader();
    const settings = options.currentSettings();
    const sessionChapter = createReaderNarrationSessionChapter(
      reader,
      settings.voiceId,
      dependencies.routingMode,
      options.engineInstallations()
    );
    const sessionKey = [
      reader.book.id,
      reader.chapter.id,
      sessionChapter.engineId,
      sessionChapter.modelRevision,
      sessionChapter.voiceId
    ].join("\u001f");
    if (openSessionKey !== sessionKey) {
      dependencies.session.open(sessionChapter);
      openSessionKey = sessionKey;
    }
    dependencies.session.setOutput(settings);
    return reader;
  };

  const handlePlaybackRequested = async (event: DomainEvent<"NarrationPlaybackRequested">) => {
    const reader = options.currentReader();
    if (reader.book.id !== event.payload.bookId || reader.chapter.id !== event.payload.chapterId) {
      return;
    }
    const sentence = reader.sentences.find(
      (candidate) => candidate.id === event.payload.sentenceId
    );
    if (sentence == null) return;

    ensureSessionOpen();
    try {
      await dependencies.session.play(sentence.id);
    } catch (error) {
      reportErrorSafely(options, error, "playback", sentence.id);
      await publish(
        createDomainEvent("NarrationPlaybackFailed", {
          bookId: reader.book.id,
          chapterId: reader.chapter.id,
          passageId: `${reader.chapter.id}:unavailable-passage`,
          sentenceId: sentence.id,
          reason: "Narration needs attention. Please try again."
        })
      );
    }
  };

  const startPlayback = (sentenceId: string) => {
    const interruptedSentenceId = activeSentenceId;
    const reader = options.currentReader();
    lastSentenceId = sentenceId;
    activeSentenceId = sentenceId;
    void (async () => {
      if (interruptedSentenceId != null) {
        await publish(
          createDomainEvent("NarrationPlaybackInterrupted", {
            bookId: reader.book.id,
            chapterId: reader.chapter.id,
            sentenceId: interruptedSentenceId,
            passageId: null
          })
        );
      }
      await publish(
        createDomainEvent("NarrationPlaybackRequested", {
          bookId: reader.book.id,
          chapterId: reader.chapter.id,
          sentenceId,
          voiceId: options.currentSettings().voiceId
        })
      );
    })();
  };

  return {
    async prepare(sentenceId) {
      const reader = ensureSessionOpen();
      const sentence = reader.sentences.find((candidate) => candidate.id === sentenceId);
      if (sentence == null) return;
      try {
        await dependencies.session.prepare(sentenceId);
      } catch (error) {
        reportErrorSafely(options, error, "playback", sentenceId);
        await publish(
          createDomainEvent("NarrationPlaybackFailed", {
            bookId: reader.book.id,
            chapterId: reader.chapter.id,
            passageId: null,
            sentenceId,
            reason: "Narration needs attention. Please try again."
          })
        );
      }
    },
    readiness() {
      return currentReadiness;
    },
    start(sentenceId) {
      startPlayback(sentenceId);
    },
    pause() {
      return dependencies.session.pause();
    },
    resume() {
      if (lastSentenceId != null) startPlayback(lastSentenceId);
    },
    async stop() {
      const reader = options.currentReader();
      const interruptedSentenceId = activeSentenceId;
      activeSentenceId = null;
      if (interruptedSentenceId != null) {
        await publish(
          createDomainEvent("NarrationPlaybackInterrupted", {
            bookId: reader.book.id,
            chapterId: reader.chapter.id,
            sentenceId: interruptedSentenceId,
            passageId: null
          })
        );
      }
      await publish(
        createDomainEvent("NarrationResetRequested", {
          bookId: reader.book.id,
          chapterId: reader.chapter.id
        })
      );
    },
    setOutput(settings) {
      dependencies.session.setOutput(settings);
    },
    prepareUpcoming(input) {
      dependencies.prefetchWorkflow.request(input);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect() {
      const stopPrefetch = dependencies.prefetchWorkflow.start();
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("NarrationPlaybackRequested", () => {
          options.projectNotice(null);
        }),
        dependencies.eventDispatcher.subscribe(
          "NarrationPlaybackRequested",
          handlePlaybackRequested
        ),
        dependencies.eventDispatcher.subscribe("NarrationPreparationStarted", (event) => {
          const reader = options.currentReader();
          if (
            reader.book.id === event.payload.bookId &&
            reader.chapter.id === event.payload.chapterId
          ) {
            currentReadiness = "preparing";
            options.projectPreparing(true);
          }
        }),
        dependencies.eventDispatcher.subscribe("PassageNarrationReady", () => {
          currentReadiness = "ready";
          options.projectPreparing(false);
        }),
        dependencies.eventDispatcher.subscribe("NarrationSentenceEntered", (event) => {
          activeSentenceId = event.payload.sentenceId;
          options.projectPreparing(false);
          options.projectAudible(true);
          options.projectPlayback(event);
        }),
        dependencies.eventDispatcher.subscribe("PassageNarrationPlaybackEnded", () => {
          options.projectPreparing(false);
          options.projectAudible(false);
        }),
        dependencies.eventDispatcher.subscribe("NarrationPlaybackPaused", (event) => {
          if (activeSentenceId === event.payload.sentenceId) activeSentenceId = null;
          options.projectPreparing(false);
          options.projectAudible(false);
          options.projectPlayback(event);
        }),
        dependencies.eventDispatcher.subscribe("NarrationPlaybackEnded", (event) => {
          if (activeSentenceId === event.payload.lastSentenceId) activeSentenceId = null;
          options.projectPreparing(false);
          options.projectAudible(false);
          options.projectPlayback(event);
        }),
        dependencies.eventDispatcher.subscribe("NarrationPlaybackFailed", (event) => {
          if (activeSentenceId === event.payload.sentenceId) activeSentenceId = null;
          currentReadiness = "needs-attention";
          options.projectPreparing(false);
          options.projectAudible(false);
          options.projectPlayback(event);
        }),
        dependencies.eventDispatcher.subscribe("NarrationPlaybackInterrupted", (event) => {
          if (activeSentenceId === event.payload.sentenceId) activeSentenceId = null;
          options.projectPreparing(false);
          options.projectAudible(false);
          options.projectPlayback(event);
        }),
        ...gatewayEventNames.map((name) =>
          dependencies.eventDispatcher.subscribe(name, (event) => {
            listeners.forEach((listener) => listener(event as NarrationGatewayEvent));
          })
        ),
        dependencies.eventDispatcher.subscribe("NarrationResetRequested", () => {
          dependencies.prefetchWorkflow.reset();
        }),
        dependencies.eventDispatcher.subscribe("NarrationResetRequested", () => {
          dependencies.session.close();
          openSessionKey = null;
          currentReadiness = "idle";
        }),
        dependencies.eventDispatcher.subscribe("NarrationResetRequested", () => {
          options.projectAudible(false);
        }),
        dependencies.eventDispatcher.subscribe("NarrationResetRequested", () => {
          options.projectPreparing(false);
        }),
        dependencies.eventDispatcher.subscribe("UpcomingNarrationPreparationFailed", (event) => {
          reportErrorSafely(
            options,
            event.payload.reason,
            "prefetch",
            `${event.payload.nextChapterId}:sentence-1`
          );
        })
      ];

      return () => {
        dependencies.session.close();
        stopPrefetch();
        subscriptions.forEach((unsubscribe) => unsubscribe());
      };
    }
  };
}

const gatewayEventNames = [
  "NarrationPreparationStarted",
  "PassageNarrationReady",
  "NarrationSentenceEntered",
  "NarrationPlaybackPaused",
  "NarrationPlaybackEnded",
  "NarrationPlaybackFailed",
  "NarrationPlaybackInterrupted"
] as const;

function reportErrorSafely(
  options: DesktopNarrationGatewayOptions,
  error: unknown,
  stage: "playback" | "prefetch",
  sentenceId: string
) {
  try {
    options.reportError(error, stage, sentenceId);
  } catch {
    // Development diagnostics must not alter reader behavior.
  }
}
