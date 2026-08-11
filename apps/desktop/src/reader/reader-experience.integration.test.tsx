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
import { createReaderPreferences, type ReaderPreferences } from "@sonelle/reader";
import type { ReaderExperienceDependencies } from "./reader-dependencies";
import type {
  BookImportGateway,
  BookMetadataEditor,
  LibrarySearch,
  LibrarySearchResultDto
} from "../library/library-contracts";
import type { LibraryBookSummary, ReaderDocumentDto } from "../library/library-models";
import { ReaderExperience } from "./reader-experience";
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
    await vi.waitFor(() => expect(importBook).toHaveBeenCalledWith({ kind: "choose" }));

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
      createLibraryBook("book-two", "Second Book", 3),
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

  it("searches across imported books and opens a sentence result in context", async () => {
    const openBook = vi.fn(async (bookId: string) => createReaderDocument(bookId));
    const searchLibrary = vi.fn<LibrarySearch["search"]>().mockResolvedValue([
      {
        id: "sentence:book-two-sentence",
        kind: "sentence",
        bookId: "book-two",
        bookTitle: "Second Book",
        author: "Library Author",
        chapterId: "book-two-chapter",
        chapterTitle: "Chapter 1",
        sentenceId: "book-two-sentence",
        sentenceIndex: 0,
        excerpt: "Every serious choice involves trade-offs."
      }
    ] satisfies LibrarySearchResultDto[]);
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

    dispatchShortcut("f", { ctrlKey: true, shiftKey: true });
    const search = await vi.waitFor(() => {
      const input = container.querySelector<HTMLInputElement>(
        '.library-workspace [aria-label="Search library"]'
      );
      expect(document.activeElement).toBe(input);
      return input;
    });
    if (search == null) throw new Error("Cross-book search was not rendered");
    search.value = "trade";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(searchLibrary).toHaveBeenCalledWith({ query: "trade", limit: 30 })
    );
    const results = await vi.waitFor(() => {
      const view = container.querySelector(".cross-book-search-results");
      expect(view?.textContent).toContain("Every serious choice involves trade-offs.");
      return view;
    });
    expect(results?.querySelector("mark")?.textContent).toBe("trade");
    const result = [...(results?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent?.includes("Every serious choice")
    );
    result?.click();

    await vi.waitFor(() => expect(openBook).toHaveBeenCalledWith("book-two", "book-two-chapter"));
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
    expect(container.textContent).not.toContain("Diagnostics");

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
    bookMetadataEditor: {
      chooseCover: spies.chooseBookCover ?? vi.fn().mockResolvedValue(null),
      update:
        spies.updateBookMetadata ??
        vi.fn().mockRejectedValue(new Error("No metadata edit requested"))
    },
    bookmarkStore: {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockRejectedValue(new Error("No bookmark requested")),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    dictionaryRepository: {
      lookupWord: vi.fn().mockResolvedValue(null),
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
    narration: {
      capabilities: {
        offlineLibrary: spies.offlineLibrary ?? "individual-voice",
        preparesAcrossChapters: spies.offlineLibrary === "language-pack"
      },
      activateSettings: (settings) => settings,
      voices: () => SUPPORTED_NARRATION_VOICES,
      observeEngineInstallation: vi.fn(),
      createGateway: () => narrationGateway,
      bookIdentity: () => ({ voiceId: "voice-1", modelRevision: "test-revision" }),
      prepareBook: vi.fn().mockResolvedValue({ sentenceCount: 0 })
    },
    quoteImageExporter: {
      export: spies.exportQuoteImage ?? vi.fn().mockResolvedValue("quote.png")
    },
    readerPreferencesRepository: {
      load: () => spies.readerPreferences ?? createReaderPreferences(),
      save: spies.savePreferences ?? vi.fn()
    },
    readingPositionStore: { save: vi.fn().mockResolvedValue(undefined) },
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
