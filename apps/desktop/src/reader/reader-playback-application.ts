import type { AudioSettings } from "@sonelle/audio";
import type { NarrationGateway } from "@sonelle/audio/narration";
import type { DomainEvent, DomainEventDispatcher } from "@sonelle/domain";
import {
  createReadingPositionScheduler,
  movePlayback,
  pausePlayback,
  playPlayback,
  projectNarrationEventToPlayback,
  selectPlaybackSentence,
  type MediaSessionGateway,
  type MediaSessionIntent,
  type MediaSessionSnapshot,
  type NarrationPlaybackProjectionEvent,
  type PlaybackStatus,
  type ReaderPlaybackState
} from "@sonelle/reader";
import type { ReadingPositionStore, SaveReadingPositionInput } from "../library/library-contracts";
import { nextReaderChapter } from "./reader-chapter-flow";
import type { ReaderView } from "./reader-view";

type PositionSaveIntent = "immediate" | "playback";

interface ReaderPlaybackApplicationDependencies {
  narration: NarrationGateway;
  mediaSession: MediaSessionGateway;
  eventDispatcher: DomainEventDispatcher;
  positions: ReadingPositionStore;
  preparesAcrossChapters: boolean;
  reportEventError(error: unknown): void;
  reportPlaybackError(
    event: Extract<NarrationPlaybackProjectionEvent, { name: "NarrationPlaybackFailed" }>
  ): void;
}

interface ReaderPlaybackApplicationOptions {
  currentReader(): ReaderView;
  currentPlayback(): ReaderPlaybackState;
  currentSettings(): AudioSettings;
  narrationAudible(): boolean;
  narrationReadinessMessage(): string | null;
  allowsChapterTransition(): boolean;
  projectPlayback(update: (current: ReaderPlaybackState) => ReaderPlaybackState): void;
  projectNotice(message: string | null): void;
  projectAudible(audible: boolean): void;
  projectPreparing(preparing: boolean): void;
  projectJump(update: (current: ReaderPlaybackState) => ReaderPlaybackState): void;
  projectReaderActivation(reader: ReaderView, playback: ReaderPlaybackState): void;
  clearSentenceElements(): void;
  advanceChapter(reader: ReaderView, nextChapterId: string): Promise<void>;
  reportPositionError(): void;
}

export interface ReaderPlaybackApplication {
  start(): () => void;
  playbackChanged(): () => void;
  autoAdvanceChanged(): void;
  prefetchChanged(): void;
  positionChanged(): void;
  toggle(): void;
  move(direction: -1 | 1): void;
  select(sentenceIndex: number): void;
  activate(
    reader: ReaderView,
    sentenceIndex?: number,
    playbackStatus?: PlaybackStatus
  ): Promise<void>;
  projectNarration(event: NarrationPlaybackProjectionEvent): void;
  stop(): Promise<void>;
  jumpStatus(): PlaybackStatus;
  dispose(): void;
}

export function createReaderPlaybackApplication(
  dependencies: ReaderPlaybackApplicationDependencies,
  options: ReaderPlaybackApplicationOptions
): ReaderPlaybackApplication {
  let positionSaveSettled = Promise.resolve();
  const positionScheduler = createReadingPositionScheduler<SaveReadingPositionInput>({
    delayMs: 2_500,
    save(position) {
      positionSaveSettled = positionSaveSettled
        .then(() => dependencies.positions.save(position))
        .catch(() => options.reportPositionError());
      return positionSaveSettled;
    }
  });
  let nextPositionSaveIntent: PositionSaveIntent | null = null;
  let sessionProjectedPlaybackChange = false;
  let jumpRun = 0;
  let chapterTransitionRun = 0;
  let chapterTransitionTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeAfterInterruption = false;
  let narrationControlRun = 0;
  let pendingNarrationControls = 0;
  let narrationControlSettled = Promise.resolve();

  const settleNarrationControl = (control: () => Promise<void>): Promise<void> => {
    narrationControlRun += 1;
    pendingNarrationControls += 1;
    narrationControlSettled = narrationControlSettled
      .then(control)
      .catch(dependencies.reportEventError)
      .finally(() => {
        pendingNarrationControls -= 1;
      });
    return narrationControlSettled;
  };

  const startNarration = (sentenceId: string) => {
    const run = ++narrationControlRun;
    if (pendingNarrationControls === 0) {
      dependencies.narration.start(sentenceId);
      return;
    }
    void narrationControlSettled.then(() => {
      if (run === narrationControlRun) dependencies.narration.start(sentenceId);
    });
  };

  const pauseNarration = () => {
    void settleNarrationControl(() => dependencies.narration.pause());
  };

  const cancelChapterTransition = () => {
    chapterTransitionRun += 1;
    if (chapterTransitionTimer != null) {
      clearTimeout(chapterTransitionTimer);
      chapterTransitionTimer = undefined;
    }
  };

  const stopPlaybackNow = () => {
    sessionProjectedPlaybackChange = false;
    options.projectAudible(false);
    cancelChapterTransition();
    pauseNarration();
  };

  const pausePlaybackNow = () => {
    if (options.currentPlayback().status !== "playing" && !options.narrationAudible()) return;
    stopPlaybackNow();
    options.projectPlayback(pausePlayback);
  };

  const requestPlayback = () => {
    const readinessMessage = options.narrationReadinessMessage();
    if (readinessMessage != null) {
      stopPlaybackNow();
      options.projectPlayback(pausePlayback);
      options.projectNotice(readinessMessage);
      return;
    }
    if (options.currentPlayback().status === "playing" || options.narrationAudible()) return;
    options.projectPlayback((current) =>
      playPlayback(current, options.currentReader().sentences.length)
    );
  };

  const commitJump = (resolve: (current: ReaderPlaybackState) => ReaderPlaybackState) => {
    const current = options.currentPlayback();
    const next = resolve(current);
    if (
      next.activeSentenceIndex === current.activeSentenceIndex &&
      next.status === current.status
    ) {
      return;
    }

    const reader = options.currentReader();
    const sentence = reader.sentences[next.activeSentenceIndex];
    const shouldResume = current.status === "playing" || options.narrationAudible();
    const run = ++jumpRun;
    nextPositionSaveIntent = "immediate";
    sessionProjectedPlaybackChange = true;
    options.projectAudible(false);
    options.projectJump(() => (shouldResume ? { ...next, status: "playing" } : next));
    void dependencies.narration
      .stop()
      .then(() => {
        const activeReader = options.currentReader();
        const activePlayback = options.currentPlayback();
        if (
          run !== jumpRun ||
          !shouldResume ||
          sentence == null ||
          activeReader.book.id !== reader.book.id ||
          activeReader.chapter.id !== reader.chapter.id ||
          activeReader.sentences[activePlayback.activeSentenceIndex]?.id !== sentence.id ||
          activePlayback.status !== "playing"
        ) {
          return;
        }
        dependencies.narration.start(sentence.id);
      })
      .catch(dependencies.reportEventError);
  };

  const isUserVoiceChange = (event: DomainEvent<"NarrationSettingsChanged">) =>
    event.payload.source === "user" &&
    event.payload.previousVoiceId !== event.payload.settings.voiceId;

  const handleMediaSessionIntent = (intent: MediaSessionIntent) => {
    switch (intent.type) {
      case "play":
        resumeAfterInterruption = false;
        requestPlayback();
        return;
      case "pause":
        resumeAfterInterruption = false;
        pausePlaybackNow();
        return;
      case "stop":
        resumeAfterInterruption = false;
        cancelChapterTransition();
        void settleNarrationControl(() => dependencies.narration.stop());
        options.projectAudible(false);
        options.projectPlayback(pausePlayback);
        return;
      case "seek":
        commitJump((current) =>
          movePlayback(current, options.currentReader().sentences.length, intent.sentenceOffset)
        );
        return;
      case "interruption-started":
        resumeAfterInterruption =
          options.currentPlayback().status === "playing" || options.narrationAudible();
        pausePlaybackNow();
        return;
      case "interruption-ended": {
        const shouldResume = resumeAfterInterruption && intent.mayResume;
        resumeAfterInterruption = false;
        if (shouldResume) requestPlayback();
        return;
      }
      case "output-disconnected":
        resumeAfterInterruption = false;
        pausePlaybackNow();
    }
  };

  return {
    start() {
      const subscriptions = [
        dependencies.mediaSession.subscribe(handleMediaSessionIntent),
        dependencies.eventDispatcher.subscribe("ReaderClosed", () => {
          resumeAfterInterruption = false;
          dependencies.mediaSession.clear();
        }),
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          if (isUserVoiceChange(event))
            void settleNarrationControl(() => dependencies.narration.stop());
        }),
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          if (isUserVoiceChange(event)) options.projectNotice(null);
        }),
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          if (isUserVoiceChange(event)) options.projectAudible(false);
        }),
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          if (isUserVoiceChange(event)) options.projectPlayback(pausePlayback);
        })
      ];
      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    playbackChanged() {
      const playback = options.currentPlayback();
      const reader = options.currentReader();
      const sentence = reader.sentences[playback.activeSentenceIndex];
      dependencies.mediaSession.publish(mediaSessionSnapshot(reader, playback));
      const ignoreSessionProjection = sessionProjectedPlaybackChange;
      sessionProjectedPlaybackChange = false;
      if (ignoreSessionProjection || playback.status !== "playing" || sentence == null) {
        return () => undefined;
      }

      startNarration(sentence.id);
      return () => {
        if (!sessionProjectedPlaybackChange) pauseNarration();
      };
    },
    autoAdvanceChanged() {
      cancelChapterTransition();
      const playback = options.currentPlayback();
      const reader = options.currentReader();
      const nextChapter = nextReaderChapter(reader.chapters, reader.chapter.id);
      if (
        playback.status !== "ended" ||
        !options.currentSettings().autoAdvance ||
        !options.allowsChapterTransition() ||
        nextChapter == null
      ) {
        return;
      }

      const runId = chapterTransitionRun;
      chapterTransitionTimer = setTimeout(() => {
        chapterTransitionTimer = undefined;
        if (runId !== chapterTransitionRun) return;
        const current = options.currentReader();
        if (current.book.id !== reader.book.id || current.chapter.id !== reader.chapter.id) return;
        void options.advanceChapter(reader, nextChapter.id);
      }, 5_000);
    },
    prefetchChanged() {
      const playback = options.currentPlayback();
      const reader = options.currentReader();
      const settings = options.currentSettings();
      if (
        playback.status !== "playing" ||
        !settings.autoAdvance ||
        reader.source !== "library" ||
        !dependencies.preparesAcrossChapters
      ) {
        return;
      }

      const nextChapter = nextReaderChapter(reader.chapters, reader.chapter.id);
      if (nextChapter == null || nextChapter.sentenceCount <= 0) return;
      dependencies.narration.prepareUpcoming({
        bookId: reader.book.id,
        chapterId: reader.chapter.id,
        nextChapterId: nextChapter.id,
        voiceId: settings.voiceId
      });
    },
    positionChanged() {
      const reader = options.currentReader();
      const playback = options.currentPlayback();
      const sentence = reader.sentences[playback.activeSentenceIndex];
      const saveIntent = nextPositionSaveIntent;
      nextPositionSaveIntent = null;
      if (reader.source !== "library" || sentence == null) {
        if (reader.source !== "library") positionScheduler.flush();
        return;
      }

      const position = {
        bookId: reader.book.id,
        chapterId: reader.chapter.id,
        sentenceIndex: sentence.index
      };
      if (saveIntent === "immediate" || playback.status !== "playing") {
        positionScheduler.saveNow(position);
      } else {
        positionScheduler.schedulePlaybackSave(position);
      }
    },
    toggle() {
      if (options.currentPlayback().status === "playing" || options.narrationAudible()) {
        pausePlaybackNow();
        return;
      }
      requestPlayback();
    },
    move(direction) {
      commitJump((current) =>
        movePlayback(current, options.currentReader().sentences.length, direction)
      );
    },
    select(sentenceIndex) {
      commitJump((current) =>
        selectPlaybackSentence(current, options.currentReader().sentences.length, sentenceIndex)
      );
    },
    async activate(
      nextReader,
      sentenceIndex = nextReader.initialSentenceIndex,
      playbackStatus = "idle"
    ) {
      positionScheduler.flush();
      await positionSaveSettled;
      nextPositionSaveIntent = "immediate";
      options.clearSentenceElements();
      await dependencies.narration.stop().catch(dependencies.reportEventError);
      options.projectReaderActivation(
        nextReader,
        selectPlaybackSentence(
          { activeSentenceIndex: sentenceIndex, status: playbackStatus },
          nextReader.sentences.length,
          sentenceIndex
        )
      );
    },
    projectNarration(event) {
      const reader = options.currentReader();
      if (
        reader.book.id !== event.payload.bookId ||
        reader.chapter.id !== event.payload.chapterId
      ) {
        return;
      }
      nextPositionSaveIntent = event.name === "NarrationSentenceEntered" ? "playback" : "immediate";
      options.projectPreparing(false);
      options.projectAudible(event.name === "NarrationSentenceEntered");
      sessionProjectedPlaybackChange = true;
      options.projectPlayback((current) =>
        projectNarrationEventToPlayback(
          current,
          reader.sentences.map((sentence) => sentence.id),
          event
        )
      );
      if (event.name === "NarrationPlaybackFailed") {
        options.projectNotice(event.payload.reason);
        dependencies.reportPlaybackError(event);
      }
    },
    async stop() {
      cancelChapterTransition();
      positionScheduler.flush();
      const pauseSettled = settleNarrationControl(async () => {
        await positionSaveSettled;
        await dependencies.narration.pause();
      });
      options.projectAudible(false);
      options.projectPlayback(pausePlayback);
      await pauseSettled;
    },
    jumpStatus() {
      const status = options.currentPlayback().status;
      return status === "ended" ? "paused" : status;
    },
    dispose() {
      narrationControlRun += 1;
      cancelChapterTransition();
      positionScheduler.flush();
      dependencies.mediaSession.clear();
    }
  };
}

function mediaSessionSnapshot(
  reader: ReaderView,
  playback: ReaderPlaybackState
): MediaSessionSnapshot {
  const sentence = reader.sentences[playback.activeSentenceIndex] ?? null;
  return {
    book: {
      id: reader.book.id,
      title: reader.book.title,
      author: reader.book.author,
      coverImageSrc: reader.book.coverImageSrc
    },
    chapter: {
      id: reader.chapter.id,
      title: reader.chapter.title
    },
    activeSentence:
      sentence == null
        ? null
        : {
            id: sentence.id,
            index: sentence.index,
            count: reader.sentences.length
          },
    playbackStatus: playback.status
  };
}
