import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { LibraryBookSummary } from "../library/library-models";
import { LibraryIcon, SearchIcon, SettingsIcon } from "./reader-icons";

interface MobileReaderShellProps {
  bookTitle: string;
  chapterTitle: string;
  navigation: JSX.Element;
  content: JSX.Element;
  tools: JSX.Element;
  playback: JSX.Element;
  libraryBooks: LibraryBookSummary[];
  activeBookId: string;
  toolsOpen: boolean;
  onOpenBook(bookId: string): Promise<void>;
  onOpenFullLibrary(): void;
  onOpenSearch(): void;
  onOpenTools(): void;
  onCloseTools(): void;
}

export function MobileReaderShell(props: MobileReaderShellProps) {
  const [libraryOpen, setLibraryOpen] = createSignal(false);
  const historyMarker = "mobile-reader-library";
  let libraryTrigger: HTMLButtonElement | undefined;
  let libraryClose: HTMLButtonElement | undefined;
  let toolsClose: HTMLButtonElement | undefined;
  let toolsReturnFocus: HTMLElement | null = null;
  let toolsHistoryActive = false;
  let toolsWereOpen = false;

  const restoreLibraryFocus = () => queueMicrotask(() => libraryTrigger?.focus());
  const openLibrary = () => {
    if (libraryOpen()) return;
    window.history.pushState({ sonelleSurface: historyMarker }, "");
    setLibraryOpen(true);
    queueMicrotask(() => libraryClose?.focus());
  };
  const closeLibrary = () => {
    if (!libraryOpen()) return;
    setLibraryOpen(false);
    restoreLibraryFocus();
    if (window.history.state?.sonelleSurface === historyMarker) window.history.back();
  };
  const selectBook = (bookId: string) => {
    if (bookId === props.activeBookId) {
      closeLibrary();
      return;
    }
    void props.onOpenBook(bookId).finally(closeLibrary);
  };
  const restoreToolsFocus = () =>
    queueMicrotask(() => {
      if (toolsReturnFocus?.isConnected) toolsReturnFocus.focus();
      toolsReturnFocus = null;
    });

  createEffect(() => {
    const open = props.toolsOpen;
    if (open === toolsWereOpen) return;
    toolsWereOpen = open;

    if (open) {
      toolsReturnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.history.pushState({ sonelleSurface: "mobile-reader-tools" }, "");
      toolsHistoryActive = true;
      queueMicrotask(() => toolsClose?.focus());
      return;
    }

    restoreToolsFocus();
    if (toolsHistoryActive && window.history.state?.sonelleSurface === "mobile-reader-tools") {
      toolsHistoryActive = false;
      window.history.back();
    }
  });

  onMount(() => {
    const closeFromBackNavigation = () => {
      if (libraryOpen()) {
        setLibraryOpen(false);
        restoreLibraryFocus();
      }
      if (props.toolsOpen && toolsHistoryActive) {
        toolsHistoryActive = false;
        props.onCloseTools();
        restoreToolsFocus();
      }
    };
    window.addEventListener("popstate", closeFromBackNavigation);
    onCleanup(() => window.removeEventListener("popstate", closeFromBackNavigation));
  });

  return (
    <section class="mobile-reader-shell" aria-label="Mobile reader">
      <header class="mobile-reader-header">
        <button
          ref={libraryTrigger}
          class="mobile-reader-library-trigger"
          type="button"
          aria-label="Open library"
          aria-expanded={libraryOpen()}
          aria-controls="mobile-reader-library-sheet"
          onClick={openLibrary}
        >
          <LibraryIcon />
        </button>
        <div class="mobile-reader-title">
          <span>{props.bookTitle}</span>
          <strong>{props.chapterTitle}</strong>
        </div>
        <div class="mobile-reader-actions">
          <button type="button" aria-label="Search this chapter" onClick={props.onOpenSearch}>
            <SearchIcon />
          </button>
          <button type="button" aria-label="Open reading tools" onClick={props.onOpenTools}>
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div class="mobile-reader-navigation-slot">{props.navigation}</div>
      <div class="mobile-reader-content-slot">{props.content}</div>
      <div class="mobile-reader-playback-slot">{props.playback}</div>

      <Show when={libraryOpen()}>
        <div
          class="mobile-reader-sheet-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeLibrary();
          }}
        >
          <section
            id="mobile-reader-library-sheet"
            class="mobile-reader-sheet mobile-reader-library-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Library"
          >
            <header>
              <div>
                <span>Your books</span>
                <strong>Library</strong>
              </div>
              <button ref={libraryClose} type="button" onClick={closeLibrary}>
                Back to reading
              </button>
            </header>
            <div class="mobile-reader-book-list">
              <Show when={props.libraryBooks.length === 0}>
                <p class="mobile-reader-library-empty">
                  Add an EPUB from the Library to keep it close at hand.
                </p>
              </Show>
              <For each={props.libraryBooks}>
                {(book) => {
                  const progress = () =>
                    book.sentenceCount === 0
                      ? 0
                      : Math.round((book.completedSentenceCount / book.sentenceCount) * 100);
                  return (
                    <button
                      type="button"
                      data-mobile-library-book={book.id}
                      classList={{
                        "mobile-reader-book": true,
                        active: book.id === props.activeBookId
                      }}
                      aria-current={book.id === props.activeBookId ? "page" : undefined}
                      onClick={() => selectBook(book.id)}
                    >
                      <span class="mobile-reader-book-cover" aria-hidden="true">
                        <Show
                          when={book.coverImageSrc}
                          fallback={book.title.slice(0, 1).toUpperCase()}
                        >
                          {(source) => <img src={source()} alt="" />}
                        </Show>
                      </span>
                      <span class="mobile-reader-book-copy">
                        <strong>{book.title}</strong>
                        <span>{book.author || "Unknown author"}</span>
                        <small>
                          {progress()}% read · {book.chapterCount} chapter
                          {book.chapterCount === 1 ? "" : "s"}
                        </small>
                      </span>
                    </button>
                  );
                }}
              </For>
            </div>
            <footer>
              <button
                type="button"
                onClick={() => {
                  closeLibrary();
                  props.onOpenFullLibrary();
                }}
              >
                Manage library
              </button>
            </footer>
          </section>
        </div>
      </Show>

      <Show when={props.toolsOpen}>
        <div
          class="mobile-reader-tools-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) props.onCloseTools();
          }}
        >
          <section
            class="mobile-reader-tools-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Reading tools"
          >
            <header>
              <div>
                <span>Current book</span>
                <strong>Reading tools</strong>
              </div>
              <button ref={toolsClose} type="button" onClick={props.onCloseTools}>
                Back to reading
              </button>
            </header>
            <div class="mobile-reader-tools-slot">{props.tools}</div>
          </section>
        </div>
      </Show>
    </section>
  );
}
