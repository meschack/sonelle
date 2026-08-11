import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AUDIO_SETTINGS } from "@sonelle/audio";
import type { NarrationGateway } from "@sonelle/audio/narration";
import { createDomainEvent, createDomainEventDispatcher } from "@sonelle/domain";
import { createPlaybackState, type ReaderPlaybackState } from "@sonelle/reader";
import { FakeMediaSessionGateway } from "@sonelle/reader/testing";
import type { SaveReadingPositionInput } from "../library/library-contracts";
import {
  createReaderPlaybackApplication,
  type ReaderPlaybackApplication
} from "./reader-playback-application";
import { buildFixtureReaderView, type ReaderView } from "./reader-view";

afterEach(() => vi.useRealTimers());

describe("reader playback application", () => {
  it("coordinates jumps, persisted position, and narration projections through its interface", async () => {
    const harness = createHarness();

    harness.application.select(1);
    harness.application.positionChanged();
    await vi.waitFor(() => expect(harness.savePosition).toHaveBeenCalledOnce());
    harness.application.projectNarration(
      createDomainEvent("NarrationSentenceEntered", {
        bookId: harness.reader().book.id,
        chapterId: harness.reader().chapter.id,
        sentenceId: harness.reader().sentences[1].id,
        passageId: "passage-1"
      })
    );

    expect(harness.reset).toHaveBeenCalledOnce();
    expect(harness.playback().activeSentenceIndex).toBe(1);
    expect(harness.playback().status).toBe("playing");
    expect(harness.audible()).toBe(true);
    expect(harness.savePosition).toHaveBeenCalledWith({
      bookId: harness.reader().book.id,
      chapterId: harness.reader().chapter.id,
      sentenceIndex: 1
    });
    harness.application.dispose();
  });

  it("publishes the active book and playback state to the platform session", () => {
    const harness = createHarness();
    harness.setPlayback({ activeSentenceIndex: 1, status: "playing" });

    harness.application.playbackChanged();

    expect(harness.mediaSession.published[harness.mediaSession.published.length - 1]).toEqual({
      book: {
        id: harness.reader().book.id,
        title: harness.reader().book.title,
        author: harness.reader().book.author,
        coverImageSrc: harness.reader().book.coverImageSrc
      },
      chapter: {
        id: harness.reader().chapter.id,
        title: harness.reader().chapter.title
      },
      activeSentence: {
        id: harness.reader().sentences[1].id,
        index: 1,
        count: harness.reader().sentences.length
      },
      playbackStatus: "playing"
    });
    harness.application.dispose();
  });

  it("accepts play, pause, stop, and headset seek intents through the platform session", async () => {
    const harness = createHarness();
    const disconnect = harness.application.start();

    harness.mediaSession.play("headset");
    expect(harness.playback().status).toBe("playing");
    harness.application.playbackChanged();
    expect(harness.requestPlayback).toHaveBeenCalledWith(harness.reader().sentences[0].id);

    harness.mediaSession.seek(1, "headset");
    await vi.waitFor(() => expect(harness.playback().activeSentenceIndex).toBe(1));
    await vi.waitFor(() =>
      expect(harness.requestPlayback).toHaveBeenLastCalledWith(harness.reader().sentences[1].id)
    );

    harness.mediaSession.pause("headset");
    expect(harness.playback().status).toBe("paused");
    await vi.waitFor(() => expect(harness.pause).toHaveBeenCalled());

    harness.mediaSession.play();
    harness.mediaSession.stop();
    expect(harness.playback().status).toBe("paused");
    expect(harness.reset).toHaveBeenCalled();
    disconnect();
    harness.application.dispose();
  });

  it("pauses once without advancing or auto-resuming when the active output disconnects", async () => {
    const harness = createHarness();
    const disconnect = harness.application.start();
    harness.setPlayback({ activeSentenceIndex: 1, status: "playing" });

    harness.mediaSession.disconnectOutput();
    harness.mediaSession.disconnectOutput();

    expect(harness.playback()).toEqual({ activeSentenceIndex: 1, status: "paused" });
    await vi.waitFor(() => expect(harness.pause).toHaveBeenCalledOnce());

    harness.mediaSession.endInterruption(true);
    expect(harness.playback()).toEqual({ activeSentenceIndex: 1, status: "paused" });
    expect(harness.requestPlayback).not.toHaveBeenCalled();

    disconnect();
    harness.application.dispose();
  });

  it("waits for an in-flight pause before resuming narration", async () => {
    let finishPause: (() => void) | undefined;
    const harness = createHarness({
      pause: () =>
        new Promise<void>((resolve) => {
          finishPause = resolve;
        })
    });
    harness.setPlayback({ activeSentenceIndex: 1, status: "playing" });

    harness.application.toggle();
    await vi.waitFor(() => expect(harness.pause).toHaveBeenCalledOnce());
    harness.application.toggle();
    harness.application.playbackChanged();

    expect(harness.playback()).toEqual({ activeSentenceIndex: 1, status: "playing" });
    expect(harness.requestPlayback).not.toHaveBeenCalled();

    finishPause?.();
    await vi.waitFor(() =>
      expect(harness.requestPlayback).toHaveBeenCalledWith(harness.reader().sentences[1].id)
    );
    harness.application.dispose();
  });

  it("suppresses a queued resume when the newest rapid control intent is pause", async () => {
    const pauseResolvers: Array<() => void> = [];
    const harness = createHarness({
      pause: () =>
        new Promise<void>((resolve) => {
          pauseResolvers.push(resolve);
        })
    });
    harness.setPlayback({ activeSentenceIndex: 1, status: "playing" });

    harness.application.toggle();
    await vi.waitFor(() => expect(harness.pause).toHaveBeenCalledOnce());
    harness.application.toggle();
    harness.application.playbackChanged();
    harness.application.toggle();

    expect(harness.playback()).toEqual({ activeSentenceIndex: 1, status: "paused" });
    pauseResolvers.shift()?.();
    await vi.waitFor(() => expect(pauseResolvers).toHaveLength(1));
    pauseResolvers.shift()?.();
    await Promise.resolve();

    expect(harness.requestPlayback).not.toHaveBeenCalled();
    expect(harness.playback()).toEqual({ activeSentenceIndex: 1, status: "paused" });
    harness.application.dispose();
  });

  it("clears playback immediately and orders resume behind an explicit stop", async () => {
    let finishPause: (() => void) | undefined;
    const harness = createHarness({
      pause: () =>
        new Promise<void>((resolve) => {
          finishPause = resolve;
        })
    });
    harness.setPlayback({ activeSentenceIndex: 2, status: "playing" });

    const stopping = harness.application.stop();
    expect(harness.playback()).toEqual({ activeSentenceIndex: 2, status: "paused" });
    await vi.waitFor(() => expect(harness.pause).toHaveBeenCalledOnce());

    harness.application.toggle();
    harness.application.playbackChanged();
    expect(harness.requestPlayback).not.toHaveBeenCalled();

    finishPause?.();
    await stopping;
    await vi.waitFor(() =>
      expect(harness.requestPlayback).toHaveBeenCalledWith(harness.reader().sentences[2].id)
    );
    harness.application.dispose();
  });

  it("resumes only when the platform permits an interrupted session to continue", () => {
    const harness = createHarness();
    const disconnect = harness.application.start();
    harness.setPlayback({ activeSentenceIndex: 1, status: "playing" });

    harness.mediaSession.startInterruption();
    expect(harness.playback().status).toBe("paused");
    harness.mediaSession.endInterruption(true);
    expect(harness.playback().status).toBe("playing");

    harness.mediaSession.startInterruption();
    harness.mediaSession.endInterruption(false);
    expect(harness.playback().status).toBe("paused");
    disconnect();
    harness.application.dispose();
  });

  it("clears platform state when the reader closes and when playback is disposed", async () => {
    const harness = createHarness();
    const disconnect = harness.application.start();

    await harness.dispatcher.dispatch(
      createDomainEvent("ReaderClosed", {
        bookId: harness.reader().book.id,
        chapterId: harness.reader().chapter.id,
        sentenceId: harness.reader().sentences[0].id
      })
    );
    expect(harness.mediaSession.clearCount).toBe(1);

    disconnect();
    harness.application.dispose();
    expect(harness.mediaSession.clearCount).toBe(2);
  });

  it("resumes narration at the selected sentence after a jump while playing", async () => {
    let finishReset: (() => void) | undefined;
    const harness = createHarness({
      reset: () =>
        new Promise<void>((resolve) => {
          finishReset = resolve;
        })
    });
    harness.setPlayback({ activeSentenceIndex: 2, status: "playing" });

    harness.application.move(-1);
    harness.application.playbackChanged();

    expect(harness.playback()).toEqual({ activeSentenceIndex: 1, status: "playing" });
    expect(harness.requestPlayback).not.toHaveBeenCalled();

    finishReset?.();
    await vi.waitFor(() =>
      expect(harness.requestPlayback).toHaveBeenCalledWith(harness.reader().sentences[1].id)
    );
    harness.application.dispose();
  });

  it("does not interrupt narration when a movement key cannot move any farther", () => {
    const harness = createHarness();
    harness.setPlayback({ activeSentenceIndex: 0, status: "playing" });

    harness.application.move(-1);

    expect(harness.reset).not.toHaveBeenCalled();
    expect(harness.playback()).toEqual({ activeSentenceIndex: 0, status: "playing" });
    harness.application.dispose();
  });

  it("bounds automatic chapter handoff and cancels it when playback changes", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.setPlayback({ activeSentenceIndex: 0, status: "ended" });

    harness.application.autoAdvanceChanged();
    harness.setPlayback({ activeSentenceIndex: 0, status: "paused" });
    harness.application.autoAdvanceChanged();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.advanceChapter).not.toHaveBeenCalled();

    harness.setPlayback({ activeSentenceIndex: 0, status: "ended" });
    harness.application.autoAdvanceChanged();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.advanceChapter).toHaveBeenCalledOnce();
    harness.application.dispose();
  });

  it("does not hand off chapters when the active session limit blocks it", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ allowsChapterTransition: () => false });
    harness.setPlayback({ activeSentenceIndex: 0, status: "ended" });

    harness.application.autoAdvanceChanged();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(harness.advanceChapter).not.toHaveBeenCalled();
    harness.application.dispose();
  });

  it("resets old narration before continuing an automatic chapter handoff", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ reactToReaderActivation: true });
    const nextReader: ReaderView = {
      ...buildFixtureReaderView({ chapterId: "chapter-2" }),
      source: "library"
    };
    harness.advanceChapter.mockImplementation(async () => {
      await harness.application.activate(nextReader, 0, "playing");
    });
    harness.setPlayback({ activeSentenceIndex: 0, status: "ended" });

    harness.application.autoAdvanceChanged();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(harness.advanceChapter).toHaveBeenCalledOnce();
    expect(harness.requestPlayback).toHaveBeenCalledWith(nextReader.sentences[0].id);
    expect(harness.operations).toEqual(["reset", `play:${nextReader.sentences[0].id}`]);
    harness.application.dispose();
  });

  it("reacts to a user voice change without duplicating book-activation resets", async () => {
    const harness = createHarness();
    const stop = harness.application.start();
    harness.setPlayback({ activeSentenceIndex: 0, status: "playing" });

    await harness.dispatcher.dispatch(
      createDomainEvent("NarrationSettingsChanged", {
        bookId: "book-1",
        previousVoiceId: "kokoro:af-heart",
        source: "user",
        settings: { ...DEFAULT_AUDIO_SETTINGS, voiceId: "kokoro:bf-emma" }
      })
    );
    expect(harness.reset).toHaveBeenCalledOnce();
    expect(harness.playback().status).toBe("paused");

    await harness.dispatcher.dispatch(
      createDomainEvent("NarrationSettingsChanged", {
        bookId: "book-1",
        previousVoiceId: "kokoro:bf-emma",
        source: "book",
        settings: { ...DEFAULT_AUDIO_SETTINGS, voiceId: "supertonic:F1" }
      })
    );
    expect(harness.reset).toHaveBeenCalledOnce();
    stop();
    harness.application.dispose();
  });

  it("flushes and awaits the latest reading position before stopping", async () => {
    let finishSave: (() => void) | undefined;
    const savePosition = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    const harness = createHarness({ savePosition });
    harness.setPlayback({ activeSentenceIndex: 2, status: "playing" });
    harness.application.positionChanged();

    const stopping = harness.application.stop();
    await vi.waitFor(() => expect(savePosition).toHaveBeenCalledOnce());
    expect(harness.pause).not.toHaveBeenCalled();

    finishSave?.();
    await stopping;
    expect(harness.pause).toHaveBeenCalledOnce();
    harness.application.dispose();
  });
});

function createHarness(
  options: {
    reactToReaderActivation?: boolean;
    savePosition?: (position: SaveReadingPositionInput) => Promise<void>;
    allowsChapterTransition?: () => boolean;
    reset?: () => Promise<void>;
    pause?: () => Promise<void>;
  } = {}
) {
  let currentReader: ReaderView = { ...buildFixtureReaderView(), source: "library" };
  let currentPlayback = createPlaybackState();
  let currentSettings = DEFAULT_AUDIO_SETTINGS;
  let currentAudible = false;
  const operations: string[] = [];
  const savePosition = vi.fn(options.savePosition ?? (() => Promise.resolve()));
  const reset = vi.fn(async () => {
    operations.push("reset");
    await options.reset?.();
  });
  const advanceChapter = vi.fn().mockResolvedValue(undefined);
  const dispatcher = createDomainEventDispatcher();
  const mediaSession = new FakeMediaSessionGateway();
  const narration = {
    prepare: vi.fn().mockResolvedValue(undefined),
    readiness: vi.fn(() => "ready" as const),
    start: vi.fn((sentenceId: string) => void operations.push(`play:${sentenceId}`)),
    pause: vi.fn(options.pause ?? (() => Promise.resolve())),
    resume: vi.fn(),
    setOutput: vi.fn(),
    prepareUpcoming: vi.fn(),
    stop: reset,
    subscribe: vi.fn(() => () => undefined),
    connect: vi.fn(() => () => undefined)
  } satisfies NarrationGateway;
  let application!: ReaderPlaybackApplication;
  application = createReaderPlaybackApplication(
    {
      narration,
      mediaSession,
      eventDispatcher: dispatcher,
      positions: { save: savePosition },
      preparesAcrossChapters: true,
      reportEventError: vi.fn(),
      reportPlaybackError: vi.fn()
    },
    {
      currentReader: () => currentReader,
      currentPlayback: () => currentPlayback,
      currentSettings: () => currentSettings,
      narrationAudible: () => currentAudible,
      narrationReadinessMessage: () => null,
      allowsChapterTransition: options.allowsChapterTransition ?? (() => true),
      projectPlayback: (update) => {
        currentPlayback = update(currentPlayback);
      },
      projectNotice: vi.fn(),
      projectAudible: (audible) => {
        currentAudible = audible;
      },
      projectPreparing: vi.fn(),
      projectJump: (update) => {
        currentPlayback = update(currentPlayback);
      },
      projectReaderActivation: (reader, playback) => {
        currentReader = reader;
        currentPlayback = playback;
        if (options.reactToReaderActivation) application.playbackChanged();
      },
      clearSentenceElements: vi.fn(),
      advanceChapter,
      reportPositionError: vi.fn()
    }
  );

  return {
    application,
    reader: () => currentReader,
    playback: () => currentPlayback,
    audible: () => currentAudible,
    setPlayback: (playback: ReaderPlaybackState) => {
      currentPlayback = playback;
    },
    savePosition,
    pause: narration.pause,
    reset,
    requestPlayback: narration.start,
    operations,
    advanceChapter,
    dispatcher,
    mediaSession
  };
}
