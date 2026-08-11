import { describe, expect, it, vi } from "vitest";
import {
  createDomainEvent,
  createDomainEventDispatcher,
  type AnyDomainEvent
} from "@sonelle/domain";
import { libraryImportNotice } from "@sonelle/library";
import type { LibraryBookmarkDto } from "../library/library-contracts";
import type { LibraryBookSummary, ReaderDocumentDto } from "../library/library-models";
import { createReaderLibraryApplication } from "./reader-library-application";

const book: LibraryBookSummary = {
  id: "book-1",
  title: "Book",
  author: "Writer",
  importedAt: "2026-07-15T00:00:00.000Z",
  chapterCount: 1,
  sentenceCount: 1,
  lastChapterId: null,
  completedSentenceCount: 0
};

const document = {
  book: { id: "book-1", title: "Book", author: "Writer", language: "en" },
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

describe("reader library application", () => {
  it("restores the most recently read book after a normal restart", async () => {
    const olderBook = { ...book, id: "book-older", lastReadAt: "2026-07-01T08:00:00Z" };
    const recentBook = { ...book, id: "book-recent", lastReadAt: "2026-07-02T08:00:00Z" };
    const open = vi.fn().mockResolvedValue({
      ...document,
      book: { ...document.book, id: recentBook.id }
    });
    const openDocument = vi.fn().mockResolvedValue(undefined);
    const application = createReaderLibraryApplication(
      {
        catalog: { list: vi.fn().mockResolvedValue([olderBook, recentBook]), open },
        drops: { listen: async () => () => undefined },
        openRequests: { listen: async () => () => undefined },
        importGateway: { importBook: vi.fn() },
        importSourceStore: { prepare: vi.fn() },
        bookmarks: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
        eventDispatcher: createDomainEventDispatcher(),
        friendlyError: () => "Library needs attention"
      },
      {
        activeView: () => "reader",
        currentBookSource: () => "sample",
        projectBooks: vi.fn(),
        projectBookmarks: vi.fn(),
        projectLoading: vi.fn(),
        projectImporting: vi.fn(),
        projectDropTarget: vi.fn(),
        projectLibraryNotice: vi.fn(),
        projectBookmarkNotice: vi.fn(),
        openDocument,
        openBookmarkInspector: vi.fn()
      }
    );

    await application.refresh();

    expect(open).toHaveBeenCalledWith("book-recent", undefined);
    expect(openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ book: expect.objectContaining({ id: "book-recent" }) }),
      {}
    );
  });

  it("ends the busy state when Android source preparation finishes", async () => {
    const dispatcher = createDomainEventDispatcher();
    const importing: boolean[] = [];
    const projectedBooks: LibraryBookSummary[][] = [];
    const openedDocuments: ReaderDocumentDto[] = [];
    const application = createReaderLibraryApplication(
      {
        catalog: {
          list: vi.fn().mockResolvedValue([book]),
          open: vi.fn().mockResolvedValue(document)
        },
        drops: { listen: async () => () => undefined },
        openRequests: { listen: async () => () => undefined },
        importGateway: {
          importBook: vi.fn().mockImplementation(async (request) =>
            request.kind === "choose"
              ? {
                  status: "source-selected",
                  source: "content://books/the-book.epub"
                }
              : { status: "imported", document }
          )
        },
        importSourceStore: {
          prepare: vi.fn().mockResolvedValue({
            source: "/data/import-sources/book.epub",
            reusedExisting: false
          })
        },
        bookmarks: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
        eventDispatcher: dispatcher,
        friendlyError: () => "Library needs attention"
      },
      {
        activeView: () => "library",
        currentBookSource: () => "library",
        projectBooks: (books) => projectedBooks.push(books),
        projectBookmarks: vi.fn(),
        projectLoading: vi.fn(),
        projectImporting: (active) => importing.push(active),
        projectDropTarget: vi.fn(),
        projectLibraryNotice: vi.fn(),
        projectBookmarkNotice: vi.fn(),
        openDocument: async (next) => void openedDocuments.push(next),
        openBookmarkInspector: vi.fn()
      }
    );
    const stop = await application.start();

    await application.importFromDialog();
    await vi.waitFor(() => expect(importing).toEqual([true, false]));
    expect(projectedBooks[projectedBooks.length - 1]).toEqual([book]);
    expect(openedDocuments[openedDocuments.length - 1]?.book).toMatchObject({
      title: "Book",
      author: "Writer"
    });
    expect(openedDocuments[openedDocuments.length - 1]?.chapters).toHaveLength(1);

    stop();
  });

  it("coordinates import facts and independent library projections through its interface", async () => {
    const dispatcher = createDomainEventDispatcher();
    const events: AnyDomainEvent[] = [];
    dispatcher.subscribe("BookImportRequested", (event) => {
      events.push(event);
    });
    const books: string[][] = [];
    const opened: string[] = [];
    const notices: Array<string | null> = [];
    const importing: boolean[] = [];
    let projectedBookmarks: LibraryBookmarkDto[] = [];
    const stopDropListener = vi.fn();
    const stopOpenRequestListener = vi.fn();
    let handleOpenRequest: ((path: string) => Promise<void>) | undefined;
    const importBook = vi.fn().mockResolvedValue({ status: "imported", document });
    const listBooks = vi.fn(async () => [book]);
    const application = createReaderLibraryApplication(
      {
        catalog: {
          list: listBooks,
          open: async () => document
        },
        drops: { listen: async () => stopDropListener },
        openRequests: {
          async listen(listener) {
            handleOpenRequest = listener;
            return stopOpenRequestListener;
          }
        },
        importGateway: { importBook },
        importSourceStore: { prepare: vi.fn() },
        bookmarks: {
          list: async () => [],
          save: vi.fn(),
          delete: vi.fn()
        },
        eventDispatcher: dispatcher,
        friendlyError: () => "Library needs attention"
      },
      {
        activeView: () => "library",
        currentBookSource: () => "library",
        projectBooks: (next) => books.push(next.map((book) => book.id)),
        projectBookmarks: (update) => {
          projectedBookmarks = update(projectedBookmarks);
        },
        projectLoading: vi.fn(),
        projectImporting: (active) => importing.push(active),
        projectDropTarget: vi.fn(),
        projectLibraryNotice: (message) => notices.push(message),
        projectBookmarkNotice: vi.fn(),
        openDocument: async (next) => void opened.push(next.book.id),
        openBookmarkInspector: vi.fn()
      }
    );
    const stop = await application.start();

    await handleOpenRequest?.("/tmp/book.epub");
    await vi.waitFor(() => expect(opened).toEqual(["book-1"]));

    expect(importBook).toHaveBeenCalledWith({ kind: "provided", source: "/tmp/book.epub" });
    expect(events.map((event) => event.name)).toEqual(["BookImportRequested"]);
    expect(books).toEqual([["book-1"]]);
    expect(notices[notices.length - 1]).toBe(libraryImportNotice("reopened"));
    expect(importing).toEqual([true, false]);

    listBooks.mockClear();
    await dispatcher.dispatch(
      createDomainEvent("ReaderClosed", {
        bookId: "book-1",
        chapterId: "chapter-1",
        sentenceId: "sentence-1"
      })
    );
    expect(listBooks).toHaveBeenCalledOnce();

    stop();
    expect(stopDropListener).toHaveBeenCalledOnce();
    expect(stopOpenRequestListener).toHaveBeenCalledOnce();
  });
});
