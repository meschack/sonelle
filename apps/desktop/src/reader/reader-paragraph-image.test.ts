import { describe, expect, it } from "vitest";
import { createParagraphImageLayout } from "./reader-paragraph-image";

const measureMonospace = (text: string, fontSize: number) => text.length * fontSize * 0.62;

describe("paragraph image layout", () => {
  it("keeps a short paragraph in a fixed landscape image", () => {
    const layout = createParagraphImageLayout(
      "A quiet paragraph can still hold a rather loud idea.",
      measureMonospace
    );

    expect(layout.width).toBe(2_046);
    expect(layout.height).toBe(1_440);
    expect(layout.paragraphFontSize).toBe(64);
    expect(layout.lines.join(" ")).toBe("A quiet paragraph can still hold a rather loud idea.");
  });

  it("preserves a long paragraph by reducing type within the fixed canvas", () => {
    const paragraph = Array.from({ length: 120 }, (_, index) => `trade-offs-${index + 1}`).join(
      " "
    );
    const layout = createParagraphImageLayout(paragraph, measureMonospace);

    expect(layout.width).toBe(2_046);
    expect(layout.height).toBe(1_440);
    expect(layout.paragraphFontSize).toBeLessThanOrEqual(34);
    expect(layout.lines.join(" ")).toBe(paragraph);
  });

  it("breaks an unusually long token without overflowing the image width", () => {
    const paragraph = "x".repeat(500);
    const layout = createParagraphImageLayout(paragraph, measureMonospace);
    const lineWidth = 2_046 - 154 * 2;

    expect(layout.lines.length).toBeGreaterThan(1);
    expect(
      layout.lines.every((line) => measureMonospace(line, layout.paragraphFontSize) <= lineWidth)
    ).toBe(true);
    expect(layout.lines.join("")).toBe(paragraph);
  });
});
