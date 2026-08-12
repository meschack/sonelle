import { Channel, invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  MediaSessionGateway,
  MediaSessionIntent,
  MediaSessionSnapshot
} from "@sonelle/reader";
import { isAndroidRuntime, isTauriRuntime } from "./tauri-runtime";

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type FocusChannel = { onmessage: (intent: MediaSessionIntent) => void };

export function createAndroidAudioFocusGateway(
  options: {
    invoke?: InvokeCommand;
    createChannel?: () => FocusChannel;
    available?: boolean;
    reportError?: (error: unknown) => void;
  } = {}
): MediaSessionGateway {
  const invoke = options.invoke ?? tauriInvoke;
  const available = options.available ?? (isTauriRuntime() && isAndroidRuntime());
  const listeners = new Set<(intent: MediaSessionIntent) => void>();
  let subscribed = false;
  let lastStatus: MediaSessionSnapshot["playbackStatus"] | null = null;
  const reportError = options.reportError ?? (() => undefined);

  const ensureSubscribed = () => {
    if (!available || subscribed) return;
    subscribed = true;
    const channel = options.createChannel?.() ?? new Channel<MediaSessionIntent>();
    channel.onmessage = (intent) => listeners.forEach((listener) => listener(intent));
    void invoke("subscribe_android_audio_focus", { onIntent: channel }).catch(reportError);
  };

  return {
    publish(snapshot) {
      if (!available || snapshot.playbackStatus === lastStatus) return;
      lastStatus = snapshot.playbackStatus;
      ensureSubscribed();
      void invoke("set_android_audio_focus_playback", {
        playing: snapshot.playbackStatus === "playing"
      }).catch(reportError);
    },
    subscribe(listener) {
      listeners.add(listener);
      ensureSubscribed();
      return () => listeners.delete(listener);
    },
    clear() {
      lastStatus = null;
      if (available) void invoke("clear_android_audio_focus").catch(reportError);
    }
  };
}
