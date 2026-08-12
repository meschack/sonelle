import type { MediaSessionIntent, MediaSessionSnapshot } from "@sonelle/reader";
import { describe, expect, it, vi } from "vitest";
import { createAndroidBackgroundPlaybackGateway } from "./android-background-playback-gateway";

describe("Android background playback gateway", () => {
  it("publishes reader metadata and playback state without duplicate native updates", async () => {
    const invoke = vi.fn(async () => undefined);
    const channel = { onmessage: (_intent: MediaSessionIntent) => undefined };
    const gateway = createAndroidBackgroundPlaybackGateway({
      invoke,
      createChannel: () => channel,
      available: true
    });

    gateway.publish(snapshot("playing"));
    gateway.publish(snapshot("playing"));
    gateway.publish(snapshot("paused"));
    await Promise.resolve();

    expect(invoke).toHaveBeenNthCalledWith(1, "subscribe_android_background_playback", {
      onIntent: channel
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "publish_android_background_playback", {
      snapshot: {
        bookTitle: "The Book",
        author: "A Reader",
        chapterTitle: "First chapter",
        playbackStatus: "playing"
      }
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "publish_android_background_playback", {
      snapshot: {
        bookTitle: "The Book",
        author: "A Reader",
        chapterTitle: "First chapter",
        playbackStatus: "paused"
      }
    });
  });

  it("delivers notification controls and releases the service on clear", async () => {
    const invoke = vi.fn(async () => undefined);
    const channel = { onmessage: (_intent: MediaSessionIntent) => undefined };
    const received: MediaSessionIntent[] = [];
    const gateway = createAndroidBackgroundPlaybackGateway({
      invoke,
      createChannel: () => channel,
      available: true
    });
    gateway.subscribe((intent) => received.push(intent));

    channel.onmessage({ type: "pause", source: "platform" });
    channel.onmessage({ type: "play", source: "platform" });
    channel.onmessage({ type: "stop", source: "platform" });
    gateway.clear();
    await Promise.resolve();

    expect(received).toEqual([
      { type: "pause", source: "platform" },
      { type: "play", source: "platform" },
      { type: "stop", source: "platform" }
    ]);
    expect(invoke).toHaveBeenLastCalledWith("clear_android_background_playback");
  });
});

function snapshot(playbackStatus: MediaSessionSnapshot["playbackStatus"]): MediaSessionSnapshot {
  return {
    book: { id: "book", title: "The Book", author: "A Reader", coverImageSrc: null },
    chapter: { id: "chapter", title: "First chapter" },
    activeSentence: { id: "sentence", index: 0, count: 2 },
    playbackStatus
  };
}
