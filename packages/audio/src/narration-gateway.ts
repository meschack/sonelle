import type { DomainEvent, EntityId, NarrationSettingsSnapshot } from "@sonelle/domain";

/**
 * The stable reader-facing narration lifecycle.
 *
 * Implementations own preparation and playback orchestration behind these commands and emit
 * lifecycle facts through `subscribe`. The reader may project those facts into highlighting and
 * progress without knowing which engine or platform produced them.
 *
 * This boundary refuses reader rendering, reading-position persistence, model installation, and
 * media-session controls. Contract behavior is exercised by `narration-gateway.test.ts`; concrete
 * preparation and playback remain covered by the narration-session tests.
 */
export type NarrationReadiness = "idle" | "preparing" | "ready" | "needs-attention";

export type NarrationGatewayEvent =
  | DomainEvent<"NarrationPreparationStarted">
  | DomainEvent<"PassageNarrationReady">
  | DomainEvent<"NarrationSentenceEntered">
  | DomainEvent<"NarrationPlaybackPaused">
  | DomainEvent<"NarrationPlaybackEnded">
  | DomainEvent<"NarrationPlaybackFailed">
  | DomainEvent<"NarrationPlaybackInterrupted">;

export interface UpcomingNarrationTarget {
  bookId: EntityId;
  chapterId: EntityId;
  nextChapterId: EntityId;
  voiceId: string;
}

export interface NarrationGateway {
  prepare(sentenceId: EntityId): Promise<void>;
  readiness(): NarrationReadiness;
  start(sentenceId: EntityId): void;
  pause(): Promise<void>;
  resume(): void;
  stop(): Promise<void>;
  setOutput(settings: NarrationSettingsSnapshot): void;
  prepareUpcoming(target: UpcomingNarrationTarget): void;
  subscribe(listener: (event: NarrationGatewayEvent) => void): () => void;
  connect(): () => void;
}
