import { createDomainEvent, type DomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type {
  BookCatalog,
  BookImportGateway,
  BookImportRequest,
  BookImportSourceStore,
  BookmarkStore,
  SaveBookmarkInput
} from "../library/library-contracts";

export interface ReaderLibraryWorkflowDependencies {
  eventDispatcher: DomainEventDispatcher;
  catalog: Pick<BookCatalog, "list">;
  importGateway: BookImportGateway;
  importSourceStore: BookImportSourceStore;
  bookmarks: Pick<BookmarkStore, "delete" | "save">;
  friendlyError(error: unknown): string;
  onEventError?(error: unknown): void;
}

export interface ReaderLibraryWorkflows {
  importFromDialog(): Promise<void>;
  importFromPath(path: string): Promise<void>;
  cancelImportPreparation(): void;
  saveBookmark(input: SaveBookmarkInput): Promise<void>;
  deleteBookmark(bookmarkId: string, bookId: string): Promise<void>;
  start(): () => void;
}

export function createReaderLibraryWorkflows(
  dependencies: ReaderLibraryWorkflowDependencies
): ReaderLibraryWorkflows {
  let activePreparation: { requestId: string; controller: AbortController } | null = null;
  const publish = async (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) => {
    try {
      await dependencies.eventDispatcher.dispatch(event);
    } catch (error) {
      reportEventErrorSafely(dependencies.onEventError, error);
    }
  };

  const importBook = async (request: BookImportRequest, path: string | null) => {
    let progressEvents = Promise.resolve();
    try {
      const existingBookIds = new Set((await dependencies.catalog.list()).map((book) => book.id));
      const outcome = await dependencies.importGateway.importBook(request, {
        onProgress(progress) {
          progressEvents = progressEvents.then(() =>
            publish(createDomainEvent("BookImportProgressed", { phase: progress.phase }))
          );
        }
      });
      await progressEvents;
      if (outcome.status === "cancelled") {
        await publish(createDomainEvent("BookImportCancelled", { path }));
        return;
      }
      if (outcome.status === "source-selected") {
        await publish(createDomainEvent("BookImportSourceSelected", { source: outcome.source }));
        return;
      }
      const { document } = outcome;

      await publish(
        createDomainEvent("BookImported", {
          bookId: document.book.id,
          title: document.book.title,
          chapterCount: document.chapters.length,
          replacedExisting: existingBookIds.has(document.book.id)
        })
      );
    } catch (error) {
      await progressEvents;
      await publish(
        createDomainEvent("BookImportFailed", {
          path,
          reason: dependencies.friendlyError(error)
        })
      );
    }
  };

  const handleImportRequested = async (event: DomainEvent<"BookImportRequested">) => {
    const { path } = event.payload;
    await importBook(path == null ? { kind: "choose" } : { kind: "provided", source: path }, path);
  };

  const handleSourcePrepared = async (event: DomainEvent<"BookImportSourcePrepared">) => {
    await importBook({ kind: "provided", source: event.payload.source }, event.payload.source);
  };

  const handleSourceSelected = async (event: DomainEvent<"BookImportSourceSelected">) => {
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    activePreparation?.controller.abort();
    activePreparation = { requestId, controller };
    await publish(createDomainEvent("BookImportPreparationStarted", { requestId }));
    let progressEvents = Promise.resolve();

    try {
      const prepared = await dependencies.importSourceStore.prepare(event.payload.source, {
        requestId,
        signal: controller.signal,
        onProgress(progress) {
          progressEvents = progressEvents.then(() =>
            publish(
              createDomainEvent("BookImportPreparationProgressed", {
                requestId,
                completedBytes: progress.completedBytes,
                totalBytes: progress.totalBytes
              })
            )
          );
        }
      });
      await progressEvents;
      await publish(
        createDomainEvent("BookImportSourcePrepared", {
          requestId,
          source: prepared.source,
          reusedExisting: prepared.reusedExisting
        })
      );
    } catch (error) {
      await progressEvents;
      if (controller.signal.aborted || isAbortError(error)) {
        await publish(createDomainEvent("BookImportPreparationCancelled", { requestId }));
      } else {
        await publish(
          createDomainEvent("BookImportFailed", {
            path: null,
            reason: dependencies.friendlyError(error)
          })
        );
      }
    } finally {
      if (activePreparation?.requestId === requestId) activePreparation = null;
    }
  };

  return {
    async importFromDialog() {
      await publish(createDomainEvent("BookImportRequested", { path: null }));
    },
    async importFromPath(path) {
      await publish(createDomainEvent("BookImportRequested", { path }));
    },
    cancelImportPreparation() {
      activePreparation?.controller.abort();
    },
    async saveBookmark(input) {
      const bookmark = await dependencies.bookmarks.save(input);
      await publish(
        createDomainEvent("BookmarkCreated", {
          bookmarkId: bookmark.id,
          bookId: bookmark.bookId,
          chapterId: bookmark.chapterId,
          sentenceId: bookmark.sentenceId,
          sentenceIndex: bookmark.sentenceIndex
        })
      );
    },
    async deleteBookmark(bookmarkId, bookId) {
      await dependencies.bookmarks.delete(bookmarkId);
      await publish(createDomainEvent("BookmarkDeleted", { bookmarkId, bookId }));
    },
    start() {
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("BookImportRequested", handleImportRequested),
        dependencies.eventDispatcher.subscribe("BookImportSourceSelected", handleSourceSelected),
        dependencies.eventDispatcher.subscribe("BookImportSourcePrepared", handleSourcePrepared)
      ];
      return () => {
        activePreparation?.controller.abort();
        subscriptions.forEach((unsubscribe) => unsubscribe());
      };
    }
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function reportEventErrorSafely(reporter: ((error: unknown) => void) | undefined, error: unknown) {
  try {
    reporter?.(error);
  } catch {
    // Development diagnostics must not alter library behavior.
  }
}
