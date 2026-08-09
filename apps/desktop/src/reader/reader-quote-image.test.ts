import { describe, expect, it } from "vitest";
import { createQuoteImageLayout } from "./reader-quote-image";

const measureMonospace = (text: string, fontSize: number) => text.length * fontSize * 0.62;

describe("quote image layout", () => {
  it("uses a compact landscape canvas for a short sentence", () => {
    const layout = createQuoteImageLayout(
      "A quiet sentence can still hold a rather loud idea.",
      measureMonospace
    );

    expect(layout.width).toBe(2_046);
    expect(layout.height).toBeGreaterThanOrEqual(720);
    expect(layout.height).toBeLessThan(900);
    expect(layout.quoteFontSize).toBe(64);
  });

  it("grows the canvas height with the selected sentences", () => {
    const shortLayout = createQuoteImageLayout("A compact thought.", measureMonospace);
    const longLayout = createQuoteImageLayout(
      Array.from({ length: 100 }, (_, index) => `consideration-${index + 1}`).join(" "),
      measureMonospace
    );

    expect(longLayout.height).toBeGreaterThan(shortLayout.height);
    expect(longLayout.height).toBeLessThanOrEqual(1_440);
  });

  it("keeps neighboring sentences in reading order", () => {
    const sentences = [
      "The first sentence makes the claim.",
      "The second sentence finds another edge."
    ];
    const layout = createQuoteImageLayout(sentences, measureMonospace);

    expect(layout.lines.join(" ")).toBe(sentences.join(" "));
  });

  it("breaks an unusually long token without overflowing the image width", () => {
    const sentence = "x".repeat(500);
    const layout = createQuoteImageLayout(sentence, measureMonospace);
    const lineWidth = 2_046 - 154 * 2;

    expect(layout.lines.length).toBeGreaterThan(1);
    expect(
      layout.lines.every((line) => measureMonospace(line, layout.quoteFontSize) <= lineWidth)
    ).toBe(true);
    expect(layout.lines.join("")).toBe(sentence);
  });
});
