import { resolveHybridNarrationVoiceForLanguage } from "@sonelle/audio";
import {
  createNarrationChapterOutline,
  createNarrationPassages,
  digestNarrationPassageText,
  routeNarrationEngine,
  type NarrationEngineId,
  type NarrationPreparationRequest,
  type NarrationRoutingMode,
  type NarrationSessionChapter,
  type NarrationChapterOutline
} from "@sonelle/audio/narration";
import type { SentenceNarrationRequest } from "@sonelle/audio/compatibility";
import type { ReaderSentenceView, ReaderView } from "./reader-view";

type HybridNarrationEngineId = Exclude<NarrationEngineId, "piper">;

export function createSentenceNarrationRequest(
  currentReader: ReaderView,
  sentence: ReaderSentenceView,
  voiceId: string
): SentenceNarrationRequest {
  return {
    bookId: currentReader.book.id,
    chapterId: currentReader.chapter.id,
    sentenceId: sentence.id,
    sentenceIndex: sentence.index,
    voiceId,
    text: sentence.text
  };
}

export function createReaderNarrationOutline(currentReader: ReaderView): NarrationChapterOutline {
  return createNarrationChapterOutline({
    bookId: currentReader.book.id,
    chapterId: currentReader.chapter.id,
    language: currentReader.book.language,
    sentences: currentReader.sentences.map(({ id, index, text }) => ({ id, index, text })),
    paragraphs: currentReader.paragraphs.map(
      ({ id, index, startSentenceIndex, endSentenceIndex }) => ({
        id,
        index,
        startSentenceIndex,
        endSentenceIndex
      })
    )
  });
}

export function createReaderNarrationSessionChapter(
  currentReader: ReaderView,
  voiceId: string,
  routingMode: NarrationRoutingMode,
  modelRevisions: Partial<Record<NarrationEngineId, { modelRevision: string }>> = {}
): NarrationSessionChapter {
  const route = routeNarrationEngine(currentReader.book.language, { mode: routingMode });
  const routedVoiceId =
    routingMode === "hybrid-v1"
      ? resolveHybridNarrationVoiceForLanguage(currentReader.book.language, voiceId)
      : routingMode === "mobile-supertonic-v1"
        ? voiceId.startsWith("supertonic:")
          ? voiceId
          : "supertonic:F1"
        : voiceId;

  return {
    outline: createReaderNarrationOutline(currentReader),
    engineId: route.engineId,
    modelRevision:
      route.engineId === "piper"
        ? "piper-desktop-dev"
        : modelRevisions[route.engineId]?.modelRevision || `${route.engineId}-revision-pending`,
    voiceId: routedVoiceId,
    passageOptions:
      route.engineId === "supertonic"
        ? { maxSentences: 2 }
        : route.preparationKind === "sentence-batch"
          ? { maxSentences: 1 }
          : undefined
  };
}

export function createReaderNarrationPreparationRequests(
  currentReader: ReaderView,
  voiceId: string,
  routingMode: NarrationRoutingMode,
  modelRevisions: Partial<Record<NarrationEngineId, { modelRevision: string }>>,
  limit: number,
  createRequestId: () => string = () => crypto.randomUUID()
): NarrationPreparationRequest[] {
  const chapter = createReaderNarrationSessionChapter(
    currentReader,
    voiceId,
    routingMode,
    modelRevisions
  );
  const passages = createNarrationPassages(chapter.outline, chapter.passageOptions);

  return passages.slice(0, Math.max(0, limit)).map((passage) => ({
    requestId: createRequestId(),
    passage,
    engineId: chapter.engineId,
    modelRevision: chapter.modelRevision,
    voiceId: chapter.voiceId,
    sourceTextDigest: digestNarrationPassageText(passage)
  }));
}

export function readerHybridNarrationEngineId(
  currentReader: ReaderView,
  routingMode: Extract<NarrationRoutingMode, "hybrid-v1">
): HybridNarrationEngineId {
  const engineId = routeNarrationEngine(currentReader.book.language, {
    mode: routingMode
  }).engineId;
  if (engineId === "piper") throw new Error("Hybrid narration cannot route to Piper.");
  return engineId;
}
