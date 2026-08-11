// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { ReaderLegalPanel } from "./reader-legal";

describe("reader privacy and license information", () => {
  let dispose = () => {};
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    dispose();
    container?.remove();
    dispose = () => {};
    container = null;
  });

  it("explains local processing and hides unshipped model notices", () => {
    container = document.createElement("div");
    document.body.append(container);
    dispose = render(() => <ReaderLegalPanel standardOfflineVoiceAvailable={false} />, container!);
    expect(container.textContent).toContain("Your library stays on this device");
    expect(container.textContent).toContain("never uploaded automatically");
    expect(container.textContent).toContain(
      "This build does not activate an Android device-provided voice"
    );
    expect(container.textContent).not.toContain("Supertonic 3 model");
  });

  it("exposes full standard-voice terms when that voice is available", () => {
    container = document.createElement("div");
    document.body.append(container);
    dispose = render(() => <ReaderLegalPanel standardOfflineVoiceAvailable={true} />, container!);
    expect(container.textContent).toContain("Supertonic 3 model");
    expect(
      container.querySelector('[aria-label="Supertonic 3 model license"]')?.textContent
    ).toContain("BigScience Open RAIL-M License");
    expect(container.querySelectorAll("details")).toHaveLength(3);
  });
});
