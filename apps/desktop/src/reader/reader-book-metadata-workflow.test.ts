import { describe, expect, it, vi } from "vitest";
import { createDomainEventDispatcher, type AnyDomainEvent } from "@sonelle/domain";
import { createReaderBookMetadataWorkflow } from "./reader-book-metadata-workflow";

describe("reader book metadata workflow", () => {
  it("updates metadata and lets projections refresh independently", async () => {
    const dispatcher = createDomainEventDispatcher();
    const metadata = {
      bookId: "book-1",
      title: "Edited title",
      author: "Edited author",
      coverImageSrc: "asset://cover.png"
    };
    const projectMetadata = vi.fn();
    const projectNotice = vi.fn();
    const refreshLibrary = vi.fn().mockResolvedValue(undefined);
    const events: AnyDomainEvent[] = [];
    dispatcher.subscribe("BookMetadataUpdated", (event) => {
      events.push(event);
    });
    const workflow = createReaderBookMetadataWorkflow(
      {
        editor: {
          chooseCover: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue(metadata)
        },
        eventDispatcher: dispatcher,
        friendlyError: (error) => String(error)
      },
      { projectMetadata, projectNotice, refreshLibrary }
    );
    const stop = workflow.start();

    workflow.request({
      bookId: "book-1",
      title: "Edited title",
      author: "Edited author",
      coverPath: "/tmp/cover.png",
      removeCover: false
    });

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(projectMetadata).toHaveBeenCalledWith(metadata);
    expect(refreshLibrary).toHaveBeenCalledOnce();
    expect(projectNotice).toHaveBeenLastCalledWith({
      message: "Book details saved.",
      tone: "success"
    });
    stop();
  });
});
