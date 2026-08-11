import { invoke } from "@tauri-apps/api/core";
import {
  createDesktopMediaSourceGateway,
  type MediaSourceGateway
} from "../platform/media-source-gateway";
import type {
  NarrationPreparationAdapter,
  NarrationPreparationRequest,
  PreparedNarration
} from "@sonelle/audio/narration";

type NativeManifestNarration = PreparedNarration;

type InvokeCommand = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
interface NativeManifestNarrationAdapterDependencies {
  invoke?: InvokeCommand;
  mediaSources?: MediaSourceGateway;
}

export function createNativeManifestNarrationAdapter(
  dependencies: NativeManifestNarrationAdapterDependencies = {}
): NarrationPreparationAdapter {
  const invokeCommand = dependencies.invoke ?? invoke;
  const mediaSources = dependencies.mediaSources ?? createDesktopMediaSourceGateway();

  return {
    async prepare(
      request: NarrationPreparationRequest,
      signal?: AbortSignal
    ): Promise<PreparedNarration> {
      throwIfAborted(signal);
      const narration = await abortable(
        invokeCommand<NativeManifestNarration>("prepare_manifest_narration", { request }),
        signal,
        () => {
          void invokeCommand("cancel_manifest_narration", { requestId: request.requestId }).catch(
            () => undefined
          );
        }
      );
      throwIfAborted(signal);

      const resolved = mediaSources.resolve({
        kind: "prepared-narration",
        source: narration.sourceUrl
      });
      if (resolved.status !== "available") {
        throw new Error("Prepared narration is not available to play.");
      }
      return { ...narration, sourceUrl: resolved.url };
    }
  };
}

function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void
): Promise<T> {
  if (signal == null) return operation;
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Narration preparation cancelled.", "AbortError");
}
