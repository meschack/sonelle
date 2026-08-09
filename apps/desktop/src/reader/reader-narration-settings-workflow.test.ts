import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from "@sonelle/audio";
import {
  createDomainEvent,
  createDomainEventDispatcher,
  type AnyDomainEvent
} from "@sonelle/domain";
import { createReaderNarrationSettingsWorkflow } from "./reader-narration-settings-workflow";

describe("reader narration settings workflow", () => {
  it("lets projection, persistence, and output react independently", async () => {
    const dispatcher = createDomainEventDispatcher();
    const events: AnyDomainEvent[] = [];
    let settings: AudioSettings = DEFAULT_AUDIO_SETTINGS;
    let bookId = "book-one";
    const save = vi.fn();
    const load = vi.fn(() => DEFAULT_AUDIO_SETTINGS);
    const setOutput = vi.fn();
    dispatcher.subscribe("NarrationSettingsChanged", (event) => {
      events.push(event);
    });
    const workflow = createReaderNarrationSettingsWorkflow(
      {
        eventDispatcher: dispatcher,
        repository: { load, save },
        narration: { setOutput },
        activateSettings: (current, language) => ({
          ...current,
          voiceId: language === "fr" ? "supertonic:F1" : current.voiceId
        }),
        reportEventError: vi.fn()
      },
      {
        currentSettings: () => settings,
        currentLanguage: () => "en",
        currentBookId: () => bookId,
        projectSettings: (next) => {
          settings = next;
        }
      }
    );
    const stop = workflow.start();

    workflow.change({ volume: 0.7 });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(settings.volume).toBe(0.7);
    expect(save).toHaveBeenCalledWith(settings, "book-one");
    expect(setOutput).toHaveBeenCalledWith(settings);
    expect(events[0]).toMatchObject({
      name: "NarrationSettingsChanged",
      payload: { source: "user" }
    });

    bookId = "book-two";
    workflow.activate("book-two", "fr");
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(settings.voiceId).toBe("supertonic:F1");
    expect(events[1]).toMatchObject({
      name: "NarrationSettingsChanged",
      payload: { source: "book" }
    });

    workflow.reset();
    await vi.waitFor(() => expect(events).toHaveLength(3));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(setOutput).toHaveBeenCalledTimes(3));
    expect(settings).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(save).toHaveBeenLastCalledWith(DEFAULT_AUDIO_SETTINGS, "book-two");
    expect(setOutput).toHaveBeenLastCalledWith(DEFAULT_AUDIO_SETTINGS);
    stop();
  });

  it("activates the saved narration profile when its book opens", async () => {
    const dispatcher = createDomainEventDispatcher();
    let settings: AudioSettings = DEFAULT_AUDIO_SETTINGS;
    const bookSettings = { ...DEFAULT_AUDIO_SETTINGS, playbackRate: 1.25, volume: 0.8 };
    const setOutput = vi.fn();
    const workflow = createReaderNarrationSettingsWorkflow(
      {
        eventDispatcher: dispatcher,
        repository: {
          load: vi.fn((bookId) => (bookId === "book-two" ? bookSettings : DEFAULT_AUDIO_SETTINGS)),
          save: vi.fn()
        },
        narration: { setOutput },
        activateSettings: (current) => current,
        reportEventError: vi.fn()
      },
      {
        currentSettings: () => settings,
        currentLanguage: () => "en",
        currentBookId: () => "book-two",
        projectSettings: (next) => {
          settings = next;
        }
      }
    );
    const stop = workflow.start();

    await dispatcher.dispatch(
      createDomainEvent("ReaderOpened", {
        bookId: "book-two",
        chapterId: "chapter-1",
        sentenceId: "sentence-1",
        sentenceIndex: 0,
        playbackStatus: "idle",
        source: "library",
        language: "en"
      })
    );

    await vi.waitFor(() => expect(settings.playbackRate).toBe(1.25));
    expect(setOutput).toHaveBeenCalledWith(bookSettings);
    stop();
  });
});
