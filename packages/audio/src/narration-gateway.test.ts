import { describe, expect, it, vi } from "vitest";
import type { NarrationGatewayEvent } from "./narration-gateway";
import { FakeNarrationGateway } from "./narration-fakes";

describe("NarrationGateway contract", () => {
  it("reports readiness and emits deterministic lifecycle events", async () => {
    const gateway = new FakeNarrationGateway();
    const events: NarrationGatewayEvent[] = [];
    gateway.subscribe((event) => events.push(event));

    expect(gateway.readiness()).toBe("idle");
    await gateway.prepare("sentence-1");
    expect(gateway.readiness()).toBe("ready");

    gateway.start("sentence-1");
    await vi.waitFor(() =>
      expect(events.some((event) => event.name === "NarrationSentenceEntered")).toBe(true)
    );
    gateway.complete();
    gateway.complete();

    expect(events.map((event) => event.name)).toEqual([
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationPreparationStarted",
      "PassageNarrationReady",
      "NarrationSentenceEntered",
      "NarrationPlaybackEnded"
    ]);
  });

  it("interrupts superseded playback without leaking a stale sentence start", async () => {
    const gateway = new FakeNarrationGateway();
    const events: NarrationGatewayEvent[] = [];
    gateway.subscribe((event) => events.push(event));

    gateway.start("sentence-1");
    gateway.start("sentence-2");
    await vi.waitFor(() =>
      expect(events.filter((event) => event.name === "NarrationSentenceEntered")).toHaveLength(1)
    );

    expect(
      events
        .filter((event) => event.name === "NarrationSentenceEntered")
        .map((event) => event.payload.sentenceId)
    ).toEqual(["sentence-2"]);
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "NarrationPlaybackInterrupted",
        payload: expect.objectContaining({ sentenceId: "sentence-1" })
      })
    );
  });

  it("emits failure and explicit interruption outcomes", async () => {
    const gateway = new FakeNarrationGateway();
    const events: NarrationGatewayEvent[] = [];
    gateway.subscribe((event) => events.push(event));

    gateway.start("sentence-1");
    await vi.waitFor(() =>
      expect(events.some((event) => event.name === "NarrationSentenceEntered")).toBe(true)
    );
    gateway.fail("Voice files are unavailable.");
    expect(gateway.readiness()).toBe("needs-attention");

    gateway.start("sentence-2");
    await vi.waitFor(() =>
      expect(
        events.some(
          (event) =>
            event.name === "NarrationSentenceEntered" && event.payload.sentenceId === "sentence-2"
        )
      ).toBe(true)
    );
    gateway.interrupt();

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "NarrationPlaybackFailed" }),
        expect.objectContaining({ name: "NarrationPlaybackInterrupted" })
      ])
    );
  });
});
