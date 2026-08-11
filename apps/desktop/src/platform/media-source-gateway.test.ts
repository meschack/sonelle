import { describe, expect, it, vi } from "vitest";
import {
  createDesktopMediaSourceGateway,
  createFakeMediaSourceGateway
} from "./media-source-gateway";

describe("MediaSourceGateway", () => {
  it("turns a desktop local path into an asset URL", () => {
    const convertLocalSource = vi.fn((path: string, protocol?: string) => `${protocol}:${path}`);
    const gateway = createDesktopMediaSourceGateway(convertLocalSource);

    expect(gateway.resolve({ kind: "book-cover", source: "/books/cover.png" })).toEqual({
      status: "available",
      url: "asset:/books/cover.png"
    });
    expect(convertLocalSource).toHaveBeenCalledWith("/books/cover.png", "asset");
  });

  it("preserves already usable media URLs", () => {
    const convertLocalSource = vi.fn();
    const gateway = createDesktopMediaSourceGateway(convertLocalSource);

    expect(
      gateway.resolve({ kind: "prepared-narration", source: "asset://localhost/audio.wav" })
    ).toEqual({ status: "available", url: "asset://localhost/audio.wav" });
    expect(convertLocalSource).not.toHaveBeenCalled();
  });

  it("reports missing and invalid desktop media without leaking converter failures", () => {
    const gateway = createDesktopMediaSourceGateway(() => {
      throw new Error("bad local path");
    });

    expect(gateway.resolve({ kind: "book-cover", source: null })).toEqual({ status: "missing" });
    expect(gateway.resolve({ kind: "book-cover", source: "bad\0path" })).toEqual({
      status: "invalid"
    });
    expect(gateway.resolve({ kind: "book-cover", source: "/bad/path" })).toEqual({
      status: "invalid"
    });
  });

  it("provides deterministic available, missing, and invalid fake outcomes", () => {
    const gateway = createFakeMediaSourceGateway({
      cover: { status: "available", url: "fake://cover" },
      broken: { status: "invalid" }
    });

    expect(gateway.resolve({ kind: "book-cover", source: "cover" })).toEqual({
      status: "available",
      url: "fake://cover"
    });
    expect(gateway.resolve({ kind: "book-cover", source: null })).toEqual({ status: "missing" });
    expect(gateway.resolve({ kind: "prepared-narration", source: "broken" })).toEqual({
      status: "invalid"
    });
    expect(gateway.requests).toHaveLength(3);
  });
});
