export type {
  NarrationChapterOutline,
  NarrationEngineId,
  NarrationPassage,
  NarrationPreparationAdapter,
  NarrationPreparationRequest,
  NarrationSentence,
  NarrationSentenceSpan,
  PreparedNarration
} from "./narration-contracts";
export { digestNarrationPassageText } from "./narration-identity";
export {
  prepareNarrationBook,
  type NarrationBookPreparationInput,
  type NarrationBookPreparationProgress,
  type NarrationBookPreparationResult
} from "./narration-book-preparation";
export {
  createNarrationChapterOutline,
  createNarrationPassages,
  type NarrationPassageOptions
} from "./narration-outline";
export type {
  ManifestAwareNarrationPlayer,
  ManifestPlaybackHandlers,
  ManifestPlaybackInput,
  NarrationOutputSettings
} from "./narration-player";
export {
  routeNarrationEngine,
  type NarrationEngineRoute,
  type NarrationRoutingMode,
  type NarrationRoutingOptions
} from "./narration-routing";
export {
  createNarrationSession,
  type NarrationSession,
  type NarrationSessionChapter,
  type NarrationSessionOptions
} from "./narration-session";
