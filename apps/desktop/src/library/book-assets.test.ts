import { describe, expect, it } from "vitest";
import { createFakeMediaSourceGateway } from "../platform/media-source-gateway";
import { resolveBookCover } from "./book-assets";

describe("book cover media", () => {
  it("projects an available cover through MediaSourceGateway", () => {
    const mediaSources = createFakeMediaSourceGateway({
      "/covers/book.png": { status: "available", url: "fake://book-cover" }
    });

    expect(
      resolveBookCover({ id: "book-1", coverImageSrc: "/covers/book.png" }, mediaSources)
    ).toEqual({ id: "book-1", coverImageSrc: "fake://book-cover" });
  });

  it("hides missing and invalid cover references", () => {
    const mediaSources = createFakeMediaSourceGateway({
      broken: { status: "invalid" }
    });

    expect(resolveBookCover({ coverImageSrc: null }, mediaSources).coverImageSrc).toBeNull();
    expect(resolveBookCover({ coverImageSrc: "broken" }, mediaSources).coverImageSrc).toBeNull();
  });
});
