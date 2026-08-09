import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { AppView } from "./reader-experience-types";
import { CloseIcon, SearchIcon } from "./reader-icons";
import type { ReaderKeyboardCommand } from "./reader-keyboard-shortcuts";

interface CommandPaletteEntry {
  command: ReaderKeyboardCommand;
  label: string;
  shortcut: string;
  surfaces: readonly AppView[] | "all";
}

const commandPaletteEntries: readonly CommandPaletteEntry[] = [
  {
    command: "toggle-playback",
    label: "Play or pause narration",
    shortcut: "Space",
    surfaces: ["reader"]
  },
  {
    command: "previous-sentence",
    label: "Previous sentence",
    shortcut: "Left",
    surfaces: ["reader"]
  },
  { command: "next-sentence", label: "Next sentence", shortcut: "Right", surfaces: ["reader"] },
  {
    command: "previous-chapter",
    label: "Previous chapter",
    shortcut: "Shift + Left",
    surfaces: ["reader"]
  },
  {
    command: "next-chapter",
    label: "Next chapter",
    shortcut: "Shift + Right",
    surfaces: ["reader"]
  },
  {
    command: "first-sentence",
    label: "First sentence in chapter",
    shortcut: "Shift + Home",
    surfaces: ["reader"]
  },
  {
    command: "last-sentence",
    label: "Last sentence in chapter",
    shortcut: "Shift + End",
    surfaces: ["reader"]
  },
  {
    command: "toggle-mute",
    label: "Mute or unmute narration",
    shortcut: "M",
    surfaces: ["reader"]
  },
  {
    command: "next-playback-rate",
    label: "Increase narration speed",
    shortcut: "R",
    surfaces: ["reader"]
  },
  {
    command: "previous-playback-rate",
    label: "Decrease narration speed",
    shortcut: "Shift + R",
    surfaces: ["reader"]
  },
  { command: "focus-chapter", label: "Choose a chapter", shortcut: "C", surfaces: ["reader"] },
  {
    command: "search-chapter",
    label: "Search current chapter",
    shortcut: "Ctrl / Cmd + F",
    surfaces: ["reader"]
  },
  {
    command: "toggle-bookmark",
    label: "Bookmark current sentence",
    shortcut: "B",
    surfaces: ["reader"]
  },
  { command: "open-word", label: "Open Word", shortcut: "W", surfaces: ["reader"] },
  { command: "open-notes", label: "Open Notes", shortcut: "N", surfaces: ["reader"] },
  { command: "open-tools", label: "Open Tools", shortcut: "T", surfaces: ["reader"] },
  {
    command: "save-quote-image",
    label: "Create quote image",
    shortcut: "Shift + S",
    surfaces: ["reader"]
  },
  {
    command: "toggle-distraction-free",
    label: "Toggle distraction-free reading",
    shortcut: "D",
    surfaces: ["reader"]
  },
  {
    command: "open-library",
    label: "Return to Library",
    shortcut: "Shift + L",
    surfaces: ["reader"]
  },
  {
    command: "focus-library-search",
    label: "Search the Library",
    shortcut: "Ctrl / Cmd + F",
    surfaces: ["library"]
  },
  {
    command: "search-across-books",
    label: "Search across all books",
    shortcut: "Ctrl / Cmd + Shift + F",
    surfaces: "all"
  },
  {
    command: "select-library-filter-all",
    label: "Show all books",
    shortcut: "1",
    surfaces: ["library"]
  },
  {
    command: "select-library-filter-in-progress",
    label: "Show books in progress",
    shortcut: "2",
    surfaces: ["library"]
  },
  {
    command: "select-library-filter-bookmarked",
    label: "Show bookmarked books",
    shortcut: "3",
    surfaces: ["library"]
  },
  { command: "import-book", label: "Import an EPUB", shortcut: "Ctrl / Cmd + O", surfaces: "all" },
  {
    command: "toggle-library-sidebar",
    label: "Toggle Library sidebar",
    shortcut: "Ctrl / Cmd + B",
    surfaces: "all"
  },
  {
    command: "toggle-inspector-sidebar",
    label: "Toggle reader tools",
    shortcut: "Ctrl / Cmd + Shift + B",
    surfaces: ["reader"]
  },
  { command: "toggle-fullscreen", label: "Toggle fullscreen", shortcut: "F11", surfaces: "all" },
  {
    command: "open-shortcut-reference",
    label: "Show keyboard shortcuts",
    shortcut: "?",
    surfaces: "all"
  }
] as const;

interface ReaderCommandPaletteProps {
  surface: AppView;
  onClose: () => void;
  onSelect: (command: ReaderKeyboardCommand) => void;
}

export function ReaderCommandPalette(props: ReaderCommandPaletteProps) {
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  let input: HTMLInputElement | undefined;
  let dialog: HTMLElement | undefined;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const commands = createMemo(() => {
    const normalizedQuery = query().trim().toLowerCase();
    return commandPaletteEntries.filter(
      (entry) =>
        (entry.surfaces === "all" || entry.surfaces.includes(props.surface)) &&
        (normalizedQuery.length === 0 || entry.label.toLowerCase().includes(normalizedQuery))
    );
  });

  createEffect(() => {
    query();
    setActiveIndex(0);
  });
  onMount(() => input?.focus());
  onCleanup(() => previouslyFocused?.focus());

  const selectActiveCommand = () => {
    const command = commands()[activeIndex()];
    if (command != null) props.onSelect(command.command);
  };

  const keepFocusInDialog = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || dialog == null) return;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>("input, button:not([disabled])")
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (first == null || last == null) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <Portal>
      <div
        class="command-palette-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <section
          ref={dialog}
          class="command-palette"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onKeyDown={keepFocusInDialog}
        >
          <header class="command-palette-search">
            <SearchIcon />
            <input
              ref={input}
              type="search"
              aria-label="Search commands"
              aria-controls="command-palette-results"
              aria-activedescendant={commands()[activeIndex()]?.command}
              placeholder="Type a command"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (commands().length === 0) return;
                  setActiveIndex((current) => Math.min(commands().length - 1, current + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (commands().length === 0) return;
                  setActiveIndex((current) => Math.max(0, current - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  selectActiveCommand();
                }
              }}
            />
            <button
              type="button"
              aria-label="Close command palette"
              title="Close (Esc)"
              onClick={props.onClose}
            >
              <CloseIcon />
            </button>
          </header>
          <div id="command-palette-results" class="command-palette-results" role="listbox">
            <Show when={commands().length > 0} fallback={<p>No matching commands</p>}>
              <For each={commands()}>
                {(entry, index) => (
                  <button
                    id={entry.command}
                    classList={{ active: index() === activeIndex() }}
                    type="button"
                    role="option"
                    aria-selected={index() === activeIndex()}
                    onMouseEnter={() => setActiveIndex(index())}
                    onClick={() => props.onSelect(entry.command)}
                  >
                    <span>{entry.label}</span>
                    <kbd>{entry.shortcut}</kbd>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </section>
      </div>
    </Portal>
  );
}
