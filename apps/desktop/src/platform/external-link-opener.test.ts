import { describe, expect, it } from "vitest";
import { allowedExternalUrl } from "./external-link-opener";

describe("external link safety", () => {
  it.each([
    ["https://example.com/reading", "https://example.com/reading"],
    ["http://example.com/source", "http://example.com/source"],
    ["mailto:reader@example.com", "mailto:reader@example.com"]
  ])("allows supported book links", (href, expected) => {
    expect(allowedExternalUrl(href)).toBe(expected);
  });

  it.each(["javascript:alert('nope')", "data:text/html,unsafe", "../chapter.xhtml"])(
    "rejects links that must not leave the reader",
    (href) => {
      expect(allowedExternalUrl(href)).toBeNull();
    }
  );
});
