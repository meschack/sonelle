import { createDomainEvent, type DomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type { QuoteImageExporter } from "./reader-quote-image";
import type { ReaderView } from "./reader-view";

export interface QuoteImageNotice {
  title: string;
  message: string;
  tone: "pending" | "success" | "error";
}

interface ReaderQuoteImageWorkflowDependencies {
  eventDispatcher: DomainEventDispatcher;
  exporter: QuoteImageExporter;
  onError?(error: unknown): void;
}

interface ReaderQuoteImageWorkflowOptions {
  currentReader(): ReaderView;
  currentSentenceIndex(): number;
  projectNotice(notice: QuoteImageNotice | null): void;
}

export interface ReaderQuoteImageWorkflow {
  request(sentenceIds?: string[]): void;
  start(): () => void;
}

export function createReaderQuoteImageWorkflow(
  dependencies: ReaderQuoteImageWorkflowDependencies,
  options: ReaderQuoteImageWorkflowOptions
): ReaderQuoteImageWorkflow {
  const publish = async (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) => {
    try {
      await dependencies.eventDispatcher.dispatch(event);
    } catch (error) {
      reportSafely(dependencies.onError, error);
    }
  };

  const createImage = async (event: DomainEvent<"QuoteImageRequested">) => {
    const reader = options.currentReader();
    const sentences = event.payload.sentenceIds
      .map((sentenceId) => reader.sentences.find((entry) => entry.id === sentenceId))
      .filter((sentence): sentence is ReaderView["sentences"][number] => sentence != null);
    if (
      sentences.length !== event.payload.sentenceIds.length ||
      reader.book.id !== event.payload.bookId ||
      reader.chapter.id !== event.payload.chapterId
    ) {
      await publish(
        createDomainEvent("QuoteImageFailed", {
          ...event.payload,
          reason: "That passage is no longer open. Select it and try again."
        })
      );
      return;
    }

    try {
      const fileName = await dependencies.exporter.export({
        sentenceTexts: sentences.map((sentence) => sentence.text),
        bookTitle: reader.book.title,
        author: reader.book.author,
        chapterTitle: reader.chapter.title
      });
      await publish(createDomainEvent("QuoteImageCreated", { ...event.payload, fileName }));
    } catch (error) {
      reportSafely(dependencies.onError, error);
      await publish(
        createDomainEvent("QuoteImageFailed", {
          ...event.payload,
          reason: error instanceof Error ? error.message : "Sonelle could not create this image."
        })
      );
    }
  };

  return {
    request(sentenceIds) {
      const reader = options.currentReader();
      const activeSentence = reader.sentences[options.currentSentenceIndex()];
      if (activeSentence == null) {
        const error = new Error("Select a sentence before saving an image.");
        reportSafely(dependencies.onError, error);
        options.projectNotice({
          title: "No sentence selected",
          message: error.message,
          tone: "error"
        });
        return;
      }

      const selectedIds = sentenceIds ?? [activeSentence.id];
      const selectedIndexes = selectedIds
        .map((sentenceId) => reader.sentences.findIndex((entry) => entry.id === sentenceId))
        .sort((left, right) => left - right);
      const selectionIsValid =
        selectedIndexes.length > 0 &&
        selectedIndexes.length <= 4 &&
        selectedIndexes.every((index) => index >= 0) &&
        selectedIndexes.every((index, offset) =>
          offset === 0 ? true : index === selectedIndexes[offset - 1] + 1
        );
      if (!selectionIsValid) {
        const error = new Error("Choose up to four neighboring sentences for the quote image.");
        reportSafely(dependencies.onError, error);
        options.projectNotice({
          title: "Passage selection needs attention",
          message: error.message,
          tone: "error"
        });
        return;
      }

      void publish(
        createDomainEvent("QuoteImageRequested", {
          bookId: reader.book.id,
          chapterId: reader.chapter.id,
          sentenceIds: selectedIndexes.map((index) => reader.sentences[index].id)
        })
      );
    },
    start() {
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("QuoteImageRequested", () => {
          options.projectNotice({
            title: "Creating quote image",
            message: "Laying out the selected passage.",
            tone: "pending"
          });
        }),
        dependencies.eventDispatcher.subscribe("QuoteImageRequested", createImage),
        dependencies.eventDispatcher.subscribe("QuoteImageCreated", (event) => {
          options.projectNotice({
            title: "Quote image ready",
            message: `${event.payload.fileName} was saved to your Downloads folder.`,
            tone: "success"
          });
        }),
        dependencies.eventDispatcher.subscribe("QuoteImageFailed", (event) => {
          options.projectNotice({
            title: "Quote image needs attention",
            message: event.payload.reason,
            tone: "error"
          });
        })
      ];
      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    }
  };
}

function reportSafely(reporter: ((error: unknown) => void) | undefined, error: unknown) {
  try {
    reporter?.(error);
  } catch {
    // Diagnostics observe image export failures without changing the workflow.
  }
}
