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
    expect(container.querySelector('[role="status"], [role="alert"]')).toBeNull();
    expect(
      container.querySelector('[role="group"][aria-label="Narration transport"]')
    ).not.toBeNull();
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
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Download narration files"
    );
    container.querySelector<HTMLButtonElement>('[aria-label="Open narration recovery"]')?.click();
    expect(onOpenControls).toHaveBeenCalledOnce();

    dispose();
    container.remove();
  });

  it("announces preparation without turning playback changes into live chatter", () => {
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
            chapterSentenceCount: 4,
            chapterPercent: 25,
            bookSentenceNumber: 1,
            bookSentenceCount: 4,
            bookPercent: 25
          }}
          sentenceCount={4}
          status="idle"
          preparing={true}
          notice={null}
          onPrevious={vi.fn()}
          onToggle={vi.fn()}
          onNext={vi.fn()}
          onStop={vi.fn()}
          onOpenControls={vi.fn()}
        />
      ),
      container
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Preparing narration audio"
    );

    dispose();
    container.remove();
  });
});
