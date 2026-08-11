// @vitest-environment happy-dom

import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { expect, it, vi } from "vitest";
import { MobileReaderShell } from "./mobile-reader-shell";

it("keeps navigation, tools, reading, and playback in explicit mobile slots", async () => {
  const back = vi.fn();
  const [toolsOpen, setToolsOpen] = createSignal(false);
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
        libraryBooks={[]}
        activeBookId="book-1"
        toolsOpen={toolsOpen()}
        onOpenBook={vi.fn()}
        onOpenFullLibrary={back}
        onOpenSearch={vi.fn()}
        onOpenTools={() => setToolsOpen(true)}
        onCloseTools={() => setToolsOpen(false)}
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
  expect(container.querySelector('.mobile-reader-tools-slot [data-slot="tools"]')).toBeNull();
  const toolsTrigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Open reading tools"]'
  );
  toolsTrigger?.focus();
  toolsTrigger?.click();
  expect(container.querySelector('.mobile-reader-tools-slot [data-slot="tools"]')).not.toBeNull();
  await vi.waitFor(() => expect(document.activeElement?.textContent).toContain("Back to reading"));
  window.history.replaceState(null, "");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(container.querySelector('.mobile-reader-tools-slot [data-slot="tools"]')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(toolsTrigger));
  expect(
    container.querySelector('.mobile-reader-playback-slot [data-slot="playback"]')
  ).not.toBeNull();
  const library = container.querySelector<HTMLButtonElement>('[aria-label="Open library"]');
  library?.click();
  const libraryDialog = container.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Library"]'
  );
  expect(libraryDialog).not.toBeNull();
  expect(libraryDialog?.getAttribute("aria-labelledby")).toBe("mobile-reader-library-title");
  const libraryClose = container.querySelector<HTMLButtonElement>(
    ".mobile-reader-library-sheet > header button"
  );
  const manageLibrary = container.querySelector<HTMLButtonElement>(
    ".mobile-reader-library-sheet > footer button"
  );
  manageLibrary?.focus();
  manageLibrary?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
  );
  expect(document.activeElement).toBe(libraryClose);
  container
    .querySelector<HTMLButtonElement>(".mobile-reader-library-sheet > header button")
    ?.click();
  expect(container.querySelector('[role="dialog"][aria-label="Library"]')).toBeNull();

  dispose();
  container.remove();
});
