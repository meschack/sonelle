import { describe, expect, it, vi } from "vitest";
import { createAndroidAppLifecycleGateway } from "./app-lifecycle-gateway";

describe("Android app lifecycle gateway", () => {
  it("reports only background visibility changes and removes its listener", () => {
    let visibilityState: DocumentVisibilityState = "visible";
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const visibilityDocument = {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener(_name: string, listener: EventListenerOrEventListenerObject) {
        listeners.add(listener);
      },
      removeEventListener(_name: string, listener: EventListenerOrEventListenerObject) {
        listeners.delete(listener);
      }
    } as unknown as Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
    const backgrounded = vi.fn();
    const stop =
      createAndroidAppLifecycleGateway(visibilityDocument).listenForBackground(backgrounded);
    const notify = () => {
      for (const listener of listeners) {
        if (typeof listener === "function") listener(new Event("visibilitychange"));
        else listener.handleEvent(new Event("visibilitychange"));
      }
    };

    notify();
    expect(backgrounded).not.toHaveBeenCalled();
    visibilityState = "hidden";
    notify();
    expect(backgrounded).toHaveBeenCalledOnce();

    stop();
    notify();
    expect(backgrounded).toHaveBeenCalledOnce();
  });
});
