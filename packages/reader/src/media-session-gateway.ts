/**
 * Platform playback seam for now-playing state and external controls.
 *
 * The gateway owns publication to platform media sessions and delivery of platform/headset intents.
 * It refuses narration preparation, voice selection, audio generation, reader rendering, and reading
 * position persistence. Those remain with their existing reader and narration modules.
 *
 * Contract behavior is covered through the fake adapter in `media-session-fakes.ts` and the reader
 * playback application tests.
 */

export type MediaSessionPlaybackStatus = "idle" | "playing" | "paused" | "ended";
export type MediaSessionIntentSource = "platform" | "headset";

export interface MediaSessionSnapshot {
  book: {
    id: string;
    title: string;
    author: string;
    coverImageSrc: string | null;
  };
  chapter: {
    id: string;
    title: string;
  };
  activeSentence: {
    id: string;
    /** Zero-based chapter sentence index. */
    index: number;
    /** Total sentences in the active chapter. */
    count: number;
  } | null;
  playbackStatus: MediaSessionPlaybackStatus;
}

export type MediaSessionIntent =
  | { type: "play" | "pause" | "stop"; source: MediaSessionIntentSource }
  | {
      type: "seek";
      /** Sentence movement, not a time offset. */
      sentenceOffset: -1 | 1;
      source: MediaSessionIntentSource;
    }
  | { type: "interruption-started" }
  | { type: "interruption-ended"; mayResume: boolean };

export interface MediaSessionGateway {
  publish(snapshot: MediaSessionSnapshot): void;
  subscribe(listener: (intent: MediaSessionIntent) => void): () => void;
  clear(): void;
}

/** Desktop currently has no platform media-session integration, so state and intents are inert. */
export function createNoopMediaSessionGateway(): MediaSessionGateway {
  return {
    publish() {},
    subscribe() {
      return () => undefined;
    },
    clear() {}
  };
}
