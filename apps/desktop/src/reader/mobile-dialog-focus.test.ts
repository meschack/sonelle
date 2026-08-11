// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { containMobileDialogFocus } from "./mobile-dialog-focus";

describe("mobile dialog focus", () => {
  it("wraps Tab and Shift+Tab inside the visible dialog", () => {
    const dialog = document.createElement("section");
    const first = document.createElement("button");
    const last = document.createElement("button");
    dialog.append(first, last);
    document.body.append(dialog);

    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    containMobileDialogFocus(forward, dialog, vi.fn());
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      cancelable: true
    });
    containMobileDialogFocus(backward, dialog, vi.fn());
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    dialog.remove();
  });

  it("closes on Escape without moving focus through background controls", () => {
    const close = vi.fn();
    const dialog = document.createElement("section");
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });

    containMobileDialogFocus(escape, dialog, close);

    expect(escape.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });
});
