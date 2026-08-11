import { describe, expect, it, vi } from "vitest";
import { createNoopMediaSessionGateway, type MediaSessionIntent } from "./media-session-gateway";
import { FakeMediaSessionGateway } from "./media-session-fakes";

describe("MediaSessionGateway contract", () => {
  it("keeps the desktop no-op adapter inert", () => {
    const gateway = createNoopMediaSessionGateway();
    const listener = vi.fn();

    expect(() => {
      gateway.publish(snapshot("playing"));
      gateway.clear();
      gateway.subscribe(listener)();
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("lets a fake platform publish state and drive every external intent", () => {
    const gateway = new FakeMediaSessionGateway();
    const intents: MediaSessionIntent[] = [];
    const unsubscribe = gateway.subscribe((intent) => intents.push(intent));

    gateway.publish(snapshot("paused"));
    gateway.play();
    gateway.pause("headset");
    gateway.stop();
    gateway.seek(1, "headset");
    gateway.startInterruption();
    gateway.endInterruption(true);
    gateway.disconnectOutput();
    gateway.clear();

    expect(gateway.published).toEqual([snapshot("paused")]);
    expect(gateway.clearCount).toBe(1);
    expect(intents).toEqual([
      { type: "play", source: "platform" },
      { type: "pause", source: "headset" },
      { type: "stop", source: "platform" },
      { type: "seek", sentenceOffset: 1, source: "headset" },
      { type: "interruption-started" },
      { type: "interruption-ended", mayResume: true },
      { type: "output-disconnected" }
    ]);

    unsubscribe();
    gateway.play();
    expect(intents).toHaveLength(7);
  });
});

function snapshot(playbackStatus: "playing" | "paused") {
  return {
    book: {
      id: "book-1",
      title: "A Book",
      author: "A Reader",
      coverImageSrc: null
    },
    chapter: { id: "chapter-1", title: "Chapter One" },
    activeSentence: { id: "sentence-1", index: 0, count: 2 },
    playbackStatus
  } as const;
}
