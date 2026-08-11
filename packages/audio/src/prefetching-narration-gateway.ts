import type {
  LegacyNarrationGateway,
  LegacyPrefetchingNarrationGateway,
  SentenceNarration,
  SentenceNarrationRequest
} from "./legacy-narration";

interface PrefetchingNarrationOptions {
  maxEntries?: number;
}

export function createPrefetchingNarrationGateway(
  gateway: LegacyNarrationGateway,
  options: PrefetchingNarrationOptions = {}
): LegacyPrefetchingNarrationGateway {
  const maxEntries = Math.max(1, options.maxEntries ?? 4);
  const prepared = new Map<string, Promise<SentenceNarration>>();

  const prepare = (request: SentenceNarrationRequest) => {
    const key = narrationRequestKey(request);
    const existing = prepared.get(key);
    if (existing != null) return existing;

    const pending = gateway.prepareSentenceAudio(request).catch((error) => {
      prepared.delete(key);
      throw error;
    });

    prepared.set(key, pending);
    trimPreparedNarrations(prepared, maxEntries);
    return pending;
  };

  return {
    prepareSentenceAudio(request) {
      return prepare(request);
    },
    async prefetchSentenceAudio(request) {
      await prepare(request);
    },
    playPreparedSentenceAudio(request, narration) {
      return gateway.playPreparedSentenceAudio(request, narration);
    },
    stopPreparedSentenceAudio() {
      return gateway.stopPreparedSentenceAudio();
    },
    clearPrefetchedNarrations() {
      prepared.clear();
    }
  };
}

function narrationRequestKey(request: SentenceNarrationRequest): string {
  return [
    request.bookId,
    request.chapterId,
    request.sentenceId,
    request.sentenceIndex,
    request.voiceId,
    request.text
  ].join("\u001f");
}

function trimPreparedNarrations(
  prepared: Map<string, Promise<SentenceNarration>>,
  maxEntries: number
) {
  while (prepared.size > maxEntries) {
    const oldestKey = prepared.keys().next().value as string | undefined;
    if (oldestKey == null) return;
    prepared.delete(oldestKey);
  }
}
