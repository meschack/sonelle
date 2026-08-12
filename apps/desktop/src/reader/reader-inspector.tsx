import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { type AudioSettings, type NarrationVoice } from "@sonelle/audio";
import { primaryDefinition, type SavedDictionaryEntry, type WordInsight } from "@sonelle/learning";
import type { ReaderSearchResult } from "@sonelle/reader";
import type {
  OfflineNarrationProfileId,
  OfflineNarrationProfileView,
  OfflineVoiceView,
  PreparedAudioView
} from "./reader-offline-narration-application";
import type {
  BookCoverSelection,
  LibraryBookmarkDto,
  UpdateBookMetadataInput
} from "../library/library-contracts";
import { formatBytes } from "./reader-formatting";
import { DictionaryStatus, StateBlock } from "./reader-feedback";
import type { InspectorTab } from "./reader-experience-types";
import type { ReaderSentenceView } from "./reader-view";
import type {
  BookNarrationProgressView,
  BookNarrationReadiness
} from "./reader-book-narration-preparation";
import type { ReaderSessionLimit } from "./reader-session-control-application";
import type { BookMetadataNotice } from "./reader-book-metadata-workflow";
import {
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  HeadphonesIcon,
  SearchIcon,
  SettingsIcon,
  SpeakerIcon,
  WordIcon
} from "./reader-icons";
import { SavedPassageCard } from "./saved-passage-card";
import { ReaderLegalPanel } from "./reader-legal";

export interface ReaderInspectorModel {
  tab: InspectorTab;
  word: ReaderWordInspectorModel;
  search: ReaderSearchInspectorModel;
  bookmarks: ReaderBookmarkInspectorModel;
  settings: ReaderSettingsInspectorModel;
  onTabChange: (tab: InspectorTab) => void;
}

export function ReaderInspector(componentProps: { model: ReaderInspectorModel }) {
  const model = componentProps.model;
  const tabs: Array<{
    id: InspectorTab;
    label: string;
    shortcut: string;
    icon: () => JSX.Element;
  }> = [
    { id: "word", label: "Word", shortcut: "W", icon: WordIcon },
    { id: "search", label: "Search", shortcut: "/", icon: SearchIcon },
    { id: "bookmarks", label: "Notes", shortcut: "N", icon: BookmarkIcon },
    { id: "settings", label: "Tools", shortcut: "T", icon: SettingsIcon }
  ];

  return (
    <aside class="inspector" aria-label="Reader tools">
      <div class="inspector-tabs" role="tablist" aria-label="Reader tool tabs">
        <For each={tabs}>
          {(tab) => {
            const Icon = tab.icon;

            return (
              <button
                classList={{ active: model.tab === tab.id }}
                type="button"
                role="tab"
                aria-selected={model.tab === tab.id}
                aria-keyshortcuts={tab.shortcut}
                title={`${tab.label} (${tab.shortcut})`}
                onClick={() => model.onTabChange(tab.id)}
              >
                <Icon />
                <span>{tab.label}</span>
              </button>
            );
          }}
        </For>
      </div>

      <div class="inspector-content">
        {model.tab === "word" ? (
          <WordPanel model={model.word} />
        ) : model.tab === "search" ? (
          <SearchPanel model={model.search} />
        ) : model.tab === "bookmarks" ? (
          <BookmarkPanel model={model.bookmarks} />
        ) : (
          <SettingsPanel model={model.settings} />
        )}
      </div>
    </aside>
  );
}

export interface ReaderWordInspectorModel {
  insight: WordInsight | null;
  savedWords: SavedDictionaryEntry[];
  onSave: (insight: WordInsight) => void;
  onForget: (surface: string) => void;
  onSelectSavedWord: (word: SavedDictionaryEntry) => void;
}

function WordPanel(componentProps: { model: ReaderWordInspectorModel }) {
  const props = componentProps.model;
  return (
    <Show
      when={props.insight}
      fallback={
        <>
          <StateBlock
            title="No word selected"
            body="Definitions and saved-word actions appear here."
          />
          <SavedWordList words={props.savedWords} onSelect={props.onSelectSavedWord} />
        </>
      }
    >
      {(insight) => (
        <>
          <div class="inspector-heading">
            <strong>{insight().surface}</strong>
            <DictionaryStatus insight={insight()} />
          </div>
          <div class="dictionary-actions">
            <Show when={insight().status === "ready" && !insight().saved}>
              <button type="button" onClick={() => props.onSave(insight())}>
                Save
              </button>
            </Show>
            <Show when={insight().saved}>
              <button type="button" onClick={() => props.onForget(insight().surface)}>
                Forget
              </button>
            </Show>
          </div>
          <dl>
            <Show when={insight().entry?.phonetic}>
              <div>
                <dt>Pronunciation</dt>
                <dd>{insight().entry?.phonetic}</dd>
              </div>
            </Show>
            <Show when={primaryDefinition(insight().entry)}>
              {(definition) => (
                <div>
                  <dt>Definition</dt>
                  <dd>{definition().definition}</dd>
                </div>
              )}
            </Show>
            <Show when={primaryDefinition(insight().entry)?.example}>
              {(example) => (
                <div>
                  <dt>Example</dt>
                  <dd>{example()}</dd>
                </div>
              )}
            </Show>
            <Show when={insight().entry?.meanings[0]?.partOfSpeech}>
              {(partOfSpeech) => (
                <div>
                  <dt>Type</dt>
                  <dd>{partOfSpeech()}</dd>
                </div>
              )}
            </Show>
            <Show when={primaryDefinition(insight().entry)?.synonyms.length}>
              <div>
                <dt>Synonyms</dt>
                <dd>{primaryDefinition(insight().entry)?.synonyms.slice(0, 6).join(", ")}</dd>
              </div>
            </Show>
            <Show when={insight().entry?.sourceUrl}>
              {(sourceUrl) => (
                <div>
                  <dt>Source</dt>
                  <dd>
                    <a href={sourceUrl()} target="_blank" rel="noreferrer">
                      Dictionary
                    </a>
                  </dd>
                </div>
              )}
            </Show>
            <Show when={insight().message != null && insight().entry == null}>
              <div>
                <dt>Status</dt>
                <dd>{insight().message}</dd>
              </div>
            </Show>
          </dl>
        </>
      )}
    </Show>
  );
}

export interface ReaderSearchInspectorModel {
  query: string;
  results: ReaderSearchResult<ReaderSentenceView>[];
  onQueryChange: (query: string) => void;
  onOpenResult: (result: ReaderSearchResult<ReaderSentenceView>) => void;
  onInputReady: (input: HTMLInputElement) => void;
}

function SearchPanel(componentProps: { model: ReaderSearchInspectorModel }) {
  const props = componentProps.model;
  const hasQuery = () => props.query.trim().length > 0;

  return (
    <section class="inspector-panel" aria-label="Search this chapter">
      <input
        ref={props.onInputReady}
        aria-label="Search this chapter"
        type="search"
        value={props.query}
        placeholder="Search chapter"
        onInput={(event) => props.onQueryChange(event.currentTarget.value)}
      />
      <Show
        when={props.results.length > 0}
        fallback={
          <StateBlock
            title={hasQuery() ? "No matches" : "Search this chapter"}
            body={
              hasQuery() ? "Try a different word or phrase." : "Matching sentences appear here."
            }
          />
        }
      >
        <div class="result-list" role="list">
          <For each={props.results}>
            {(result) => (
              <button type="button" onClick={() => props.onOpenResult(result)}>
                <span>Sentence {result.sentence.index + 1}</span>
                <small>{result.excerpt}</small>
              </button>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

export interface ReaderBookmarkInspectorModel {
  bookmarks: LibraryBookmarkDto[];
  activeBookmark: LibraryBookmarkDto | null;
  activeSentence: ReaderSentenceView | null;
  notice: string | null;
  onToggleActive: () => void;
  onOpenBookmark: (bookmark: LibraryBookmarkDto) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
}

function BookmarkPanel(componentProps: { model: ReaderBookmarkInspectorModel }) {
  const props = componentProps.model;
  return (
    <section class="inspector-panel bookmark-panel" aria-label="Bookmarks">
      <Show when={props.activeSentence}>
        {(sentence) => (
          <section class="current-sentence-card" aria-label="Current sentence">
            <span class="inspector-section-title">Current sentence</span>
            <blockquote>{sentence().text}</blockquote>
            <button
              classList={{ "current-passage-action": true, saved: props.activeBookmark != null }}
              type="button"
              onClick={props.onToggleActive}
            >
              {props.activeBookmark == null ? "Save passage" : "Remove passage"}
            </button>
          </section>
        )}
      </Show>
      <div class="panel-title-row">
        <strong>Saved Passages ({props.bookmarks.length})</strong>
      </div>
      <Show when={props.notice}>{(notice) => <p class="library-notice">{notice()}</p>}</Show>
      <Show
        when={props.bookmarks.length > 0}
        fallback={
          <StateBlock title="No bookmarks in this book" body="Saved sentences appear here." />
        }
      >
        <div class="result-list" role="list">
          <For each={props.bookmarks}>
            {(bookmark) => (
              <SavedPassageCard
                bookmark={bookmark}
                onOpen={props.onOpenBookmark}
                onDelete={props.onDeleteBookmark}
              />
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

export interface ReaderSettingsInspectorModel {
  book: {
    id: string;
    title: string;
    author: string;
    coverImageSrc: string | null;
    editable: boolean;
  };
  bookMetadataNotice: BookMetadataNotice | null;
  audioSettings: AudioSettings;
  voiceInstallation: OfflineVoiceView;
  offlineLibrary: "individual-voice" | "language-pack";
  narrationVoices: readonly NarrationVoice[];
  offlineNarrationProfiles: Record<OfflineNarrationProfileId, OfflineNarrationProfileView>;
  readerContentFontSize: number;
  readerContentFontFamily: string | null;
  uiFontFamily: string | null;
  narrationHighlightColor: string;
  bookmarkHighlightColor: string;
  systemFontFamilies: readonly string[];
  audioCacheStats: PreparedAudioView | null;
  audioCacheNotice: string | null;
  bookNarrationReadiness: BookNarrationReadiness | null;
  bookNarrationProgress: BookNarrationProgressView | null;
  sessionLimit: ReaderSessionLimit;
  canPrepareBook: boolean;
  exportNotice: string | null;
  onAudioSettingsChange: (settings: Partial<AudioSettings>) => void;
  onInstallVoice: () => void;
  onInstallNarrationProfile: (profileId: OfflineNarrationProfileId) => void;
  onRefreshEngines: () => void;
  onReaderContentFontSizeChange: (fontSize: number) => void;
  onReaderContentFontFamilyChange: (fontFamily: string | null) => void;
  onUiFontFamilyChange: (fontFamily: string | null) => void;
  onNarrationHighlightColorChange: (color: string) => void;
  onBookmarkHighlightColorChange: (color: string) => void;
  onResetAudioSettings: () => void;
  onRefreshCache: () => void;
  onClearCache: () => void;
  onPrepareBook: () => void;
  onCancelBookPreparation: () => void;
  onSessionLimitChange: (limit: ReaderSessionLimit) => void;
  onExportBook: () => void;
  onChooseBookCover: () => Promise<BookCoverSelection | null>;
  onSaveBookMetadata: (input: UpdateBookMetadataInput) => void;
}

function SettingsPanel(componentProps: { model: ReaderSettingsInspectorModel }) {
  const props = componentProps.model;
  return (
    <section class="inspector-panel settings-panel" aria-label="Settings">
      <div class="narration-profile-context">
        <HeadphonesIcon />
        <span>
          <small>Book narration profile</small>
          <strong title={props.book.title}>{props.book.title}</strong>
        </span>
      </div>
      <SpeedSelect
        value={props.audioSettings.playbackRate}
        onChange={(playbackRate) => props.onAudioSettingsChange({ playbackRate })}
      />
      <div class="settings-action-row">
        <button class="secondary-tool-button" type="button" onClick={props.onResetAudioSettings}>
          Reset this book's audio settings
        </button>
      </div>
      <div class="setting-field">
        <span class="inspector-section-title">Book text size</span>
        <div class="font-size-control">
          <input
            aria-label="Book text size"
            type="range"
            min="14"
            max="24"
            step="1"
            value={props.readerContentFontSize}
            onInput={(event) =>
              props.onReaderContentFontSizeChange(Number(event.currentTarget.value))
            }
          />
          <output>{props.readerContentFontSize}px</output>
        </div>
      </div>
      <FontSelect
        label="Book font"
        ariaLabel="Book content font"
        value={props.readerContentFontFamily}
        defaultFamily="SpaceMono Nerd Font Propo"
        usage="Book content"
        families={props.systemFontFamilies}
        onChange={props.onReaderContentFontFamilyChange}
      />
      <FontSelect
        label="Interface font"
        ariaLabel="App interface font"
        value={props.uiFontFamily}
        defaultFamily="Satoshi"
        usage="App interface"
        families={props.systemFontFamilies}
        onChange={props.onUiFontFamilyChange}
      />
      <ReadingColorSettings
        narrationColor={props.narrationHighlightColor}
        bookmarkColor={props.bookmarkHighlightColor}
        onNarrationColorChange={props.onNarrationHighlightColorChange}
        onBookmarkColorChange={props.onBookmarkHighlightColorChange}
      />
      <label class="toggle-row settings-toggle">
        <span>
          <strong>Auto-advance</strong>
          <small>Turn pages automatically while narrating</small>
        </span>
        <input
          type="checkbox"
          checked={props.audioSettings.autoAdvance}
          onChange={(event) =>
            props.onAudioSettingsChange({ autoAdvance: event.currentTarget.checked })
          }
        />
      </label>
      <VoiceSelect
        voiceId={props.audioSettings.voiceId}
        voices={props.narrationVoices}
        sourceLabel={
          props.offlineLibrary === "language-pack" ? "Offline narration" : "Local narration"
        }
        onChange={(voiceId) => props.onAudioSettingsChange({ voiceId })}
      />
      <Show when={props.book.editable}>
        <BookMetadataEditorPanel
          book={props.book}
          notice={props.bookMetadataNotice}
          onChooseCover={props.onChooseBookCover}
          onSave={props.onSaveBookMetadata}
        />
      </Show>
      <Show when={props.offlineLibrary === "individual-voice"}>
        <VoiceInstallationCard
          installation={props.voiceInstallation}
          onInstall={props.onInstallVoice}
        />
      </Show>
      <Show when={props.offlineLibrary === "language-pack"}>
        <OfflineNarrationFilesPanel
          profiles={props.offlineNarrationProfiles}
          onInstall={props.onInstallNarrationProfile}
          onRefresh={props.onRefreshEngines}
        />
      </Show>
      <SessionControls limit={props.sessionLimit} onChange={props.onSessionLimitChange} />
      <BookReadinessPanel
        readiness={props.bookNarrationReadiness}
        progress={props.bookNarrationProgress}
        canPrepare={props.canPrepareBook}
        fallbackStats={props.audioCacheStats}
        notice={props.audioCacheNotice}
        onPrepare={props.onPrepareBook}
        onCancel={props.onCancelBookPreparation}
        onRefresh={props.onRefreshCache}
        onClear={props.onClearCache}
      />
      <div class="tool-card">
        <span class="inspector-section-title">Data management</span>
        <button class="primary-tool-button" type="button" onClick={props.onExportBook}>
          Export book data
        </button>
        <Show when={props.exportNotice}>
          {(notice) => <p class="library-notice">{notice()}</p>}
        </Show>
      </div>
      <ReaderLegalPanel standardOfflineVoiceAvailable={props.offlineLibrary === "language-pack"} />
    </section>
  );
}

/** Mobile listening controls only; reading appearance and book management stay in Reading tools. */
export function MobileNarrationControls(componentProps: { model: ReaderSettingsInspectorModel }) {
  const props = componentProps.model;
  return (
    <section class="mobile-narration-controls" aria-label="Narration settings">
      <div class="narration-profile-context">
        <HeadphonesIcon />
        <span>
          <small>Listening with</small>
          <strong title={props.book.title}>{props.book.title}</strong>
        </span>
      </div>
      <div class="mobile-narration-control-grid">
        <SpeedSelect
          value={props.audioSettings.playbackRate}
          onChange={(playbackRate) => props.onAudioSettingsChange({ playbackRate })}
        />
        <label class="setting-field mobile-narration-volume">
          <span class="inspector-section-title">Volume</span>
          <span class="font-size-control">
            <input
              aria-label="Narration volume"
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={props.audioSettings.volume}
              aria-valuetext={`${Math.round(props.audioSettings.volume * 100)} percent`}
              onInput={(event) =>
                props.onAudioSettingsChange({ volume: Number(event.currentTarget.value) })
              }
            />
            <output>{Math.round(props.audioSettings.volume * 100)}%</output>
          </span>
        </label>
      </div>
      <VoiceSelect
        voiceId={props.audioSettings.voiceId}
        voices={props.narrationVoices}
        sourceLabel={
          props.offlineLibrary === "language-pack" ? "Offline narration" : "Local narration"
        }
        onChange={(voiceId) => props.onAudioSettingsChange({ voiceId })}
      />
      <Show when={props.offlineLibrary === "individual-voice"}>
        <VoiceInstallationCard
          installation={props.voiceInstallation}
          onInstall={props.onInstallVoice}
        />
      </Show>
      <Show when={props.offlineLibrary === "language-pack"}>
        <OfflineNarrationFilesPanel
          profiles={props.offlineNarrationProfiles}
          onInstall={props.onInstallNarrationProfile}
          onRefresh={props.onRefreshEngines}
        />
      </Show>
      <SessionControls limit={props.sessionLimit} onChange={props.onSessionLimitChange} />
      <label class="toggle-row settings-toggle">
        <span>
          <strong>Auto-advance</strong>
          <small>Continue into the next chapter while narrating</small>
        </span>
        <input
          type="checkbox"
          checked={props.audioSettings.autoAdvance}
          onChange={(event) =>
            props.onAudioSettingsChange({ autoAdvance: event.currentTarget.checked })
          }
        />
      </label>
      <BookReadinessPanel
        readiness={props.bookNarrationReadiness}
        progress={props.bookNarrationProgress}
        canPrepare={props.canPrepareBook}
        fallbackStats={props.audioCacheStats}
        notice={props.audioCacheNotice}
        onPrepare={props.onPrepareBook}
        onCancel={props.onCancelBookPreparation}
        onRefresh={props.onRefreshCache}
        onClear={props.onClearCache}
      />
    </section>
  );
}

function BookMetadataEditorPanel(props: {
  book: ReaderSettingsInspectorModel["book"];
  notice: BookMetadataNotice | null;
  onChooseCover(): Promise<BookCoverSelection | null>;
  onSave(input: UpdateBookMetadataInput): void;
}) {
  const [title, setTitle] = createSignal(props.book.title);
  const [author, setAuthor] = createSignal(props.book.author);
  const [coverPath, setCoverPath] = createSignal<string | null>(null);
  const [coverPreview, setCoverPreview] = createSignal<string | null>(props.book.coverImageSrc);
  const [removeCover, setRemoveCover] = createSignal(false);
  let projectedBookSignature = "";

  createEffect(() => {
    const signature = [
      props.book.id,
      props.book.title,
      props.book.author,
      props.book.coverImageSrc ?? ""
    ].join("\u0000");
    if (projectedBookSignature === signature) return;
    projectedBookSignature = signature;
    setTitle(props.book.title);
    setAuthor(props.book.author);
    setCoverPath(null);
    setCoverPreview(props.book.coverImageSrc);
    setRemoveCover(false);
  });

  const chooseCover = async () => {
    const selection = await props.onChooseCover();
    if (selection == null) return;
    setCoverPath(selection.path);
    setCoverPreview(selection.previewSrc);
    setRemoveCover(false);
  };

  return (
    <form
      class="tool-card book-metadata-editor"
      aria-label="Book details"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave({
          bookId: props.book.id,
          title: title(),
          author: author(),
          coverPath: coverPath(),
          removeCover: removeCover()
        });
      }}
    >
      <span class="inspector-section-title">Book details</span>
      <div class="book-metadata-cover-row">
        <span class="book-metadata-cover" aria-hidden="true">
          <Show when={coverPreview()} fallback={<span>{title().slice(0, 1).toUpperCase()}</span>}>
            {(source) => <img src={source()} alt="" />}
          </Show>
        </span>
        <div>
          <button class="mini-tool-button" type="button" onClick={() => void chooseCover()}>
            Choose cover
          </button>
          <Show when={coverPreview() != null}>
            <button
              class="book-cover-remove"
              type="button"
              onClick={() => {
                setCoverPath(null);
                setCoverPreview(null);
                setRemoveCover(true);
              }}
            >
              Remove cover
            </button>
          </Show>
        </div>
      </div>
      <label class="book-metadata-field">
        <span>Title</span>
        <input
          aria-label="Book title"
          value={title()}
          maxlength="500"
          onInput={(event) => setTitle(event.currentTarget.value)}
        />
      </label>
      <label class="book-metadata-field">
        <span>Author</span>
        <input
          aria-label="Book author"
          value={author()}
          maxlength="500"
          onInput={(event) => setAuthor(event.currentTarget.value)}
        />
      </label>
      <button
        class="primary-tool-button"
        type="submit"
        disabled={title().trim().length === 0 || props.notice?.tone === "pending"}
      >
        {props.notice?.tone === "pending" ? "Saving details" : "Save book details"}
      </button>
      <Show when={props.notice}>
        {(notice) => (
          <p classList={{ "book-metadata-notice": true, [notice().tone]: true }}>
            {notice().message}
          </p>
        )}
      </Show>
    </form>
  );
}

const sessionControlOptions: readonly EnhancedSelectOption[] = [
  { id: "off", label: "Off", description: "Keep narrating", meta: "No limit" },
  { id: "duration:15", label: "15 minutes", description: "Stop after 15 minutes", meta: "Timer" },
  { id: "duration:30", label: "30 minutes", description: "Stop after 30 minutes", meta: "Timer" },
  { id: "duration:45", label: "45 minutes", description: "Stop after 45 minutes", meta: "Timer" },
  { id: "duration:60", label: "1 hour", description: "Stop after 60 minutes", meta: "Timer" },
  {
    id: "paragraph",
    label: "End of paragraph",
    description: "Finish the current paragraph",
    meta: "Natural stop"
  },
  {
    id: "chapter",
    label: "End of chapter",
    description: "Finish the current chapter",
    meta: "Natural stop"
  }
];

function SessionControls(props: {
  limit: ReaderSessionLimit;
  onChange(limit: ReaderSessionLimit): void;
}) {
  const value = () =>
    props.limit.kind === "duration" ? `duration:${props.limit.durationMinutes}` : props.limit.kind;
  return (
    <EnhancedSelect
      label="Sleep and session"
      ariaLabel="Narration stop setting"
      value={value()}
      options={sessionControlOptions}
      triggerMeta="Listening session"
      icon={HeadphonesIcon}
      onChange={(next) => props.onChange(parseSessionLimit(next))}
    />
  );
}

function parseSessionLimit(value: string): ReaderSessionLimit {
  if (value === "paragraph" || value === "chapter" || value === "off") {
    return { kind: value };
  }
  const durationMinutes = Number(value.split(":")[1]);
  return {
    kind: "duration",
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 30
  };
}

function BookReadinessPanel(props: {
  readiness: BookNarrationReadiness | null;
  progress: BookNarrationProgressView | null;
  canPrepare: boolean;
  fallbackStats: PreparedAudioView | null;
  notice: string | null;
  onPrepare(): void;
  onCancel(): void;
  onRefresh(): void;
  onClear(): void;
}) {
  const isPreparing = () => props.progress != null;
  const preparedSentenceCount = () =>
    props.readiness?.preparedSentenceCount ?? props.fallbackStats?.sentenceCount ?? 0;
  const totalSentenceCount = () => props.readiness?.totalSentenceCount;
  const storedSize = () => props.readiness?.sizeBytes ?? props.fallbackStats?.sizeBytes ?? 0;
  const progressValue = () =>
    (totalSentenceCount() ?? 0) > 0
      ? Math.min(100, Math.round((preparedSentenceCount() / (totalSentenceCount() ?? 1)) * 100))
      : 0;
  const isReady = () =>
    (totalSentenceCount() ?? 0) > 0 && preparedSentenceCount() >= (totalSentenceCount() ?? 0);
  const status = () => {
    if (isPreparing()) return { label: "Preparing", className: "preparing" };
    if (!props.canPrepare) return { label: "Unavailable", className: "unavailable" };
    if (props.readiness == null) return { label: "Checking", className: "checking" };
    if (isReady()) return { label: "Ready", className: "ready" };
    if (preparedSentenceCount() > 0) return { label: "Partly ready", className: "partial" };
    return { label: "Not prepared", className: "unavailable" };
  };
  const prepareLabel = () => {
    if (!props.canPrepare) return "Preparation unavailable";
    return isReady() ? "Entire book ready" : "Prepare entire book";
  };

  return (
    <div class="tool-card book-readiness-card">
      <div class="book-readiness-heading">
        <span class="inspector-section-title">Offline readiness</span>
        <span class={`book-readiness-state ${status().className}`}>{status().label}</span>
      </div>
      <div class="book-readiness-summary">
        <span class="book-readiness-metric">
          <strong>
            <Show
              when={totalSentenceCount() != null}
              fallback={preparedSentenceCount().toLocaleString()}
            >
              {preparedSentenceCount().toLocaleString()} /{" "}
              {(totalSentenceCount() ?? 0).toLocaleString()}
            </Show>
          </strong>
          <small>{totalSentenceCount() == null ? "sentences prepared" : "sentences ready"}</small>
        </span>
        <span class="book-readiness-metric">
          <strong>{formatBytes(storedSize())}</strong>
          <small>stored audio</small>
        </span>
      </div>
      <Show
        when={(totalSentenceCount() ?? 0) > 0}
        fallback={
          <Show when={props.canPrepare}>
            <div class="book-readiness-progress checking" aria-live="polite">
              <progress aria-label="Checking book narration readiness" />
              <small>Checking chapter readiness...</small>
            </div>
          </Show>
        }
      >
        <div class="book-readiness-progress">
          <span>
            <small>Book progress</small>
            <strong>{progressValue()}%</strong>
          </span>
          <progress aria-label="Book narration readiness" max="100" value={progressValue()} />
        </div>
      </Show>
      <Show when={(props.readiness?.estimatedSizeBytes ?? 0) > storedSize()}>
        <small class="book-readiness-estimate">
          Estimated full book: {formatBytes(props.readiness?.estimatedSizeBytes ?? 0)}
        </small>
      </Show>
      <Show
        when={isPreparing()}
        fallback={
          <button
            class="primary-tool-button"
            type="button"
            disabled={!props.canPrepare || isReady()}
            onClick={props.onPrepare}
          >
            {prepareLabel()}
          </button>
        }
      >
        <button class="secondary-tool-button" type="button" onClick={props.onCancel}>
          Cancel preparation
        </button>
      </Show>
      <div class="book-readiness-actions" aria-label="Prepared audio maintenance">
        <button class="secondary-tool-button" type="button" onClick={props.onRefresh}>
          Refresh
        </button>
        <button class="secondary-tool-button mini-danger" type="button" onClick={props.onClear}>
          Clear audio
        </button>
      </div>
      <Show when={props.notice}>{(notice) => <p class="library-notice">{notice()}</p>}</Show>
    </div>
  );
}

function ReadingColorSettings(props: {
  narrationColor: string;
  bookmarkColor: string;
  onNarrationColorChange: (color: string) => void;
  onBookmarkColorChange: (color: string) => void;
}) {
  return (
    <div class="setting-field reader-color-settings">
      <span class="inspector-section-title">Reading colors</span>
      <div class="reader-color-controls">
        <ReaderColorControl
          label="Narration highlight"
          value={props.narrationColor}
          onChange={props.onNarrationColorChange}
        />
        <ReaderColorControl
          label="Bookmark highlight"
          value={props.bookmarkColor}
          onChange={props.onBookmarkColorChange}
        />
      </div>
    </div>
  );
}

function ReaderColorControl(props: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label class="reader-color-control">
      <span class="reader-color-copy">
        <strong>{props.label}</strong>
        <small>{props.value.toUpperCase()}</small>
      </span>
      <input
        class="reader-color-input"
        type="color"
        aria-label={`${props.label} color`}
        value={props.value}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function OfflineNarrationFilesPanel(props: {
  profiles: Record<OfflineNarrationProfileId, OfflineNarrationProfileView>;
  onInstall: (profileId: OfflineNarrationProfileId) => void;
  onRefresh: () => void;
}) {
  return (
    <div class="tool-card offline-narration-files-card">
      <div class="voice-installation-heading">
        <span class="inspector-section-title">Offline narration files</span>
        <button class="mini-tool-button" type="button" onClick={props.onRefresh}>
          Refresh
        </button>
      </div>
      <div class="offline-narration-file-list">
        <For each={Object.values(props.profiles)}>
          {(profile) => (
            <OfflineNarrationFileCard
              installation={profile}
              label={profile.label}
              description={profile.description}
              onInstall={() => props.onInstall(profile.id)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function OfflineNarrationFileCard(props: {
  installation: OfflineNarrationProfileView;
  label: string;
  description: string;
  onInstall: () => void;
}) {
  const isPreparing = () => props.installation.status === "preparing";
  const isReady = () => props.installation.status === "ready";
  const readinessLabel = () => {
    if (isReady()) return "Ready";
    if (isPreparing()) return "Preparing";
    return "Not ready";
  };
  const actionLabel = () =>
    props.installation.status === "failed" ? "Retry download" : "Download files";
  const sizeLabel = () =>
    props.installation.downloadSizeBytes > 0
      ? ` · ${formatBytes(props.installation.downloadSizeBytes)}`
      : "";

  return (
    <section classList={{ "offline-narration-file-card": true, ready: isReady() }}>
      <div class="offline-narration-file-heading">
        <span>
          <strong>{props.label}</strong>
          <small>{props.description}</small>
        </span>
        <span class="voice-readiness">{readinessLabel()}</span>
      </div>
      <p>{props.installation.message}</p>
      <Show when={isPreparing()}>
        <progress
          aria-label={`Preparing ${props.label.toLowerCase()} files`}
          max="100"
          value={props.installation.progress ?? 0}
        />
        <Show when={props.installation.downloadSizeBytes > 0}>
          <div class="voice-installation-progress-meta">
            <strong>{props.installation.progress ?? 0}%</strong>
            <span>
              {formatBytes(props.installation.downloadedBytes)} /{" "}
              {formatBytes(props.installation.downloadSizeBytes)}
            </span>
          </div>
        </Show>
      </Show>
      <Show when={!isPreparing() && !isReady()}>
        <button class="primary-tool-button" type="button" onClick={props.onInstall}>
          {actionLabel()}
          {sizeLabel()}
        </button>
      </Show>
    </section>
  );
}

function VoiceInstallationCard(props: { installation: OfflineVoiceView; onInstall: () => void }) {
  const isPreparing = () => props.installation.status === "preparing";
  const isReady = () => props.installation.status === "ready";
  const actionLabel = () =>
    props.installation.status === "failed" ? "Retry voice" : "Download voice";
  const sizeLabel = () =>
    props.installation.downloadSizeBytes > 0
      ? ` · ${formatBytes(props.installation.downloadSizeBytes)}`
      : "";

  return (
    <div classList={{ "tool-card": true, "voice-installation-card": true, ready: isReady() }}>
      <div class="voice-installation-heading">
        <span class="inspector-section-title">Offline voice</span>
        <span class="voice-readiness">{isReady() ? "Ready" : "Not ready"}</span>
      </div>
      <p>{props.installation.message}</p>
      <Show when={isPreparing()}>
        <progress
          aria-label="Preparing offline voice"
          max="100"
          value={props.installation.progress ?? 0}
        />
        <Show when={props.installation.downloadSizeBytes > 0}>
          <div class="voice-installation-progress-meta">
            <strong>{props.installation.progress ?? 0}%</strong>
            <span>
              {formatBytes(props.installation.downloadedBytes)} /{" "}
              {formatBytes(props.installation.downloadSizeBytes)}
            </span>
          </div>
        </Show>
      </Show>
      <Show when={!isPreparing() && !isReady()}>
        <button class="primary-tool-button" type="button" onClick={props.onInstall}>
          {actionLabel()}
          {sizeLabel()}
        </button>
      </Show>
    </div>
  );
}

interface EnhancedSelectOption {
  id: string;
  label: string;
  description: string;
  meta: string;
  fontFamily?: string;
}

interface EnhancedSelectProps {
  label: string;
  ariaLabel: string;
  value: string;
  options: readonly EnhancedSelectOption[];
  triggerMeta: string;
  icon: () => JSX.Element;
  onChange: (value: string) => void;
}

const narrationSpeedOptions: readonly EnhancedSelectOption[] = [
  {
    id: "0.75",
    label: "0.75x",
    description: "Slow and spacious",
    meta: "Gentle pace"
  },
  {
    id: "0.9",
    label: "0.90x",
    description: "Relaxed and clear",
    meta: "Recommended"
  },
  {
    id: "1",
    label: "1.0x",
    description: "Natural reading pace",
    meta: "Balanced"
  },
  {
    id: "1.25",
    label: "1.25x",
    description: "Brisk but comfortable",
    meta: "Faster pace"
  },
  {
    id: "1.5",
    label: "1.5x",
    description: "Fast review pace",
    meta: "Quick listen"
  }
];

function VoiceSelect(props: {
  voiceId: string;
  voices: readonly NarrationVoice[];
  sourceLabel: string;
  onChange: (voiceId: string) => void;
}) {
  const options = () =>
    props.voices.length > 0
      ? props.voices.map((voice) => ({
          id: voice.id,
          label: voice.label,
          description: voice.description,
          meta: voice.locale
        }))
      : [
          {
            id: props.voiceId,
            label: "No voice ready",
            description: "Download narration files below",
            meta: "Offline"
          }
        ];

  return (
    <EnhancedSelect
      label="Voice selection"
      ariaLabel="Narration voice"
      value={props.voiceId}
      options={options()}
      triggerMeta={props.sourceLabel}
      icon={HeadphonesIcon}
      onChange={props.onChange}
    />
  );
}

function SpeedSelect(props: { value: number; onChange: (value: number) => void }) {
  return (
    <EnhancedSelect
      label="Narration speed"
      ariaLabel="Narration speed"
      value={props.value.toString()}
      options={narrationSpeedOptions}
      triggerMeta="Playback speed"
      icon={SpeakerIcon}
      onChange={(value) => props.onChange(Number(value))}
    />
  );
}

function FontSelect(props: {
  label: string;
  ariaLabel: string;
  value: string | null;
  defaultFamily: string;
  usage: string;
  families: readonly string[];
  onChange: (fontFamily: string | null) => void;
}) {
  const options = () => [
    {
      id: "",
      label: "Sonelle default",
      description: props.defaultFamily,
      meta: props.usage,
      fontFamily: props.defaultFamily
    },
    ...props.families.map((family) => ({
      id: family,
      label: family,
      description: "Installed on this computer",
      meta: props.usage,
      fontFamily: family
    }))
  ];

  return (
    <EnhancedSelect
      label={props.label}
      ariaLabel={props.ariaLabel}
      value={props.value ?? ""}
      options={options()}
      triggerMeta={props.usage}
      icon={WordIcon}
      onChange={(value) => props.onChange(value.length > 0 ? value : null)}
    />
  );
}

function EnhancedSelect(props: EnhancedSelectProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);
  let root: HTMLDivElement | undefined;
  let typeaheadReset: ReturnType<typeof setTimeout> | undefined;
  let typeahead = "";
  const Icon = props.icon;

  const selectId = props.label.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
  const optionsId = `${selectId}-options`;
  const selectedOption = () =>
    props.options.find((option) => option.id === props.value) ?? props.options[0];
  const selectedIndex = () =>
    Math.max(
      0,
      props.options.findIndex((option) => option.id === selectedOption().id)
    );
  const highlightedOption = () => props.options[highlightedIndex()] ?? selectedOption();

  const openMenu = () => {
    setHighlightedIndex(selectedIndex());
    setIsOpen(true);
  };

  const closeMenu = () => setIsOpen(false);

  const moveHighlight = (direction: -1 | 1) => {
    setHighlightedIndex((current) => {
      const next = current + direction;
      if (next < 0) return props.options.length - 1;
      if (next >= props.options.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      closeMenu();
      return;
    }

    if (event.key === "Escape") {
      if (!isOpen()) return;
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen()) {
        openMenu();
        return;
      }
      moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!isOpen()) return;
      event.preventDefault();
      setHighlightedIndex(event.key === "Home" ? 0 : props.options.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen()) {
        openMenu();
        return;
      }
      props.onChange(highlightedOption().id);
      closeMenu();
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      typeahead += event.key.toLocaleLowerCase();
      clearTimeout(typeaheadReset);
      typeaheadReset = setTimeout(() => {
        typeahead = "";
      }, 700);
      const match = props.options.findIndex((option) =>
        option.label.toLocaleLowerCase().startsWith(typeahead)
      );
      if (match >= 0) {
        event.preventDefault();
        if (!isOpen()) setIsOpen(true);
        setHighlightedIndex(match);
      }
    }
  };

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (root != null && !root.contains(event.target as Node)) closeMenu();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    onCleanup(() => {
      clearTimeout(typeaheadReset);
      document.removeEventListener("pointerdown", handlePointerDown);
    });
  });

  return (
    <div class="enhanced-select" ref={(element) => (root = element)}>
      <span class="inspector-section-title">{props.label}</span>
      <button
        class="enhanced-select-trigger"
        type="button"
        aria-controls={optionsId}
        aria-expanded={isOpen()}
        aria-haspopup="listbox"
        aria-label={props.ariaLabel}
        aria-activedescendant={isOpen() ? `${optionsId}-option-${highlightedIndex()}` : undefined}
        onClick={() => (isOpen() ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span class="enhanced-select-icon" aria-hidden="true">
          <Icon />
        </span>
        <span class="enhanced-select-copy" style={{ "font-family": selectedOption().fontFamily }}>
          <strong>{selectedOption().label}</strong>
          <small>{selectedOption().description}</small>
          <span class="enhanced-select-meta">
            <span class="enhanced-select-badge">{selectedOption().meta}</span>
            <span>{props.triggerMeta}</span>
          </span>
        </span>
        <span class="enhanced-select-chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>
      <Show when={isOpen()}>
        <div
          id={optionsId}
          class="enhanced-select-options"
          role="listbox"
          aria-label={`Available ${props.label.toLowerCase()} options`}
        >
          <For each={props.options}>
            {(option, index) => (
              <button
                id={`${optionsId}-option-${index()}`}
                classList={{
                  "enhanced-select-option": true,
                  active: props.value === option.id,
                  highlighted: highlightedIndex() === index()
                }}
                type="button"
                role="option"
                aria-selected={props.value === option.id}
                onMouseEnter={() => setHighlightedIndex(index())}
                onClick={() => {
                  props.onChange(option.id);
                  closeMenu();
                }}
              >
                <span class="enhanced-select-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span
                  class="enhanced-select-option-copy"
                  style={{ "font-family": option.fontFamily }}
                >
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                  <span class="enhanced-select-meta">
                    <span class="enhanced-select-badge">{option.meta}</span>
                  </span>
                </span>
                <Show when={props.value === option.id}>
                  <span class="enhanced-select-check" aria-label="Selected">
                    <CheckIcon />
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

interface SavedWordListProps {
  words: SavedDictionaryEntry[];
  onSelect: (word: SavedDictionaryEntry) => void;
}

function SavedWordList(props: SavedWordListProps) {
  return (
    <Show
      when={props.words.length > 0}
      fallback={<StateBlock title="No saved words" body="Saved definitions appear here." />}
    >
      <section class="saved-word-list" aria-label="Saved words">
        <span class="inspector-section-title">Saved words</span>
        <For each={props.words}>
          {(word) => (
            <button class="saved-word-row" type="button" onClick={() => props.onSelect(word)}>
              <span>{word.surface}</span>
              <small>{primaryDefinition(word)?.definition ?? "Saved definition"}</small>
            </button>
          )}
        </For>
      </section>
    </Show>
  );
}
