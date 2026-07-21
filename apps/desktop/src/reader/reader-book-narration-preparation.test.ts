import type { NarrationBookPreparationProgress } from "@sonelle/audio/narration";
import { createDomainEvent, createDomainEventDispatcher } from "@sonelle/domain";
import { describe, expect, it, vi } from "vitest";
import type { ReaderDocumentDto } from "../library/library-models";
import {
  createReaderBookNarrationPreparationApplication,
  projectBookNarrationReadiness
} from "./reader-book-narration-preparation";

describe("book narration readiness", () => {
  it("projects ready, preparing, and unavailable chapters with a storage estimate", () => {
    const progress: NarrationBookPreparationProgress = {
      activeChapterId: "chapter-2",
      completedChapterIds: ["chapter-1"],
      completedPassageCount: 2,
      totalPassageCount: 5,
      preparedSentenceCount: 3,
      totalSentenceCount: 6
    };

    const readiness = projectBookNarrationReadiness(
      document(),
      [
        {
          chapterId: "chapter-1",
          sentenceIds: ["c1-s1", "c1-s2"],
          sizeBytes: 100_000
        }
      ],
      progress
    );

    expect(readiness.chapters.map((chapter) => chapter.status)).toEqual([
      "ready",
      "preparing",
      "unavailable"
    ]);
    expect(readiness.preparedSentenceCount).toBe(3);
    expect(readiness.totalSentenceCount).toBe(6);
    expect(readiness.estimatedSizeBytes).toBeGreaterThan(readiness.sizeBytes);
  });

  it("uses native sentence identities for chapters whose text is not in the active payload", () => {
    const summary = document();
    summary.chapters[1].sentences = [];

    const readiness = projectBookNarrationReadiness(
      summary,
      [
        {
          chapterId: "chapter-2",
          sentenceIds: ["c2-s1", "c2-s2"],
          sizeBytes: 200_000
        }
      ],
      null
    );

    expect(readiness.chapters[1]).toMatchObject({
      status: "ready",
      preparedSentenceCount: 2,
      totalSentenceCount: 2
    });
  });

  it("hydrates every chapter before preparing and projects completion through events", async () => {
    const fullDocument = document();
    const catalog = {
      list: vi.fn(),
      open: vi.fn(async (_bookId: string, chapterId?: string) => ({
        ...fullDocument,
        activeChapterId: chapterId ?? fullDocument.activeChapterId,
        chapters: fullDocument.chapters.map((chapter) => ({
          ...chapter,
          sentences:
            chapter.id === (chapterId ?? fullDocument.activeChapterId) ? chapter.sentences : []
        }))
      }))
    };
    const prepareBook = vi.fn(
      async (
        preparedDocument: ReaderDocumentDto,
        _voiceId: string,
        options: { onProgress(progress: NarrationBookPreparationProgress): void }
      ) => {
        expect(preparedDocument.chapters.every((chapter) => chapter.sentences.length === 2)).toBe(
          true
        );
        options.onProgress({
          activeChapterId: "chapter-3",
          completedChapterIds: ["chapter-1", "chapter-2", "chapter-3"],
          completedPassageCount: 3,
          totalPassageCount: 3,
          preparedSentenceCount: 6,
          totalSentenceCount: 6
        });
        return { sentenceCount: 6 };
      }
    );
    const projectNotice = vi.fn();
    const dispatcher = createDomainEventDispatcher();
    const lifecycle: string[] = [];
    dispatcher.subscribe("BookNarrationPreparationProgressed", () => {
      lifecycle.push("progress");
    });
    dispatcher.subscribe("BookNarrationPreparationReady", () => {
      lifecycle.push("ready");
    });
    const application = createReaderBookNarrationPreparationApplication(
      {
        audioCache: {
          getStats: vi.fn(),
          getChapterStats: vi.fn().mockResolvedValue([]),
          clear: vi.fn()
        },
        catalog,
        eventDispatcher: dispatcher,
        narration: {
          bookIdentity: () => ({ voiceId: "kokoro:af-heart", modelRevision: "kokoro-test" }),
          prepareBook
        },
        friendlyError: (error) => String(error)
      },
      {
        isAvailable: () => true,
        currentBookId: () => "book-1",
        currentVoiceId: () => "kokoro:af-heart",
        projectReadiness: vi.fn(),
        projectProgress: vi.fn(),
        projectNotice
      }
    );
    const stop = application.start();

    application.request();

    await vi.waitFor(() => expect(prepareBook).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(projectNotice).toHaveBeenCalledWith("This book is ready to listen offline.")
    );
    expect(lifecycle).toEqual(["progress", "progress", "ready"]);
    expect(catalog.open).toHaveBeenCalledTimes(6);
    stop();
  });

  it("clears the previous book projection before loading readiness for the next book", async () => {
    const firstDocument = document();
    const secondDocument: ReaderDocumentDto = {
      ...document(),
      book: { id: "book-2", title: "Second Book", author: "Author", language: "en" },
      activeChapterId: "book-2-chapter",
      chapters: [chapter("book-2-chapter", ["book-2-sentence"])]
    };
    let resolveSecondDocument!: (document: ReaderDocumentDto) => void;
    const secondDocumentLoad = new Promise<ReaderDocumentDto>((resolve) => {
      resolveSecondDocument = resolve;
    });
    let currentBookId = "book-1";
    const projectReadiness = vi.fn();
    const catalog = {
      list: vi.fn(),
      open: vi.fn((bookId: string) =>
        bookId === "book-1" ? Promise.resolve(firstDocument) : secondDocumentLoad
      )
    };
    const dispatcher = createDomainEventDispatcher();
    const application = createReaderBookNarrationPreparationApplication(
      {
        audioCache: {
          getStats: vi.fn(),
          getChapterStats: vi.fn().mockResolvedValue([]),
          clear: vi.fn()
        },
        catalog,
        eventDispatcher: dispatcher,
        narration: {
          bookIdentity: () => ({ voiceId: "kokoro:af-heart", modelRevision: "kokoro-test" }),
          prepareBook: vi.fn()
        },
        friendlyError: (error) => String(error)
      },
      {
        isAvailable: () => true,
        currentBookId: () => currentBookId,
        currentVoiceId: () => "kokoro:af-heart",
        projectReadiness,
        projectProgress: vi.fn(),
        projectNotice: vi.fn()
      }
    );
    const stop = application.start();

    await vi.waitFor(() =>
      expect(projectReadiness).toHaveBeenLastCalledWith(
        expect.objectContaining({ totalSentenceCount: 6 })
      )
    );

    await dispatcher.dispatch(
      createDomainEvent("ReaderOpened", {
        bookId: "book-2",
        chapterId: "book-2-chapter",
        sentenceId: "book-2-sentence",
        sentenceIndex: 0,
        playbackStatus: "idle",
        source: "library"
      })
    );
    await vi.waitFor(() => expect(catalog.open).toHaveBeenCalledWith("book-2"));

    expect(projectReadiness).toHaveBeenLastCalledWith(null);

    currentBookId = "book-2";
    resolveSecondDocument(secondDocument);
    await vi.waitFor(() =>
      expect(projectReadiness).toHaveBeenLastCalledWith(
        expect.objectContaining({ totalSentenceCount: 1 })
      )
    );
    stop();
  });
});

function document(): ReaderDocumentDto {
  return {
    book: { id: "book-1", title: "Book", author: "Author", language: "en" },
    activeChapterId: "chapter-1",
    position: null,
    chapters: [
      chapter("chapter-1", ["c1-s1", "c1-s2"]),
      chapter("chapter-2", ["c2-s1", "c2-s2"]),
      chapter("chapter-3", ["c3-s1", "c3-s2"])
    ]
  };
}

function chapter(id: string, sentenceIds: string[]): ReaderDocumentDto["chapters"][number] {
  return {
    id,
    title: id,
    index: Number(id.slice(-1)) - 1,
    sentenceCount: sentenceIds.length,
    sentences: sentenceIds.map((sentenceId, index) => ({
      id: sentenceId,
      index,
      text: `A sufficiently descriptive sentence number ${index + 1}.`
    })),
    paragraphs: [{ id: `${id}:p1`, index: 0, startSentenceIndex: 0, sentenceCount: 2 }]
  };
}
