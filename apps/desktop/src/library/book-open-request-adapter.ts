import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../platform/tauri-runtime";
import type { BookOpenRequestAdapter } from "./library-contracts";

const bookOpenRequestedEvent = "book-open-requested";

interface NativeBookOpenRequestBridge {
  listen(onSignal: () => void): Promise<() => void>;
  takePending(): Promise<string[]>;
}

interface BookOpenRequestAdapterOptions {
  bridge?: NativeBookOpenRequestBridge;
  reportError?(error: unknown): void;
}

export function createBookOpenRequestAdapter(
  options: BookOpenRequestAdapterOptions = {}
): BookOpenRequestAdapter {
  const bridge = options.bridge ?? (isTauriRuntime() ? nativeBookOpenRequestBridge : null);
  if (bridge == null) return unavailableBookOpenRequestAdapter;

  return {
    async listen(onPath) {
      let stopped = false;
      let delivery = Promise.resolve();
      const reportError = (error: unknown) => {
        try {
          options.reportError?.(error);
        } catch {
          // Diagnostics must not break delivery of later book requests.
        }
      };
      const drain = async () => {
        try {
          const paths = await bridge.takePending();
          for (const path of paths) {
            delivery = delivery.then(async () => {
              if (stopped) return;
              try {
                await onPath(path);
              } catch (error) {
                reportError(error);
              }
            });
          }
          await delivery;
        } catch (error) {
          reportError(error);
        }
      };

      let stopListening: () => void = () => undefined;
      try {
        stopListening = await bridge.listen(() => void drain());
      } catch (error) {
        reportError(error);
      }
      await drain();

      return () => {
        stopped = true;
        stopListening();
      };
    }
  };
}

const nativeBookOpenRequestBridge: NativeBookOpenRequestBridge = {
  async listen(onSignal) {
    return listen(bookOpenRequestedEvent, onSignal);
  },
  takePending() {
    return invoke<string[]>("take_pending_book_open_requests");
  }
};

const unavailableBookOpenRequestAdapter: BookOpenRequestAdapter = {
  async listen() {
    return () => undefined;
  }
};
