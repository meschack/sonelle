import {
  createAudioSettings,
  selectNarrationVoicePreference,
  type AudioSettings
} from "@sonelle/audio";
import { createDomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type { AudioSettingsRepository } from "../audio/audio-settings-repository";
import type { ReaderNarrationWorkflow } from "./reader-narration-workflow";

interface ReaderNarrationSettingsDependencies {
  eventDispatcher: DomainEventDispatcher;
  repository: Pick<AudioSettingsRepository, "load" | "save">;
  narration: Pick<ReaderNarrationWorkflow, "setOutput">;
  activateSettings(settings: AudioSettings, language: string | null): AudioSettings;
  reportEventError(error: unknown): void;
}

interface ReaderNarrationSettingsOptions {
  currentSettings(): AudioSettings;
  currentLanguage(): string | null;
  currentBookId(): string;
  projectSettings(settings: AudioSettings): void;
}

export interface ReaderNarrationSettingsWorkflow {
  start(): () => void;
  change(settings: Partial<AudioSettings>): void;
  activate(bookId: string, language: string | null): void;
  reset(): void;
  updateVolume(volume: number): void;
  toggleMute(): void;
}

export function createReaderNarrationSettingsWorkflow(
  dependencies: ReaderNarrationSettingsDependencies,
  options: ReaderNarrationSettingsOptions
): ReaderNarrationSettingsWorkflow {
  let lastAudibleVolume =
    options.currentSettings().volume > 0 ? options.currentSettings().volume : 1.2;

  const publish = (settings: AudioSettings, source: "book" | "user", bookId: string) => {
    const previous = options.currentSettings();
    if (audioSettingsEqual(previous, settings)) return;
    void dependencies.eventDispatcher
      .dispatch(
        createDomainEvent("NarrationSettingsChanged", {
          bookId,
          previousVoiceId: previous.voiceId,
          source,
          settings
        })
      )
      .catch(dependencies.reportEventError);
  };

  const change = (nextSettings: Partial<AudioSettings>) => {
    const current = options.currentSettings();
    const next =
      nextSettings.voiceId != null && nextSettings.voiceId !== current.voiceId
        ? selectNarrationVoicePreference(
            createAudioSettings({ ...current, ...nextSettings }),
            options.currentLanguage(),
            nextSettings.voiceId
          )
        : createAudioSettings({ ...current, ...nextSettings });
    publish(next, "user", options.currentBookId());
  };

  return {
    start() {
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          if (event.payload.settings.volume > 0) {
            lastAudibleVolume = event.payload.settings.volume;
          }
          options.projectSettings(event.payload.settings);
        }),
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          dependencies.repository.save(event.payload.settings, event.payload.bookId);
        }),
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          dependencies.narration.setOutput(event.payload.settings);
        }),
        dependencies.eventDispatcher.subscribe("ReaderOpened", (event) => {
          const saved = dependencies.repository.load(event.payload.bookId);
          publish(
            dependencies.activateSettings(saved, event.payload.language),
            "book",
            event.payload.bookId
          );
        })
      ];
      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    change,
    activate(bookId, language) {
      publish(
        dependencies.activateSettings(dependencies.repository.load(bookId), language),
        "book",
        bookId
      );
    },
    reset() {
      publish(
        dependencies.activateSettings(createAudioSettings(), options.currentLanguage()),
        "user",
        options.currentBookId()
      );
    },
    updateVolume(volume) {
      if (volume > 0) lastAudibleVolume = volume;
      change({ volume });
    },
    toggleMute() {
      const volume = options.currentSettings().volume;
      change({ volume: volume > 0 ? 0 : lastAudibleVolume });
    }
  };
}

function audioSettingsEqual(left: AudioSettings, right: AudioSettings): boolean {
  return (
    left.playbackRate === right.playbackRate &&
    left.volume === right.volume &&
    left.autoAdvance === right.autoAdvance &&
    left.voiceId === right.voiceId &&
    JSON.stringify(left.voicePreferences) === JSON.stringify(right.voicePreferences)
  );
}
