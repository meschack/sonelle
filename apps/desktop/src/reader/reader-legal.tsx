import { For, Show } from "solid-js";
import {
  releasePrivacyStatements,
  sonelleReleaseNotice,
  standardOfflineVoiceNotices
} from "../legal/release-disclosure";

export function ReaderLegalPanel(props: { standardOfflineVoiceAvailable: boolean }) {
  return (
    <div class="tool-card legal-privacy-panel">
      <span class="inspector-section-title">Privacy and licenses</span>
      <p>Your books are not a telemetry product. Here is what this build stores and uses.</p>
      <For each={releasePrivacyStatements}>
        {(statement) => (
          <div class="legal-privacy-statement">
            <strong>{statement.title}</strong>
            <p>{statement.body}</p>
          </div>
        )}
      </For>
      <ReleaseNotice notice={sonelleReleaseNotice} />
      <Show when={props.standardOfflineVoiceAvailable}>
        <For each={standardOfflineVoiceNotices}>
          {(notice) => <ReleaseNotice notice={notice} />}
        </For>
      </Show>
    </div>
  );
}

function ReleaseNotice(props: {
  notice: { title: string; summary: string; source: string; license: string };
}) {
  return (
    <details class="release-notice">
      <summary>{props.notice.title}</summary>
      <p>{props.notice.summary}</p>
      <a href={props.notice.source} target="_blank" rel="noreferrer">
        Pinned source
      </a>
      <pre aria-label={`${props.notice.title} license`}>{props.notice.license}</pre>
    </details>
  );
}
