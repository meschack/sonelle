import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioSettingsRepository } from "./audio-settings-repository";

describe("audio settings repository", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads legacy settings and writes the versioned replacement without deleting the legacy copy", () => {
    const stored = new Map<string, string>([
      [
        "sonelle.audio.settings.v1",
        JSON.stringify({
          playbackRate: 1,
          volume: 0.7,
          autoAdvance: false,
          voiceId: "fr_FR-siwis-medium"
        })
      ]
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });

    const repository = createAudioSettingsRepository();
    const settings = repository.load();
    repository.save(settings);

    expect(settings.voicePreferences).toEqual({ fr: "fr_FR-siwis-medium" });
    expect(JSON.parse(stored.get("sonelle.audio.settings.v2") ?? "{}")).toMatchObject({
      schemaVersion: 2,
      voiceId: "fr_FR-siwis-medium"
    });
    expect(stored.has("sonelle.audio.settings.v1")).toBe(true);
  });

  it("keeps narration profiles isolated by book with the global profile as fallback", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const repository = createAudioSettingsRepository();
    const defaults = repository.load();
    repository.save({ ...defaults, playbackRate: 1.25 }, "book-one");
    repository.save({ ...defaults, playbackRate: 0.75 }, "book-two");

    expect(repository.load("book-one").playbackRate).toBe(1.25);
    expect(repository.load("book-two").playbackRate).toBe(0.75);
    expect(repository.load("unseen-book")).toEqual(defaults);
  });
});
