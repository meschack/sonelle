import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { CloseIcon, ShareIcon } from "./reader-icons";
import type { ReaderSentenceView } from "./reader-view";

interface ReaderQuoteImageDialogProps {
  sentences: ReaderSentenceView[];
  activeSentenceId: string;
  onClose(): void;
  onSave(sentenceIds: string[]): void;
}

const maximumSelectedSentences = 4;

export function ReaderQuoteImageDialog(props: ReaderQuoteImageDialogProps) {
  const activeIndex = Math.max(
    0,
    props.sentences.findIndex((sentence) => sentence.id === props.activeSentenceId)
  );
  const [range, setRange] = createSignal({ start: activeIndex, end: activeIndex });
  const selectedSentences = createMemo(() => props.sentences.slice(range().start, range().end + 1));
  let dialog: HTMLDivElement | undefined;
  let activeOption: HTMLLabelElement | undefined;
  const previouslyFocused = document.activeElement as HTMLElement | null;

  onMount(() => {
    dialog?.focus();
    activeOption?.scrollIntoView({ block: "center" });
  });
  onCleanup(() => previouslyFocused?.focus());

  const toggleSentence = (sentenceId: string) => {
    const index = props.sentences.findIndex((sentence) => sentence.id === sentenceId);
    if (index < 0 || index === activeIndex) return;
    const current = range();
    if (index >= current.start && index <= current.end) {
      setRange(
        index < activeIndex ? { ...current, start: index + 1 } : { ...current, end: index - 1 }
      );
      return;
    }

    const next = {
      start: Math.min(current.start, index, activeIndex),
      end: Math.max(current.end, index, activeIndex)
    };
    if (next.end - next.start + 1 <= maximumSelectedSentences) setRange(next);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab" || dialog == null) return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")
    ];
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (
      document.activeElement === dialog ||
      (event.shiftKey && document.activeElement === first) ||
      (!event.shiftKey && document.activeElement === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  return (
    <Portal>
      <div
        class="quote-image-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div
          ref={dialog}
          class="quote-image-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quote-image-title"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <header>
            <div>
              <span>Share a passage</span>
              <h2 id="quote-image-title">Create quote image</h2>
              <p>Select up to four neighboring sentences.</p>
            </div>
            <button type="button" aria-label="Close quote image" onClick={props.onClose}>
              <CloseIcon />
            </button>
          </header>

          <div class="quote-image-sentences" role="group" aria-label="Sentence selection">
            <For each={props.sentences}>
              {(sentence, index) => {
                const selected = () => index() >= range().start && index() <= range().end;
                const wouldExceedLimit = () => {
                  if (selected()) return false;
                  const nextStart = Math.min(range().start, index(), activeIndex);
                  const nextEnd = Math.max(range().end, index(), activeIndex);
                  return nextEnd - nextStart + 1 > maximumSelectedSentences;
                };
                const current = index() === activeIndex;
                return (
                  <label
                    ref={(element) => {
                      if (current) activeOption = element;
                    }}
                    classList={{ selected: selected(), active: current }}
                  >
                    <input
                      type="checkbox"
                      checked={selected()}
                      disabled={current || wouldExceedLimit()}
                      onChange={() => toggleSentence(sentence.id)}
                    />
                    <span>
                      <strong>
                        Sentence {index() + 1}
                        {current ? " · Current" : ""}
                      </strong>
                      <small>{sentence.text}</small>
                    </span>
                  </label>
                );
              }}
            </For>
          </div>

          <footer>
            <span>
              {selectedSentences().length} sentence
              {selectedSentences().length === 1 ? "" : "s"} selected
            </span>
            <div>
              <button class="secondary-tool-button" type="button" onClick={props.onClose}>
                Cancel
              </button>
              <button
                class="primary-tool-button"
                type="button"
                onClick={() => props.onSave(selectedSentences().map((sentence) => sentence.id))}
              >
                <ShareIcon />
                Save image
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
