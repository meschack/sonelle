import { createDomainEventDispatcher } from "@sonelle/domain";
import { describe, expect, it, vi } from "vitest";
import type { AndroidDeviceVoiceRepository } from "../audio/android-device-voice-repository";
import { deviceVoiceId } from "../audio/android-device-voice-repository";
import type { NarrationGateway } from "@sonelle/audio/narration";
import {
  createAndroidDeviceNarrationGateway,
  routeNarrationGateway
} from "./android-device-narration-gateway";

describe("Android device narration gateway", () => {
  it("reads from the selected sentence through the end of the chapter before ending playback", async () => {
    const eventDispatcher = createDomainEventDispatcher();
    const events: string[] = [];
    for (const name of [
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationSentenceEntered",
      "NarrationPlaybackEnded"
    ] as const) {
      eventDispatcher.subscribe(name, () => {
        events.push(name);
      });
    }
    const completions: Array<() => void> = [];
    const repository = repositoryFake(
      () => new Promise<void>((resolve) => completions.push(resolve))
    );
    const gateway = createGateway(repository, eventDispatcher);

    gateway.start("sentence-1");
    await vi.waitFor(() => expect(events).toContain("NarrationSentenceEntered"));
    expect(repository.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "The device voice remains optional.",
        voiceId: deviceVoiceId("reader")
      })
    );
    completions[0]();
    await vi.waitFor(() => expect(repository.speak).toHaveBeenCalledTimes(2));
    expect(events).not.toContain("NarrationPlaybackEnded");
    completions[1]();
    await vi.waitFor(() => expect(repository.speak).toHaveBeenCalledTimes(3));
    expect(events).not.toContain("NarrationPlaybackEnded");
    completions[2]();
    await vi.waitFor(() => expect(events[events.length - 1]).toBe("NarrationPlaybackEnded"));
    expect(repository.speak).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "It reads every sentence." })
    );
    expect(repository.speak).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ text: "Then the chapter is complete." })
    );
    expect(events.filter((event) => event === "NarrationPlaybackEnded")).toHaveLength(1);
  });

  it("stops stale completion and resumes from the same sentence", async () => {
    const eventDispatcher = createDomainEventDispatcher();
    const ended: string[] = [];
    const interrupted: string[] = [];
    eventDispatcher.subscribe("NarrationPlaybackEnded", (event) => {
      ended.push(event.payload.lastSentenceId);
    });
    eventDispatcher.subscribe("NarrationPlaybackInterrupted", (event) => {
      interrupted.push(event.payload.sentenceId);
    });
    const completions: Array<() => void> = [];
    const repository = repositoryFake(
      () => new Promise<void>((resolve) => completions.push(resolve))
    );
    const gateway = createGateway(repository, eventDispatcher);

    gateway.start("sentence-1");
    await vi.waitFor(() => expect(repository.speak).toHaveBeenCalledTimes(1));
    await gateway.stop();
    completions[0]();
    await Promise.resolve();
    gateway.resume();
    await vi.waitFor(() => expect(repository.speak).toHaveBeenCalledTimes(2));
    completions[1]();
    await vi.waitFor(() => expect(repository.speak).toHaveBeenCalledTimes(3));
    completions[2]();
    await vi.waitFor(() => expect(repository.speak).toHaveBeenCalledTimes(4));
    completions[3]();
    await vi.waitFor(() => expect(ended).toEqual(["sentence-3"]));

    expect(interrupted).toEqual(["sentence-1"]);
    expect(repository.stop).toHaveBeenCalledTimes(1);
  });

  it("pauses after the current sentence when auto-advance is off", async () => {
    const eventDispatcher = createDomainEventDispatcher();
    const paused: string[] = [];
    eventDispatcher.subscribe("NarrationPlaybackPaused", (event) => {
      paused.push(event.payload.sentenceId);
    });
    let finishSpeaking!: () => void;
    const repository = repositoryFake(
      () => new Promise<void>((resolve) => (finishSpeaking = resolve))
    );
    const gateway = createGateway(repository, eventDispatcher, false);

    gateway.start("sentence-1");
    await vi.waitFor(() => expect(repository.speak).toHaveBeenCalledOnce());
    finishSpeaking();
    await vi.waitFor(() => expect(paused).toEqual(["sentence-1"]));

    expect(repository.speak).toHaveBeenCalledTimes(1);
  });

  it("keeps the book readable and reports device voice failure", async () => {
    const eventDispatcher = createDomainEventDispatcher();
    const failures: string[] = [];
    eventDispatcher.subscribe("NarrationPlaybackFailed", (event) => {
      failures.push(event.payload.reason);
    });
    const gateway = createGateway(
      repositoryFake(async () => {
        throw new Error("Device speech unavailable");
      }),
      eventDispatcher
    );

    gateway.start("sentence-1");
    await vi.waitFor(() => expect(failures).toEqual(["This device voice needs attention."]));
    expect(gateway.readiness()).toBe("needs-attention");
  });

  it("routes only an explicit device-voice selection and never falls back after failure", async () => {
    let useDeviceVoice = false;
    const sonelle = gatewayFake();
    const device = gatewayFake();
    const gateway = routeNarrationGateway(sonelle, device, () => useDeviceVoice);

    gateway.start("sentence-1");
    expect(sonelle.start).toHaveBeenCalledWith("sentence-1");
    expect(device.start).not.toHaveBeenCalled();

    useDeviceVoice = true;
    gateway.start("sentence-2");
    expect(device.start).toHaveBeenCalledWith("sentence-2");
    expect(sonelle.start).toHaveBeenCalledTimes(1);

    useDeviceVoice = false;
    gateway.start("sentence-3");
    expect(sonelle.start).toHaveBeenLastCalledWith("sentence-3");
  });
});

function createGateway(
  repository: AndroidDeviceVoiceRepository,
  eventDispatcher: ReturnType<typeof createDomainEventDispatcher>,
  autoAdvance = true
) {
  return createAndroidDeviceNarrationGateway(
    { eventDispatcher, repository },
    {
      currentReader: () =>
        ({
          book: { id: "book-1", language: "en-US" },
          chapter: { id: "chapter-1" },
          sentences: [
            { id: "sentence-1", index: 0, text: "The device voice remains optional." },
            { id: "sentence-2", index: 1, text: "It reads every sentence." },
            { id: "sentence-3", index: 2, text: "Then the chapter is complete." }
          ]
        }) as never,
      currentSettings: () => ({
        voiceId: deviceVoiceId("reader"),
        playbackRate: 1,
        volume: 0.8,
        voicePreferences: {},
        autoAdvance
      })
    }
  );
}

function repositoryFake(speak: () => Promise<void>): AndroidDeviceVoiceRepository {
  return {
    list: vi.fn(async () => []),
    speak: vi.fn(speak),
    stop: vi.fn(async () => undefined)
  };
}

function gatewayFake(): NarrationGateway {
  return {
    prepare: vi.fn(async () => undefined),
    readiness: vi.fn(() => "idle" as const),
    start: vi.fn(),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(),
    stop: vi.fn(async () => undefined),
    setOutput: vi.fn(),
    prepareUpcoming: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    connect: vi.fn(() => () => undefined)
  };
}
