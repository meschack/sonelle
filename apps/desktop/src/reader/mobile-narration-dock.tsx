import type { PlaybackStatus, ReaderProgress } from "@sonelle/reader";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, SettingsIcon } from "./reader-icons";

interface MobileNarrationDockProps {
  chapterTitle: string;
  progress: ReaderProgress;
  sentenceCount: number;
  status: PlaybackStatus;
  preparing: boolean;
  notice: string | null;
  onPrevious(): void;
  onToggle(): void;
  onNext(): void;
  onStop(): void;
  onOpenControls(): void;
}

export function MobileNarrationDock(props: MobileNarrationDockProps) {
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
    <footer class="mobile-narration-dock" aria-label="Narration controls">
      <div class="mobile-narration-copy">
        <span>{statusLabel()}</span>
        <strong title={props.chapterTitle}>{props.chapterTitle}</strong>
        <small>
          Sentence {props.progress.chapterSentenceNumber} of {props.progress.chapterSentenceCount}
        </small>
      </div>
      <div class="mobile-narration-transport">
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
        <button
          type="button"
          aria-label="Stop narration"
          disabled={props.status === "idle" || props.status === "ended"}
          onClick={props.onStop}
        >
          <span class="mobile-narration-stop-glyph" aria-hidden="true" />
        </button>
      </div>
      <button
        classList={{
          "mobile-narration-settings": true,
          attention: props.notice != null
        }}
        type="button"
        aria-label={props.notice == null ? "Open narration controls" : "Open narration recovery"}
        onClick={props.onOpenControls}
      >
        <SettingsIcon />
      </button>
    </footer>
  );
}
