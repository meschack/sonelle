import { describe, expect, it, vi } from "vitest";
import type { NarrationPreparationAdapter } from "./narration-contracts";
import { prepareNarrationBook } from "./narration-book-preparation";
import type { NarrationSessionChapter } from "./narration-session";

describe("whole-book narration preparation", () => {
  it("prepares every passage in chapter order and reports sentence progress", async () => {
    const prepared: string[] = [];
    const adapter: NarrationPreparationAdapter = {
      async prepare(request) {
        prepared.push(request.passage.id);
        const sentence = request.passage.sentences[0];
        return {
          assetId: request.passage.id.replace(/:/gu, "-"),
          sourceUrl: "/audio.wav",
          sampleRate: 24_000,
          sampleCount: 24_000,
          sentences: request.passage.sentences.map((item, index) => ({
            sentenceId: item.id,
            startSample: index * 12_000,
            endSample: (index + 1) * 12_000
          })),
          cached: sentence?.id === "sentence-1",
          engineId: request.engineId,
          modelRevision: request.modelRevision,
          voiceId: request.voiceId,
          sourceTextDigest: request.sourceTextDigest
        };
      }
    };
    const progress = vi.fn();

    const result = await prepareNarrationBook(
      { adapter },
      { bookId: "book-1", chapters: [chapter("chapter-1", 0), chapter("chapter-2", 2)] },
      { onProgress: progress, createRequestId: () => `request-${prepared.length + 1}` }
    );

    expect(prepared).toEqual([
      "chapter-1:chapter-1:paragraph-1:passage-1",
      "chapter-2:chapter-2:paragraph-1:passage-1"
    ]);
    expect(result).toEqual({ completedPassageCount: 2, totalPassageCount: 2, sentenceCount: 4 });
    expect(progress).toHaveBeenLastCalledWith({
      activeChapterId: "chapter-2",
      completedChapterIds: ["chapter-1", "chapter-2"],
      completedPassageCount: 2,
      totalPassageCount: 2,
      preparedSentenceCount: 4,
      totalSentenceCount: 4
    });
  });

  it("cancels between passages without discarding prepared work", async () => {
    const controller = new AbortController();
    const adapter: NarrationPreparationAdapter = {
      async prepare(request) {
        controller.abort();
        return {
          assetId: "asset-1",
          sourceUrl: "/audio.wav",
          sampleRate: 24_000,
          sampleCount: 24_000,
          sentences: request.passage.sentences.map((sentence, index) => ({
            sentenceId: sentence.id,
            startSample: index * 12_000,
            endSample: (index + 1) * 12_000
          })),
          cached: false,
          engineId: request.engineId,
          modelRevision: request.modelRevision,
          voiceId: request.voiceId,
          sourceTextDigest: request.sourceTextDigest
        };
      }
    };

    await expect(
      prepareNarrationBook(
        { adapter },
        { bookId: "book-1", chapters: [chapter("chapter-1", 0), chapter("chapter-2", 2)] },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

function chapter(chapterId: string, sentenceOffset: number): NarrationSessionChapter {
  return {
    outline: {
      bookId: "book-1",
      chapterId,
      language: "en",
      sentences: [0, 1].map((index) => ({
        id: `sentence-${sentenceOffset + index + 1}`,
        index,
        text: `Sentence ${sentenceOffset + index + 1}.`
      })),
      paragraphs: [
        {
          id: `${chapterId}:paragraph-1`,
          index: 0,
          startSentenceIndex: 0,
          endSentenceIndex: 2
        }
      ]
    },
    engineId: "kokoro",
    modelRevision: "kokoro-1",
    voiceId: "kokoro:af-heart"
  };
}
