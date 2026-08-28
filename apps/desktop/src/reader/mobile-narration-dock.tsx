import { createUniqueId, Show } from "solid-js";
import type { PlaybackStatus, ReaderProgress } from "@sonelle/reader";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./reader-icons";

interface MobileNarrationDockProps {
  progress: ReaderProgress;
  sentenceCount: number;
  status: PlaybackStatus;
  preparing: boolean;
  notice: string | null;
  onPrevious(): void;
  onToggle(): void;
  onNext(): void;
}

export function MobileNarrationDock(props: MobileNarrationDockProps) {
  const statusId = `mobile-narration-status-${createUniqueId()}`;
  const isFirstSentence = () => props.progress.chapterSentenceNumber <= 1;
  const isLastSentence = () =>
    props.progress.chapterSentenceCount === 0 ||
    props.progress.chapterSentenceNumber >= props.progress.chapterSentenceCount;
  const toggleLabel = () => {
    if (props.status === "playing") return "Pause narration";
    if (props.status === "paused") return "Resume narration";
    return "Play narration";
  };
  const statusLabel = () => {
    if (props.notice != null) return "Narration needs attention";
    if (props.preparing) return "Preparing audio";
    if (props.status === "playing") return "Listening";
    if (props.status === "paused") return "Paused";
    if (props.status === "ended") return "Chapter finished";
    return "Ready to listen";
  };

  return (
    <footer
      class="mobile-narration-dock"
      aria-label="Narration controls"
      aria-describedby={statusId}
    >
      <span id={statusId} class="reader-visually-hidden">
        {statusLabel()}
      </span>
      <div class="mobile-narration-transport" role="group" aria-label="Narration transport">
        <button
          type="button"
          aria-label="Previous sentence"
          disabled={props.sentenceCount === 0 || isFirstSentence()}
          onClick={props.onPrevious}
        >
          <PreviousIcon />
        </button>
        <button
          class="mobile-narration-play"
          type="button"
          aria-label={toggleLabel()}
          disabled={props.sentenceCount === 0}
          onClick={props.onToggle}
        >
          {props.status === "playing" ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          aria-label="Next sentence"
          disabled={props.sentenceCount === 0 || isLastSentence()}
          onClick={props.onNext}
        >
          <NextIcon />
        </button>
      </div>
      <Show when={props.notice}>
        {(notice) => (
          <span class="reader-visually-hidden" role="alert">
            {notice()}
          </span>
        )}
      </Show>
      <Show when={props.notice == null && props.preparing}>
        <span class="reader-visually-hidden" role="status" aria-live="polite">
          Preparing narration audio.
        </span>
      </Show>
    </footer>
  );
}
