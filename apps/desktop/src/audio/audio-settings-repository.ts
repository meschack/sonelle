import { parseAudioSettings, serializeAudioSettings, type AudioSettings } from "@sonelle/audio";

const audioSettingsStorageKey = "sonelle.audio.settings.v2";
const legacyAudioSettingsStorageKey = "sonelle.audio.settings.v1";
const bookAudioSettingsStoragePrefix = "sonelle.audio.settings.book.v1.";

export interface AudioSettingsRepository {
  load(bookId?: string): AudioSettings;
  save(settings: AudioSettings, bookId?: string): void;
}

export function createAudioSettingsRepository(): AudioSettingsRepository {
  return {
    load(bookId) {
      if (typeof localStorage === "undefined") return parseAudioSettings(null);
      if (bookId != null) {
        const savedForBook = localStorage.getItem(bookAudioSettingsKey(bookId));
        if (savedForBook != null) return parseAudioSettings(savedForBook);
      }
      return parseAudioSettings(
        localStorage.getItem(audioSettingsStorageKey) ??
          localStorage.getItem(legacyAudioSettingsStorageKey)
      );
    },

    save(settings, bookId) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        bookId == null ? audioSettingsStorageKey : bookAudioSettingsKey(bookId),
        serializeAudioSettings(settings)
      );
    }
  };
}

function bookAudioSettingsKey(bookId: string): string {
  return `${bookAudioSettingsStoragePrefix}${encodeURIComponent(bookId)}`;
}
