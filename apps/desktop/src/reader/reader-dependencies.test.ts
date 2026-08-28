import { describe, expect, it } from "vitest";
import {
  availableHybridNarrationVoicesForLanguage,
  createNarrationPreparationAdapterForMode,
  resolveDevelopmentNarrationSessionRoutingMode,
  resolveOfflineNarrationLibrary
} from "./reader-dependencies";

describe("reader narration session dependency selection", () => {
  it("offers a provider's voices only after its offline files are ready", () => {
    const readyKokoro = {
      engineId: "kokoro" as const,
      status: "ready" as const,
      modelRevision: "test",
      downloadSizeBytes: 10,
      downloadedBytes: 10,
      progress: 100,
      message: "Ready"
    };

    expect(availableHybridNarrationVoicesForLanguage("en", {})).toEqual([]);
    expect(
      availableHybridNarrationVoicesForLanguage("en", { kokoro: readyKokoro }).map(
        (voice) => voice.id
      )
    ).toEqual(["kokoro:af-heart", "kokoro:bf-emma"]);
    expect(availableHybridNarrationVoicesForLanguage("fr", { kokoro: readyKokoro })).toEqual([]);
  });

  it("accepts only explicit development narration session modes", () => {
    expect(resolveDevelopmentNarrationSessionRoutingMode("legacy-piper")).toBe("legacy-piper");
    expect(resolveDevelopmentNarrationSessionRoutingMode("hybrid-v1")).toBe("hybrid-v1");
    expect(resolveDevelopmentNarrationSessionRoutingMode("")).toBe("hybrid-v1");
    expect(resolveDevelopmentNarrationSessionRoutingMode("kokoro")).toBe("hybrid-v1");
  });

  it("keeps desktop narration packs out of the Android capability surface", () => {
    expect(resolveOfflineNarrationLibrary(true, true)).toBe("mobile-standard");
    expect(resolveOfflineNarrationLibrary(true, false)).toBe("mobile-standard");
    expect(resolveOfflineNarrationLibrary(false, true)).toBe("language-pack");
    expect(resolveOfflineNarrationLibrary(false, false)).toBe("individual-voice");
  });

  it("uses the native manifest adapter for hybrid mode inside Tauri", () => {
    const nativeAdapter = { prepare: async () => Promise.reject(new Error("unused")) };

    const adapter = createNarrationPreparationAdapterForMode(
      "hybrid-v1",
      fakeNarrationRepository(),
      {
        nativeRuntime: true,
        createNativeAdapter: () => nativeAdapter
      }
    );

    expect(adapter).toBe(nativeAdapter);
  });

  it("uses a deterministic fallback adapter for hybrid mode outside Tauri", () => {
    const fallbackAdapter = { prepare: async () => Promise.reject(new Error("unused")) };

    const adapter = createNarrationPreparationAdapterForMode(
      "hybrid-v1",
      fakeNarrationRepository(),
      {
        nativeRuntime: false,
        createBrowserFallbackAdapter: () => fallbackAdapter
      }
    );

    expect(adapter).toBe(fallbackAdapter);
  });

  it("keeps legacy mode on the Piper compatibility adapter", () => {
    const adapter = createNarrationPreparationAdapterForMode(
      "legacy-piper",
      fakeNarrationRepository()
    );

    expect(adapter?.constructor.name).toBe("PiperCompatibilityAdapter");
  });
});

function fakeNarrationRepository() {
  return {
    prepareSentenceAudio: async () => ({
      bookId: "book-1",
      chapterId: "chapter-1",
      sentenceId: "sentence-1",
      readiness: "ready" as const,
      durationSec: 1,
      sourceUrl: "data:audio/wav;base64,",
      playbackMode: "html-audio" as const,
      cached: false,
      message: null
    }),
    prefetchSentenceAudio: async () => undefined,
    playPreparedSentenceAudio: async () => undefined,
    stopPreparedSentenceAudio: async () => undefined,
    clearPrefetchedNarrations: () => undefined
  };
}
