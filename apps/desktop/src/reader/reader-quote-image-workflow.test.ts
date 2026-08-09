import { describe, expect, it, vi } from "vitest";
import { createDomainEventDispatcher, type AnyDomainEvent } from "@sonelle/domain";
import { buildFixtureReaderView } from "./reader-view";
import { createReaderQuoteImageWorkflow } from "./reader-quote-image-workflow";

describe("reader quote image workflow", () => {
  it("exports neighboring sentences through domain events", async () => {
    const dispatcher = createDomainEventDispatcher();
    const reader = buildFixtureReaderView();
    const exporter = { export: vi.fn().mockResolvedValue("passage.png") };
    const projectNotice = vi.fn();
    const events: AnyDomainEvent[] = [];
    dispatcher.subscribe("QuoteImageRequested", (event) => {
      events.push(event);
    });
    dispatcher.subscribe("QuoteImageCreated", (event) => {
      events.push(event);
    });
    const workflow = createReaderQuoteImageWorkflow(
      { eventDispatcher: dispatcher, exporter },
      {
        currentReader: () => reader,
        currentSentenceIndex: () => 1,
        projectNotice
      }
    );
    const stop = workflow.start();

    workflow.request(reader.sentences.slice(0, 2).map((sentence) => sentence.id));

    await vi.waitFor(() => expect(exporter.export).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(events.map((event) => event.name)).toEqual([
        "QuoteImageRequested",
        "QuoteImageCreated"
      ])
    );
    expect(exporter.export).toHaveBeenCalledWith(
      expect.objectContaining({
        sentenceTexts: reader.sentences.slice(0, 2).map((sentence) => sentence.text),
        bookTitle: reader.book.title,
        author: reader.book.author,
        chapterTitle: reader.chapter.title
      })
    );
    expect(projectNotice).toHaveBeenLastCalledWith(
      expect.objectContaining({ tone: "success", message: expect.stringContaining("passage.png") })
    );
    stop();
  });

  it("reports renderer failures and projects an actionable error", async () => {
    const dispatcher = createDomainEventDispatcher();
    const error = new Error("Canvas refused to cooperate.");
    const onError = vi.fn();
    const projectNotice = vi.fn();
    const workflow = createReaderQuoteImageWorkflow(
      {
        eventDispatcher: dispatcher,
        exporter: { export: vi.fn().mockRejectedValue(error) },
        onError
      },
      {
        currentReader: buildFixtureReaderView,
        currentSentenceIndex: () => 0,
        projectNotice
      }
    );
    const stop = workflow.start();

    workflow.request();

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    await vi.waitFor(() =>
      expect(projectNotice).toHaveBeenLastCalledWith({
        title: "Quote image needs attention",
        message: error.message,
        tone: "error"
      })
    );
    stop();
  });
});
