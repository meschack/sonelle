import { Channel, invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  MediaSessionGateway,
  MediaSessionIntent,
  MediaSessionSnapshot
} from "@sonelle/reader";
import { isAndroidRuntime, isTauriRuntime } from "./tauri-runtime";

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type PlaybackChannel = { onmessage: (intent: MediaSessionIntent) => void };

export function createAndroidBackgroundPlaybackGateway(
  options: {
    invoke?: InvokeCommand;
    createChannel?: () => PlaybackChannel;
    available?: boolean;
    reportError?: (error: unknown) => void;
  } = {}
): MediaSessionGateway {
  const invoke = options.invoke ?? tauriInvoke;
  const available = options.available ?? (isTauriRuntime() && isAndroidRuntime());
  const listeners = new Set<(intent: MediaSessionIntent) => void>();
  const reportError = options.reportError ?? (() => undefined);
  let subscribed = false;
  let lastPublication = "";

  const ensureSubscribed = () => {
    if (!available || subscribed) return;
    subscribed = true;
    const channel = options.createChannel?.() ?? new Channel<MediaSessionIntent>();
    channel.onmessage = (intent) => listeners.forEach((listener) => listener(intent));
    void invoke("subscribe_android_background_playback", { onIntent: channel }).catch(reportError);
  };

  return {
    publish(snapshot) {
      if (!available) return;
      const publication = nativePublication(snapshot);
      const serialized = JSON.stringify(publication);
      if (serialized === lastPublication) return;
      lastPublication = serialized;
      ensureSubscribed();
      void invoke("publish_android_background_playback", { snapshot: publication }).catch(
        reportError
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      ensureSubscribed();
      return () => listeners.delete(listener);
    },
    clear() {
      lastPublication = "";
      if (available) void invoke("clear_android_background_playback").catch(reportError);
    }
  };
}

function nativePublication(snapshot: MediaSessionSnapshot) {
  return {
    bookTitle: snapshot.book.title,
    author: snapshot.book.author,
    chapterTitle: snapshot.chapter.title,
    sentenceIndex: snapshot.activeSentence?.index ?? 0,
    sentenceCount: snapshot.activeSentence?.count ?? 0,
    playbackStatus: snapshot.playbackStatus
  };
}
