// @vitest-environment happy-dom

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import {
  DEFAULT_AUDIO_SETTINGS,
  SUPPORTED_NARRATION_VOICES,
  type AudioSettings
} from "@sonelle/audio";
import { createDomainEvent, createDomainEventDispatcher } from "@sonelle/domain";
import type { NarrationGateway } from "@sonelle/audio/narration";
import { createSavedDictionary } from "@sonelle/learning";
import {
  createNoopMediaSessionGateway,
  createReaderPreferences,
  type ReaderPreferences
} from "@sonelle/reader";
import type { ReaderExperienceDependencies } from "./reader-dependencies";
import type { DictionaryRepository } from "../learning/dictionary-repository";
import type {
  BookmarkStore,
  BookImportGateway,
  BookMetadataEditor,
  LibraryBookmarkDto,
  LibrarySearch,
  LibrarySearchResultDto,
  SaveReadingPositionInput
} from "../library/library-contracts";
import type { LibraryBookSummary, ReaderDocumentDto } from "../library/library-models";
import { ReaderExperience } from "./reader-experience";
import type { ReaderNarrationProjectionEvent } from "./reader-narration-workflow";
import { buildFixtureReaderView } from "./reader-view";

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("ReaderExperience integration", () => {
  it("drives narration settings and chapter navigation through keyboard shortcuts", async () => {
    const saveAudioSettings = vi.fn();
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      saveAudioSettings
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await Promise.resolve();

    dispatchShortcut("ArrowRight", { shiftKey: true });
    await vi.waitFor(() =>
      expect(
        container.querySelector<HTMLSelectElement>('[aria-label="Current chapter"]')?.value
      ).toBe(buildFixtureReaderView().chapters[1].id)
    );

    dispatchShortcut("m");
    await vi.waitFor(() =>
      expect(saveAudioSettings).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 0 }),
        "fixture-book-mara"
      )
    );

    dispatchShortcut("ArrowUp", { shiftKey: true });
    await vi.waitFor(() =>
      expect(saveAudioSettings).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 0.05 }),
        "fixture-book-mara"
      )
    );

    dispatchShortcut("r");
    await vi.waitFor(() =>
      expect(saveAudioSettings).toHaveBeenCalledWith(
        expect.objectContaining({ playbackRate: 1 }),
        "fixture-book-mara"
      )
    );
    dispatchShortcut("R", { shiftKey: true });
    await vi.waitFor(() =>
      expect(saveAudioSettings).toHaveBeenCalledWith(
        expect.objectContaining({ playbackRate: 0.9 }),
        "fixture-book-mara"
      )
    );

    dispose();
    container.remove();
  });

  it("opens and focuses reader tools through keyboard shortcuts", async () => {
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn()
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await Promise.resolve();

    dispatchShortcut("c");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Current chapter");

    dispatchShortcut("f", { ctrlKey: true });
    await Promise.resolve();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Search this chapter");

    dispatchShortcut("w");
    expect(container.textContent).toContain("No word selected");
    dispatchShortcut("n");
    expect(container.textContent).toContain("Saved Passages");
    dispatchShortcut(",", { metaKey: true });
    expect(container.querySelector('[aria-label="Narration speed"]')).not.toBeNull();

    dispose();
    container.remove();
  });

  it("routes quote images, library closing, and imports through keyboard shortcuts", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const exportQuoteImage = vi.fn().mockResolvedValue("sonelle-passage.png");
    const importBook = vi.fn().mockResolvedValue({ status: "cancelled" as const });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause,
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      exportQuoteImage,
      importBook
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await Promise.resolve();

    dispatchShortcut("S", { shiftKey: true });
    const quoteDialog = await vi.waitFor(() => {
      const element = document.querySelector('[aria-labelledby="quote-image-title"]');
      expect(element).not.toBeNull();
      return element;
    });
    const saveQuote = [...(quoteDialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent?.includes("Save image")
    );
    expect(saveQuote).not.toBeUndefined();
    saveQuote?.click();
    await vi.waitFor(() => expect(exportQuoteImage).toHaveBeenCalledOnce());

    dispatchShortcut("L", { shiftKey: true });
    await vi.waitFor(() => expect(container.querySelector(".library-workspace")).not.toBeNull());
    await vi.waitFor(() => expect(pause).toHaveBeenCalledOnce());

    dispatchShortcut("o", { ctrlKey: true });
    await vi.waitFor(() =>
      expect(importBook).toHaveBeenCalledWith(
        { kind: "choose" },
        expect.objectContaining({ onProgress: expect.any(Function) })
      )
    );

    dispose();
    container.remove();
  });

  it("shows an accessible keyboard shortcut reference", async () => {
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn()
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await Promise.resolve();

    dispatchShortcut("?", { shiftKey: true });
    const dialog = await vi.waitFor(() => {
      const element = document.querySelector('[role="dialog"][aria-modal="true"]');
      expect(element).not.toBeNull();
      return element;
    });
    expect(dialog?.textContent).toContain("Keyboard shortcuts");
    expect(dialog?.textContent).toContain("Play or pause narration");
    expect(dialog?.textContent).toContain("Create quote image");

    dispatchShortcut("Escape");
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
    );

    dispose();
    container.remove();
  });

  it("navigates and filters the Library from the keyboard", async () => {
    const openBook = vi.fn(async (bookId: string) => createReaderDocument(bookId));
    const libraryBooks = [
      createLibraryBook("book-one", "First Book", 0),
      {
        ...createLibraryBook("book-two", "Second Book", 3),
        sourceStatus: {
          status: "needs-attention" as const,
          message: "The saved book is still readable. Reimport it to restore the source file."
        }
      },
      createLibraryBook("book-three", "Third Book", 0)
    ];
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks,
      openBook
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("book-one", undefined));
    openBook.mockClear();

    dispatchShortcut("L", { shiftKey: true });
    await vi.waitFor(() =>
      expect(container.querySelectorAll("[data-library-book-card]")).toHaveLength(3)
    );
    const attention = container.querySelector<HTMLElement>(
      '[data-library-book-card="book-two"] .library-book-attention'
    );
    expect(attention?.textContent).toBe("Needs attention");
    expect(attention?.title).toContain("Reimport");

    dispatchShortcut("f", { ctrlKey: true });
    const search = container.querySelector<HTMLInputElement>(
      '.library-workspace [aria-label="Search library"]'
    );
    expect(document.activeElement).toBe(search);
    if (search == null) throw new Error("Library search was not rendered");
    search.value = "Second";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    dispatchShortcutFrom(search, "Escape");
    expect(search.value).toBe("");

    search.blur();
    dispatchShortcut("2");
    expect(
      container.querySelector<HTMLButtonElement>(".library-filter-row button.active")?.textContent
    ).toContain("In progress");
    dispatchShortcut("Escape");
    expect(
      container.querySelector<HTMLButtonElement>(".library-filter-row button.active")?.textContent
    ).toContain("All books");

    dispatchShortcut("ArrowRight");
    expect(document.activeElement?.getAttribute("data-library-book-card")).toBe("book-one");
    dispatchShortcut("ArrowRight");
    expect(document.activeElement?.getAttribute("data-library-book-card")).toBe("book-two");
    if (!(document.activeElement instanceof HTMLElement)) {
      throw new Error("A Library book was not focused");
    }
    dispatchShortcutFrom(document.activeElement, "Enter");
    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("book-two", undefined));

    dispose();
    container.remove();
  });

  it("opens a structurally rich imported book through the bounded shared reader", async () => {
    const importedBook = createLibraryBook("android-import", "Pocket Structure", 0);
    const openBook = vi.fn(async () => createStructuredReaderDocument());
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [importedBook],
      openBook
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("android-import", undefined));

    dispatchShortcut("L", { shiftKey: true });
    const card = await vi.waitFor(() => {
      const element = container.querySelector<HTMLButtonElement>(
        '[data-library-book-card="android-import"]'
      );
      expect(element).not.toBeNull();
      return element;
    });
    openBook.mockClear();
    card?.click();

    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("android-import", undefined));
    await vi.waitFor(() =>
      expect(container.querySelector(".article-title")?.textContent).toBe("A Structured Beginning")
    );
    expect(container.querySelectorAll(".sentence")).toHaveLength(49);
    expect(container.querySelector('.reader-paragraph[data-structure="ordered"]')).not.toBeNull();
    expect(container.querySelector('.reader-paragraph[data-structure="unordered"]')).not.toBeNull();
    expect(container.querySelector(".reader-paragraph.emphasized")?.textContent).toContain(
      "Quoted thought"
    );
    expect(container.querySelector(".reader-link")?.textContent).toBe("Library");
    expect(container.querySelector(".sentence-window-jump")?.textContent).toContain(
      "Next 48 sentences"
    );

    dispose();
    container.remove();
  });

  it("composes the mobile reader shell for book open, chapter change, tools, and library return", async () => {
    const mobileBook = createLibraryBook("mobile-reader", "Pocket Reader", 0);
    const secondBook = createLibraryBook("mobile-second", "Another Book", 4);
    const openBook = vi.fn(async (bookId: string, chapterId?: string) => {
      const document = createReaderDocument(bookId);
      document.book.title = bookId === "mobile-reader" ? "Pocket Reader" : "Another Book";
      document.chapters.push({
        id: `${bookId}-chapter-2`,
        title: "Chapter 2",
        index: 1,
        sentenceCount: 1,
        sentences: [{ id: `${bookId}-sentence-2`, index: 0, text: "The next chapter." }]
      });
      document.activeChapterId = chapterId ?? document.chapters[0].id;
      return document;
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [mobileBook, secondBook],
      openBook,
      mobileReaderShell: true
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("mobile-reader", undefined));
    expect(container.querySelector('[aria-label="Mobile reader"]')).not.toBeNull();
    expect(container.querySelector(".product-bar")).toBeNull();
    expect(container.querySelector(".library-rail")).toBeNull();
    expect(container.querySelector(".mobile-narration-dock")).not.toBeNull();
    expect(container.querySelector(".mobile-reader-playback-slot .audio-rail")).toBeNull();
    expect(container.querySelector(".mobile-reader-title")?.textContent).toContain("Pocket Reader");

    container.querySelector<HTMLButtonElement>('[aria-label="Open narration controls"]')?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Reading tools"]')).not.toBeNull()
    );
    expect(container.querySelector('[aria-label="Narration voice"]')).not.toBeNull();
    container
      .querySelector<HTMLButtonElement>(".mobile-reader-tools-sheet > header button")
      ?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Reading tools"]')).toBeNull()
    );

    const chapter = container.querySelector<HTMLSelectElement>(
      '.mobile-reader-navigation-slot [aria-label="Current chapter"]'
    );
    if (chapter == null) throw new Error("Mobile chapter navigation was not rendered");
    chapter.value = "mobile-reader-chapter-2";
    chapter.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(openBook).toHaveBeenCalledWith("mobile-reader", "mobile-reader-chapter-2")
    );
    await vi.waitFor(() =>
      expect(container.querySelector(".mobile-reader-title")?.textContent).toContain("Chapter 2")
    );

    container.querySelector<HTMLButtonElement>('[aria-label="Search this chapter"]')?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Reading tools"]')).not.toBeNull()
    );
    container
      .querySelector<HTMLButtonElement>(".mobile-reader-tools-sheet > header button")
      ?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Reading tools"]')).toBeNull()
    );

    const openLibrary = container.querySelector<HTMLButtonElement>('[aria-label="Open library"]');
    openLibrary?.click();
    const librarySheet = await vi.waitFor(() => {
      const element = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Library"]');
      expect(element).not.toBeNull();
      return element;
    });
    expect(librarySheet?.textContent).toContain("Another Book");
    expect(librarySheet?.textContent).toContain("40% read");
    expect(
      container
        .querySelector('[data-mobile-library-book="mobile-second"]')
        ?.getAttribute("aria-label")
    ).toContain("Another Book, Library Author, 40% read");
    expect(document.activeElement?.textContent).toContain("Back to reading");

    container.querySelector<HTMLElement>(".mobile-reader-sheet-backdrop")?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Library"]')).toBeNull()
    );
    expect(container.querySelector(".mobile-reader-title")?.textContent).toContain("Chapter 2");
    expect(document.activeElement).toBe(openLibrary);

    openLibrary?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Library"]')).not.toBeNull()
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(container.querySelector('[role="dialog"][aria-label="Library"]')).toBeNull();
    expect(container.querySelector(".mobile-reader-title")?.textContent).toContain("Chapter 2");
    await vi.waitFor(() => expect(document.activeElement).toBe(openLibrary));

    openLibrary?.click();
    openBook.mockClear();
    container
      .querySelector<HTMLButtonElement>('[data-mobile-library-book="mobile-second"]')
      ?.click();
    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("mobile-second", undefined));
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Library"]')).toBeNull()
    );
    expect(container.querySelector(".mobile-reader-title")?.textContent).toContain("Another Book");

    dispose();
    container.remove();
  });

  it("keeps mobile word, search, and bookmark tools contextual without interrupting reading", async () => {
    const bookId = "mobile-insights";
    const pause = vi.fn().mockResolvedValue(undefined);
    const lookupWord = vi.fn<DictionaryRepository["lookupWord"]>().mockResolvedValue({
      key: "opened",
      surface: "Opened",
      word: "opened",
      phonetic: "/ˈoʊpənd/",
      audioUrl: null,
      meanings: [
        {
          partOfSpeech: "verb",
          definitions: [
            {
              definition: "Made available for reading.",
              example: null,
              synonyms: [],
              antonyms: []
            }
          ]
        }
      ],
      sourceUrl: "https://dictionary.test/opened",
      fetchedAt: "2026-08-11T00:00:00.000Z"
    });
    const bookmark: LibraryBookmarkDto = {
      id: "mobile-insight-bookmark",
      bookId,
      bookTitle: "Pocket Insights",
      chapterId: `${bookId}-chapter`,
      chapterTitle: "Chapter 1",
      sentenceId: `${bookId}-sentence`,
      sentenceIndex: 0,
      text: "Opened from the Library.",
      note: null,
      createdAt: "2026-08-11T00:00:00.000Z"
    };
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause,
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook(bookId, "Pocket Insights", 0)],
      openBook: vi.fn(async () => createReaderDocument(bookId)),
      bookmarkStore: {
        list: vi.fn().mockResolvedValue([bookmark]),
        save: vi.fn().mockResolvedValue(bookmark),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      lookupWord,
      mobileReaderShell: true
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    const readingSurface = await vi.waitFor(() => {
      const element = container.querySelector<HTMLElement>(".mobile-reader-content-slot");
      expect(element).not.toBeNull();
      return element;
    });
    if (readingSurface == null) throw new Error("Mobile reading surface was not rendered");
    readingSurface.scrollTop = 64;
    const word = await vi.waitFor(() => {
      const element = container.querySelector<HTMLElement>('[aria-label="Tap to inspect Opened"]');
      expect(element).not.toBeNull();
      return element;
    });
    if (word == null) throw new Error("Tappable reader word was not rendered");
    word.click();

    await vi.waitFor(() => expect(lookupWord).toHaveBeenCalledWith("Opened", "en"));
    const tools = await vi.waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[role="dialog"][aria-label="Reading tools"]'
      );
      expect(element).not.toBeNull();
      return element;
    });
    expect(tools?.textContent).toContain("Made available for reading.");
    expect(container.querySelector(".word-popover")).toBeNull();
    expect(readingSurface.scrollTop).toBe(64);
    expect(pause).not.toHaveBeenCalled();

    clickInspectorTab(container, "Search");
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search this chapter"]'
    );
    if (search == null) throw new Error("Mobile chapter search was not rendered");
    search.value = "Library";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const searchResult = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(".result-list button");
      expect(button).not.toBeNull();
      return button;
    });
    searchResult?.click();
    expect(container.querySelector(".sentence.active")?.textContent).toContain(
      "Opened from the Library."
    );

    clickInspectorTab(container, "Notes");
    const savedPassage = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(".bookmark-card-button");
      expect(button?.textContent).toContain("Opened from the Library.");
      return button;
    });
    savedPassage?.click();
    expect(readingSurface.scrollTop).toBe(64);
    expect(pause).not.toHaveBeenCalled();

    container.querySelector<HTMLElement>(".mobile-reader-tools-backdrop")?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[role="dialog"][aria-label="Reading tools"]')).toBeNull()
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(word));
    expect(readingSurface.scrollTop).toBe(64);
    expect(pause).not.toHaveBeenCalled();

    dispose();
    container.remove();
  });

  it("flushes the active reading position when the Android webview backgrounds", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const saveReadingPosition = vi.fn().mockResolvedValue(undefined);
    let projectNarration: ((event: ReaderNarrationProjectionEvent) => void) | undefined;
    let background: (() => void) | undefined;
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause,
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook("background-book", "Background Book", 0)],
      openBook: vi.fn(async () => createReaderDocument("background-book")),
      saveReadingPosition,
      captureNarrationProjection: (project) => {
        projectNarration = project;
      },
      captureBackground: (listener) => {
        background = listener;
      }
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await vi.waitFor(() => expect(projectNarration).toBeTypeOf("function"));
    saveReadingPosition.mockClear();
    pause.mockClear();

    projectNarration?.(
      createDomainEvent("NarrationSentenceEntered", {
        bookId: "background-book",
        chapterId: "background-book-chapter",
        sentenceId: "background-book-sentence",
        passageId: "background-passage"
      })
    );
    await Promise.resolve();
    background?.();

    await vi.waitFor(() =>
      expect(saveReadingPosition).toHaveBeenCalledWith({
        bookId: "background-book",
        chapterId: "background-book-chapter",
        sentenceIndex: 0
      })
    );
    await vi.waitFor(() => expect(pause).toHaveBeenCalled());

    dispose();
    container.remove();
  });

  it("adds, removes, and opens persisted Android bookmarks through the reader", async () => {
    const bookId = "book-android-bookmarks";
    const targetChapterId = `${bookId}-chapter-2`;
    let saved: LibraryBookmarkDto[] = [
      {
        id: "bookmark-restart-target",
        bookId,
        bookTitle: "Pocket Bookmarks",
        chapterId: targetChapterId,
        chapterTitle: "Second chapter",
        sentenceId: `${targetChapterId}-sentence-2`,
        sentenceIndex: 1,
        text: "The restored target.",
        note: null,
        createdAt: "2026-08-11T12:00:00Z"
      }
    ];
    const bookmarkStore: BookmarkStore = {
      async list(requestedBookId) {
        return requestedBookId == null
          ? saved
          : saved.filter((bookmark) => bookmark.bookId === requestedBookId);
      },
      async save(input) {
        const bookmark: LibraryBookmarkDto = {
          ...input,
          id: `bookmark-${input.sentenceId}`,
          createdAt: "2026-08-11T13:00:00Z"
        };
        saved = [
          bookmark,
          ...saved.filter(
            (candidate) =>
              !(
                candidate.bookId === input.bookId &&
                candidate.chapterId === input.chapterId &&
                candidate.sentenceId === input.sentenceId
              )
          )
        ];
        return bookmark;
      },
      async delete(bookmarkId) {
        saved = saved.filter((bookmark) => bookmark.id !== bookmarkId);
      }
    };
    const openBook = vi.fn(async (_bookId: string, chapterId?: string) => {
      const document = createReaderDocument(bookId);
      document.book.title = "Pocket Bookmarks";
      document.chapters.push({
        id: targetChapterId,
        title: "Second chapter",
        index: 1,
        sentenceCount: 2,
        sentences:
          chapterId === targetChapterId
            ? [
                { id: `${targetChapterId}-sentence-1`, index: 0, text: "Before it." },
                {
                  id: `${targetChapterId}-sentence-2`,
                  index: 1,
                  text: "The restored target."
                }
              ]
            : []
      });
      if (chapterId != null) document.activeChapterId = chapterId;
      return document;
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook(bookId, "Pocket Bookmarks", 0)],
      openBook,
      bookmarkStore
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith(bookId, undefined));

    const add = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>('[aria-label="Bookmark sentence"]');
      expect(button).not.toBeNull();
      return button;
    });
    add?.click();
    await vi.waitFor(() => expect(saved).toHaveLength(2));
    await vi.waitFor(() =>
      expect(container.querySelector('[aria-label="Remove bookmark"]')).not.toBeNull()
    );

    container.querySelector<HTMLButtonElement>('[aria-label="Remove bookmark"]')?.click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    const target = await vi.waitFor(() => {
      const button = Array.from(
        container.querySelectorAll<HTMLButtonElement>(".bookmark-card-button")
      ).find((candidate) => candidate.textContent?.includes("The restored target."));
      expect(button).not.toBeUndefined();
      return button;
    });
    target?.click();

    await vi.waitFor(() => expect(openBook).toHaveBeenLastCalledWith(bookId, targetChapterId));
    await vi.waitFor(() =>
      expect(container.querySelector(".sentence.active")?.textContent).toContain(
        "The restored target."
      )
    );

    dispose();
    container.remove();
  });

  it("searches persisted non-Latin text, handles no matches, and opens the exact sentence", async () => {
    const openBook = vi.fn(async (bookId: string) => {
      const document = createReaderDocument(bookId);
      if (bookId === "book-two") {
        document.chapters[0].sentenceCount = 2;
        document.chapters[0].sentences = [
          { id: "book-two-sentence-1", index: 0, text: "Before the match." },
          { id: "book-two-sentence-2", index: 1, text: "東京では静かな読書が続く。" }
        ];
      }
      return document;
    });
    const searchLibrary = vi.fn<LibrarySearch["search"]>(async ({ query }) => {
      if (query !== "東京") return [];
      return [
        {
          id: "sentence:book-two-sentence-2",
          kind: "sentence",
          bookId: "book-two",
          bookTitle: "Second Book",
          author: "Library Author",
          chapterId: "book-two-chapter",
          chapterTitle: "Chapter 1",
          sentenceId: "book-two-sentence-2",
          sentenceIndex: 1,
          excerpt: "東京では静かな読書が続く。"
        }
      ] satisfies LibrarySearchResultDto[];
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [
        createLibraryBook("book-one", "First Book", 0),
        createLibraryBook("book-two", "Second Book", 0)
      ],
      openBook,
      searchLibrary
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("book-one", undefined));
    openBook.mockClear();
    expect(searchLibrary).not.toHaveBeenCalled();

    dispatchShortcut("f", { ctrlKey: true, shiftKey: true });
    const search = await vi.waitFor(() => {
      const input = container.querySelector<HTMLInputElement>(
        '.library-workspace [aria-label="Search library"]'
      );
      expect(document.activeElement).toBe(input);
      return input;
    });
    if (search == null) throw new Error("Cross-book search was not rendered");
    search.value = "missing phrase";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(searchLibrary).toHaveBeenCalledWith({ query: "missing phrase", limit: 30 })
    );
    await vi.waitFor(() => expect(container.textContent).toContain("No matches across your books"));

    search.value = "東京";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(searchLibrary).toHaveBeenCalledWith({ query: "東京", limit: 30 })
    );
    const results = await vi.waitFor(() => {
      const view = container.querySelector(".cross-book-search-results");
      expect(view?.textContent).toContain("東京では静かな読書が続く。");
      expect(view?.textContent).toContain("Second Book");
      return view;
    });
    expect(results?.querySelector("mark")?.textContent).toBe("東京");
    const result = [...(results?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent?.includes("東京では静かな読書")
    );
    result?.click();

    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("book-two", "book-two-chapter"));
    await vi.waitFor(() =>
      expect(container.querySelector(".sentence.active")?.textContent).toContain(
        "東京では静かな読書が続く。"
      )
    );
    dispose();
    container.remove();
  });

  it("routes power-user layout, chapter-boundary, palette, and fullscreen commands", async () => {
    const toggleFullscreen = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn().mockResolvedValue(undefined);
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause,
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      toggleFullscreen
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await Promise.resolve();

    dispatchShortcut("b", { ctrlKey: true });
    expect(container.querySelector(".sonelle-shell")?.classList).toContain(
      "library-sidebar-collapsed"
    );
    dispatchShortcut("B", { ctrlKey: true, shiftKey: true });
    expect(container.querySelector(".sonelle-shell")?.classList).toContain(
      "inspector-sidebar-collapsed"
    );

    dispatchShortcut("End", { shiftKey: true });
    expect(container.querySelector(".audio-progress")?.textContent).toContain("5 / 5");
    dispatchShortcut("Home", { shiftKey: true });
    expect(container.querySelector(".audio-progress")?.textContent).toContain("1 / 5");

    dispatchShortcut("k", { metaKey: true });
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-label="Command palette"]')).not.toBeNull()
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Search commands");
    dispatchShortcut("Escape");
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-label="Command palette"]')).toBeNull()
    );

    dispatchShortcut("k", { ctrlKey: true });
    const commandSearch = document.querySelector<HTMLInputElement>(
      '[aria-label="Command palette"] [aria-label="Search commands"]'
    );
    if (commandSearch == null) throw new Error("Command search was not rendered");
    commandSearch.value = "Return to Library";
    commandSearch.dispatchEvent(new InputEvent("input", { bubbles: true }));
    dispatchShortcutFrom(commandSearch, "Enter");
    await vi.waitFor(() => expect(container.querySelector(".library-workspace")).not.toBeNull());
    await vi.waitFor(() => expect(pause).toHaveBeenCalledOnce());

    dispatchShortcut("F11");
    await vi.waitFor(() => expect(toggleFullscreen).toHaveBeenCalledOnce());

    dispose();
    container.remove();
  });

  it("enters distraction-free reading without destroying the prior sidebar layout", async () => {
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn()
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    const shell = container.querySelector(".sonelle-shell");

    dispatchShortcut("b", { ctrlKey: true });
    expect(shell?.classList).toContain("library-sidebar-collapsed");

    container
      .querySelector<HTMLButtonElement>('[aria-label="Enter distraction-free reading"]')
      ?.click();
    expect(shell?.classList).toContain("distraction-free");
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Exit distraction-free reading"]')
    ).not.toBeNull();

    dispatchShortcut("Escape");
    expect(shell?.classList).not.toContain("distraction-free");
    expect(shell?.classList).toContain("library-sidebar-collapsed");

    dispatchShortcut("d");
    expect(shell?.classList).toContain("distraction-free");
    dispatchShortcut("d");
    expect(shell?.classList).not.toContain("distraction-free");

    dispose();
    container.remove();
  });

  it("starts the application workflows, reacts to reader closure, and disposes them", async () => {
    const dispatcher = createDomainEventDispatcher();
    const reader = buildFixtureReaderView();
    const pause = vi.fn().mockResolvedValue(undefined);
    const stopNarration = vi.fn();
    const stopDrops = vi.fn();
    const stopVoiceEvents = vi.fn();
    const dependencies = createDependencies({
      dispatcher,
      pause,
      stopNarration,
      stopDrops,
      stopVoiceEvents
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    expect(container.querySelector(".reader-surface")).not.toBeNull();
    await dispatcher.dispatch(
      createDomainEvent("ReaderClosed", {
        bookId: reader.book.id,
        chapterId: reader.chapter.id,
        sentenceId: reader.sentences[0]?.id ?? ""
      })
    );

    expect(container.querySelector(".library-workspace")).not.toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    dispose();
    await vi.waitFor(() => {
      expect(stopNarration).toHaveBeenCalledOnce();
      expect(stopDrops).toHaveBeenCalledOnce();
      expect(stopVoiceEvents).toHaveBeenCalledOnce();
    });
    container.remove();
  });

  it("loads installed fonts and applies persisted book and interface selections", async () => {
    const savePreferences = vi.fn();
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      savePreferences
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    const settingsTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (button) => button.textContent?.includes("Tools")
    );
    expect(settingsTab).not.toBeUndefined();
    settingsTab?.click();

    const bookFontTrigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Book content font"]'
    );
    await vi.waitFor(() => expect(bookFontTrigger).not.toBeNull());
    bookFontTrigger?.click();
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].some((option) =>
          option.textContent?.includes("Literata")
        )
      ).toBe(true)
    );
    const literata = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes("Literata")
    );
    literata?.click();

    const interfaceFontTrigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="App interface font"]'
    );
    interfaceFontTrigger?.click();
    const inter = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes("Inter")
    );
    inter?.click();

    const shell = container.querySelector<HTMLElement>(".sonelle-shell");
    await vi.waitFor(() => {
      expect(shell?.style.getPropertyValue("--reader-font")).toContain('"Literata"');
      expect(shell?.style.getPropertyValue("--ui-font")).toContain('"Inter"');
      expect(savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ contentFontFamily: "Literata", uiFontFamily: "Inter" })
      );
    });

    dispose();
    container.remove();
  });

  it("loads and persists configurable narration and bookmark colors", async () => {
    const savePreferences = vi.fn();
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      savePreferences,
      readerPreferences: createReaderPreferences({
        narrationHighlightColor: "#abcdef",
        bookmarkHighlightColor: "#123456"
      })
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    const shell = container.querySelector<HTMLElement>(".sonelle-shell");

    expect(shell?.style.getPropertyValue("--narration-highlight")).toBe("#abcdef");
    expect(shell?.style.getPropertyValue("--narration-highlight-ink")).toBe("#242625");
    expect(shell?.style.getPropertyValue("--bookmark-highlight")).toBe("#123456");
    expect(shell?.style.getPropertyValue("--bookmark-highlight-ink")).toBe("#ffffff");

    savePreferences.mockClear();
    clickInspectorTab(container, "Tools");
    const narrationColor = container.querySelector<HTMLInputElement>(
      '[aria-label="Narration highlight color"]'
    );
    const bookmarkColor = container.querySelector<HTMLInputElement>(
      '[aria-label="Bookmark highlight color"]'
    );
    expect(narrationColor).not.toBeNull();
    expect(bookmarkColor).not.toBeNull();

    if (narrationColor != null) {
      narrationColor.value = "#102030";
      narrationColor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (bookmarkColor != null) {
      bookmarkColor.value = "#ddeeff";
      bookmarkColor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await vi.waitFor(() => {
      expect(shell?.style.getPropertyValue("--narration-highlight")).toBe("#102030");
      expect(shell?.style.getPropertyValue("--bookmark-highlight")).toBe("#ddeeff");
      expect(savePreferences).toHaveBeenLastCalledWith(
        expect.objectContaining({
          narrationHighlightColor: "#102030",
          bookmarkHighlightColor: "#ddeeff"
        })
      );
    });
    expect(shell?.style.getPropertyValue("--narration-highlight-ink")).toBe("#ffffff");
    expect(shell?.style.getPropertyValue("--bookmark-highlight-ink")).toBe("#242625");

    dispose();
    container.remove();
  });

  it("restores and persists resized reader rails", async () => {
    let persistedPreferences = createReaderPreferences({
      libraryRailWidth: 360,
      inspectorRailWidth: 420
    });
    const savePreferences = vi.fn((preferences: ReaderPreferences) => {
      persistedPreferences = preferences;
    });
    const dependenciesForPreferences = () =>
      createDependencies({
        dispatcher: createDomainEventDispatcher(),
        pause: vi.fn().mockResolvedValue(undefined),
        stopNarration: vi.fn(),
        stopDrops: vi.fn(),
        stopVoiceEvents: vi.fn(),
        savePreferences,
        readerPreferences: persistedPreferences
      });
    const previousViewportWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_600 });
    const firstContainer = document.createElement("div");
    document.body.append(firstContainer);
    const disposeFirst = render(
      () => <ReaderExperience dependencies={dependenciesForPreferences()} />,
      firstContainer
    );
    const firstShell = firstContainer.querySelector<HTMLElement>(".sonelle-shell");

    expect(firstShell?.style.getPropertyValue("--library-rail-width")).toBe("360px");
    expect(firstShell?.style.getPropertyValue("--inspector-rail-width")).toBe("420px");

    firstContainer
      .querySelector<HTMLElement>('[aria-label="Resize library sidebar"]')
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    await vi.waitFor(() =>
      expect(savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ libraryRailWidth: 376, inspectorRailWidth: 420 })
      )
    );
    disposeFirst();
    firstContainer.remove();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    const secondContainer = document.createElement("div");
    document.body.append(secondContainer);
    const disposeSecond = render(
      () => <ReaderExperience dependencies={dependenciesForPreferences()} />,
      secondContainer
    );
    const secondShell = secondContainer.querySelector<HTMLElement>(".sonelle-shell");

    expect(secondShell?.style.getPropertyValue("--library-rail-width")).toBe("220px");
    expect(secondShell?.style.getPropertyValue("--inspector-rail-width")).toBe("280px");
    expect(persistedPreferences).toEqual(
      expect.objectContaining({ libraryRailWidth: 376, inspectorRailWidth: 420 })
    );

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_600 });
    window.dispatchEvent(new Event("resize"));
    expect(secondShell?.style.getPropertyValue("--library-rail-width")).toBe("376px");
    expect(secondShell?.style.getPropertyValue("--inspector-rail-width")).toBe("420px");

    disposeSecond();
    secondContainer.remove();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousViewportWidth
    });
  });

  it("keeps every inspector mode available through the reader shell", async () => {
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn()
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    expect(container.textContent).toContain("No word selected");

    clickInspectorTab(container, "Search");
    expect(container.querySelector('[aria-label="Search this chapter"]')).not.toBeNull();

    clickInspectorTab(container, "Notes");
    expect(container.textContent).toContain("Saved Passages");

    clickInspectorTab(container, "Tools");
    expect(container.querySelector('[aria-label="Narration speed"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Book content font"]')).not.toBeNull();
    expect(container.textContent).toContain("Offline readiness");
    expect(container.querySelector('[aria-label="Chapter narration readiness"]')).toBeNull();
    expect(container.querySelector(".diagnostics-card")).toBeNull();
    expect(container.textContent).not.toContain("Show error log");

    dispose();
    container.remove();
  });

  it("refreshes prepared audio for the active book", async () => {
    const getAudioCacheStats = vi
      .fn<(bookId: string) => Promise<{ sentenceCount: number; sizeBytes: number }>>()
      .mockResolvedValue({ sentenceCount: 8, sizeBytes: 6_800_000 });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      getAudioCacheStats
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    await vi.waitFor(() => expect(getAudioCacheStats).toHaveBeenCalled());
    getAudioCacheStats.mockClear();
    clickInspectorTab(container, "Tools");
    const refresh = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Refresh"
    );
    expect(refresh).not.toBeUndefined();
    refresh?.click();

    await vi.waitFor(() => expect(getAudioCacheStats).toHaveBeenCalledOnce());
    expect(getAudioCacheStats).toHaveBeenCalledWith(buildFixtureReaderView().book.id);
    expect(container.textContent).not.toContain("Narration needs attention");
    expect(container.textContent).toContain("8sentences prepared");
    expect(container.textContent).toContain("6.5 MBstored audio");
    expect(container.textContent).not.toContain("8 of 0 sentences");

    dispose();
    container.remove();
  });

  it("opens imported EPUB references in a reader popover", async () => {
    const openBook = vi.fn(async () => {
      const document = createReaderDocument("book-reference");
      document.chapters[0].references = [
        {
          id: "reference-1",
          sentenceId: "book-reference-sentence",
          sentenceIndex: 0,
          offset: 23,
          marker: "1",
          kind: "footnote",
          content: "A compact explanation from the EPUB."
        }
      ];
      return document;
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook("book-reference", "Referenced Book", 0)],
      openBook
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    const referenceButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(".reader-reference-button");
      expect(button).not.toBeNull();
      return button;
    });
    referenceButton?.click();

    await vi.waitFor(() =>
      expect(document.querySelector(".reference-popover")?.textContent).toContain(
        "A compact explanation from the EPUB."
      )
    );

    dispose();
    document.querySelector(".reference-popover")?.remove();
    container.remove();
  });

  it("opens imported EPUB links with the platform adapter", async () => {
    const openExternalLink = vi.fn().mockResolvedValue(undefined);
    const openBook = vi.fn(async () => {
      const document = createReaderDocument("book-link");
      document.chapters[0].links = [
        {
          id: "link-1",
          sentenceId: "book-link-sentence",
          sentenceIndex: 0,
          offset: 16,
          length: 7,
          href: "https://example.com/library",
          targetChapterId: null,
          targetSentenceIndex: null
        }
      ];
      document.chapters[0].presentations = [
        {
          index: 0,
          kind: "navigation",
          indentLevel: 1,
          marker: null,
          emphasized: false
        }
      ];
      document.chapters[0].paragraphs = [
        {
          id: "book-link-paragraph",
          index: 0,
          startSentenceIndex: 0,
          sentenceCount: 1
        }
      ];
      return document;
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook("book-link", "Linked Book", 0)],
      openBook,
      openExternalLink
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    const link = await vi.waitFor(() => {
      const anchor = container.querySelector<HTMLAnchorElement>(".reader-link");
      expect(anchor?.textContent).toBe("Library");
      return anchor;
    });
    expect(link?.closest(".reader-paragraph")?.classList.contains("indent-1")).toBe(true);
    link?.click();

    expect(openExternalLink).toHaveBeenCalledWith("https://example.com/library");

    dispose();
    container.remove();
  });

  it("navigates imported EPUB links inside the book", async () => {
    const openBook = vi.fn(async (_bookId: string, chapterId?: string) => {
      const document = createReaderDocument("book-contents");
      document.chapters.push({
        id: "book-contents-target",
        title: "Target chapter",
        index: 1,
        sentenceCount: 3,
        sentences:
          chapterId === "book-contents-target"
            ? [
                { id: "target-1", index: 0, text: "Opening." },
                { id: "target-2", index: 1, text: "Part Two." },
                { id: "target-3", index: 2, text: "Destination." }
              ]
            : []
      });
      document.chapters[0].links = [
        {
          id: "internal-link-1",
          sentenceId: "book-contents-sentence",
          sentenceIndex: 0,
          offset: 16,
          length: 7,
          href: null,
          targetChapterId: "book-contents-target",
          targetSentenceIndex: 1
        }
      ];
      if (chapterId != null) document.activeChapterId = chapterId;
      return document;
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook("book-contents", "Contents Book", 0)],
      openBook
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    const link = await vi.waitFor(() => {
      const anchor = container.querySelector<HTMLAnchorElement>(".reader-link");
      expect(anchor?.textContent).toBe("Library");
      return anchor;
    });
    link?.click();

    await vi.waitFor(() =>
      expect(openBook).toHaveBeenLastCalledWith("book-contents", "book-contents-target")
    );
    await vi.waitFor(() => expect(container.textContent).toContain("Part Two."));

    dispose();
    container.remove();
  });

  it("navigates nested EPUB contents targets and keeps broken entries safe", async () => {
    const openBook = vi.fn(async (_bookId: string, chapterId?: string) => {
      const document = createReaderDocument("book-mobile-contents");
      document.navigation = [
        {
          label: "Part One",
          depth: 0,
          targetChapterId: "book-mobile-contents-chapter",
          targetSentenceIndex: 0
        },
        {
          label: "The inner destination",
          depth: 1,
          targetChapterId: "book-mobile-contents-target",
          targetSentenceIndex: 2
        },
        {
          label: "Lost appendix",
          depth: 0,
          targetChapterId: null,
          targetSentenceIndex: null
        }
      ];
      document.chapters.push({
        id: "book-mobile-contents-target",
        title: "Target chapter",
        index: 1,
        sentenceCount: 3,
        sentences:
          chapterId === "book-mobile-contents-target"
            ? [
                { id: "target-opening", index: 0, text: "Opening." },
                { id: "target-middle", index: 1, text: "Middle." },
                { id: "target-destination", index: 2, text: "Anchor destination." }
              ]
            : []
      });
      if (chapterId != null) document.activeChapterId = chapterId;
      return document;
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook("book-mobile-contents", "Contents Book", 0)],
      openBook
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    const browse = await vi.waitFor(() => {
      const button = Array.from(container.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === "Browse contents"
      );
      expect(button).not.toBeUndefined();
      return button;
    });
    browse?.click();
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Back to reading")
    );

    const nested = await vi.waitFor(() => {
      const button = Array.from(
        container.querySelectorAll<HTMLButtonElement>(".contents-entry")
      ).find((candidate) => candidate.textContent?.includes("The inner destination"));
      expect(button?.style.paddingLeft).toBe("38px");
      return button;
    });
    const broken = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".contents-entry")
    ).find((candidate) => candidate.textContent?.includes("Lost appendix"));
    expect(broken?.disabled).toBe(true);
    nested?.click();

    await vi.waitFor(() =>
      expect(openBook).toHaveBeenLastCalledWith(
        "book-mobile-contents",
        "book-mobile-contents-target"
      )
    );
    await vi.waitFor(() => expect(container.textContent).toContain("Anchor destination."));
    expect(container.querySelector('[aria-label="Table of contents"]')).toBeNull();
    expect(document.activeElement).toBe(browse);

    browse?.click();
    const back = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>('[aria-label="Back to reading"]');
      expect(button).not.toBeNull();
      return button;
    });
    back?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[aria-label="Table of contents"]')).toBeNull()
    );
    expect(container.textContent).toContain("Anchor destination.");
    expect(document.activeElement).toBe(browse);

    browse?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[aria-label="Table of contents"]')).not.toBeNull()
    );
    container.querySelector<HTMLElement>(".reader-contents-backdrop")?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[aria-label="Table of contents"]')).toBeNull()
    );
    expect(document.activeElement).toBe(browse);

    browse?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('[aria-label="Table of contents"]')).not.toBeNull()
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(container.querySelector('[aria-label="Table of contents"]')).toBeNull();
    expect(container.textContent).toContain("Anchor destination.");
    await vi.waitFor(() => expect(document.activeElement).toBe(browse));

    dispose();
    container.remove();
  });

  it("exports selected neighboring sentences from beside the local storage status", async () => {
    const exportQuoteImage = vi.fn().mockResolvedValue("sonelle-passage.png");
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      exportQuoteImage
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    const action = container.querySelector<HTMLButtonElement>(
      '.product-status-actions [aria-label="Create quote image"]'
    );
    expect(action).not.toBeNull();
    action?.click();

    const dialog = await vi.waitFor(() => {
      const element = document.querySelector(
        '[role="dialog"][aria-labelledby="quote-image-title"]'
      );
      expect(element).not.toBeNull();
      return element;
    });
    const optionalSentence =
      dialog?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];
    optionalSentence?.click();
    const save = [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) =>
      button.textContent?.includes("Save image")
    );
    save?.click();

    await vi.waitFor(() => expect(exportQuoteImage).toHaveBeenCalledOnce());
    expect(exportQuoteImage).toHaveBeenCalledWith(
      expect.objectContaining({
        bookTitle: "The Listening Margin",
        chapterTitle: "Chapter 1",
        sentenceTexts: expect.arrayContaining([
          expect.stringContaining("Rain softened the windows"),
          expect.stringContaining("playback controls")
        ])
      })
    );
    await vi.waitFor(() => expect(container.textContent).toContain("Quote image ready"));

    dispose();
    container.remove();
  });

  it("edits the active library book title, author, and cover", async () => {
    const updateBookMetadata = vi.fn<BookMetadataEditor["update"]>().mockResolvedValue({
      bookId: "book-edit",
      title: "A Better Title",
      author: "A Better Author",
      coverImageSrc: "asset://edited-cover.png"
    });
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      libraryBooks: [createLibraryBook("book-edit", "Original Title", 0)],
      openBook: vi.fn(async () => createReaderDocument("book-edit")),
      chooseBookCover: vi.fn().mockResolvedValue({
        path: "/tmp/edited-cover.png",
        previewSrc: "asset://edited-cover.png"
      }),
      updateBookMetadata
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);
    await vi.waitFor(() => expect(container.textContent).toContain("Opened Book"));

    clickInspectorTab(container, "Tools");
    const title = await vi.waitFor(() => {
      const input = container.querySelector<HTMLInputElement>('[aria-label="Book title"]');
      expect(input).not.toBeNull();
      return input;
    });
    if (title == null) throw new Error("Book title editor was not rendered");
    title.value = "A Better Title";
    title.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const author = container.querySelector<HTMLInputElement>('[aria-label="Book author"]');
    if (author == null) throw new Error("Book author editor was not rendered");
    author.value = "A Better Author";
    author.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const chooseCover = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Choose cover")
    );
    chooseCover?.click();
    await Promise.resolve();
    const save = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Save book details")
    );
    save?.click();

    await vi.waitFor(() => expect(updateBookMetadata).toHaveBeenCalledOnce());
    expect(updateBookMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-edit",
        title: "A Better Title",
        author: "A Better Author",
        coverPath: "/tmp/edited-cover.png"
      })
    );
    await vi.waitFor(() => expect(container.textContent).toContain("Book details saved."));
    expect(container.textContent).toContain("A Better Title");

    dispose();
    container.remove();
  });

  it("blocks playback until the routed narration engine is ready", async () => {
    const requestPlayback = vi.fn();
    const dependencies = createDependencies({
      dispatcher: createDomainEventDispatcher(),
      pause: vi.fn().mockResolvedValue(undefined),
      stopNarration: vi.fn(),
      stopDrops: vi.fn(),
      stopVoiceEvents: vi.fn(),
      requestPlayback,
      engineStatus: "not-installed",
      offlineLibrary: "language-pack"
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <ReaderExperience dependencies={dependencies} />, container);

    clickInspectorTab(container, "Tools");
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Download narration files to listen offline.")
    );
    container.querySelector<HTMLButtonElement>('[aria-label="Play"]')?.click();

    await vi.waitFor(() => {
      expect(requestPlayback).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Download English narration to listen offline.");
    });

    dispose();
    container.remove();
  });
});

function clickInspectorTab(container: HTMLElement, label: string) {
  const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) =>
    button.textContent?.includes(label)
  );
  expect(tab).not.toBeUndefined();
  tab?.click();
}

interface DependencySpies {
  dispatcher: ReturnType<typeof createDomainEventDispatcher>;
  pause(): Promise<void>;
  stopNarration(): void;
  stopDrops(): void;
  stopVoiceEvents(): void;
  savePreferences?: (preferences: ReaderPreferences) => void;
  saveAudioSettings?: (settings: AudioSettings) => void;
  requestPlayback?: (sentenceId: string) => void;
  engineStatus?: "ready" | "not-installed";
  offlineLibrary?: "individual-voice" | "language-pack";
  readerPreferences?: ReaderPreferences;
  exportQuoteImage?: (content: {
    sentenceTexts: string[];
    bookTitle: string;
    author: string;
    chapterTitle: string;
  }) => Promise<string>;
  importBook?: BookImportGateway["importBook"];
  getAudioCacheStats?: (bookId: string) => Promise<{ sentenceCount: number; sizeBytes: number }>;
  toggleFullscreen?: () => Promise<void>;
  libraryBooks?: LibraryBookSummary[];
  openBook?: (bookId: string, chapterId?: string) => Promise<ReaderDocumentDto>;
  searchLibrary?: LibrarySearch["search"];
  chooseBookCover?: BookMetadataEditor["chooseCover"];
  updateBookMetadata?: BookMetadataEditor["update"];
  openExternalLink?: (href: string) => Promise<void>;
  saveReadingPosition?: (position: SaveReadingPositionInput) => Promise<void>;
  captureNarrationProjection?: (project: (event: ReaderNarrationProjectionEvent) => void) => void;
  captureBackground?: (listener: () => void) => void;
  bookmarkStore?: BookmarkStore;
  mobileReaderShell?: boolean;
  lookupWord?: DictionaryRepository["lookupWord"];
}

function createDependencies(spies: DependencySpies): ReaderExperienceDependencies {
  const voiceId = DEFAULT_AUDIO_SETTINGS.voiceId;
  const readyVoice = {
    voiceId,
    status: "ready" as const,
    downloadSizeBytes: 0,
    downloadedBytes: 0,
    progress: 100,
    message: "Ready"
  };
  const narrationGateway = {
    prepare: vi.fn().mockResolvedValue(undefined),
    readiness: () => "ready" as const,
    start: spies.requestPlayback ?? vi.fn(),
    pause: spies.pause,
    resume: vi.fn(),
    setOutput: vi.fn(),
    prepareUpcoming: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
    connect: vi.fn(() => spies.stopNarration)
  } satisfies NarrationGateway;

  return {
    appLifecycle: {
      listenForBackground(listener) {
        spies.captureBackground?.(listener);
        return () => undefined;
      }
    },
    appWindow: {
      toggleFullscreen: spies.toggleFullscreen ?? vi.fn().mockResolvedValue(undefined)
    },
    audioCacheRepository: {
      getStats:
        spies.getAudioCacheStats ?? vi.fn().mockResolvedValue({ sentenceCount: 0, sizeBytes: 0 }),
      getChapterStats: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue({ sentenceCount: 0, sizeBytes: 0 })
    },
    audioSettingsRepository: {
      load: () => DEFAULT_AUDIO_SETTINGS,
      save: spies.saveAudioSettings ?? vi.fn()
    },
    bookCatalog: {
      list: vi.fn().mockResolvedValue(spies.libraryBooks ?? []),
      open: spies.openBook ?? vi.fn().mockRejectedValue(new Error("No library book selected"))
    },
    bookDropAdapter: { listen: vi.fn().mockResolvedValue(spies.stopDrops) },
    bookOpenRequestAdapter: { listen: vi.fn().mockResolvedValue(() => undefined) },
    bookExporter: {
      exportData: vi.fn().mockRejectedValue(new Error("No library book selected"))
    },
    bookImportGateway: {
      importBook: spies.importBook ?? vi.fn().mockRejectedValue(new Error("No import requested"))
    },
    bookImportSourceStore: {
      prepare: vi.fn().mockRejectedValue(new Error("No import source selected"))
    },
    bookMetadataEditor: {
      chooseCover: spies.chooseBookCover ?? vi.fn().mockResolvedValue(null),
      update:
        spies.updateBookMetadata ??
        vi.fn().mockRejectedValue(new Error("No metadata edit requested"))
    },
    bookmarkStore: spies.bookmarkStore ?? {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockRejectedValue(new Error("No bookmark requested")),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    dictionaryRepository: {
      lookupWord: spies.lookupWord ?? vi.fn().mockResolvedValue(null),
      loadSavedDictionary: createSavedDictionary,
      saveSavedDictionary: vi.fn()
    },
    engineInstallationRepository: {
      getStatus: vi.fn(async (engineId) => ({
        engineId,
        status: spies.engineStatus ?? "ready",
        modelRevision: `${engineId}-test`,
        downloadSizeBytes: spies.engineStatus === "not-installed" ? 100 : 0,
        downloadedBytes: 0,
        progress: spies.engineStatus === "not-installed" ? null : 100,
        message:
          spies.engineStatus === "not-installed"
            ? "Download narration files to listen offline."
            : "Ready"
      })),
      install: vi.fn(async (engineId) => ({
        engineId,
        status: "ready" as const,
        modelRevision: `${engineId}-test`,
        downloadSizeBytes: 0,
        downloadedBytes: 0,
        progress: 100,
        message: "Ready"
      })),
      listen: vi.fn().mockResolvedValue(() => undefined)
    },
    eventDispatcher: spies.dispatcher,
    externalLinkOpener: {
      open: spies.openExternalLink ?? vi.fn().mockResolvedValue(undefined)
    },
    fontCatalog: { listFamilies: vi.fn().mockResolvedValue(["Inter", "Literata"]) },
    librarySearch: { search: spies.searchLibrary ?? vi.fn().mockResolvedValue([]) },
    mediaSession: createNoopMediaSessionGateway(),
    narration: {
      capabilities: {
        offlineLibrary: spies.offlineLibrary ?? "individual-voice",
        preparesAcrossChapters: spies.offlineLibrary === "language-pack"
      },
      activateSettings: (settings) => settings,
      voices: () => SUPPORTED_NARRATION_VOICES,
      observeEngineInstallation: vi.fn(),
      createGateway: (options) => {
        spies.captureNarrationProjection?.(options.projectPlayback);
        return narrationGateway;
      },
      bookIdentity: () => ({ voiceId: "voice-1", modelRevision: "test-revision" }),
      prepareBook: vi.fn().mockResolvedValue({ sentenceCount: 0 })
    },
    quoteImageExporter: {
      export: spies.exportQuoteImage ?? vi.fn().mockResolvedValue("quote.png")
    },
    readerShellViewport: {
      isMobile: () => spies.mobileReaderShell ?? false,
      listen: () => () => undefined
    },
    readerPreferencesRepository: {
      load: () => spies.readerPreferences ?? createReaderPreferences(),
      save: spies.savePreferences ?? vi.fn()
    },
    readingPositionStore: {
      save: spies.saveReadingPosition ?? vi.fn().mockResolvedValue(undefined)
    },
    voiceInstallationRepository: {
      getStatus: vi.fn().mockResolvedValue(readyVoice),
      install: vi.fn().mockResolvedValue(readyVoice),
      listen: vi.fn().mockResolvedValue(spies.stopVoiceEvents)
    }
  };
}

function dispatchShortcut(key: string, options: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options }));
}

function dispatchShortcutFrom(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options }));
}

function createLibraryBook(
  id: string,
  title: string,
  completedSentenceCount: number
): LibraryBookSummary {
  return {
    id,
    title,
    author: "Library Author",
    importedAt: "2026-07-17T00:00:00.000Z",
    chapterCount: 2,
    sentenceCount: 10,
    lastChapterId: completedSentenceCount > 0 ? `${id}-chapter` : null,
    completedSentenceCount
  };
}

function createReaderDocument(bookId: string): ReaderDocumentDto {
  return {
    book: { id: bookId, title: "Opened Book", author: "Library Author", language: "en" },
    activeChapterId: `${bookId}-chapter`,
    chapters: [
      {
        id: `${bookId}-chapter`,
        title: "Chapter 1",
        index: 0,
        sentenceCount: 1,
        sentences: [{ id: `${bookId}-sentence`, index: 0, text: "Opened from the Library." }]
      }
    ],
    position: null
  };
}

function createStructuredReaderDocument(): ReaderDocumentDto {
  const sentences = Array.from({ length: 120 }, (_, index) => ({
    id: `android-import:chapter-1:sentence-${index + 1}`,
    index,
    text:
      index === 0
        ? "Visit Library."
        : index === 1
          ? "Another item."
          : index === 2
            ? "Quoted thought."
            : `Reading sentence ${index + 1}.`
  }));
  return {
    book: {
      id: "android-import",
      title: "Pocket Structure",
      author: "Mobile Reader",
      language: "en",
      coverImageSrc: "https://asset.localhost/covers/android-import.png"
    },
    activeChapterId: "android-import:chapter-1",
    chapters: [
      {
        id: "android-import:chapter-1",
        title: "A Structured Beginning",
        index: 0,
        sentenceCount: sentences.length,
        sentences,
        paragraphs: sentences.map((sentence) => ({
          id: `android-import:chapter-1:paragraph-${sentence.index + 1}`,
          index: sentence.index,
          startSentenceIndex: sentence.index,
          sentenceCount: 1
        })),
        presentations: [
          { index: 0, kind: "ordered", indentLevel: 1, marker: "1", emphasized: false },
          { index: 1, kind: "unordered", indentLevel: 1, marker: null, emphasized: false },
          { index: 2, kind: "quote", indentLevel: 0, marker: null, emphasized: true }
        ],
        links: [
          {
            id: "android-import:chapter-1:link-1",
            sentenceId: sentences[0].id,
            sentenceIndex: 0,
            offset: 6,
            length: 7,
            href: "https://example.com/library",
            targetChapterId: null,
            targetSentenceIndex: null
          }
        ]
      }
    ],
    position: null
  };
}
