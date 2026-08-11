import type {
  MediaSessionGateway,
  MediaSessionIntent,
  MediaSessionIntentSource,
  MediaSessionSnapshot
} from "./media-session-gateway";

/** Deterministic platform adapter for playback-orchestration contract tests. */
export class FakeMediaSessionGateway implements MediaSessionGateway {
  readonly published: MediaSessionSnapshot[] = [];
  clearCount = 0;
  private readonly listeners = new Set<(intent: MediaSessionIntent) => void>();

  publish(snapshot: MediaSessionSnapshot): void {
    this.published.push(snapshot);
  }

  subscribe(listener: (intent: MediaSessionIntent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.clearCount += 1;
  }

  play(source: MediaSessionIntentSource = "platform"): void {
    this.emit({ type: "play", source });
  }

  pause(source: MediaSessionIntentSource = "platform"): void {
    this.emit({ type: "pause", source });
  }

  stop(source: MediaSessionIntentSource = "platform"): void {
    this.emit({ type: "stop", source });
  }

  seek(sentenceOffset: -1 | 1, source: MediaSessionIntentSource = "platform"): void {
    this.emit({ type: "seek", sentenceOffset, source });
  }

  startInterruption(): void {
    this.emit({ type: "interruption-started" });
  }

  endInterruption(mayResume: boolean): void {
    this.emit({ type: "interruption-ended", mayResume });
  }

  private emit(intent: MediaSessionIntent) {
    this.listeners.forEach((listener) => listener(intent));
  }
}
