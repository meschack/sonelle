import { createDomainEvent, type DomainEvent, type DomainEventDispatcher } from "@sonelle/domain";

export type ReaderSessionLimit =
  | { kind: "off" }
  | { kind: "duration"; durationMinutes: number }
  | { kind: "paragraph" }
  | { kind: "chapter" };

interface ReaderSessionControlDependencies {
  eventDispatcher: DomainEventDispatcher;
  stopPlayback(): Promise<void>;
  schedule?(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
}

interface ReaderSessionControlOptions {
  currentBookId(): string;
  currentChapterId(): string;
  paragraphEndSentenceIds(): ReadonlySet<string>;
  projectLimit(limit: ReaderSessionLimit): void;
  projectNotice(message: string): void;
}

export interface ReaderSessionControlApplication {
  start(): () => void;
  set(limit: ReaderSessionLimit): void;
  allowsChapterTransition(): boolean;
}

export function createReaderSessionControlApplication(
  dependencies: ReaderSessionControlDependencies,
  options: ReaderSessionControlOptions
): ReaderSessionControlApplication {
  const schedule = dependencies.schedule ?? setTimeout;
  const cancel = dependencies.cancel ?? clearTimeout;
  let current: ReaderSessionLimit = { kind: "off" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chapterTransitionBlocked = false;

  const clearTimer = () => {
    if (timer == null) return;
    cancel(timer);
    timer = undefined;
  };

  const publish = (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) =>
    dependencies.eventDispatcher.dispatch(event).catch(() => undefined);

  const reach = (kind: "duration" | "paragraph" | "chapter") => {
    void publish(
      createDomainEvent("NarrationSessionLimitReached", {
        bookId: options.currentBookId(),
        chapterId: options.currentChapterId(),
        kind
      })
    );
  };

  const apply = (event: DomainEvent<"NarrationSessionLimitChanged">) => {
    if (event.payload.bookId !== options.currentBookId()) return;
    clearTimer();
    chapterTransitionBlocked = false;
    current = limitFromEvent(event);
    options.projectLimit(current);

    if (current.kind === "duration") {
      timer = schedule(() => reach("duration"), current.durationMinutes * 60 * 1_000);
    }
  };

  const handleReached = async (event: DomainEvent<"NarrationSessionLimitReached">) => {
    if (
      event.payload.bookId !== options.currentBookId() ||
      event.payload.chapterId !== options.currentChapterId() ||
      current.kind !== event.payload.kind
    ) {
      return;
    }

    clearTimer();
    chapterTransitionBlocked = event.payload.kind === "chapter";
    const completed = current;
    current = { kind: "off" };
    options.projectLimit(current);
    await dependencies.stopPlayback();
    options.projectNotice(limitReachedMessage(completed));
  };

  return {
    start() {
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("NarrationSessionLimitChanged", apply),
        dependencies.eventDispatcher.subscribe("NarrationSessionLimitReached", handleReached),
        dependencies.eventDispatcher.subscribe("PassageNarrationPlaybackEnded", (event) => {
          if (
            current.kind === "paragraph" &&
            event.payload.bookId === options.currentBookId() &&
            event.payload.chapterId === options.currentChapterId() &&
            options.paragraphEndSentenceIds().has(event.payload.lastSentenceId)
          ) {
            reach("paragraph");
          }
        }),
        dependencies.eventDispatcher.subscribe("NarrationPlaybackEnded", (event) => {
          if (
            current.kind === "chapter" &&
            event.payload.bookId === options.currentBookId() &&
            event.payload.chapterId === options.currentChapterId()
          ) {
            reach("chapter");
          }
        }),
        dependencies.eventDispatcher.subscribe("NarrationPlaybackRequested", () => {
          if (current.kind === "off") chapterTransitionBlocked = false;
        }),
        dependencies.eventDispatcher.subscribe("ReaderClosed", () => {
          clearTimer();
          current = { kind: "off" };
          chapterTransitionBlocked = false;
          options.projectLimit(current);
        })
      ];
      return () => {
        clearTimer();
        subscriptions.forEach((unsubscribe) => unsubscribe());
      };
    },
    set(limit) {
      const durationMinutes = limit.kind === "duration" ? limit.durationMinutes : null;
      void publish(
        createDomainEvent("NarrationSessionLimitChanged", {
          bookId: options.currentBookId(),
          kind: limit.kind,
          durationMinutes
        })
      );
    },
    allowsChapterTransition() {
      return !chapterTransitionBlocked;
    }
  };
}

function limitFromEvent(event: DomainEvent<"NarrationSessionLimitChanged">): ReaderSessionLimit {
  if (event.payload.kind === "duration") {
    return {
      kind: "duration",
      durationMinutes: Math.max(1, Math.round(event.payload.durationMinutes ?? 1))
    };
  }
  return { kind: event.payload.kind };
}

function limitReachedMessage(limit: Exclude<ReaderSessionLimit, { kind: "off" }>): string {
  switch (limit.kind) {
    case "duration":
      return `Narration stopped after ${limit.durationMinutes} minutes.`;
    case "paragraph":
      return "Narration stopped at the end of the paragraph.";
    case "chapter":
      return "Narration stopped at the end of the chapter.";
  }
}
