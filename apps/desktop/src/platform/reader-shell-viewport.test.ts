import { describe, expect, it, vi } from "vitest";
import { createReaderShellViewport } from "./reader-shell-viewport";

describe("reader shell viewport", () => {
  it("projects media-query changes through one application-boundary listener", () => {
    let handleChange: ((event: MediaQueryListEvent) => void) | undefined;
    const removeEventListener = vi.fn();
    const viewport = createReaderShellViewport(
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn((_name, listener) => {
          handleChange = listener;
        }),
        removeEventListener
      })
    );
    const changed = vi.fn();

    const stop = viewport.listen(changed);
    expect(viewport.isMobile()).toBe(true);
    handleChange?.({ matches: false } as MediaQueryListEvent);
    expect(changed).toHaveBeenCalledWith(false);

    stop();
    expect(removeEventListener).toHaveBeenCalledWith("change", handleChange);
  });

  it("uses the desktop shell when matchMedia is unavailable", () => {
    const viewport = createReaderShellViewport(undefined);
    expect(viewport.isMobile()).toBe(false);
  });
});
