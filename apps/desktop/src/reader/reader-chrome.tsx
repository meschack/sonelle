import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { PlaybackStatus, ReaderProgress } from "@sonelle/reader";
import type { ReaderChapterNavigationItem, ReaderContentsItem } from "./reader-view";
import {
  BookmarkIcon,
  FocusIcon,
  HelpIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  SearchIcon,
  ShareIcon,
  SpeakerIcon,
  SettingsIcon
} from "./reader-icons";
import { containMobileDialogFocus } from "./mobile-dialog-focus";

interface ProductBarProps {
  showQuoteImageAction: boolean;
  canSaveQuoteImage: boolean;
  onSaveQuoteImage: () => void;
  onOpenShortcutReference: () => void;
}

export function ProductBar(props: ProductBarProps) {
  return (
    <header class="product-bar">
      <div class="product-brand">
        <img src="/sonelle-icon.png" alt="" aria-hidden="true" />
        <strong>Sonelle</strong>
      </div>
      <span class="product-tagline">Your private reading desk</span>
      <div class="product-status-actions">
        <Show when={props.showQuoteImageAction}>
          <button
            class="product-icon-action product-quote-image-action"
            type="button"
            aria-label="Create quote image"
            aria-keyshortcuts="Shift+S"
            title="Create quote image (Shift+S)"
            disabled={!props.canSaveQuoteImage}
            onClick={props.onSaveQuoteImage}
          >
            <ShareIcon />
          </button>
        </Show>
        <button
          class="product-icon-action"
          type="button"
          aria-label="Keyboard shortcuts"
          aria-keyshortcuts="?"
          title="Keyboard shortcuts (?)"
          onClick={props.onOpenShortcutReference}
        >
          <HelpIcon />
        </button>
      </div>
    </header>
  );
}

interface ReaderTopAppBarProps {
  chapterTitle: string;
  activeChapterId: string;
  chapters: ReaderChapterNavigationItem[];
  sentenceCount: number;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onEnterDistractionFree: () => void;
}

export function ReaderTopAppBar(props: ReaderTopAppBarProps) {
  const chapterNumber = () =>
    Math.max(1, props.chapters.findIndex((chapter) => chapter.id === props.activeChapterId) + 1);

  return (
    <header class="top-app-bar">
      <div class="top-reading-title">
        <span>Now reading</span>
        <strong>{props.chapterTitle}</strong>
      </div>
      <div class="top-reading-meta">
        <span>
          Chapter {chapterNumber()} of {props.chapters.length}
        </span>
        <span>
          {props.sentenceCount} sentence{props.sentenceCount === 1 ? "" : "s"}
        </span>
      </div>
      <div class="top-app-actions">
        <button
          type="button"
          aria-label="Enter distraction-free reading"
          aria-keyshortcuts="D"
          title="Distraction-free reading (D)"
          onClick={props.onEnterDistractionFree}
        >
          <FocusIcon />
        </button>
        <button
          type="button"
          aria-label="Open search"
          aria-keyshortcuts="/ Control+F Meta+F"
          title="Search chapter (/ or Ctrl/Cmd+F)"
          onClick={props.onOpenSearch}
        >
          <SearchIcon />
        </button>
        <button
          type="button"
          aria-label="Open settings"
          aria-keyshortcuts="T Control+, Meta+,"
          title="Tools (T or Ctrl/Cmd+,)"
          onClick={props.onOpenSettings}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}

interface ChapterNavigatorProps {
  chapters: ReaderChapterNavigationItem[];
  activeChapterId: string;
  progress: ReaderProgress;
  volume: string;
  onOpenChapter: (chapterId: string) => void;
}

export function ChapterNavigator(props: ChapterNavigatorProps) {
  const activeChapter = () =>
    props.chapters.find((chapter) => chapter.id === props.activeChapterId) ?? props.chapters[0];

  return (
    <nav class="chapter-navigation" aria-label="Chapter navigation">
      <label class="chapter-meta-block">
        <span>Chapter</span>
        <select
          aria-label="Current chapter"
          aria-keyshortcuts="C"
          value={props.activeChapterId}
          onChange={(event) => props.onOpenChapter(event.currentTarget.value)}
        >
          <For each={props.chapters}>
            {(chapter) => <option value={chapter.id}>{chapter.title}</option>}
          </For>
        </select>
      </label>
      <span class="chapter-divider" aria-hidden="true" />
      <div class="chapter-meta-block">
        <span>Volume</span>
        <strong>{props.volume}</strong>
      </div>
      <div class="chapter-meta-block chapter-progress-meta">
        <span>Chapter Progress</span>
        <strong>
          {activeChapter()?.sentenceCount ?? props.progress.chapterSentenceCount} sentence
          {(activeChapter()?.sentenceCount ?? props.progress.chapterSentenceCount) === 1 ? "" : "s"}
        </strong>
      </div>
    </nav>
  );
}

interface ReaderContentsNavigatorProps {
  items: ReaderContentsItem[];
  activeChapterId: string;
  onOpenLocation: (chapterId: string, sentenceIndex: number) => Promise<void>;
}

export function ReaderContentsNavigator(props: ReaderContentsNavigatorProps) {
  const [open, setOpen] = createSignal(false);
  const historyMarker = "reader-contents";
  let trigger: HTMLButtonElement | undefined;
  let closeButton: HTMLButtonElement | undefined;

  const restoreFocus = () => queueMicrotask(() => trigger?.focus());

  const openContents = () => {
    if (open()) return;
    window.history.pushState({ sonelleSurface: historyMarker }, "");
    setOpen(true);
    queueMicrotask(() => closeButton?.focus());
  };

  const closeContents = () => {
    if (!open()) return;
    setOpen(false);
    restoreFocus();
    if (window.history.state?.sonelleSurface === historyMarker) window.history.back();
  };

  onMount(() => {
    const closeFromBackNavigation = () => {
      if (!open()) return;
      setOpen(false);
      restoreFocus();
    };
    window.addEventListener("popstate", closeFromBackNavigation);
    onCleanup(() => window.removeEventListener("popstate", closeFromBackNavigation));
  });

  const openLocation = (item: ReaderContentsItem) => {
    if (item.targetChapterId == null) return;
    void props
      .onOpenLocation(item.targetChapterId, item.targetSentenceIndex ?? 0)
      .finally(closeContents);
  };

  return (
    <>
      <Show when={props.items.length > 0}>
        <button
          ref={trigger}
          class="mobile-contents-trigger"
          type="button"
          aria-expanded={open()}
          aria-controls="reader-contents-panel"
          onClick={openContents}
        >
          Browse contents
        </button>
      </Show>
      <Show when={open()}>
        <div
          class="reader-contents-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeContents();
          }}
        >
          <section
            id="reader-contents-panel"
            class="reader-contents-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Table of contents"
            tabindex="-1"
            onKeyDown={(event) =>
              containMobileDialogFocus(event, event.currentTarget, closeContents)
            }
          >
            <header>
              <div>
                <span>Book navigation</span>
                <strong>Contents</strong>
              </div>
              <button
                ref={closeButton}
                type="button"
                aria-label="Back to reading"
                onClick={closeContents}
              >
                Back
              </button>
            </header>
            <nav aria-label="Table of contents">
              <For each={props.items}>
                {(item) => (
                  <button
                    type="button"
                    classList={{
                      "contents-entry": true,
                      active: item.targetChapterId === props.activeChapterId
                    }}
                    style={{ "padding-left": `${18 + Math.min(item.depth, 6) * 20}px` }}
                    disabled={item.targetChapterId == null}
                    aria-label={
                      item.targetChapterId == null ? `${item.label}, unavailable` : undefined
                    }
                    onClick={() => openLocation(item)}
                  >
                    <span>{item.label}</span>
                    <Show when={item.targetChapterId == null}>
                      <small>Unavailable</small>
                    </Show>
                  </button>
                )}
              </For>
            </nav>
          </section>
        </div>
      </Show>
    </>
  );
}

interface PlaybackRailProps {
  bookTitle: string;
  author: string;
  coverImageSrc: string | null;
  chapterTitle: string;
  progress: ReaderProgress;
  sentenceCount: number;
  status: PlaybackStatus;
  bookmarked: boolean;
  volume: number;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onToggleBookmark: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

export function PlaybackRail(props: PlaybackRailProps) {
  const isFirstSentence = () => props.progress.chapterSentenceNumber <= 1;
  const isLastSentence = () =>
    props.progress.chapterSentenceCount === 0 ||
    props.progress.chapterSentenceNumber >= props.progress.chapterSentenceCount;

  return (
    <footer class="audio-rail" aria-label="Playback controls">
      <div class="track-info">
        <div class="book-cover player-cover">
          <Show
            when={props.coverImageSrc}
            fallback={<span aria-hidden="true">{props.bookTitle.slice(0, 1).toUpperCase()}</span>}
          >
            {(source) => <img src={source()} alt={`${props.bookTitle} cover`} />}
          </Show>
        </div>
        <div class="playback-copy">
          <strong title={props.chapterTitle}>{props.chapterTitle}</strong>
          <span title={props.author}>{props.author || "Unknown author"}</span>
        </div>
      </div>
      <div class="transport-stack">
        <div class="transport-controls">
          <button
            class="icon-button"
            type="button"
            aria-label="Previous sentence"
            aria-keyshortcuts="ArrowLeft"
            title="Previous sentence (Left arrow)"
            disabled={props.sentenceCount === 0 || isFirstSentence()}
            onClick={props.onPrevious}
          >
            <PreviousIcon />
          </button>
          <button
            class="play"
            type="button"
            aria-label={props.status === "playing" ? "Pause" : "Play"}
            aria-keyshortcuts="Space"
            title={`${props.status === "playing" ? "Pause" : "Play"} (Space)`}
            disabled={props.sentenceCount === 0}
            onClick={props.onToggle}
          >
            <Show when={props.status === "playing"} fallback={<PlayIcon />}>
              <PauseIcon />
            </Show>
          </button>
          <button
            class="icon-button"
            type="button"
            aria-label="Next sentence"
            aria-keyshortcuts="ArrowRight"
            title="Next sentence (Right arrow)"
            disabled={props.sentenceCount === 0 || isLastSentence()}
            onClick={props.onNext}
          >
            <NextIcon />
          </button>
        </div>
        <div class="audio-progress" aria-label="Reading progress">
          <span>
            {props.progress.chapterSentenceNumber} / {props.progress.chapterSentenceCount}
          </span>
          <div class="progress-track" aria-hidden="true">
            <span style={{ width: `${props.progress.bookPercent}%` }} />
          </div>
          <span>{Math.round(props.progress.bookPercent)}%</span>
        </div>
      </div>
      <div class="essential-actions">
        <button
          classList={{
            "bookmark-toggle": true,
            active: props.bookmarked
          }}
          type="button"
          aria-label={props.bookmarked ? "Remove bookmark" : "Bookmark sentence"}
          aria-pressed={props.bookmarked}
          disabled={props.sentenceCount === 0}
          title={props.bookmarked ? "Remove bookmark" : "Bookmark sentence"}
          aria-keyshortcuts="B"
          onClick={props.onToggleBookmark}
        >
          <BookmarkIcon />
        </button>
        <div class="volume-control">
          <button
            classList={{ "volume-toggle": true, muted: props.volume === 0 }}
            type="button"
            aria-label={props.volume === 0 ? "Unmute narration" : "Mute narration"}
            aria-pressed={props.volume === 0}
            title={props.volume === 0 ? "Unmute narration" : "Mute narration"}
            aria-keyshortcuts="M"
            onClick={props.onToggleMute}
          >
            <SpeakerIcon />
          </button>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={props.volume}
            aria-label="Narration volume"
            aria-valuetext={`${Math.round(props.volume * 100)} percent`}
            title={`Narration volume: ${Math.round(props.volume * 100)}%`}
            onInput={(event) => props.onVolumeChange(Number(event.currentTarget.value))}
          />
          <span>{Math.round(props.volume * 100)}%</span>
        </div>
      </div>
    </footer>
  );
}
