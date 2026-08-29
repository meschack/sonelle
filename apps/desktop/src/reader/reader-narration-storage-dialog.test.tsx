// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReaderNarrationStorageDialog } from "./reader-narration-storage-dialog";

function mountDialog(overrides: { busy?: boolean; onConfirm?: () => void; onCancel?: () => void }) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(
    () => (
      <ReaderNarrationStorageDialog
        title="Remove prepared audio?"
        body="This removes listening files for this book. The book, bookmarks, and reading position stay safe."
        confirmAction={overrides.busy ? "Remove audio" : "Remove audio"}
        cancelAction="Keep audio"
        busy={overrides.busy ?? false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ),
    container
  );
  return {
    container,
    onConfirm,
    onCancel,
    confirm: (label = "Remove audio") =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === label
      )!,
    cancel: () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === "Keep audio"
      )!,
    dispose() {
      dispose();
      container.remove();
    }
  };
}

describe("narration storage confirmation dialog", () => {
  it("renders an accessible confirmation with preservation copy and initial focus", async () => {
    const harness = mountDialog({});

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("narration-storage-dialog-title");
    expect(document.getElementById("narration-storage-dialog-title")?.textContent).toBe(
      "Remove prepared audio?"
    );
    expect(dialog?.textContent).toContain("The book, bookmarks, and reading position stay safe.");
    await Promise.resolve();
    expect(document.activeElement).toBe(harness.confirm());
    expect(harness.onConfirm).not.toHaveBeenCalled();

    harness.dispose();
  });

  it("confirms through the confirm action only", () => {
    const harness = mountDialog({});

    harness.confirm().click();

    expect(harness.onConfirm).toHaveBeenCalledTimes(1);
    expect(harness.onCancel).not.toHaveBeenCalled();

    harness.dispose();
  });

  it("cancels through the cancel action, Escape, and backdrop dismissal", () => {
    const harness = mountDialog({});

    harness.cancel().click();
    expect(harness.onCancel).toHaveBeenCalledTimes(1);

    document.body
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(harness.onCancel).toHaveBeenCalledTimes(2);

    document.body
      .querySelector(".quote-image-backdrop")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(harness.onCancel).toHaveBeenCalledTimes(3);
    expect(harness.onConfirm).not.toHaveBeenCalled();

    harness.dispose();
  });

  it("keeps the dialog settled while removal is running", () => {
    const harness = mountDialog({ busy: true });

    const removing = harness.confirm("Removing\u2026");
    expect(removing.disabled).toBe(true);
    expect(harness.cancel().disabled).toBe(true);

    removing.click();
    harness.cancel().click();
    expect(harness.onConfirm).not.toHaveBeenCalled();
    expect(harness.onCancel).not.toHaveBeenCalled();

    harness.dispose();
  });

  it("restores focus to the previously focused element when removed", () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    anchor.focus();
    expect(document.activeElement).toBe(anchor);

    const harness = mountDialog({});
    expect(document.activeElement).not.toBe(anchor);
    harness.dispose();
    expect(document.activeElement).toBe(anchor);
    anchor.remove();
  });
});
