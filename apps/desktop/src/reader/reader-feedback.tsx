import { Show } from "solid-js";
import type { WordInsight } from "@sonelle/learning";
import { CheckIcon, CloseIcon, HeadphonesIcon } from "./reader-icons";

interface ReaderToastProps {
  message: string;
  title?: string;
  tone?: "error" | "warning" | "pending" | "success";
  onDismiss?: () => void;
}

export function ReaderToast(props: ReaderToastProps) {
  const tone = () => props.tone ?? "error";
  const title = () => {
    if (props.title != null) return props.title;
    if (tone() === "success") return "Ready";
    if (tone() === "pending") return "Preparing narration";
    if (tone() === "warning") return "Narration warning";
    return "Narration needs attention";
  };

  return (
    <section class="reader-toast-region" aria-label="Notifications">
      <div
        classList={{ "reader-toast": true, [tone()]: true }}
        role={tone() === "error" ? "alert" : "status"}
        aria-live={tone() === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        <span class="reader-toast-icon" aria-hidden="true">
          <Show
            when={tone() === "pending"}
            fallback={
              <Show when={tone() === "success"} fallback={<HeadphonesIcon />}>
                <CheckIcon />
              </Show>
            }
          >
            <span class="reader-toast-spinner" />
          </Show>
        </span>
        <div class="reader-toast-copy">
          <strong>{title()}</strong>
          <p>{props.message}</p>
        </div>
        <Show when={props.onDismiss != null}>
          <button
            class="reader-toast-close"
            type="button"
            aria-label="Close notification"
            onClick={() => props.onDismiss?.()}
          >
            <CloseIcon />
          </button>
        </Show>
      </div>
    </section>
  );
}

interface StateBlockProps {
  title: string;
  body: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}

export function StateBlock(props: StateBlockProps) {
  return (
    <div class="state-block">
      <strong>{props.title}</strong>
      <p>{props.body}</p>
      <Show when={props.actionLabel != null && props.onAction != null}>
        <button type="button" disabled={props.actionDisabled} onClick={() => props.onAction?.()}>
          {props.actionLabel}
        </button>
      </Show>
    </div>
  );
}

interface StateNoticeProps {
  message: string;
  onRetry: () => void;
  compact?: boolean;
}

export function StateNotice(props: StateNoticeProps) {
  const retryable = () => isRecoverableNotice(props.message);

  return (
    <div
      classList={{
        "state-notice": true,
        compact: props.compact === true,
        attention: retryable()
      }}
    >
      <p>{props.message}</p>
      <Show when={retryable()}>
        <button type="button" onClick={props.onRetry}>
          Retry
        </button>
      </Show>
    </div>
  );
}

function isRecoverableNotice(message: string): boolean {
  return message.startsWith("We couldn't") || message.includes("Please try again");
}

interface DictionaryStatusProps {
  insight: WordInsight;
  compact?: boolean;
}

export function DictionaryStatus(props: DictionaryStatusProps) {
  const label = () => {
    if (props.insight.saved) return "Saved";

    switch (props.insight.status) {
      case "loading":
        return "Looking up";
      case "ready":
        return "Definition found";
      case "not-found":
        return "Not found";
      case "error":
        return "Needs attention";
      default:
        return "Ready";
    }
  };

  return (
    <span
      classList={{
        "dictionary-state": true,
        compact: props.compact === true,
        attention: props.insight.status === "error" || props.insight.status === "not-found",
        saved: props.insight.saved
      }}
    >
      {label()}
    </span>
  );
}
