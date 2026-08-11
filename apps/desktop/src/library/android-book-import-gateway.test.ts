import { describe, expect, it, vi } from "vitest";
import { createAndroidBookImportGateway } from "./book-import-gateway";

describe("Android book import gateway", () => {
  it("selects a readable EPUB source through the system document picker", async () => {
    const choose = vi.fn().mockResolvedValue("content://books/the-book.epub");
    const probe = vi.fn().mockResolvedValue(undefined);
    const gateway = createAndroidBookImportGateway({ choose, probe });

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
    const gateway = createAndroidBookImportGateway({ choose, probe });

    await expect(gateway.importBook({ kind: "choose" })).resolves.toEqual({
      status: "cancelled"
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("rejects an unreadable or revoked document source", async () => {
    const gateway = createAndroidBookImportGateway({
      choose: vi.fn().mockResolvedValue("content://books/gone.epub"),
      probe: vi.fn().mockRejectedValue(new Error("permission denied"))
    });

    await expect(gateway.importBook({ kind: "choose" })).rejects.toThrow(
      "We couldn't read that book from your document provider. Please choose it again."
    );
  });
});
