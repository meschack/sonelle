import type { MediaSessionIntent } from "@sonelle/reader";
import { describe, expect, it, vi } from "vitest";
import { createAndroidAudioFocusGateway } from "./android-audio-focus-gateway";

describe("Android audio focus gateway", () => {
  it("requests focus only for playing state and abandons it otherwise", async () => {
    const invoke = vi.fn(async () => undefined);
    const channel = { onmessage: (_intent: MediaSessionIntent) => undefined };
    const gateway = createAndroidAudioFocusGateway({
      invoke,
      createChannel: () => channel,
      available: true
    });
    gateway.subscribe(() => undefined);

    gateway.publish(snapshot("playing"));
    gateway.publish(snapshot("playing"));
    gateway.publish(snapshot("paused"));
    gateway.clear();
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith("subscribe_android_audio_focus", { onIntent: channel });
    expect(invoke).toHaveBeenCalledWith("set_android_audio_focus_playback", { playing: true });
    expect(invoke).toHaveBeenCalledWith("set_android_audio_focus_playback", { playing: false });
    expect(invoke).toHaveBeenCalledWith("clear_android_audio_focus");
    expect(invoke).toHaveBeenCalledTimes(4);
  });

  it("delivers native interruption policy through MediaSessionGateway", () => {
    const channel = { onmessage: (_intent: MediaSessionIntent) => undefined };
    const received: MediaSessionIntent[] = [];
    const gateway = createAndroidAudioFocusGateway({
      invoke: vi.fn(async () => undefined),
      createChannel: () => channel,
      available: true
    });
    gateway.subscribe((intent) => received.push(intent));

    channel.onmessage({ type: "interruption-started" });
    channel.onmessage({ type: "interruption-ended", mayResume: true });
    channel.onmessage({ type: "interruption-started" });
    channel.onmessage({ type: "interruption-ended", mayResume: false });

    expect(received).toEqual([
      { type: "interruption-started" },
      { type: "interruption-ended", mayResume: true },
      { type: "interruption-started" },
      { type: "interruption-ended", mayResume: false }
    ]);
  });
});

function snapshot(playbackStatus: "playing" | "paused") {
  return {
    book: { id: "book", title: "Book", author: "Reader", coverImageSrc: null },
    chapter: { id: "chapter", title: "Chapter" },
    activeSentence: { id: "sentence", index: 0, count: 1 },
    playbackStatus
  } as const;
}
