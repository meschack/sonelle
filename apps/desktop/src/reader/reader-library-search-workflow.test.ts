import { describe, expect, it, vi } from "vitest";
import { createReaderLibrarySearchWorkflow } from "./reader-library-search-workflow";

describe("reader library search workflow", () => {
  it("debounces queries and ignores stale results", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(value: never[]) => void> = [];
    const search = vi.fn(
      () =>
        new Promise<never[]>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const results: unknown[][] = [];
    const searching: boolean[] = [];
    const workflow = createReaderLibrarySearchWorkflow(
      { search: { search }, delayMs: 10 },
      {
        projectSearching: (value) => searching.push(value),
        projectResults: (value) => results.push(value),
        projectNotice: vi.fn()
      }
    );

    workflow.queryChanged("first");
    await vi.advanceTimersByTimeAsync(10);
    workflow.queryChanged("second");
    await vi.advanceTimersByTimeAsync(10);
    resolvers[0]?.([]);
    await Promise.resolve();
    expect(searching[searching.length - 1]).toBe(true);
    resolvers[1]?.([]);
    await Promise.resolve();

    expect(search).toHaveBeenNthCalledWith(1, { query: "first", limit: 30 });
    expect(search).toHaveBeenNthCalledWith(2, { query: "second", limit: 30 });
    expect(searching[searching.length - 1]).toBe(false);
    expect(results).toEqual([[]]);
    workflow.stop();
    vi.useRealTimers();
  });

  it("clears short queries without crossing the repository boundary", () => {
    const search = vi.fn();
    const projectResults = vi.fn();
    const workflow = createReaderLibrarySearchWorkflow(
      { search: { search } },
      {
        projectSearching: vi.fn(),
        projectResults,
        projectNotice: vi.fn()
      }
    );

    workflow.queryChanged("a");

    expect(search).not.toHaveBeenCalled();
    expect(projectResults).toHaveBeenCalledWith([]);
  });
});
