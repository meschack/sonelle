import { createDomainEvent, type DomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type { ChapterAudioCacheStatsDto } from "../audio/audio-cache-repository";
import type { AudioCacheRepository } from "../audio/audio-cache-repository";
import type { BookCatalog } from "../library/library-contracts";
import type { ReaderDocumentDto } from "../library/library-models";
import type { ReaderNarrationService } from "./reader-dependencies";

export type ChapterNarrationReadinessStatus = "ready" | "preparing" | "unavailable";

export interface ChapterNarrationReadiness {
  id: string;
  title: string;
  status: ChapterNarrationReadinessStatus;
  preparedSentenceCount: number;
  totalSentenceCount: number;
  sizeBytes: number;
}

export interface BookNarrationReadiness {
  bookId: string;
  chapters: readonly ChapterNarrationReadiness[];
  preparedSentenceCount: number;
  totalSentenceCount: number;
  sizeBytes: number;
  estimatedSizeBytes: number;
}

export interface BookNarrationProgressView {
  activeChapterId: string;
  completedChapterIds: readonly string[];
  preparedSentenceCount: number;
  totalSentenceCount: number;
}

interface ReaderBookNarrationPreparationDependencies {
  audioCache: AudioCacheRepository;
  catalog: BookCatalog;
  eventDispatcher: DomainEventDispatcher;
  narration: Pick<ReaderNarrationService, "bookIdentity" | "prepareBook">;
  friendlyError(error: unknown): string;
}

interface ReaderBookNarrationPreparationOptions {
  isAvailable(): boolean;
  currentBookId(): string;
  currentVoiceId(): string;
  projectReadiness(readiness: BookNarrationReadiness | null): void;
  projectProgress(progress: BookNarrationProgressView | null): void;
  projectNotice(message: string | null): void;
}

export interface ReaderBookNarrationPreparationApplication {
  start(): () => void;
  refresh(): Promise<void>;
  request(): void;
  cancel(): void;
}

export function projectBookNarrationReadiness(
  document: ReaderDocumentDto,
  cacheStats: readonly ChapterAudioCacheStatsDto[],
  progress: BookNarrationProgressView | null
): BookNarrationReadiness {
  const statsByChapter = new Map(cacheStats.map((stats) => [stats.chapterId, stats]));
  const completedChapterIds = new Set(progress?.completedChapterIds ?? []);
  const chapters = document.chapters.map((chapter): ChapterNarrationReadiness => {
    const stats = statsByChapter.get(chapter.id);
    const preparedSentenceCount = Math.min(
      chapter.sentenceCount,
      new Set(stats?.sentenceIds ?? []).size
    );
    const ready =
      completedChapterIds.has(chapter.id) ||
      (chapter.sentenceCount > 0 && preparedSentenceCount >= chapter.sentenceCount);
    const preparing = !ready && progress?.activeChapterId === chapter.id;

    return {
      id: chapter.id,
      title: chapter.title,
      status: ready ? "ready" : preparing ? "preparing" : "unavailable",
      preparedSentenceCount: ready ? chapter.sentenceCount : preparedSentenceCount,
      totalSentenceCount: chapter.sentenceCount,
      sizeBytes: stats?.sizeBytes ?? 0
    };
  });
  const totalSentenceCount = chapters.reduce(
    (total, chapter) => total + chapter.totalSentenceCount,
    0
  );
  const cachedSentenceCount = chapters.reduce(
    (total, chapter) => total + chapter.preparedSentenceCount,
    0
  );
  const preparedSentenceCount = Math.min(
    totalSentenceCount,
    Math.max(cachedSentenceCount, progress?.preparedSentenceCount ?? 0)
  );
  const sizeBytes = chapters.reduce((total, chapter) => total + chapter.sizeBytes, 0);
  const estimatedSizeBytes = estimatePreparedBookSize(
    document,
    sizeBytes,
    cachedSentenceCount,
    totalSentenceCount
  );

  return {
    bookId: document.book.id,
    chapters,
    preparedSentenceCount,
    totalSentenceCount,
    sizeBytes,
    estimatedSizeBytes
  };
}

export function createReaderBookNarrationPreparationApplication(
  dependencies: ReaderBookNarrationPreparationDependencies,
  options: ReaderBookNarrationPreparationOptions
): ReaderBookNarrationPreparationApplication {
  let controller: AbortController | null = null;
  let preparationBookId: string | null = null;
  let document: ReaderDocumentDto | null = null;
  let cacheStats: ChapterAudioCacheStatsDto[] = [];
  let progress: BookNarrationProgressView | null = null;
  let projectionVoiceId: string | null = null;
  let requestedBookId = options.currentBookId();
  let requestedVoiceId = options.currentVoiceId();
  let requestedBookAvailable = options.isAvailable();

  const publish = (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) =>
    dependencies.eventDispatcher.dispatch(event).catch((error) => {
      options.projectNotice(dependencies.friendlyError(error));
    });
  const project = () => {
    options.projectProgress(progress);
    options.projectReadiness(
      document == null ? null : projectBookNarrationReadiness(document, cacheStats, progress)
    );
  };
  const clearProjection = () => {
    document = null;
    cacheStats = [];
    progress = null;
    projectionVoiceId = null;
    project();
  };

  const refreshBook = async (bookId: string, voiceId: string, isAvailable: boolean) => {
    requestedBookId = bookId;
    requestedVoiceId = voiceId;
    requestedBookAvailable = isAvailable;
    if (!isAvailable) {
      clearProjection();
      return;
    }
    if (document?.book.id !== bookId || projectionVoiceId !== voiceId) {
      clearProjection();
    }
    try {
      const nextDocument = await dependencies.catalog.open(bookId);
      const identity = dependencies.narration.bookIdentity(nextDocument, voiceId);
      const nextStats =
        identity == null
          ? []
          : await dependencies.audioCache.getChapterStats(
              bookId,
              identity.voiceId,
              identity.modelRevision
            );
      if (bookId !== requestedBookId || voiceId !== requestedVoiceId) return;
      document = nextDocument;
      cacheStats = nextStats;
      projectionVoiceId = voiceId;
      project();
    } catch (error) {
      if (bookId === requestedBookId && voiceId === requestedVoiceId) {
        options.projectNotice(dependencies.friendlyError(error));
      }
    }
  };
  const refresh = () =>
    refreshBook(options.currentBookId(), options.currentVoiceId(), options.isAvailable());

  const prepare = async (event: DomainEvent<"BookNarrationPreparationRequested">) => {
    if (event.payload.bookId !== options.currentBookId() || controller != null) return;
    const activeController = new AbortController();
    controller = activeController;
    preparationBookId = event.payload.bookId;
    options.projectNotice(null);
    let progressEvents = Promise.resolve();

    try {
      const preparationDocument = await openCompleteReaderDocument(
        dependencies.catalog,
        event.payload.bookId
      );
      const firstChapter = preparationDocument.chapters[0];
      if (firstChapter != null) {
        await publish(
          createDomainEvent("BookNarrationPreparationProgressed", {
            bookId: event.payload.bookId,
            activeChapterId: firstChapter.id,
            completedChapterIds: [],
            preparedSentenceCount: 0,
            totalSentenceCount: preparationDocument.chapters.reduce(
              (total, chapter) => total + chapter.sentenceCount,
              0
            )
          })
        );
      }
      const result = await dependencies.narration.prepareBook(
        preparationDocument,
        event.payload.voiceId,
        {
          signal: activeController.signal,
          onProgress(nextProgress) {
            progressEvents = progressEvents.then(() => {
              if (controller !== activeController || activeController.signal.aborted) return;
              return publish(
                createDomainEvent("BookNarrationPreparationProgressed", {
                  bookId: event.payload.bookId,
                  activeChapterId: nextProgress.activeChapterId,
                  completedChapterIds: [...nextProgress.completedChapterIds],
                  preparedSentenceCount: nextProgress.preparedSentenceCount,
                  totalSentenceCount: nextProgress.totalSentenceCount
                })
              );
            });
          }
        }
      );
      await progressEvents;
      if (!activeController.signal.aborted) {
        await publish(
          createDomainEvent("BookNarrationPreparationReady", {
            bookId: event.payload.bookId,
            sentenceCount: result.sentenceCount
          })
        );
      }
    } catch (error) {
      if (!activeController.signal.aborted) {
        await publish(
          createDomainEvent("BookNarrationPreparationFailed", {
            bookId: event.payload.bookId,
            reason: dependencies.friendlyError(error)
          })
        );
      }
    } finally {
      if (controller === activeController) {
        controller = null;
        preparationBookId = null;
      }
    }
  };

  return {
    start() {
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("BookNarrationPreparationRequested", prepare),
        dependencies.eventDispatcher.subscribe("BookNarrationPreparationProgressed", (event) => {
          if (event.payload.bookId !== options.currentBookId()) return;
          progress = event.payload;
          project();
        }),
        dependencies.eventDispatcher.subscribe("BookNarrationPreparationCancelled", (event) => {
          if (event.payload.bookId !== options.currentBookId()) return;
          controller?.abort(new DOMException("Book preparation cancelled.", "AbortError"));
          progress = null;
          options.projectNotice("Book preparation cancelled. Ready chapters were kept.");
          void refresh();
        }),
        dependencies.eventDispatcher.subscribe("BookNarrationPreparationReady", (event) => {
          if (event.payload.bookId !== options.currentBookId()) return;
          progress = null;
          options.projectNotice("This book is ready to listen offline.");
          void refresh();
        }),
        dependencies.eventDispatcher.subscribe("BookNarrationPreparationFailed", (event) => {
          if (event.payload.bookId !== options.currentBookId()) return;
          progress = null;
          options.projectNotice(event.payload.reason);
          void refresh();
        }),
        dependencies.eventDispatcher.subscribe("ReaderOpened", (event) => {
          if (preparationBookId != null && preparationBookId !== event.payload.bookId) {
            controller?.abort(new DOMException("Reader changed books.", "AbortError"));
            controller = null;
            preparationBookId = null;
            progress = null;
          }
          void refreshBook(
            event.payload.bookId,
            options.currentVoiceId(),
            event.payload.source === "library"
          );
        }),
        dependencies.eventDispatcher.subscribe("NarrationSettingsChanged", (event) => {
          if (event.payload.source === "book") return;
          if (controller != null) {
            void publish(
              createDomainEvent("BookNarrationPreparationCancelled", {
                bookId: options.currentBookId()
              })
            );
          } else {
            void refreshBook(
              requestedBookId,
              event.payload.settings.voiceId,
              requestedBookAvailable
            );
          }
        }),
        dependencies.eventDispatcher.subscribe("PreparedNarrationClearingRequested", (event) => {
          if (event.payload.bookId !== preparationBookId) return;
          controller?.abort(new DOMException("Prepared audio is being cleared.", "AbortError"));
          controller = null;
          preparationBookId = null;
          progress = null;
          project();
        }),
        dependencies.eventDispatcher.subscribe("PreparedNarrationCleared", () => void refresh())
      ];
      void refresh();
      return () => {
        controller?.abort(new DOMException("Reader closed.", "AbortError"));
        controller = null;
        preparationBookId = null;
        subscriptions.forEach((unsubscribe) => unsubscribe());
      };
    },
    refresh,
    request() {
      if (!options.isAvailable()) return;
      void publish(
        createDomainEvent("BookNarrationPreparationRequested", {
          bookId: options.currentBookId(),
          voiceId: options.currentVoiceId()
        })
      );
    },
    cancel() {
      if (!options.isAvailable()) return;
      void publish(
        createDomainEvent("BookNarrationPreparationCancelled", {
          bookId: options.currentBookId()
        })
      );
    }
  };
}

async function openCompleteReaderDocument(
  catalog: BookCatalog,
  bookId: string
): Promise<ReaderDocumentDto> {
  const summary = await catalog.open(bookId);
  const chapters = [];
  for (const chapter of summary.chapters) {
    const chapterDocument = await catalog.open(bookId, chapter.id);
    chapters.push(
      chapterDocument.chapters.find((candidate) => candidate.id === chapter.id) ?? chapter
    );
  }
  return { ...summary, chapters };
}

function estimatePreparedBookSize(
  document: ReaderDocumentDto,
  sizeBytes: number,
  preparedSentenceCount: number,
  totalSentenceCount: number
): number {
  if (preparedSentenceCount > 0 && sizeBytes > 0) {
    return Math.max(
      sizeBytes,
      Math.round((sizeBytes / preparedSentenceCount) * totalSentenceCount)
    );
  }

  const loadedCharacterCount = document.chapters.reduce(
    (total, chapter) =>
      total +
      chapter.sentences.reduce((chapterTotal, sentence) => chapterTotal + sentence.text.length, 0),
    0
  );
  const loadedSentenceCount = document.chapters.reduce(
    (total, chapter) => total + chapter.sentences.length,
    0
  );
  const estimatedCharacterCount =
    loadedSentenceCount > 0
      ? (loadedCharacterCount / loadedSentenceCount) * totalSentenceCount
      : totalSentenceCount * 100;
  return Math.round(estimatedCharacterCount * 3_200);
}
