import {
  parseReaderPreferences,
  serializeReaderPreferences,
  type ReaderPreferences
} from "@sonelle/reader";

const readerPreferencesStorageKey = "sonelle.reader.preferences.v1";

export interface ReaderPreferencesRepository {
  load(): ReaderPreferences;
  save(preferences: ReaderPreferences): void;
}

export function createReaderPreferencesRepository(): ReaderPreferencesRepository {
  return {
    load() {
      if (typeof localStorage === "undefined") return parseReaderPreferences(null);
      return parseReaderPreferences(localStorage.getItem(readerPreferencesStorageKey));
    },

    save(preferences) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(readerPreferencesStorageKey, serializeReaderPreferences(preferences));
    }
  };
}
