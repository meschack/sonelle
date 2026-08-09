import type { AppView } from "./reader-experience-types";

export type ReaderKeyboardCommand =
  | "previous-sentence"
  | "next-sentence"
  | "previous-chapter"
  | "next-chapter"
  | "toggle-playback"
  | "toggle-mute"
  | "increase-volume"
  | "decrease-volume"
  | "next-playback-rate"
  | "previous-playback-rate"
  | "focus-chapter"
  | "search-chapter"
  | "toggle-bookmark"
  | "open-word"
  | "open-notes"
  | "open-tools"
  | "save-quote-image"
  | "open-library"
  | "import-book"
  | "focus-library-search"
  | "search-across-books"
  | "navigate-library-up"
  | "navigate-library-down"
  | "navigate-library-left"
  | "navigate-library-right"
  | "open-focused-library-book"
  | "select-library-filter-all"
  | "select-library-filter-in-progress"
  | "select-library-filter-bookmarked"
  | "clear-library"
  | "toggle-library-sidebar"
  | "toggle-inspector-sidebar"
  | "toggle-distraction-free"
  | "first-sentence"
  | "last-sentence"
  | "open-command-palette"
  | "close-command-palette"
  | "toggle-fullscreen"
  | "open-shortcut-reference"
  | "close-shortcut-reference"
  | "clear-transient";

export interface ReaderKeyboardShortcutInput {
  key: string;
  surface: AppView;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  typing?: boolean;
  shortcutReferenceOpen?: boolean;
  commandPaletteOpen?: boolean;
  distractionFree?: boolean;
}

export interface ReaderKeyboardShortcutReferenceGroup {
  title: string;
  shortcuts: ReadonlyArray<{
    keys: readonly string[];
    label: string;
  }>;
}

export const readerKeyboardShortcutReference: readonly ReaderKeyboardShortcutReferenceGroup[] = [
  {
    title: "Playback",
    shortcuts: [
      { keys: ["Space"], label: "Play or pause narration" },
      { keys: ["Left", "Right"], label: "Move by sentence" },
      { keys: ["Shift", "Left / Right"], label: "Move by chapter" },
      { keys: ["M"], label: "Mute or unmute" },
      { keys: ["Shift", "Up / Down"], label: "Change volume" },
      { keys: ["R", "Shift + R"], label: "Cycle narration speed" }
    ]
  },
  {
    title: "Reading",
    shortcuts: [
      { keys: ["B"], label: "Bookmark current sentence" },
      { keys: ["C"], label: "Choose a chapter" },
      { keys: ["/", "Ctrl / Cmd + F"], label: "Search current chapter" },
      { keys: ["W"], label: "Open Word" },
      { keys: ["N"], label: "Open Notes" },
      { keys: ["T", "Ctrl / Cmd + ,"], label: "Open Tools" },
      { keys: ["Shift + S"], label: "Create quote image" },
      { keys: ["Shift + L"], label: "Return to Library" },
      { keys: ["Ctrl / Cmd + Shift + F"], label: "Search across all books" },
      { keys: ["D"], label: "Toggle distraction-free reading" }
    ]
  },
  {
    title: "Library",
    shortcuts: [
      { keys: ["/", "Ctrl / Cmd + F"], label: "Search the Library" },
      { keys: ["Arrow keys"], label: "Move between book cards" },
      { keys: ["Enter"], label: "Open the focused book" },
      { keys: ["1", "2", "3"], label: "Change the Library filter" },
      { keys: ["Esc"], label: "Clear search or restore All books" }
    ]
  },
  {
    title: "Power",
    shortcuts: [
      { keys: ["Ctrl / Cmd + B"], label: "Toggle the Library sidebar" },
      { keys: ["Ctrl / Cmd + Shift + B"], label: "Toggle reader tools" },
      { keys: ["Shift + Home", "Shift + End"], label: "Jump to chapter boundary" },
      { keys: ["Ctrl / Cmd + K"], label: "Open the command palette" },
      { keys: ["F11"], label: "Toggle fullscreen" }
    ]
  },
  {
    title: "App",
    shortcuts: [
      { keys: ["Ctrl / Cmd + O"], label: "Import an EPUB" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["Esc"], label: "Close or clear the current action" }
    ]
  }
] as const;

export function resolveReaderKeyboardShortcut(
  input: ReaderKeyboardShortcutInput
): ReaderKeyboardCommand | null {
  if (input.altKey) return null;
  const primaryModifier = input.ctrlKey || input.metaKey;
  const key = input.key.toLowerCase();
  if (input.shortcutReferenceOpen) {
    return input.key === "Escape" || input.key === "?" ? "close-shortcut-reference" : null;
  }
  if (input.commandPaletteOpen) {
    if (input.key === "Escape" || (primaryModifier && !input.shiftKey && key === "k")) {
      return "close-command-palette";
    }
    return null;
  }

  if (!primaryModifier && !input.typing && input.key === "?") return "open-shortcut-reference";
  if (primaryModifier && !input.shiftKey && key === "o") return "import-book";
  if (primaryModifier && !input.shiftKey && key === "k") return "open-command-palette";
  if (primaryModifier && input.shiftKey && key === "f") return "search-across-books";
  if (primaryModifier && key === "b") {
    return input.shiftKey ? "toggle-inspector-sidebar" : "toggle-library-sidebar";
  }
  if (!primaryModifier && input.key === "F11") return "toggle-fullscreen";

  if (input.surface === "library") {
    if (primaryModifier) {
      return !input.shiftKey && key === "f" ? "focus-library-search" : null;
    }
    if (input.key === "Escape") return "clear-library";
    if (input.typing) return null;
    if (input.key === "/") return "focus-library-search";
    if (input.key === "ArrowUp") return "navigate-library-up";
    if (input.key === "ArrowDown") return "navigate-library-down";
    if (input.key === "ArrowLeft") return "navigate-library-left";
    if (input.key === "ArrowRight") return "navigate-library-right";
    if (input.key === "Enter") return "open-focused-library-book";
    if (input.key === "1") return "select-library-filter-all";
    if (input.key === "2") return "select-library-filter-in-progress";
    if (input.key === "3") return "select-library-filter-bookmarked";
    return null;
  }

  if (primaryModifier) {
    if (!input.shiftKey && key === "f") return "search-chapter";
    if (!input.shiftKey && input.key === ",") return "open-tools";
    return null;
  }
  if (input.key === "Escape") {
    return input.distractionFree ? "toggle-distraction-free" : "clear-transient";
  }
  if (input.typing) return null;

  if (input.key === "ArrowLeft") {
    return input.shiftKey ? "previous-chapter" : "previous-sentence";
  }
  if (input.key === "ArrowRight") {
    return input.shiftKey ? "next-chapter" : "next-sentence";
  }
  if (input.shiftKey && input.key === "ArrowUp") return "increase-volume";
  if (input.shiftKey && input.key === "ArrowDown") return "decrease-volume";
  if (input.shiftKey && input.key === "Home") return "first-sentence";
  if (input.shiftKey && input.key === "End") return "last-sentence";
  if (!input.shiftKey && input.key === " ") return "toggle-playback";

  if (!input.shiftKey && key === "m") return "toggle-mute";
  if (key === "r") return input.shiftKey ? "previous-playback-rate" : "next-playback-rate";
  if (!input.shiftKey && key === "c") return "focus-chapter";
  if (input.key === "/") return "search-chapter";
  if (!input.shiftKey && key === "b") return "toggle-bookmark";
  if (!input.shiftKey && key === "w") return "open-word";
  if (!input.shiftKey && key === "n") return "open-notes";
  if (!input.shiftKey && key === "t") return "open-tools";
  if (input.shiftKey && key === "s") return "save-quote-image";
  if (input.shiftKey && key === "l") return "open-library";
  if (!input.shiftKey && key === "d") return "toggle-distraction-free";
  return null;
}
