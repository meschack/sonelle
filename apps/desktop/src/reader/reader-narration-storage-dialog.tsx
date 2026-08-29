import { onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

interface ReaderNarrationStorageDialogProps {
  title: string;
  body: string;
  confirmAction: string;
  cancelAction: string;
  busy: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ReaderNarrationStorageDialog(props: ReaderNarrationStorageDialogProps) {
  let dialog: HTMLDivElement | undefined;
  let confirmButton: HTMLButtonElement | undefined;
  const previouslyFocused = document.activeElement as HTMLElement | null;

  onMount(() => {
    dialog?.focus();
    confirmButton?.focus();
  });
  onCleanup(() => previouslyFocused?.focus());

  const handleKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (!props.busy) props.onCancel();
      return;
    }
    if (event.key !== "Tab" || dialog == null) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled)")];
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
          if (event.target === event.currentTarget && !props.busy) props.onCancel();
        }}
      >
        <div
          ref={dialog}
          class="quote-image-dialog narration-storage-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="narration-storage-dialog-title"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <header>
            <div>
              <span>Listening files</span>
              <h2 id="narration-storage-dialog-title">{props.title}</h2>
              <p>{props.body}</p>
            </div>
          </header>
          <footer>
            <button
              class="secondary-tool-button"
              type="button"
              disabled={props.busy}
              onClick={props.onCancel}
            >
              {props.cancelAction}
            </button>
            <button
              ref={confirmButton}
              class="primary-tool-button mini-danger"
              type="button"
              disabled={props.busy}
              onClick={props.onConfirm}
            >
              {props.busy ? "Removing…" : props.confirmAction}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
