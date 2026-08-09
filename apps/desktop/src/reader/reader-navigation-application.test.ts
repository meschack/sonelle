import { describe, expect, it, vi } from "vitest";
import type { PlaybackStatus } from "@sonelle/reader";
import type { ReaderLibraryApplication } from "./reader-library-application";
import { createReaderNavigationApplication } from "./reader-navigation-application";
import type { ReaderOpeningWorkflow } from "./reader-opening-workflow";
import type { ReaderPlaybackApplication } from "./reader-playback-application";
import { buildFixtureReaderView } from "./reader-view";

describe("reader navigation application", () => {
  it("routes current and external search results through the correct application boundary", async () => {
    const reader = buildFixtureReaderView();
    const open = vi.fn().mockResolvedValue(undefined);
    const library = fakeLibrary({ open });
    const playback = fakePlayback({ jumpStatus: vi.fn<() => PlaybackStatus>(() => "paused") });
    const opening = fakeOpening();
    const application = createReaderNavigationApplication(
      { library, opening, playback },
      {
        currentReader: () => reader,
        bookmarks: () => [],
        activeBookmark: () => null,
        activeSentence: () => reader.sentences[0] ?? null,
        openBookmarkInspector: vi.fn()
      }
    );

    await application.openLibrarySearchResult({
      id: "current-result",
      kind: "sentence",
      bookId: reader.book.id,
      bookTitle: reader.book.title,
      author: reader.book.author,
      chapterId: reader.chapter.id,
      chapterTitle: reader.chapter.title,
      sentenceId: reader.sentences[1].id,
      sentenceIndex: 1,
      excerpt: reader.sentences[1].text
    });
    await application.openLibrarySearchResult({
      id: "other-result",
      kind: "book",
      bookId: "other-book",
      bookTitle: "Other",
      author: "Writer",
      chapterId: null,
      chapterTitle: null,
      sentenceId: null,
      sentenceIndex: null,
      excerpt: "Other"
    });

    expect(opening.open).toHaveBeenCalledWith(reader, 1, "paused");
    expect(open).toHaveBeenCalledWith("other-book");
  });

  it("routes sample and library chapter opening through their owning applications", async () => {
    const sample = buildFixtureReaderView();
    const opening = fakeOpening();
    const library = fakeLibrary();
    const playback = fakePlayback({ jumpStatus: vi.fn<() => PlaybackStatus>(() => "paused") });
    const options = navigationOptions(sample);
    const sampleApplication = createReaderNavigationApplication(
      { library, opening, playback },
      options
    );

    sampleApplication.openSample();
    await sampleApplication.openChapter(sample.chapters[1].id);

    expect(opening.open).toHaveBeenCalledTimes(2);
    expect(opening.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ chapter: expect.objectContaining({ id: sample.chapters[1].id }) }),
      0,
      "paused"
    );

    const libraryReader = { ...sample, source: "library" as const };
    const libraryApplication = createReaderNavigationApplication(
      { library, opening, playback },
      navigationOptions(libraryReader)
    );
    await libraryApplication.openChapter(libraryReader.chapters[1].id);

    expect(library.open).toHaveBeenCalledWith(libraryReader.book.id, {
      chapterId: libraryReader.chapters[1].id,
      sentenceIndex: 0,
      playbackStatus: "paused"
    });

    await libraryApplication.openLocation(libraryReader.chapters[1].id, 3);
    expect(library.open).toHaveBeenLastCalledWith(libraryReader.book.id, {
      chapterId: libraryReader.chapters[1].id,
      sentenceIndex: 3,
      playbackStatus: "paused"
    });

    await libraryApplication.openLocation(libraryReader.chapter.id, 1);
    expect(opening.open).toHaveBeenLastCalledWith(libraryReader, 1, "paused");
  });

  it("creates and deletes bookmarks through the library boundary", async () => {
    const reader = buildFixtureReaderView();
    const bookmark = bookmarkFor(reader);
    const saveBookmark = vi.fn().mockResolvedValue(undefined);
    const deleteBookmark = vi.fn().mockResolvedValue(undefined);
    const library = fakeLibrary({ saveBookmark, deleteBookmark });
    const dependencies = { library, opening: fakeOpening(), playback: fakePlayback() };
    const createApplication = createReaderNavigationApplication(
      dependencies,
      navigationOptions(reader)
    );
    const deleteApplication = createReaderNavigationApplication(
      dependencies,
      navigationOptions(reader, { activeBookmark: () => bookmark, bookmarks: () => [bookmark] })
    );

    await createApplication.toggleActiveBookmark();
    await deleteApplication.toggleActiveBookmark();

    expect(saveBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: reader.book.id, sentenceId: reader.sentences[0].id })
    );
    expect(deleteBookmark).toHaveBeenCalledWith(bookmark.id, bookmark.bookId);
  });

  it("opens current, sample, and external bookmarks through the correct boundary", async () => {
    const sample = buildFixtureReaderView();
    const currentBookmark = bookmarkFor(sample);
    const select = vi.fn();
    const openBookmarkInspector = vi.fn();
    const opening = fakeOpening();
    const library = fakeLibrary();
    const currentApplication = createReaderNavigationApplication(
      { library, opening, playback: fakePlayback({ select }) },
      navigationOptions(sample, { openBookmarkInspector })
    );

    await currentApplication.openBookmark(currentBookmark);
    expect(select).toHaveBeenCalledWith(currentBookmark.sentenceIndex);

    const libraryReader = {
      ...sample,
      source: "library" as const,
      book: { ...sample.book, id: "book-2" }
    };
    const externalApplication = createReaderNavigationApplication(
      { library, opening, playback: fakePlayback() },
      navigationOptions(libraryReader, { openBookmarkInspector })
    );
    await externalApplication.openBookmark(currentBookmark);
    await externalApplication.openBookmark({ ...currentBookmark, bookId: "book-3" });

    expect(opening.open).toHaveBeenCalledOnce();
    expect(library.open).toHaveBeenCalledWith(
      "book-3",
      expect.objectContaining({ chapterId: currentBookmark.chapterId })
    );
    expect(openBookmarkInspector).toHaveBeenCalledTimes(3);
  });
});

function navigationOptions(
  reader: ReturnType<typeof buildFixtureReaderView>,
  overrides: Partial<Parameters<typeof createReaderNavigationApplication>[1]> = {}
) {
  return {
    currentReader: () => reader,
    bookmarks: () => [],
    activeBookmark: () => null,
    activeSentence: () => reader.sentences[0] ?? null,
    openBookmarkInspector: vi.fn(),
    ...overrides
  };
}

function bookmarkFor(reader: ReturnType<typeof buildFixtureReaderView>) {
  return {
    id: "bookmark-1",
    bookId: reader.book.id,
    bookTitle: reader.book.title,
    chapterId: reader.chapter.id,
    chapterTitle: reader.chapter.title,
    sentenceId: reader.sentences[0].id,
    sentenceIndex: 0,
    text: reader.sentences[0].text,
    note: null,
    createdAt: "2026-07-15T00:00:00.000Z"
  };
}

function fakeLibrary(overrides: Partial<ReaderLibraryApplication> = {}): ReaderLibraryApplication {
  return {
    start: vi.fn().mockResolvedValue(() => undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
    importFromDialog: vi.fn().mockResolvedValue(undefined),
    importFromPath: vi.fn().mockResolvedValue(undefined),
    handleBrowserDrop: vi.fn(),
    saveBookmark: vi.fn().mockResolvedValue(undefined),
    deleteBookmark: vi.fn().mockResolvedValue(undefined),
    refreshBookmarks: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function fakePlayback(
  overrides: Partial<ReaderPlaybackApplication> = {}
): ReaderPlaybackApplication {
  return {
    start: vi.fn(() => () => undefined),
    playbackChanged: vi.fn(() => () => undefined),
    autoAdvanceChanged: vi.fn(),
    prefetchChanged: vi.fn(),
    positionChanged: vi.fn(),
    toggle: vi.fn(),
    move: vi.fn(),
    select: vi.fn(),
    activate: vi.fn(),
    projectNarration: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    jumpStatus: vi.fn<() => PlaybackStatus>(() => "idle"),
    dispose: vi.fn(),
    ...overrides
  };
}

function fakeOpening(overrides: Partial<ReaderOpeningWorkflow> = {}): ReaderOpeningWorkflow {
  return {
    open: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(() => () => undefined),
    ...overrides
  };
}
