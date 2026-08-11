import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
  type ParentProps
} from "solid-js";
import { Portal } from "solid-js/web";
import { primaryDefinition, type WordInsight } from "@sonelle/learning";
import { tokenizeReaderText, type ReaderTextToken } from "@sonelle/text";
import { DictionaryStatus } from "./reader-feedback";
import type { SelectedWord } from "./reader-experience-types";
import type { ReaderParagraphView, ReaderSentenceView } from "./reader-view";
import type { ReaderLinkDto, ReaderReferenceDto } from "../library/library-models";

type SentenceDisplayItem =
  | { kind: "token"; token: ReaderTextToken }
  | { kind: "reference"; reference: ReaderReferenceDto }
  | { kind: "link"; link: ReaderLinkDto; text: string };

type SentenceAnnotation =
  | { kind: "reference"; offset: number; reference: ReaderReferenceDto }
  | { kind: "link"; offset: number; link: ReaderLinkDto };

const displayItemCache = new WeakMap<ReaderSentenceView, SentenceDisplayItem[]>();

function displayItemsForSentence(sentence: ReaderSentenceView): SentenceDisplayItem[] {
  const existing = displayItemCache.get(sentence);
  if (existing != null) return existing;

  const annotations: SentenceAnnotation[] = [
    ...(sentence.references ?? []).map((reference): SentenceAnnotation => ({
      kind: "reference",
      offset: reference.offset,
      reference
    })),
    ...(sentence.links ?? []).map((link): SentenceAnnotation => ({
      kind: "link",
      offset: link.offset,
      link
    }))
  ].sort(
    (left, right) => left.offset - right.offset || annotationOrder(left) - annotationOrder(right)
  );
  const items: SentenceDisplayItem[] = [];
  let textOffset = 0;
  let tokenOffset = 0;
  const appendText = (text: string) => {
    const tokens = tokenizeReaderText(text).map((token) => ({
      ...token,
      index: token.index + tokenOffset
    }));
    items.push(...tokens.map((token): SentenceDisplayItem => ({ kind: "token", token })));
    tokenOffset += tokens.length;
  };

  for (const annotation of annotations) {
    const offset = Math.max(textOffset, Math.min(sentence.text.length, annotation.offset));
    appendText(sentence.text.slice(textOffset, offset));
    if (annotation.kind === "reference") {
      items.push({ kind: "reference", reference: annotation.reference });
      textOffset = offset;
      continue;
    }

    const end = Math.min(sentence.text.length, offset + annotation.link.length);
    const linkText = sentence.text.slice(offset, end);
    if (linkText.length > 0) {
      items.push({ kind: "link", link: annotation.link, text: linkText });
      tokenOffset += tokenizeReaderText(linkText).length;
      textOffset = end;
    }
  }
  appendText(sentence.text.slice(textOffset));
  displayItemCache.set(sentence, items);
  return items;
}

function annotationOrder(annotation: SentenceAnnotation): number {
  return annotation.kind === "reference" ? 0 : 1;
}

export interface ReaderContentInteractions {
  isActiveSentence: (sentenceId: string) => boolean;
  isBookmarkedSentence: (sentenceId: string) => boolean;
  isSearchHit: (sentenceId: string) => boolean;
  inspectWordsOnTap: () => boolean;
  showWordPopover: () => boolean;
  selectedWord: () => SelectedWord | null;
  activeWordInsight: () => WordInsight | null;
  registerSentence: (sentenceId: string, element: HTMLElement) => void;
  unregisterSentence: (sentenceId: string) => void;
  selectSentence: (sentenceIndex: number) => void;
  selectWord: (
    sentence: ReaderSentenceView,
    token: Extract<ReaderTextToken, { kind: "word" }>
  ) => void;
  clearWord: () => void;
  saveWord: (insight: WordInsight) => void;
  openLink: (link: ReaderLinkDto) => void;
}

const ReaderContentContext = createContext<ReaderContentInteractions>();

export function ReaderContentProvider(
  props: ParentProps<{ interactions: ReaderContentInteractions }>
) {
  return (
    <ReaderContentContext.Provider value={props.interactions}>
      {props.children}
    </ReaderContentContext.Provider>
  );
}

function useReaderContentInteractions(): ReaderContentInteractions {
  const interactions = useContext(ReaderContentContext);
  if (interactions == null) {
    throw new Error("Reader content must be rendered inside ReaderContentProvider.");
  }

  return interactions;
}

interface ReaderParagraphProps {
  paragraph: ReaderParagraphView;
  visibleStartIndex: number;
  visibleEndIndex: number;
}

export function ReaderParagraph(props: ReaderParagraphProps) {
  const interactions = useReaderContentInteractions();
  const visibleSentences = createMemo(() =>
    props.paragraph.sentences.filter(
      (sentence) =>
        sentence.index >= props.visibleStartIndex && sentence.index < props.visibleEndIndex
    )
  );
  const isSelectedWord = (sentenceId: string, token: ReaderTextToken) =>
    token.kind === "word" &&
    interactions.selectedWord()?.sentenceId === sentenceId &&
    interactions.selectedWord()?.tokenIndex === token.index;

  return (
    <p
      classList={{
        "reader-paragraph": true,
        "structured-entry": props.paragraph.presentation.kind !== "body",
        emphasized: props.paragraph.presentation.emphasized,
        [`indent-${Math.min(4, Math.max(0, props.paragraph.presentation.indentLevel))}`]: true
      }}
      data-structure={props.paragraph.presentation.kind}
    >
      <Show
        when={
          props.paragraph.presentation.kind === "ordered" ||
          props.paragraph.presentation.kind === "unordered"
        }
      >
        <span class="reader-list-marker" aria-hidden="true">
          {props.paragraph.presentation.kind === "ordered"
            ? `${props.paragraph.presentation.marker ?? ""}.`
            : ""}
        </span>
      </Show>
      <For each={visibleSentences()}>
        {(sentence) => {
          onCleanup(() => interactions.unregisterSentence(sentence.id));

          return (
            <span
              ref={(element) => interactions.registerSentence(sentence.id, element)}
              classList={{
                sentence: true,
                active: interactions.isActiveSentence(sentence.id),
                bookmarked: interactions.isBookmarkedSentence(sentence.id),
                "search-hit": interactions.isSearchHit(sentence.id)
              }}
              onClick={() => interactions.selectSentence(sentence.index)}
            >
              <span class="sentence-line">
                <For each={displayItemsForSentence(sentence)}>
                  {(item) =>
                    item.kind === "reference" ? (
                      <ReferenceButton reference={item.reference} />
                    ) : item.kind === "link" ? (
                      <ReaderLink
                        link={item.link}
                        text={item.text}
                        onOpen={interactions.openLink}
                      />
                    ) : (
                      <SentenceToken
                        token={item.token}
                        sentence={sentence}
                        selected={isSelectedWord(sentence.id, item.token)}
                        insight={
                          isSelectedWord(sentence.id, item.token)
                            ? interactions.activeWordInsight()
                            : null
                        }
                        inspectOnTap={interactions.inspectWordsOnTap()}
                        showPopover={interactions.showWordPopover()}
                        onSelect={interactions.selectWord}
                        onClear={interactions.clearWord}
                        onSave={interactions.saveWord}
                      />
                    )
                  }
                </For>
              </span>
            </span>
          );
        }}
      </For>
    </p>
  );
}

function ReaderLink(props: {
  link: ReaderLinkDto;
  text: string;
  onOpen: (link: ReaderLinkDto) => void;
}) {
  return (
    <a
      class="reader-link"
      href={props.link.href ?? "#"}
      target={props.link.href == null ? undefined : "_blank"}
      rel={props.link.href == null ? undefined : "noopener noreferrer"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onOpen(props.link);
      }}
    >
      {props.text}
    </a>
  );
}

function ReferenceButton(props: { reference: ReaderReferenceDto }) {
  const [open, setOpen] = createSignal(false);
  let anchorElement: HTMLButtonElement | undefined;
  const label = referenceKindLabel(props.reference.kind);

  return (
    <>
      <button
        ref={(element) => {
          anchorElement = element;
        }}
        class="reader-reference-button"
        type="button"
        aria-label={`Open ${label.toLowerCase()} ${props.reference.marker}`}
        aria-expanded={open()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <sup>{props.reference.marker}</sup>
      </button>
      <Show when={open()}>
        <Portal>
          <ReferencePopover
            anchorElement={anchorElement}
            reference={props.reference}
            onClose={() => setOpen(false)}
          />
        </Portal>
      </Show>
    </>
  );
}

function ReferencePopover(props: {
  anchorElement: HTMLButtonElement | undefined;
  reference: ReaderReferenceDto;
  onClose(): void;
}) {
  let popoverElement: HTMLSpanElement | undefined;
  const updatePosition = () => positionPopover(props.anchorElement, popoverElement);

  onMount(() => {
    const schedulePositionUpdate = () => queueMicrotask(updatePosition);
    const closeFromOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        popoverElement?.contains(target) ||
        props.anchorElement?.contains(target)
      ) {
        return;
      }
      props.onClose();
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };

    document.addEventListener("pointerdown", closeFromOutsidePointer, true);
    document.addEventListener("keydown", closeFromEscape);
    document.addEventListener("scroll", schedulePositionUpdate, true);
    window.addEventListener("resize", schedulePositionUpdate);
    schedulePositionUpdate();
    onCleanup(() => {
      document.removeEventListener("pointerdown", closeFromOutsidePointer, true);
      document.removeEventListener("keydown", closeFromEscape);
      document.removeEventListener("scroll", schedulePositionUpdate, true);
      window.removeEventListener("resize", schedulePositionUpdate);
    });
  });

  return (
    <span
      ref={(element) => {
        popoverElement = element;
      }}
      class="reference-popover"
      role="dialog"
      aria-label={referenceKindLabel(props.reference.kind)}
      onClick={(event) => event.stopPropagation()}
    >
      <span class="reference-popover-heading">
        <strong>{referenceKindLabel(props.reference.kind)}</strong>
        <small>{props.reference.marker}</small>
      </span>
      <span>{props.reference.content}</span>
      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </span>
  );
}

function referenceKindLabel(kind: ReaderReferenceDto["kind"]): string {
  switch (kind) {
    case "footnote":
      return "Footnote";
    case "endnote":
      return "Endnote";
    case "citation":
      return "Citation";
    case "note":
      return "Note";
  }
}

interface SentenceTokenProps {
  token: ReaderTextToken;
  sentence: ReaderSentenceView;
  selected: boolean;
  insight: WordInsight | null;
  inspectOnTap: boolean;
  showPopover: boolean;
  onSelect: (
    sentence: ReaderSentenceView,
    token: Extract<ReaderTextToken, { kind: "word" }>
  ) => void;
  onClear: () => void;
  onSave: (insight: WordInsight) => void;
}

function SentenceToken(props: SentenceTokenProps) {
  if (props.token.kind === "text") return <>{props.token.text}</>;

  const token = props.token;
  let tokenElement: HTMLSpanElement | undefined;
  const inspectWord = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    props.onSelect(props.sentence, token);
  };

  return (
    <span
      ref={(element) => {
        tokenElement = element;
      }}
      classList={{
        "word-token": true,
        selected: props.selected
      }}
      role="button"
      tabIndex={0}
      aria-label={`${props.inspectOnTap ? "Tap" : "Right click"} to inspect ${token.text}`}
      onClick={(event) => {
        if (!props.inspectOnTap) return;
        tokenElement?.focus();
        inspectWord(event);
      }}
      onContextMenu={inspectWord}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inspectWord(event);
      }}
    >
      {token.text}
      <Show when={props.showPopover && props.selected ? props.insight : null}>
        {(insight) => (
          <Portal>
            <WordPopover
              anchorElement={tokenElement}
              insight={insight()}
              onClear={props.onClear}
              onSave={props.onSave}
            />
          </Portal>
        )}
      </Show>
    </span>
  );
}

interface WordPopoverProps {
  anchorElement: HTMLSpanElement | undefined;
  insight: WordInsight;
  onClear: () => void;
  onSave: (insight: WordInsight) => void;
}

function WordPopover(props: WordPopoverProps) {
  let popoverElement: HTMLSpanElement | undefined;

  const updatePosition = () => {
    const anchor = props.anchorElement;
    const popover = popoverElement;
    if (anchor == null || popover == null) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const edgePadding = 16;
    const gap = 12;
    const maxLeft = Math.max(edgePadding, window.innerWidth - popoverRect.width - edgePadding);
    const centeredLeft = anchorRect.left + (anchorRect.width - popoverRect.width) / 2;
    const left = Math.min(maxLeft, Math.max(edgePadding, centeredLeft));
    const belowTop = anchorRect.bottom + gap;
    const aboveTop = anchorRect.top - popoverRect.height - gap;
    const top =
      belowTop + popoverRect.height <= window.innerHeight - edgePadding || aboveTop < edgePadding
        ? Math.min(belowTop, window.innerHeight - popoverRect.height - edgePadding)
        : aboveTop;

    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(edgePadding, top)}px`;
  };

  onMount(() => {
    const schedulePositionUpdate = () => queueMicrotask(updatePosition);
    const closeFromOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        popoverElement?.contains(target) ||
        props.anchorElement?.contains(target)
      ) {
        return;
      }

      props.onClear();
    };

    document.addEventListener("pointerdown", closeFromOutsidePointer, true);
    document.addEventListener("scroll", schedulePositionUpdate, true);
    window.addEventListener("resize", schedulePositionUpdate);
    schedulePositionUpdate();
    onCleanup(() => {
      document.removeEventListener("pointerdown", closeFromOutsidePointer, true);
      document.removeEventListener("scroll", schedulePositionUpdate, true);
      window.removeEventListener("resize", schedulePositionUpdate);
    });
  });

  createEffect(() => {
    props.insight.status;
    queueMicrotask(updatePosition);
  });

  const runAction = (event: MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
  };
  const definition = () => primaryDefinition(props.insight.entry);

  return (
    <span
      ref={(element) => {
        popoverElement = element;
      }}
      class="word-popover"
      role="dialog"
      aria-label={`Insight for ${props.insight.surface}`}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <strong>{props.insight.surface}</strong>
      <DictionaryStatus insight={props.insight} compact />
      <Show when={definition()}>{(item) => <span>{item().definition}</span>}</Show>
      <Show when={definition()?.example}>
        {(example) => <span class="popover-example">{example()}</span>}
      </Show>
      <span class="popover-actions">
        <Show when={props.insight.status === "ready" && !props.insight.saved}>
          <button
            class="save-word-button"
            type="button"
            onClick={(event) => runAction(event, () => props.onSave(props.insight))}
          >
            Save
          </button>
        </Show>
        <button
          type="button"
          aria-label="Close word insight"
          onClick={(event) => {
            event.stopPropagation();
            props.onClear();
          }}
        >
          Close
        </button>
      </span>
    </span>
  );
}

function positionPopover(anchor: HTMLElement | undefined, popover: HTMLElement | undefined): void {
  if (anchor == null || popover == null) return;

  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const edgePadding = 16;
  const gap = 12;
  const maxLeft = Math.max(edgePadding, window.innerWidth - popoverRect.width - edgePadding);
  const centeredLeft = anchorRect.left + (anchorRect.width - popoverRect.width) / 2;
  const left = Math.min(maxLeft, Math.max(edgePadding, centeredLeft));
  const belowTop = anchorRect.bottom + gap;
  const aboveTop = anchorRect.top - popoverRect.height - gap;
  const top =
    belowTop + popoverRect.height <= window.innerHeight - edgePadding || aboveTop < edgePadding
      ? Math.min(belowTop, window.innerHeight - popoverRect.height - edgePadding)
      : aboveTop;

  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(edgePadding, top)}px`;
}
