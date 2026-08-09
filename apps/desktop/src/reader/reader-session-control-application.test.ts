import { createDomainEvent, createDomainEventDispatcher } from "@sonelle/domain";
import { describe, expect, it, vi } from "vitest";
import { createReaderSessionControlApplication } from "./reader-session-control-application";

describe("reader session controls", () => {
  it("stops narration after the selected listening duration", async () => {
    const dispatcher = createDomainEventDispatcher();
    const stopPlayback = vi.fn().mockResolvedValue(undefined);
    const projectLimit = vi.fn();
    const projectNotice = vi.fn();
    let timer: (() => void) | null = null;
    const application = createReaderSessionControlApplication(
      {
        eventDispatcher: dispatcher,
        stopPlayback,
        schedule(callback) {
          timer = callback;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        cancel: vi.fn()
      },
      {
        currentBookId: () => "book-1",
        currentChapterId: () => "chapter-1",
        paragraphEndSentenceIds: () => new Set(["sentence-2"]),
        projectLimit,
        projectNotice
      }
    );
    const stop = application.start();

    application.set({ kind: "duration", durationMinutes: 15 });
    await vi.waitFor(() => expect(timer).not.toBeNull());
    if (timer == null) throw new Error("Expected session timer to be scheduled.");
    (timer as () => void)();

    await vi.waitFor(() => expect(stopPlayback).toHaveBeenCalledOnce());
    expect(projectNotice).toHaveBeenLastCalledWith("Narration stopped after 15 minutes.");
    expect(projectLimit).toHaveBeenLastCalledWith({ kind: "off" });
    stop();
  });

  it("waits for the actual paragraph boundary before stopping", async () => {
    const dispatcher = createDomainEventDispatcher();
    const stopPlayback = vi.fn().mockResolvedValue(undefined);
    const application = createReaderSessionControlApplication(
      { eventDispatcher: dispatcher, stopPlayback },
      {
        currentBookId: () => "book-1",
        currentChapterId: () => "chapter-1",
        paragraphEndSentenceIds: () => new Set(["sentence-4"]),
        projectLimit: vi.fn(),
        projectNotice: vi.fn()
      }
    );
    const stop = application.start();
    application.set({ kind: "paragraph" });
    await dispatcher.dispatch(
      createDomainEvent("PassageNarrationPlaybackEnded", {
        bookId: "book-1",
        chapterId: "chapter-1",
        passageId: "passage-1",
        lastSentenceId: "sentence-2"
      })
    );
    expect(stopPlayback).not.toHaveBeenCalled();

    await dispatcher.dispatch(
      createDomainEvent("PassageNarrationPlaybackEnded", {
        bookId: "book-1",
        chapterId: "chapter-1",
        passageId: "passage-2",
        lastSentenceId: "sentence-4"
      })
    );
    expect(stopPlayback).toHaveBeenCalledOnce();
    stop();
  });

  it("stops automatic handoff when the chapter finishes", async () => {
    const dispatcher = createDomainEventDispatcher();
    const stopPlayback = vi.fn().mockResolvedValue(undefined);
    const application = createReaderSessionControlApplication(
      { eventDispatcher: dispatcher, stopPlayback },
      {
        currentBookId: () => "book-1",
        currentChapterId: () => "chapter-1",
        paragraphEndSentenceIds: () => new Set(),
        projectLimit: vi.fn(),
        projectNotice: vi.fn()
      }
    );
    const stop = application.start();
    application.set({ kind: "chapter" });

    await dispatcher.dispatch(
      createDomainEvent("NarrationPlaybackEnded", {
        bookId: "book-1",
        chapterId: "chapter-1",
        passageId: "passage-3",
        lastSentenceId: "sentence-6"
      })
    );

    expect(stopPlayback).toHaveBeenCalledOnce();
    expect(application.allowsChapterTransition()).toBe(false);
    stop();
  });
});
