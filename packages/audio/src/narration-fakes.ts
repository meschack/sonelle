import type {
  NarrationEngineId,
  NarrationPreparationAdapter,
  NarrationPreparationRequest,
  NarrationSentence,
  NarrationSentenceSpan,
  PreparedNarration
} from "./narration-contracts";
import type {
  LegacyNarrationGateway,
  SentenceNarration,
  SentenceNarrationRequest
} from "./legacy-narration";
import { createDomainEvent, type EntityId } from "@sonelle/domain";
import type {
  NarrationGateway,
  NarrationGatewayEvent,
  NarrationReadiness
} from "./narration-gateway";
import { createNarrationAssetIdentity } from "./narration-identity";
import { assertPreparedNarration } from "./narration-manifest";

export class FakePassageNarrationAdapter implements NarrationPreparationAdapter {
  private readonly adapter = new DeterministicNarrationAdapter("kokoro", 24_000);

  prepare(request: NarrationPreparationRequest, signal?: AbortSignal): Promise<PreparedNarration> {
    return this.adapter.prepare(request, signal);
  }
}

export class FakeSentenceBatchNarrationAdapter implements NarrationPreparationAdapter {
  private readonly adapter = new DeterministicNarrationAdapter("supertonic", 44_100);

  prepare(request: NarrationPreparationRequest, signal?: AbortSignal): Promise<PreparedNarration> {
    return this.adapter.prepare(request, signal);
  }
}

export class FakeLegacyNarrationGateway implements LegacyNarrationGateway {
  private readonly prepared = new Map<string, SentenceNarration>();

  async prepareSentenceAudio(request: SentenceNarrationRequest): Promise<SentenceNarration> {
    const key = [
      request.bookId,
      request.chapterId,
      request.sentenceId,
      request.sentenceIndex,
      request.voiceId,
      request.text
    ].join("\u001f");
    const existing = this.prepared.get(key);
    if (existing != null) return { ...existing, cached: true };

    const narration: SentenceNarration = {
      bookId: request.bookId,
      chapterId: request.chapterId,
      sentenceId: request.sentenceId,
      readiness: "ready",
      durationSec: 1,
      sourceUrl: "data:audio/wav;base64,UklGRg==",
      playbackMode: "html-audio",
      cached: false,
      message: null
    };
    this.prepared.set(key, narration);
    return narration;
  }

  async playPreparedSentenceAudio(): Promise<void> {}

  async stopPreparedSentenceAudio(): Promise<void> {}
}

export interface FakeNarrationGatewayOptions {
  bookId?: EntityId;
  chapterId?: EntityId;
  voiceId?: string;
}

/** Deterministic lifecycle adapter for reader and platform contract tests. */
export class FakeNarrationGateway implements NarrationGateway {
  private readonly listeners = new Set<(event: NarrationGatewayEvent) => void>();
  private readonly bookId: EntityId;
  private readonly chapterId: EntityId;
  private readonly voiceId: string;
  private state: NarrationReadiness = "idle";
  private activeSentenceId: EntityId | null = null;
  private lastSentenceId: EntityId | null = null;
  private run = 0;

  constructor(options: FakeNarrationGatewayOptions = {}) {
    this.bookId = options.bookId ?? "book";
    this.chapterId = options.chapterId ?? "chapter";
    this.voiceId = options.voiceId ?? "fake:reader";
  }

  async prepare(sentenceId: EntityId): Promise<void> {
    await this.prepareFor(sentenceId);
  }

  private async prepareFor(
    sentenceId: EntityId,
    isCurrent: () => boolean = () => true
  ): Promise<boolean> {
    this.state = "preparing";
    this.emit(
      createDomainEvent("NarrationPreparationStarted", {
        ...this.sentenceRef(sentenceId),
        passageId: this.passageId(sentenceId)
      })
    );
    await Promise.resolve();
    if (!isCurrent()) return false;
    this.state = "ready";
    this.emit(
      createDomainEvent("PassageNarrationReady", {
        bookId: this.bookId,
        chapterId: this.chapterId,
        passageId: this.passageId(sentenceId),
        firstSentenceId: sentenceId,
        lastSentenceId: sentenceId,
        voiceId: this.voiceId,
        engineId: "fake",
        source: "prepared"
      })
    );
    return true;
  }

  readiness(): NarrationReadiness {
    return this.state;
  }

  start(sentenceId: EntityId): void {
    const previous = this.activeSentenceId;
    const run = ++this.run;
    if (previous != null) this.emitInterruption(previous);
    this.activeSentenceId = sentenceId;
    this.lastSentenceId = sentenceId;
    void this.prepareFor(sentenceId, () => run === this.run).then((ready) => {
      if (!ready || this.activeSentenceId !== sentenceId) return;
      this.emit(
        createDomainEvent("NarrationSentenceEntered", {
          ...this.sentenceRef(sentenceId),
          passageId: this.passageId(sentenceId)
        })
      );
    });
  }

  async pause(): Promise<void> {
    const sentenceId = this.activeSentenceId;
    this.activeSentenceId = null;
    this.run += 1;
    if (sentenceId == null) return;
    this.emit(
      createDomainEvent("NarrationPlaybackPaused", {
        ...this.sentenceRef(sentenceId),
        passageId: this.passageId(sentenceId)
      })
    );
  }

  resume(): void {
    if (this.lastSentenceId != null) this.start(this.lastSentenceId);
  }

  async stop(): Promise<void> {
    const sentenceId = this.activeSentenceId;
    this.activeSentenceId = null;
    this.run += 1;
    this.state = "idle";
    if (sentenceId != null) this.emitInterruption(sentenceId);
  }

  setOutput(): void {}

  prepareUpcoming(): void {}

  subscribe(listener: (event: NarrationGatewayEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(): () => void {
    return () => undefined;
  }

  complete(): void {
    const sentenceId = this.activeSentenceId;
    if (sentenceId == null) return;
    this.activeSentenceId = null;
    this.run += 1;
    this.emit(
      createDomainEvent("NarrationPlaybackEnded", {
        bookId: this.bookId,
        chapterId: this.chapterId,
        passageId: this.passageId(sentenceId),
        lastSentenceId: sentenceId
      })
    );
  }

  fail(reason = "Narration needs attention."): void {
    const sentenceId = this.activeSentenceId ?? this.lastSentenceId;
    if (sentenceId == null) return;
    this.activeSentenceId = null;
    this.run += 1;
    this.state = "needs-attention";
    this.emit(
      createDomainEvent("NarrationPlaybackFailed", {
        ...this.sentenceRef(sentenceId),
        passageId: this.passageId(sentenceId),
        reason
      })
    );
  }

  interrupt(): void {
    const sentenceId = this.activeSentenceId;
    if (sentenceId == null) return;
    this.activeSentenceId = null;
    this.run += 1;
    this.emitInterruption(sentenceId);
  }

  private sentenceRef(sentenceId: EntityId) {
    return { bookId: this.bookId, chapterId: this.chapterId, sentenceId };
  }

  private passageId(sentenceId: EntityId): EntityId {
    return `${this.chapterId}:${sentenceId}:passage`;
  }

  private emitInterruption(sentenceId: EntityId) {
    this.emit(
      createDomainEvent("NarrationPlaybackInterrupted", {
        ...this.sentenceRef(sentenceId),
        passageId: this.passageId(sentenceId)
      })
    );
  }

  private emit(event: NarrationGatewayEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

class DeterministicNarrationAdapter implements NarrationPreparationAdapter {
  private readonly prepared = new Map<string, PreparedNarration>();

  constructor(
    private readonly engineId: NarrationEngineId,
    private readonly sampleRate: number
  ) {}

  async prepare(
    request: NarrationPreparationRequest,
    signal?: AbortSignal
  ): Promise<PreparedNarration> {
    throwIfAborted(signal);
    if (request.engineId !== this.engineId) {
      throw new Error(`${this.engineId} cannot prepare a ${request.engineId} request.`);
    }

    const identity = createNarrationAssetIdentity({
      schemaVersion: 3,
      engineId: request.engineId,
      modelRevision: request.modelRevision,
      voiceId: request.voiceId,
      language: request.passage.language ?? "na",
      sentences: request.passage.sentences,
      synthesisParameters: request.synthesisParameters,
      sampleRate: this.sampleRate,
      encodingRevision: "fake-pcm-v1"
    });
    const existing = this.prepared.get(identity);
    if (existing != null) return { ...existing, cached: true };

    const sentences = createDeterministicSpans(request.passage.sentences, this.sampleRate);
    const narration: PreparedNarration = {
      assetId: `fake:${simpleIdentityHash(identity)}`,
      sourceUrl: "data:audio/wav;base64,UklGRg==",
      sampleRate: this.sampleRate,
      sampleCount: sentences[sentences.length - 1]?.endSample ?? 0,
      sentences,
      cached: false,
      engineId: request.engineId,
      modelRevision: request.modelRevision,
      voiceId: request.voiceId,
      sourceTextDigest: request.sourceTextDigest
    };
    throwIfAborted(signal);
    assertPreparedNarration(narration, request.passage.sentences);
    this.prepared.set(identity, narration);
    return narration;
  }
}

function createDeterministicSpans(
  sentences: readonly NarrationSentence[],
  sampleRate: number
): NarrationSentenceSpan[] {
  let startSample = 0;
  return sentences.map((sentence) => {
    const words = sentence.text.trim().split(/\s+/u).filter(Boolean).length;
    const sampleCount = Math.max(
      Math.round(sampleRate * 0.5),
      words * Math.round(sampleRate * 0.28)
    );
    const span = {
      sentenceId: sentence.id,
      startSample,
      endSample: startSample + sampleCount
    };
    startSample = span.endSample;
    return span;
  });
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException("Preparation cancelled.", "AbortError");
}

function simpleIdentityHash(identity: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
