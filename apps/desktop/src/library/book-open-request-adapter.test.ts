import { describe, expect, it, vi } from "vitest";
import { createBookOpenRequestAdapter } from "./book-open-request-adapter";

describe("book open request adapter", () => {
  it("delivers requests that arrived before the reader started", async () => {
    const bridge = createBridge(["/books/cold-start.epub"]);
    const open = vi.fn().mockResolvedValue(undefined);

    const stop = await createBookOpenRequestAdapter({ bridge }).listen(open);

    expect(open).toHaveBeenCalledWith("/books/cold-start.epub");
    stop();
  });

  it("delivers requests received while Sonelle is already running", async () => {
    const bridge = createBridge();
    const open = vi.fn().mockResolvedValue(undefined);
    const stop = await createBookOpenRequestAdapter({ bridge }).listen(open);

    bridge.push("/books/warm.epub");
    bridge.signal();

    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("/books/warm.epub"));
    stop();
  });

  it("delivers multiple requests serially", async () => {
    const bridge = createBridge();
    let finishFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const started: string[] = [];
    const open = vi.fn(async (path: string) => {
      started.push(path);
      if (path.endsWith("first.epub")) await first;
    });
    const stop = await createBookOpenRequestAdapter({ bridge }).listen(open);

    bridge.push("/books/first.epub", "/books/second.epub");
    bridge.signal();
    await vi.waitFor(() => expect(started).toEqual(["/books/first.epub"]));

    finishFirst?.();
    await vi.waitFor(() => expect(started).toEqual(["/books/first.epub", "/books/second.epub"]));
    stop();
  });

  it("stops delivering queued requests after cleanup", async () => {
    const bridge = createBridge();
    const open = vi.fn().mockResolvedValue(undefined);
    const stop = await createBookOpenRequestAdapter({ bridge }).listen(open);

    stop();
    bridge.push("/books/too-late.epub");
    bridge.signal();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(open).not.toHaveBeenCalled();
    expect(bridge.stopListening).toHaveBeenCalledOnce();
  });
});

function createBridge(initialPaths: string[] = []) {
  let pending = [...initialPaths];
  let notify: () => void = () => undefined;
  const stopListening = vi.fn();
  return {
    stopListening,
    async listen(onSignal: () => void) {
      notify = onSignal;
      return stopListening;
    },
    async takePending() {
      const paths = pending;
      pending = [];
      return paths;
    },
    push(...paths: string[]) {
      pending.push(...paths);
    },
    signal() {
      notify();
    }
  };
}
