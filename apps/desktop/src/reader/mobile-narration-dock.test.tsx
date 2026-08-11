// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { MobileNarrationDock } from "./mobile-narration-dock";

describe("mobile narration dock", () => {
  it("projects compact playback truth and emits reader intents", () => {
    const onToggle = vi.fn();
    const onStop = vi.fn();
    const onOpenControls = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(
      () => (
        <MobileNarrationDock
          chapterTitle="A quiet chapter"
          progress={{
            chapterIndex: 0,
            chapterCount: 5,
            chapterSentenceNumber: 2,
            chapterSentenceCount: 8,
            chapterPercent: 25,
            bookSentenceNumber: 12,
            bookSentenceCount: 40,
            bookPercent: 30
          }}
          sentenceCount={8}
          status="playing"
          preparing={false}
          notice={null}
          onPrevious={vi.fn()}
          onToggle={onToggle}
          onNext={vi.fn()}
          onStop={onStop}
          onOpenControls={onOpenControls}
        />
      ),
      container
    );

    expect(container.textContent).toContain("Listening");
    expect(container.textContent).toContain("Sentence 2 of 8");
    container.querySelector<HTMLButtonElement>('[aria-label="Pause narration"]')?.click();
    container.querySelector<HTMLButtonElement>('[aria-label="Stop narration"]')?.click();
    container.querySelector<HTMLButtonElement>('[aria-label="Open narration controls"]')?.click();
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onOpenControls).toHaveBeenCalledOnce();

    dispose();
    container.remove();
  });

  it("links needs-attention state to recovery controls", () => {
    const onOpenControls = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(
      () => (
        <MobileNarrationDock
          chapterTitle="A quiet chapter"
          progress={{
            chapterIndex: 0,
            chapterCount: 1,
            chapterSentenceNumber: 1,
            chapterSentenceCount: 1,
            chapterPercent: 100,
            bookSentenceNumber: 1,
            bookSentenceCount: 1,
            bookPercent: 100
          }}
          sentenceCount={1}
          status="paused"
          preparing={false}
          notice="Download narration files to listen offline."
          onPrevious={vi.fn()}
          onToggle={vi.fn()}
          onNext={vi.fn()}
          onStop={vi.fn()}
          onOpenControls={onOpenControls}
        />
      ),
      container
    );

    expect(container.textContent).toContain("Narration needs attention");
    container.querySelector<HTMLButtonElement>('[aria-label="Open narration recovery"]')?.click();
    expect(onOpenControls).toHaveBeenCalledOnce();

    dispose();
    container.remove();
  });
});
