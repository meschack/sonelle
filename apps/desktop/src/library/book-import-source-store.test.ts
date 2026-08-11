import { describe, expect, it, vi } from "vitest";
import { createBookImportSourceStore } from "./book-import-source-store";

describe("book import source store", () => {
  it("forwards native progress and returns the durable source", async () => {
    let emitProgress: (progress: {
      requestId: string;
      completedBytes: number;
      totalBytes: number | null;
    }) => void = () => undefined;
    const invokeCommand = vi.fn().mockImplementation(async (command: string) => {
      if (command !== "copy_book_import_source") return undefined;
      emitProgress({ requestId: "request-1", completedBytes: 4, totalBytes: 10 });
      return { source: "/data/import-sources/hash.epub", reusedExisting: false };
    });
    const onProgress = vi.fn();
    const store = createBookImportSourceStore({
      invoke: invokeCommand,
      createProgressChannel(onMessage) {
        emitProgress = onMessage;
        return {};
      }
    });

    await expect(
      store.prepare("content://books/book.epub", {
        requestId: "request-1",
        onProgress
      })
    ).resolves.toEqual({
      source: "/data/import-sources/hash.epub",
      reusedExisting: false
    });

    expect(onProgress).toHaveBeenCalledWith({ completedBytes: 4, totalBytes: 10 });
    expect(invokeCommand).toHaveBeenCalledWith(
      "copy_book_import_source",
      expect.objectContaining({
        request: { requestId: "request-1", source: "content://books/book.epub" }
      })
    );
  });

  it("asks native copying to stop when preparation is cancelled", async () => {
    const neverFinishes = new Promise(() => undefined);
    const invokeCommand = vi.fn().mockImplementation((command: string) => {
      return command === "copy_book_import_source" ? neverFinishes : Promise.resolve();
    });
    const store = createBookImportSourceStore({
      invoke: invokeCommand,
      createProgressChannel: () => ({})
    });
    const controller = new AbortController();

    const preparation = store.prepare("content://books/book.epub", {
      requestId: "request-1",
      signal: controller.signal,
      onProgress: vi.fn()
    });
    controller.abort();

    await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
    expect(invokeCommand).toHaveBeenCalledWith("cancel_book_import_source_copy", {
      requestId: "request-1"
    });
  });
});
