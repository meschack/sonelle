import { describe, expect, it, vi } from "vitest";
import { createNativeManifestNarrationAdapter } from "./native-manifest-narration-adapter";
import {
  createDesktopMediaSourceGateway,
  createFakeMediaSourceGateway
} from "../platform/media-source-gateway";

describe("createNativeManifestNarrationAdapter", () => {
  it("prepares manifest narration through the native command", async () => {
    const invoke = vi.fn().mockResolvedValue({
      assetId: "kokoro-asset",
      sourceUrl: "/tmp/sonelle/audio.wav",
      sampleRate: 24_000,
      sampleCount: 48_000,
      sentences: [{ sentenceId: "sentence-1", startSample: 0, endSample: 48_000 }],
      cached: false,
      engineId: "kokoro",
      modelRevision: "kokoro-test",
      voiceId: "kokoro:af_heart",
      sourceTextDigest: "digest"
    });
    const convertLocalSource = vi.fn((path: string, protocol?: string) => `${protocol}:${path}`);
    const mediaSources = createDesktopMediaSourceGateway(convertLocalSource);
    const adapter = createNativeManifestNarrationAdapter({ invoke, mediaSources });

    const narration = await adapter.prepare({
      requestId: "request-1",
      passage: {
        id: "passage-1",
        bookId: "book-1",
        chapterId: "chapter-1",
        paragraphId: "paragraph-1",
        language: "en",
        sentences: [{ id: "sentence-1", index: 0, text: "Prepared narration is alive." }]
      },
      engineId: "kokoro",
      modelRevision: "kokoro-test",
      voiceId: "kokoro:af_heart",
      sourceTextDigest: "digest",
      synthesisParameters: { speed: 1 }
    });

    expect(invoke).toHaveBeenCalledWith("prepare_manifest_narration", {
      request: expect.objectContaining({ engineId: "kokoro" })
    });
    expect(convertLocalSource).toHaveBeenCalledWith("/tmp/sonelle/audio.wav", "asset");
    expect(narration.sourceUrl).toBe("asset:/tmp/sonelle/audio.wav");
  });

  it("does not invoke native preparation after cancellation", async () => {
    const invoke = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error("stale"));
    const adapter = createNativeManifestNarrationAdapter({ invoke });

    await expect(
      adapter.prepare(
        {
          requestId: "request-1",
          passage: {
            id: "passage-1",
            bookId: "book-1",
            chapterId: "chapter-1",
            paragraphId: "paragraph-1",
            language: "en",
            sentences: [{ id: "sentence-1", index: 0, text: "Cancelled." }]
          },
          engineId: "kokoro",
          modelRevision: "kokoro-test",
          voiceId: "kokoro:af_heart",
          sourceTextDigest: "digest"
        },
        controller.signal
      )
    ).rejects.toThrow("stale");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects prepared narration that has no usable media source", async () => {
    const invoke = vi.fn().mockResolvedValue({
      assetId: "missing-asset",
      sourceUrl: "/missing/audio.wav",
      sampleRate: 24_000,
      sampleCount: 24_000,
      sentences: [{ sentenceId: "sentence-1", startSample: 0, endSample: 24_000 }],
      cached: false,
      engineId: "kokoro",
      modelRevision: "kokoro-test",
      voiceId: "kokoro:af_heart",
      sourceTextDigest: "digest"
    });
    const mediaSources = createFakeMediaSourceGateway({
      "/missing/audio.wav": { status: "missing" }
    });

    await expect(
      createNativeManifestNarrationAdapter({ invoke, mediaSources }).prepare(request())
    ).rejects.toThrow("not available to play");
  });

  it("forwards in-flight cancellation to the native renderer", async () => {
    const pending = deferred<never>();
    const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      invocations.push({ command, args });
      if (command === "prepare_manifest_narration") return pending.promise;
      return undefined as T;
    };
    const controller = new AbortController();
    const adapter = createNativeManifestNarrationAdapter({ invoke });
    const preparation = adapter.prepare(request(), controller.signal);

    controller.abort();

    await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
    expect(invocations).toContainEqual({
      command: "cancel_manifest_narration",
      args: { requestId: "request-1" }
    });
  });
});

function request() {
  return {
    requestId: "request-1",
    passage: {
      id: "passage-1",
      bookId: "book-1",
      chapterId: "chapter-1",
      paragraphId: "paragraph-1",
      language: "en",
      sentences: [{ id: "sentence-1", index: 0, text: "Cancelled." }]
    },
    engineId: "kokoro" as const,
    modelRevision: "kokoro-test",
    voiceId: "kokoro:af-heart",
    sourceTextDigest: "digest"
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
