import { isAndroidRuntime } from "./tauri-runtime";

export interface AppLifecycleGateway {
  listenForBackground(listener: () => void): () => void;
}

export function createAppLifecycleGateway(): AppLifecycleGateway {
  return isAndroidRuntime() ? createAndroidAppLifecycleGateway() : noopAppLifecycleGateway;
}

export function createAndroidAppLifecycleGateway(
  visibilityDocument: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  > = document
): AppLifecycleGateway {
  return {
    listenForBackground(listener) {
      const handleVisibilityChange = () => {
        if (visibilityDocument.visibilityState === "hidden") listener();
      };
      visibilityDocument.addEventListener("visibilitychange", handleVisibilityChange);
      return () =>
        visibilityDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };
}

const noopAppLifecycleGateway: AppLifecycleGateway = {
  listenForBackground() {
    return () => undefined;
  }
};
