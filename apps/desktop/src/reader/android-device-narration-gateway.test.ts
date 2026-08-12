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
  it("publishes one sentence lifecycle for an explicitly selected voice", async () => {
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
    let finishSpeaking!: () => void;
    const repository = repositoryFake(
      () => new Promise<void>((resolve) => (finishSpeaking = resolve))
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
    finishSpeaking();
    await vi.waitFor(() => expect(events[events.length - 1]).toBe("NarrationPlaybackEnded"));
    expect(events).toEqual([
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationSentenceEntered",
      "NarrationPlaybackEnded"
    ]);
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
    await vi.waitFor(() => expect(ended).toEqual(["sentence-1"]));

    expect(interrupted).toEqual(["sentence-1"]);
    expect(repository.stop).toHaveBeenCalledTimes(1);
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
  eventDispatcher: ReturnType<typeof createDomainEventDispatcher>
) {
  return createAndroidDeviceNarrationGateway(
    { eventDispatcher, repository },
    {
      currentReader: () =>
        ({
          book: { id: "book-1", language: "en-US" },
          chapter: { id: "chapter-1" },
          sentences: [{ id: "sentence-1", index: 0, text: "The device voice remains optional." }]
        }) as never,
      currentSettings: () => ({
        voiceId: deviceVoiceId("reader"),
        playbackRate: 1,
        volume: 0.8,
        voicePreferences: {},
        autoAdvance: true
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
