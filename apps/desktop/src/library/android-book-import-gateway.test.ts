import { describe, expect, it, vi } from "vitest";
import { createAndroidBookImportGateway } from "./book-import-gateway";

describe("Android book import gateway", () => {
  it("selects a readable EPUB source through the system document picker", async () => {
    const choose = vi.fn().mockResolvedValue("content://books/the-book.epub");
    const probe = vi.fn().mockResolvedValue(undefined);
    const gateway = createAndroidBookImportGateway({
      choose,
      probe,
      importDocument: vi.fn()
    });

    await expect(gateway.importBook({ kind: "choose" })).resolves.toEqual({
      status: "source-selected",
      source: "content://books/the-book.epub"
    });

    expect(choose).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        pickerMode: "document",
        filters: [
          {
            name: "EPUB books",
            extensions: [
              "epub",
              "application/epub+zip",
              "application/zip",
              "application/octet-stream"
            ]
          }
        ]
      })
    );
    expect(probe).toHaveBeenCalledWith("content://books/the-book.epub");
  });

  it.each([
    ["a null picker result", null],
    ["Android's rejected cancellation result", new Error("File picker cancelled")]
  ])("treats %s as ordinary cancellation", async (_description, pickerResult) => {
    const choose =
      pickerResult instanceof Error
        ? vi.fn().mockRejectedValue(pickerResult)
        : vi.fn().mockResolvedValue(pickerResult);
    const probe = vi.fn();
    const gateway = createAndroidBookImportGateway({
      choose,
      probe,
      importDocument: vi.fn()
    });

    await expect(gateway.importBook({ kind: "choose" })).resolves.toEqual({
      status: "cancelled"
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("rejects an unreadable or revoked document source", async () => {
    const gateway = createAndroidBookImportGateway({
      choose: vi.fn().mockResolvedValue("content://books/gone.epub"),
      probe: vi.fn().mockRejectedValue(new Error("permission denied")),
      importDocument: vi.fn()
    });

    await expect(gateway.importBook({ kind: "choose" })).rejects.toThrow(
      "We couldn't read that book from your document provider. Please choose it again."
    );
  });

  it("imports a prepared Sonelle source through the shared native importer", async () => {
    const document = {
      book: { id: "book-1", title: "The Book", author: "A. Writer", language: "en" },
      activeChapterId: "chapter-1",
      chapters: [
        {
          id: "chapter-1",
          title: "Chapter 1",
          index: 0,
          sentenceCount: 1,
          sentences: [{ id: "sentence-1", index: 0, text: "Hello." }]
        }
      ],
      position: null
    };
    const importDocument = vi.fn().mockResolvedValue(document);
    const probe = vi.fn();
    const gateway = createAndroidBookImportGateway({
      choose: vi.fn(),
      probe,
      importDocument
    });

    await expect(
      gateway.importBook({
        kind: "provided",
        source: "/data/user/0/app.sonelle.reader/files/import-sources/hash.epub"
      })
    ).resolves.toEqual({ status: "imported", document });

    expect(importDocument).toHaveBeenCalledWith(
      "/data/user/0/app.sonelle.reader/files/import-sources/hash.epub",
      expect.any(Function)
    );
    expect(probe).not.toHaveBeenCalled();
  });

  it("forwards native import phases without making the adapter own their projection", async () => {
    const onProgress = vi.fn();
    const importDocument = vi.fn().mockImplementation(async (_source, emitProgress) => {
      emitProgress({ phase: "reading" });
      emitProgress({ phase: "saving" });
      return {
        book: { id: "book-1", title: "The Book", author: "A. Writer", language: "en" },
        activeChapterId: "chapter-1",
        chapters: [],
        position: null
      };
    });
    const gateway = createAndroidBookImportGateway({
      choose: vi.fn(),
      probe: vi.fn(),
      importDocument
    });

    await gateway.importBook(
      { kind: "provided", source: "/data/import-sources/large.epub" },
      { onProgress }
    );

    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "reading",
      "saving"
    ]);
  });
});
