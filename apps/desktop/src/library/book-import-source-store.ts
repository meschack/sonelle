import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  BookImportPreparationProgress,
  BookImportSourceStore,
  PreparedBookImportSource
} from "./library-contracts";

interface NativeCopyProgress {
  requestId: string;
  completedBytes: number;
  totalBytes: number | null;
}

type InvokeCommand = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
interface ProgressChannel<T> {
  readonly onmessage?: (message: T) => void;
}
interface BookImportSourceStoreDependencies {
  invoke?: InvokeCommand;
  createProgressChannel?: (
    onMessage: (progress: NativeCopyProgress) => void
  ) => ProgressChannel<NativeCopyProgress>;
}

export function createBookImportSourceStore(
  dependencies: BookImportSourceStoreDependencies = {}
): BookImportSourceStore {
  const invokeCommand = dependencies.invoke ?? invoke;
  const createProgressChannel =
    dependencies.createProgressChannel ??
    ((onMessage: (progress: NativeCopyProgress) => void) => new Channel(onMessage));
  return {
    async prepare(source, options) {
      throwIfAborted(options.signal);
      const onProgress = createProgressChannel((progress) => {
        if (progress.requestId !== options.requestId) return;
        options.onProgress(toPreparationProgress(progress));
      });
      const operation = invokeCommand<PreparedBookImportSource>("copy_book_import_source", {
        request: { requestId: options.requestId, source },
        onProgress
      });
      return abortable(operation, options.signal, () => {
        void invokeCommand("cancel_book_import_source_copy", {
          requestId: options.requestId
        }).catch(() => undefined);
      });
    }
  };
}

function toPreparationProgress(progress: NativeCopyProgress): BookImportPreparationProgress {
  return {
    completedBytes: progress.completedBytes,
    totalBytes: progress.totalBytes
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
  return signal.reason ?? new DOMException("Book import was cancelled.", "AbortError");
}
