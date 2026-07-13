import { describe, expect, it } from "vitest";
import {
  createNarrationPreparationAdapterForMode,
  resolveDevelopmentNarrationSessionRoutingMode
} from "./reader-dependencies";

describe("reader narration session dependency selection", () => {
  it("accepts only explicit development narration session modes", () => {
    expect(resolveDevelopmentNarrationSessionRoutingMode("legacy-piper")).toBe("legacy-piper");
    expect(resolveDevelopmentNarrationSessionRoutingMode("hybrid-v1")).toBe("hybrid-v1");
    expect(resolveDevelopmentNarrationSessionRoutingMode("")).toBeUndefined();
    expect(resolveDevelopmentNarrationSessionRoutingMode("kokoro")).toBeUndefined();
  });

  it("does not create a manifest session adapter without a selected mode", () => {
    expect(
      createNarrationPreparationAdapterForMode(undefined, fakeNarrationRepository())
    ).toBeNull();
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
