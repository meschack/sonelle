import type { DomainEventDispatcher } from "@sonelle/domain";

type ErrorReporter = (scope: string, error: unknown, details?: unknown[]) => void;

export function observeReaderErrors(
  eventDispatcher: DomainEventDispatcher,
  report: ErrorReporter
): () => void {
  const reportFailure = (scope: string, reason: string, details: object) => {
    report(scope, new Error(reason), [details]);
  };
  const subscriptions = [
    eventDispatcher.subscribe("BookImportFailed", (event) => {
      reportFailure("book-import.failed", event.payload.reason, { path: event.payload.path });
    }),
    eventDispatcher.subscribe("NarrationPlaybackFailed", (event) => {
      reportFailure("narration.failed", event.payload.reason, event.payload);
    }),
    eventDispatcher.subscribe("UpcomingNarrationPreparationFailed", (event) => {
      reportFailure("narration-prefetch.failed", event.payload.reason, event.payload);
    }),
    eventDispatcher.subscribe("VoiceInstallationFailed", (event) => {
      reportFailure("voice-installation.failed", event.payload.reason, event.payload);
    }),
    eventDispatcher.subscribe("OfflineNarrationFilesInstallationFailed", (event) => {
      reportFailure("narration-files.failed", event.payload.reason, event.payload);
    }),
    eventDispatcher.subscribe("PreparedNarrationClearingFailed", (event) => {
      reportFailure("prepared-audio-clear.failed", event.payload.reason, event.payload);
    }),
    eventDispatcher.subscribe("BookExportFailed", (event) => {
      reportFailure("book-export.failed", event.payload.reason, event.payload);
    }),
    eventDispatcher.subscribe("ParagraphImageFailed", (event) => {
      reportFailure("paragraph-image.failed", event.payload.reason, event.payload);
    }),
    eventDispatcher.subscribe("WordLookupCompleted", (event) => {
      if (event.payload.status !== "error") return;
      reportFailure("word-lookup.failed", "The word lookup could not be completed.", event.payload);
    })
  ];

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
