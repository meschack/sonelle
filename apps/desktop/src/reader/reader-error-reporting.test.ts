import { describe, expect, it, vi } from "vitest";
import { createDomainEvent, createDomainEventDispatcher } from "@sonelle/domain";
import { observeReaderErrors } from "./reader-error-reporting";

describe("reader error reporting", () => {
  it("records failure events that application workflows intentionally handle", async () => {
    const dispatcher = createDomainEventDispatcher();
    const report = vi.fn();
    const stop = observeReaderErrors(dispatcher, report);

    await dispatcher.dispatch(
      createDomainEvent("BookImportFailed", {
        path: "/books/example.epub",
        reason: "The EPUB could not be opened."
      })
    );
    await dispatcher.dispatch(
      createDomainEvent("WordLookupCompleted", {
        lookupId: "lookup-1",
        surface: "ailleurs",
        status: "error"
      })
    );

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenNthCalledWith(
      1,
      "book-import.failed",
      expect.objectContaining({ message: "The EPUB could not be opened." }),
      [{ path: "/books/example.epub" }]
    );
    expect(report).toHaveBeenNthCalledWith(2, "word-lookup.failed", expect.any(Error), [
      { lookupId: "lookup-1", surface: "ailleurs", status: "error" }
    ]);
    stop();
  });

  it("does not treat a missing dictionary definition as an application error", async () => {
    const dispatcher = createDomainEventDispatcher();
    const report = vi.fn();
    const stop = observeReaderErrors(dispatcher, report);

    await dispatcher.dispatch(
      createDomainEvent("WordLookupCompleted", {
        lookupId: "lookup-2",
        surface: "unlisted",
        status: "not-found"
      })
    );

    expect(report).not.toHaveBeenCalled();
    stop();
  });
});
