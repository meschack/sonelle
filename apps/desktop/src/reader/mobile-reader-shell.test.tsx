// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { expect, it, vi } from "vitest";
import { MobileReaderShell } from "./mobile-reader-shell";

it("keeps navigation, tools, reading, and playback in explicit mobile slots", () => {
  const back = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(
    () => (
      <MobileReaderShell
        bookTitle="A Book"
        chapterTitle="Chapter two"
        navigation={<nav data-slot="navigation">Chapters</nav>}
        content={<article data-slot="content">Reading text</article>}
        tools={<aside data-slot="tools">Typography</aside>}
        playback={<footer data-slot="playback">Play</footer>}
        toolsOpen={true}
        onBackToLibrary={back}
        onOpenSearch={vi.fn()}
        onOpenTools={vi.fn()}
        onCloseTools={vi.fn()}
      />
    ),
    container
  );

  expect(
    container.querySelector('.mobile-reader-navigation-slot [data-slot="navigation"]')
  ).not.toBeNull();
  expect(
    container.querySelector('.mobile-reader-content-slot [data-slot="content"]')
  ).not.toBeNull();
  expect(container.querySelector('.mobile-reader-tools-slot [data-slot="tools"]')).not.toBeNull();
  expect(
    container.querySelector('.mobile-reader-playback-slot [data-slot="playback"]')
  ).not.toBeNull();
  container.querySelector<HTMLButtonElement>('[aria-label="Back to library"]')?.click();
  expect(back).toHaveBeenCalledOnce();

  dispose();
  container.remove();
});
