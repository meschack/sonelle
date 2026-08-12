import type { MediaSessionGateway } from "@sonelle/reader";
import { createAndroidAudioFocusGateway } from "./android-audio-focus-gateway";
import { createAndroidBackgroundPlaybackGateway } from "./android-background-playback-gateway";

export function createAndroidMediaSessionGateway(options: {
  reportError(error: unknown): void;
}): MediaSessionGateway {
  const gateways = [
    createAndroidAudioFocusGateway(options),
    createAndroidBackgroundPlaybackGateway(options)
  ];
  return {
    publish(snapshot) {
      gateways.forEach((gateway) => gateway.publish(snapshot));
    },
    subscribe(listener) {
      const subscriptions = gateways.map((gateway) => gateway.subscribe(listener));
      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    clear() {
      gateways.forEach((gateway) => gateway.clear());
    }
  };
}
