import { describe, expect, it } from "vitest";
import {
  effectiveReaderContentFontSize,
  readerContentFontSizeMaximum
} from "./mobile-reader-typography";

describe("mobile reader typography", () => {
  it("keeps large desktop preferences readable on narrow mobile displays", () => {
    expect(effectiveReaderContentFontSize(24, true)).toBe(20);
    expect(readerContentFontSizeMaximum(true)).toBe(20);
  });

  it("preserves the full desktop preference range", () => {
    expect(effectiveReaderContentFontSize(24, false)).toBe(24);
    expect(readerContentFontSizeMaximum(false)).toBe(24);
  });
});
