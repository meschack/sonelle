import { Show, type JSX } from "solid-js";
import { PreviousIcon, SearchIcon, SettingsIcon } from "./reader-icons";

interface MobileReaderShellProps {
  bookTitle: string;
  chapterTitle: string;
  navigation: JSX.Element;
  content: JSX.Element;
  tools: JSX.Element;
  playback: JSX.Element;
  toolsOpen: boolean;
  onBackToLibrary(): void;
  onOpenSearch(): void;
  onOpenTools(): void;
  onCloseTools(): void;
}

export function MobileReaderShell(props: MobileReaderShellProps) {
  return (
    <section class="mobile-reader-shell" aria-label="Mobile reader">
      <header class="mobile-reader-header">
        <button
          class="mobile-reader-back"
          type="button"
          aria-label="Back to library"
          onClick={props.onBackToLibrary}
        >
          <PreviousIcon />
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

      <Show when={props.toolsOpen}>
        <div class="mobile-reader-tools-backdrop" role="presentation">
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
              <button type="button" onClick={props.onCloseTools}>
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
