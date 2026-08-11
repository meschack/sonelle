import { describe, expect, it, vi } from "vitest";
import { createDomainEvent, createDomainEventDispatcher } from "@sonelle/domain";
import { createReaderLibraryWorkflows } from "./reader-library-workflows";

const importedDocument = {
  book: { id: "book-1", title: "The Book", author: "A. Writer", language: "en" },
  activeChapterId: "chapter-1",
  chapters: [
    {
      id: "chapter-1",
      title: "Chapter 1",
      index: 0,
      sentenceCount: 1,
      sentences: [{ id: "sentence-1", index: 0, text: "Hello." }]
    }
  ],
  position: null
};

const unusedImportSourceStore = { prepare: vi.fn() };

describe("reader library workflows", () => {
  it("publishes an import fact and leaves reactions to listeners", async () => {
    const dispatcher = createDomainEventDispatcher();
    const projectionReaction = vi.fn();
    const openBookReaction = vi.fn();
    dispatcher.subscribe("BookImported", projectionReaction);
    dispatcher.subscribe("BookImported", openBookReaction);
    const importBook = vi.fn().mockResolvedValue({
      status: "imported",
      document: importedDocument
    });
    const workflows = createReaderLibraryWorkflows({
      eventDispatcher: dispatcher,
      friendlyError: friendlyError,
      catalog: { list: vi.fn().mockResolvedValue([{ id: "book-1" }]) },
      importGateway: { importBook },
      importSourceStore: unusedImportSourceStore,
      bookmarks: { save: vi.fn(), delete: vi.fn() }
    });
    const stop = workflows.start();

    await workflows.importFromDialog();

    expect(projectionReaction).toHaveBeenCalledOnce();
    expect(openBookReaction).toHaveBeenCalledOnce();
    expect(importBook).toHaveBeenCalledWith({ kind: "choose" });
    expect(projectionReaction.mock.calls[0]?.[0]).toMatchObject({
      name: "BookImported",
      payload: { bookId: "book-1", replacedExisting: true }
    });
    stop();
  });

  it("publishes bookmark facts after their core operations succeed", async () => {
    const dispatcher = createDomainEventDispatcher();
    const created = vi.fn();
    const deleted = vi.fn();
    dispatcher.subscribe("BookmarkCreated", created);
    dispatcher.subscribe("BookmarkDeleted", deleted);
    const bookmarks = {
      save: vi.fn().mockResolvedValue({
        id: "bookmark-1",
        bookId: "book-1",
        chapterId: "chapter-1",
        sentenceId: "sentence-1",
        sentenceIndex: 0
      }),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const workflows = createReaderLibraryWorkflows({
      eventDispatcher: dispatcher,
      friendlyError,
      catalog: { list: vi.fn().mockResolvedValue([]) },
      importGateway: { importBook: vi.fn() },
      importSourceStore: unusedImportSourceStore,
      bookmarks
    });

    await workflows.saveBookmark({
      bookId: "book-1",
      bookTitle: "The Book",
      chapterId: "chapter-1",
      chapterTitle: "Chapter 1",
      sentenceId: "sentence-1",
      sentenceIndex: 0,
      text: "Hello.",
      note: null
    });
    await workflows.deleteBookmark("bookmark-1", "book-1");

    expect(created).toHaveBeenCalledOnce();
    expect(deleted).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "BookmarkDeleted",
        payload: { bookmarkId: "bookmark-1", bookId: "book-1" }
      })
    );
  });

  it("publishes import failures without making the request producer own the reaction", async () => {
    const dispatcher = createDomainEventDispatcher();
    const failed = vi.fn();
    dispatcher.subscribe("BookImportFailed", failed);
    const importBook = vi.fn().mockRejectedValue(new Error("broken EPUB"));
    const workflows = createReaderLibraryWorkflows({
      eventDispatcher: dispatcher,
      friendlyError,
      catalog: { list: vi.fn().mockResolvedValue([]) },
      importGateway: { importBook },
      importSourceStore: unusedImportSourceStore,
      bookmarks: { save: vi.fn(), delete: vi.fn() }
    });
    const stop = workflows.start();

    await expect(workflows.importFromPath("/tmp/broken.epub")).resolves.toBeUndefined();

    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "BookImportFailed",
        payload: { path: "/tmp/broken.epub", reason: "broken EPUB" }
      })
    );
    expect(importBook).toHaveBeenCalledWith({
      kind: "provided",
      source: "/tmp/broken.epub"
    });
    stop();
  });

  it("publishes a terminal fact when the import dialog is dismissed", async () => {
    const dispatcher = createDomainEventDispatcher();
    const cancelled = vi.fn();
    dispatcher.subscribe("BookImportCancelled", cancelled);
    const importBook = vi.fn().mockResolvedValue({ status: "cancelled" });
    const workflows = createReaderLibraryWorkflows({
      eventDispatcher: dispatcher,
      friendlyError,
      catalog: { list: vi.fn().mockResolvedValue([]) },
      importGateway: { importBook },
      importSourceStore: unusedImportSourceStore,
      bookmarks: { save: vi.fn(), delete: vi.fn() }
    });
    const stop = workflows.start();

    await workflows.importFromDialog();

    expect(cancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "BookImportCancelled",
        payload: { path: null }
      })
    );
    expect(importBook).toHaveBeenCalledWith({ kind: "choose" });
    stop();
  });

  it("publishes progress and a deterministic prepared source for the shared importer", async () => {
    const dispatcher = createDomainEventDispatcher();
    const selected = vi.fn();
    const progressed = vi.fn();
    const prepared = vi.fn();
    const imported = vi.fn();
    dispatcher.subscribe("BookImportSourceSelected", selected);
    dispatcher.subscribe("BookImportPreparationProgressed", progressed);
    dispatcher.subscribe("BookImportSourcePrepared", prepared);
    dispatcher.subscribe("BookImported", imported);
    const prepare = vi.fn().mockImplementation(async (_source, options) => {
      options.onProgress({ completedBytes: 5, totalBytes: 10 });
      return {
        source: "/data/import-sources/hash.epub",
        reusedExisting: true
      };
    });
    const workflows = createReaderLibraryWorkflows({
      eventDispatcher: dispatcher,
      friendlyError,
      catalog: { list: vi.fn().mockResolvedValue([]) },
      importGateway: {
        importBook: vi.fn().mockImplementation(async (request) =>
          request.kind === "choose"
            ? {
                status: "source-selected",
                source: "content://books/the-book.epub"
              }
            : { status: "imported", document: importedDocument }
        )
      },
      importSourceStore: { prepare },
      bookmarks: { save: vi.fn(), delete: vi.fn() }
    });
    const stop = workflows.start();

    await workflows.importFromDialog();

    expect(selected).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "BookImportSourceSelected",
        payload: { source: "content://books/the-book.epub" }
      })
    );
    expect(progressed).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ completedBytes: 5, totalBytes: 10 })
      })
    );
    expect(prepared).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          source: "/data/import-sources/hash.epub",
          reusedExisting: true
        })
      })
    );
    expect(prepare).toHaveBeenCalledWith(
      "content://books/the-book.epub",
      expect.objectContaining({ requestId: expect.any(String) })
    );
    expect(imported).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ bookId: "book-1", title: "The Book" })
      })
    );
    stop();
  });

  it("publishes a humane failure when a prepared Android source cannot be imported", async () => {
    const dispatcher = createDomainEventDispatcher();
    const failed = vi.fn();
    const imported = vi.fn();
    dispatcher.subscribe("BookImportFailed", failed);
    dispatcher.subscribe("BookImported", imported);
    const managedSource = "/data/import-sources/damaged.epub";
    const importBook = vi.fn().mockRejectedValue(new Error("That EPUB could not be read."));
    const workflows = createReaderLibraryWorkflows({
      eventDispatcher: dispatcher,
      friendlyError,
      catalog: { list: vi.fn().mockResolvedValue([]) },
      importGateway: { importBook },
      importSourceStore: unusedImportSourceStore,
      bookmarks: { save: vi.fn(), delete: vi.fn() }
    });
    const stop = workflows.start();

    await dispatcher.dispatch(
      createDomainEvent("BookImportSourcePrepared", {
        requestId: "import-request-1",
        source: managedSource,
        reusedExisting: false
      })
    );

    expect(importBook).toHaveBeenCalledWith({ kind: "provided", source: managedSource });
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { path: managedSource, reason: "That EPUB could not be read." }
      })
    );
    expect(imported).not.toHaveBeenCalled();
    stop();
  });

  it("cancels active source preparation without publishing a failure", async () => {
    const dispatcher = createDomainEventDispatcher();
    const cancelled = vi.fn();
    const failed = vi.fn();
    dispatcher.subscribe("BookImportPreparationCancelled", cancelled);
    dispatcher.subscribe("BookImportFailed", failed);
    const prepare = vi.fn().mockImplementation((_source, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          reject(new DOMException("Book import was cancelled.", "AbortError"));
        });
      });
    });
    const workflows = createReaderLibraryWorkflows({
      eventDispatcher: dispatcher,
      friendlyError,
      catalog: { list: vi.fn().mockResolvedValue([]) },
      importGateway: { importBook: vi.fn() },
      importSourceStore: { prepare },
      bookmarks: { save: vi.fn(), delete: vi.fn() }
    });
    const stop = workflows.start();

    const running = dispatcher.dispatch(
      createDomainEvent("BookImportSourceSelected", {
        source: "content://books/the-book.epub"
      })
    );
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    workflows.cancelImportPreparation();
    await running;

    expect(cancelled).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    stop();
  });
});

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "Import failed";
}
