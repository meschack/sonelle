import type { EntityId } from "@sonelle/domain";
import type {
  NarrationPreparationAdapter,
  NarrationPreparationRequest
} from "./narration-contracts";
import { digestNarrationPassageText } from "./narration-identity";
import { assertPreparedNarration } from "./narration-manifest";
import { createNarrationPassages } from "./narration-outline";
import type { NarrationSessionChapter } from "./narration-session";

export interface NarrationBookPreparationInput {
  bookId: EntityId;
  chapters: readonly NarrationSessionChapter[];
}

export interface NarrationBookPreparationProgress {
  activeChapterId: EntityId;
  completedChapterIds: readonly EntityId[];
  completedPassageCount: number;
  totalPassageCount: number;
  preparedSentenceCount: number;
  totalSentenceCount: number;
}

export interface NarrationBookPreparationResult {
  completedPassageCount: number;
  totalPassageCount: number;
  sentenceCount: number;
}

interface NarrationBookPreparationDependencies {
  adapter: NarrationPreparationAdapter;
}

interface NarrationBookPreparationOptions {
  signal?: AbortSignal;
  onProgress?(progress: NarrationBookPreparationProgress): void;
  createRequestId?: () => EntityId;
}

export async function prepareNarrationBook(
  dependencies: NarrationBookPreparationDependencies,
  input: NarrationBookPreparationInput,
  options: NarrationBookPreparationOptions = {}
): Promise<NarrationBookPreparationResult> {
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  const chapters = input.chapters.filter((chapter) => chapter.outline.bookId === input.bookId);
  const preparedChapters = chapters.map((chapter) => ({
    chapter,
    passages: createNarrationPassages(chapter.outline, chapter.passageOptions)
  }));
  const totalPassageCount = preparedChapters.reduce(
    (total, chapter) => total + chapter.passages.length,
    0
  );
  const totalSentenceCount = chapters.reduce(
    (total, chapter) => total + chapter.outline.sentences.length,
    0
  );
  let completedPassageCount = 0;
  let preparedSentenceCount = 0;
  const completedChapterIds: EntityId[] = [];

  for (const { chapter, passages } of preparedChapters) {
    for (const [passageIndex, passage] of passages.entries()) {
      throwIfPreparationCancelled(options.signal);
      const request: NarrationPreparationRequest = {
        requestId: createRequestId(),
        passage,
        engineId: chapter.engineId,
        modelRevision: chapter.modelRevision,
        voiceId: chapter.voiceId,
        sourceTextDigest: digestNarrationPassageText(passage)
      };
      const narration = await dependencies.adapter.prepare(request, options.signal);
      assertPreparedNarration(narration, passage.sentences);
      completedPassageCount += 1;
      preparedSentenceCount += passage.sentences.length;
      if (passageIndex === passages.length - 1) {
        completedChapterIds.push(chapter.outline.chapterId);
      }
      options.onProgress?.({
        activeChapterId: chapter.outline.chapterId,
        completedChapterIds: [...completedChapterIds],
        completedPassageCount,
        totalPassageCount,
        preparedSentenceCount,
        totalSentenceCount
      });
    }
  }

  return {
    completedPassageCount,
    totalPassageCount,
    sentenceCount: preparedSentenceCount
  };
}

function throwIfPreparationCancelled(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException("Narration preparation cancelled.", "AbortError");
}
