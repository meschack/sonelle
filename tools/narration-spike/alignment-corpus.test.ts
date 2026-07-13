import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface AlignmentPassage {
  id: string;
  category: string;
  sentences: string[];
}

interface AlignmentCorpus {
  schemaVersion: number;
  language: string;
  passages: AlignmentPassage[];
}

const corpus = JSON.parse(
  readFileSync(new URL("./alignment-corpus.json", import.meta.url), "utf8")
) as AlignmentCorpus;

describe("Kokoro alignment corpus", () => {
  it("contains unique, non-empty passages without accidental whitespace", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.language).toBe("en");
    expect(corpus.passages.length).toBeGreaterThanOrEqual(10);

    const ids = corpus.passages.map((passage) => passage.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const passage of corpus.passages) {
      expect(passage.category.length).toBeGreaterThan(0);
      expect(passage.sentences.length).toBeGreaterThan(0);
      for (const sentence of passage.sentences) {
        expect(sentence.trim()).toBe(sentence);
        expect(sentence).not.toMatch(/\s{2,}/u);
      }
    }
  });

  it("covers every required alignment category", () => {
    const categories = new Set(corpus.passages.map((passage) => passage.category));

    expect(categories).toEqual(
      new Set([
        "plain-prose",
        "dialogue-and-quotations",
        "numbers-and-abbreviations",
        "complex-punctuation",
        "headings-and-short-paragraphs",
        "long-sentences-and-limits"
      ])
    );
  });
});
