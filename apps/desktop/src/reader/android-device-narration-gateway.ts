import type { AudioSettings } from "@sonelle/audio";
import type {
  NarrationGateway,
  NarrationGatewayEvent,
  NarrationReadiness
} from "@sonelle/audio/narration";
import { createDomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type { AndroidDeviceVoiceRepository } from "../audio/android-device-voice-repository";
import type { ReaderView } from "./reader-view";

interface AndroidDeviceNarrationDependencies {
  eventDispatcher: DomainEventDispatcher;
  repository: AndroidDeviceVoiceRepository;
}

interface AndroidDeviceNarrationOptions {
  currentReader(): ReaderView;
  currentSettings(): AudioSettings;
}

/**
 * Adapts Android's selected device voice to Sonelle's sentence lifecycle.
 * Android speech mechanics stay behind the repository; this gateway owns stale completion,
 * sentence highlighting facts, and the restart-current-sentence pause policy.
 */
export function createAndroidDeviceNarrationGateway(
  dependencies: AndroidDeviceNarrationDependencies,
  options: AndroidDeviceNarrationOptions
): NarrationGateway {
  let readiness: NarrationReadiness = "idle";
  let activeSentenceId: string | null = null;
  let lastSentenceId: string | null = null;
  let run = 0;
  const listeners = new Set<(event: NarrationGatewayEvent) => void>();

  const publish = async (event: NarrationGatewayEvent) => {
    await dependencies.eventDispatcher.dispatch(event);
    listeners.forEach((listener) => listener(event));
  };

  const passageId = (reader: ReaderView, sentenceId: string) =>
    `${reader.chapter.id}:${sentenceId}:device-voice`;

  const start = (sentenceId: string) => {
    const reader = options.currentReader();
    const sentence = reader.sentences.find((candidate) => candidate.id === sentenceId);
    if (sentence == null) return;
    const settings = options.currentSettings();
    const currentRun = ++run;
    const previousSentenceId = activeSentenceId;
    activeSentenceId = sentenceId;
    lastSentenceId = sentenceId;
    readiness = "preparing";
    const currentPassageId = passageId(reader, sentenceId);

    void (async () => {
      if (previousSentenceId != null) {
        await dependencies.repository.stop();
        await publish(
          createDomainEvent("NarrationPlaybackInterrupted", {
            bookId: reader.book.id,
            chapterId: reader.chapter.id,
            sentenceId: previousSentenceId,
            passageId: passageId(reader, previousSentenceId)
          })
        );
      }
      if (currentRun !== run) return;
      await publish(
        createDomainEvent("NarrationPreparationStarted", {
          bookId: reader.book.id,
          chapterId: reader.chapter.id,
          sentenceId,
          passageId: currentPassageId
        })
      );
      await publish(
        createDomainEvent("PassageNarrationReady", {
          bookId: reader.book.id,
          chapterId: reader.chapter.id,
          passageId: currentPassageId,
          firstSentenceId: sentenceId,
          lastSentenceId: sentenceId,
          voiceId: settings.voiceId,
          engineId: "android-device",
          source: "prepared"
        })
      );
      readiness = "ready";
      await publish(
        createDomainEvent("NarrationSentenceEntered", {
          bookId: reader.book.id,
          chapterId: reader.chapter.id,
          sentenceId,
          passageId: currentPassageId
        })
      );
      try {
        await dependencies.repository.speak({
          utteranceId: `${sentenceId}:${currentRun}`,
          text: sentence.text,
          voiceId: settings.voiceId,
          locale: reader.book.language ?? "und",
          playbackRate: settings.playbackRate,
          volume: Math.min(1, settings.volume)
        });
        if (currentRun !== run || activeSentenceId !== sentenceId) return;
        activeSentenceId = null;
        await publish(
          createDomainEvent("NarrationPlaybackEnded", {
            bookId: reader.book.id,
            chapterId: reader.chapter.id,
            passageId: currentPassageId,
            lastSentenceId: sentenceId
          })
        );
      } catch {
        if (currentRun !== run) return;
        activeSentenceId = null;
        readiness = "needs-attention";
        await publish(
          createDomainEvent("NarrationPlaybackFailed", {
            bookId: reader.book.id,
            chapterId: reader.chapter.id,
            sentenceId,
            passageId: currentPassageId,
            reason: "This device voice needs attention."
          })
        );
      }
    })();
  };

  const interrupt = async (
    eventName: "NarrationPlaybackPaused" | "NarrationPlaybackInterrupted"
  ) => {
    const reader = options.currentReader();
    const sentenceId = activeSentenceId;
    activeSentenceId = null;
    run += 1;
    await dependencies.repository.stop();
    if (sentenceId == null) return;
    const payload = {
      bookId: reader.book.id,
      chapterId: reader.chapter.id,
      sentenceId,
      passageId: passageId(reader, sentenceId)
    };
    if (eventName === "NarrationPlaybackPaused") {
      await publish(createDomainEvent("NarrationPlaybackPaused", payload));
    } else {
      await publish(createDomainEvent("NarrationPlaybackInterrupted", payload));
    }
  };

  return {
    async prepare(sentenceId) {
      const reader = options.currentReader();
      const sentence = reader.sentences.find((candidate) => candidate.id === sentenceId);
      if (sentence == null) return;
      readiness = "ready";
    },
    readiness: () => readiness,
    start,
    pause: () => interrupt("NarrationPlaybackPaused"),
    resume() {
      if (lastSentenceId != null) start(lastSentenceId);
    },
    stop: () => interrupt("NarrationPlaybackInterrupted"),
    setOutput() {},
    prepareUpcoming() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect() {
      return () => undefined;
    }
  };
}

/** Routes commands by the reader's explicit voice selection; it never falls back implicitly. */
export function routeNarrationGateway(
  sonelle: NarrationGateway,
  device: NarrationGateway,
  useDeviceVoice: () => boolean
): NarrationGateway {
  const selected = () => (useDeviceVoice() ? device : sonelle);
  return {
    prepare: (sentenceId) => selected().prepare(sentenceId),
    readiness: () => selected().readiness(),
    start: (sentenceId) => selected().start(sentenceId),
    pause: () => selected().pause(),
    resume: () => selected().resume(),
    stop: () => selected().stop(),
    setOutput(settings) {
      sonelle.setOutput(settings);
      device.setOutput(settings);
    },
    prepareUpcoming(target) {
      if (!useDeviceVoice()) sonelle.prepareUpcoming(target);
    },
    subscribe(listener) {
      const unsubscribeSonelle = sonelle.subscribe(listener);
      const unsubscribeDevice = device.subscribe(listener);
      return () => {
        unsubscribeDevice();
        unsubscribeSonelle();
      };
    },
    connect() {
      const disconnectSonelle = sonelle.connect();
      const disconnectDevice = device.connect();
      return () => {
        disconnectDevice();
        disconnectSonelle();
      };
    }
  };
}
