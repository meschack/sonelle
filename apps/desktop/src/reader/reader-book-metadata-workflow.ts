import { createDomainEvent, type DomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type {
  BookCoverSelection,
  BookMetadataDto,
  BookMetadataEditor,
  UpdateBookMetadataInput
} from "../library/library-contracts";

export interface BookMetadataNotice {
  message: string;
  tone: "pending" | "success" | "error";
}

interface ReaderBookMetadataWorkflowDependencies {
  editor: BookMetadataEditor;
  eventDispatcher: DomainEventDispatcher;
  friendlyError(error: unknown): string;
  onEventError?(error: unknown): void;
}

interface ReaderBookMetadataWorkflowOptions {
  projectMetadata(metadata: BookMetadataDto): void;
  projectNotice(notice: BookMetadataNotice | null): void;
  refreshLibrary(): Promise<void>;
}

export interface ReaderBookMetadataWorkflow {
  chooseCover(): Promise<BookCoverSelection | null>;
  request(input: UpdateBookMetadataInput): void;
  start(): () => void;
}

export function createReaderBookMetadataWorkflow(
  dependencies: ReaderBookMetadataWorkflowDependencies,
  options: ReaderBookMetadataWorkflowOptions
): ReaderBookMetadataWorkflow {
  const publish = async (event: Parameters<DomainEventDispatcher["dispatch"]>[0]) => {
    try {
      await dependencies.eventDispatcher.dispatch(event);
    } catch (error) {
      try {
        dependencies.onEventError?.(error);
      } catch {
        // Diagnostics observe workflow failures without changing metadata control flow.
      }
    }
  };

  const update = async (event: DomainEvent<"BookMetadataUpdateRequested">) => {
    try {
      const metadata = await dependencies.editor.update(event.payload);
      await publish(createDomainEvent("BookMetadataUpdated", metadata));
    } catch (error) {
      await publish(
        createDomainEvent("BookMetadataUpdateFailed", {
          bookId: event.payload.bookId,
          reason: dependencies.friendlyError(error)
        })
      );
    }
  };

  return {
    chooseCover: dependencies.editor.chooseCover,
    request(input) {
      void publish(createDomainEvent("BookMetadataUpdateRequested", input));
    },
    start() {
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("BookMetadataUpdateRequested", () => {
          options.projectNotice({ message: "Saving book details...", tone: "pending" });
        }),
        dependencies.eventDispatcher.subscribe("BookMetadataUpdateRequested", update),
        dependencies.eventDispatcher.subscribe("BookMetadataUpdated", (event) => {
          options.projectMetadata(event.payload);
        }),
        dependencies.eventDispatcher.subscribe("BookMetadataUpdated", () =>
          options.refreshLibrary()
        ),
        dependencies.eventDispatcher.subscribe("BookMetadataUpdated", () => {
          options.projectNotice({ message: "Book details saved.", tone: "success" });
        }),
        dependencies.eventDispatcher.subscribe("BookMetadataUpdateFailed", (event) => {
          options.projectNotice({ message: event.payload.reason, tone: "error" });
        }),
        dependencies.eventDispatcher.subscribe("ReaderOpened", () => {
          options.projectNotice(null);
        })
      ];
      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    }
  };
}
