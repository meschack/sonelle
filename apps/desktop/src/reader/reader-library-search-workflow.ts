import { hasLibrarySearchQuery } from "@sonelle/library";
import type { LibrarySearch, LibrarySearchResultDto } from "../library/library-contracts";

interface ReaderLibrarySearchWorkflowDependencies {
  search: LibrarySearch;
  delayMs?: number;
  schedule?(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
}

interface ReaderLibrarySearchWorkflowOptions {
  projectSearching(searching: boolean): void;
  projectResults(results: LibrarySearchResultDto[]): void;
  projectNotice(message: string | null): void;
}

export interface ReaderLibrarySearchWorkflow {
  queryChanged(query: string): void;
  stop(): void;
}

export function createReaderLibrarySearchWorkflow(
  dependencies: ReaderLibrarySearchWorkflowDependencies,
  options: ReaderLibrarySearchWorkflowOptions
): ReaderLibrarySearchWorkflow {
  const schedule = dependencies.schedule ?? setTimeout;
  const cancel = dependencies.cancel ?? clearTimeout;
  const delayMs = dependencies.delayMs ?? 180;
  let runId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopTimer = () => {
    if (timer == null) return;
    cancel(timer);
    timer = undefined;
  };

  return {
    queryChanged(query) {
      const currentRun = ++runId;
      stopTimer();
      if (!hasLibrarySearchQuery(query)) {
        options.projectSearching(false);
        options.projectResults([]);
        return;
      }

      options.projectSearching(true);
      timer = schedule(() => {
        timer = undefined;
        void dependencies.search
          .search({ query, limit: 30 })
          .then((results) => {
            if (currentRun !== runId) return;
            options.projectResults(results);
            options.projectSearching(false);
          })
          .catch(() => {
            if (currentRun !== runId) return;
            options.projectResults([]);
            options.projectSearching(false);
            options.projectNotice("We couldn't search your library just now.");
          });
      }, delayMs);
    },
    stop() {
      runId += 1;
      stopTimer();
      options.projectSearching(false);
    }
  };
}
