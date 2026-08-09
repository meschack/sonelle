import { describe, expect, it } from "vitest";
import { resolveReaderKeyboardShortcut } from "./reader-keyboard-shortcuts";

describe("reader keyboard shortcuts", () => {
  it("keeps arrows on sentences and promotes shifted arrows to chapter navigation", () => {
    expect(resolveReaderKeyboardShortcut({ key: "ArrowLeft", surface: "reader" })).toBe(
      "previous-sentence"
    );
    expect(
      resolveReaderKeyboardShortcut({ key: "ArrowRight", shiftKey: true, surface: "reader" })
    ).toBe("next-chapter");
  });

  it("maps narration controls without punctuation-only shortcuts", () => {
    expect(resolveReaderKeyboardShortcut({ key: " ", surface: "reader" })).toBe("toggle-playback");
    expect(resolveReaderKeyboardShortcut({ key: "m", surface: "reader" })).toBe("toggle-mute");
    expect(
      resolveReaderKeyboardShortcut({ key: "ArrowUp", shiftKey: true, surface: "reader" })
    ).toBe("increase-volume");
    expect(resolveReaderKeyboardShortcut({ key: "r", surface: "reader" })).toBe(
      "next-playback-rate"
    );
    expect(resolveReaderKeyboardShortcut({ key: "R", shiftKey: true, surface: "reader" })).toBe(
      "previous-playback-rate"
    );
  });

  it("maps reader tools and deliberate file-producing or closing actions", () => {
    expect(resolveReaderKeyboardShortcut({ key: "b", surface: "reader" })).toBe("toggle-bookmark");
    expect(resolveReaderKeyboardShortcut({ key: "c", surface: "reader" })).toBe("focus-chapter");
    expect(resolveReaderKeyboardShortcut({ key: "f", ctrlKey: true, surface: "reader" })).toBe(
      "search-chapter"
    );
    expect(resolveReaderKeyboardShortcut({ key: "/", surface: "reader" })).toBe("search-chapter");
    expect(resolveReaderKeyboardShortcut({ key: "w", surface: "reader" })).toBe("open-word");
    expect(resolveReaderKeyboardShortcut({ key: "n", surface: "reader" })).toBe("open-notes");
    expect(resolveReaderKeyboardShortcut({ key: "t", surface: "reader" })).toBe("open-tools");
    expect(resolveReaderKeyboardShortcut({ key: ",", metaKey: true, surface: "reader" })).toBe(
      "open-tools"
    );
    expect(resolveReaderKeyboardShortcut({ key: "S", shiftKey: true, surface: "reader" })).toBe(
      "save-quote-image"
    );
    expect(resolveReaderKeyboardShortcut({ key: "L", shiftKey: true, surface: "reader" })).toBe(
      "open-library"
    );
    expect(resolveReaderKeyboardShortcut({ key: "d", surface: "reader" })).toBe(
      "toggle-distraction-free"
    );
    expect(
      resolveReaderKeyboardShortcut({
        key: "Escape",
        surface: "reader",
        distractionFree: true
      })
    ).toBe("toggle-distraction-free");
  });

  it("keeps import and shortcut help available across app surfaces", () => {
    expect(resolveReaderKeyboardShortcut({ key: "o", ctrlKey: true, surface: "library" })).toBe(
      "import-book"
    );
    expect(resolveReaderKeyboardShortcut({ key: "?", shiftKey: true, surface: "library" })).toBe(
      "open-shortcut-reference"
    );
    expect(resolveReaderKeyboardShortcut({ key: "m", surface: "library" })).toBeNull();
    expect(
      resolveReaderKeyboardShortcut({
        key: "f",
        ctrlKey: true,
        shiftKey: true,
        surface: "reader"
      })
    ).toBe("search-across-books");
  });

  it("makes the shortcut reference modal and dismissible", () => {
    expect(
      resolveReaderKeyboardShortcut({
        key: "Escape",
        surface: "reader",
        shortcutReferenceOpen: true
      })
    ).toBe("close-shortcut-reference");
    expect(
      resolveReaderKeyboardShortcut({
        key: "m",
        surface: "reader",
        shortcutReferenceOpen: true
      })
    ).toBeNull();
    expect(resolveReaderKeyboardShortcut({ key: "Escape", surface: "reader" })).toBe(
      "clear-transient"
    );
  });

  it("keeps primary-modifier commands available while editing text", () => {
    expect(resolveReaderKeyboardShortcut({ key: "m", surface: "reader", typing: true })).toBeNull();
    expect(
      resolveReaderKeyboardShortcut({ key: "?", shiftKey: true, surface: "reader", typing: true })
    ).toBeNull();
    expect(
      resolveReaderKeyboardShortcut({ key: "o", ctrlKey: true, surface: "reader", typing: true })
    ).toBe("import-book");
    expect(
      resolveReaderKeyboardShortcut({ key: "f", metaKey: true, surface: "reader", typing: true })
    ).toBe("search-chapter");
  });

  it("maps Library search, card navigation, filters, and layered clearing", () => {
    expect(resolveReaderKeyboardShortcut({ key: "/", surface: "library" })).toBe(
      "focus-library-search"
    );
    expect(resolveReaderKeyboardShortcut({ key: "f", ctrlKey: true, surface: "library" })).toBe(
      "focus-library-search"
    );
    expect(resolveReaderKeyboardShortcut({ key: "ArrowUp", surface: "library" })).toBe(
      "navigate-library-up"
    );
    expect(resolveReaderKeyboardShortcut({ key: "ArrowRight", surface: "library" })).toBe(
      "navigate-library-right"
    );
    expect(resolveReaderKeyboardShortcut({ key: "Enter", surface: "library" })).toBe(
      "open-focused-library-book"
    );
    expect(resolveReaderKeyboardShortcut({ key: "1", surface: "library" })).toBe(
      "select-library-filter-all"
    );
    expect(resolveReaderKeyboardShortcut({ key: "2", surface: "library" })).toBe(
      "select-library-filter-in-progress"
    );
    expect(resolveReaderKeyboardShortcut({ key: "3", surface: "library" })).toBe(
      "select-library-filter-bookmarked"
    );
    expect(resolveReaderKeyboardShortcut({ key: "Escape", surface: "library" })).toBe(
      "clear-library"
    );
  });

  it("maps the power-user additions without changing reader arrow behavior", () => {
    expect(resolveReaderKeyboardShortcut({ key: "b", ctrlKey: true, surface: "library" })).toBe(
      "toggle-library-sidebar"
    );
    expect(
      resolveReaderKeyboardShortcut({
        key: "B",
        ctrlKey: true,
        shiftKey: true,
        surface: "reader"
      })
    ).toBe("toggle-inspector-sidebar");
    expect(resolveReaderKeyboardShortcut({ key: "Home", shiftKey: true, surface: "reader" })).toBe(
      "first-sentence"
    );
    expect(resolveReaderKeyboardShortcut({ key: "End", shiftKey: true, surface: "reader" })).toBe(
      "last-sentence"
    );
    expect(resolveReaderKeyboardShortcut({ key: "k", metaKey: true, surface: "library" })).toBe(
      "open-command-palette"
    );
    expect(resolveReaderKeyboardShortcut({ key: "F11", surface: "library" })).toBe(
      "toggle-fullscreen"
    );
    expect(resolveReaderKeyboardShortcut({ key: "ArrowRight", surface: "reader" })).toBe(
      "next-sentence"
    );
  });

  it("makes the command palette modal and exclusive", () => {
    expect(
      resolveReaderKeyboardShortcut({
        key: "Escape",
        surface: "reader",
        commandPaletteOpen: true
      })
    ).toBe("close-command-palette");
    expect(
      resolveReaderKeyboardShortcut({
        key: "k",
        ctrlKey: true,
        surface: "reader",
        commandPaletteOpen: true
      })
    ).toBe("close-command-palette");
    expect(
      resolveReaderKeyboardShortcut({ key: "m", surface: "reader", commandPaletteOpen: true })
    ).toBeNull();
  });
});
