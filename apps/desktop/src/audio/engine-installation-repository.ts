import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../platform/tauri-runtime";

export type NarrationEngineId = "kokoro" | "supertonic";
export type EngineInstallationReadiness =
  "not-installed" | "preparing" | "ready" | "failed" | "unavailable";

export interface EngineInstallationState {
  engineId: NarrationEngineId;
  status: EngineInstallationReadiness;
  modelRevision: string;
  downloadSizeBytes: number;
  downloadedBytes: number;
  progress: number | null;
  message: string;
}

interface NativeEngineInstallationStatus {
  engineId: NarrationEngineId;
  status: "not-installed" | "ready" | "unavailable";
  modelRevision: string;
  downloadSizeBytes: number;
  message: string;
}

export interface EngineInstallationProgressDto {
  engineId: NarrationEngineId;
  status: "downloading" | "installing" | "preparing" | "ready";
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
}

export interface EngineInstallationRepository {
  getStatus(engineId: NarrationEngineId): Promise<EngineInstallationState>;
  install(engineId: NarrationEngineId): Promise<EngineInstallationState>;
  listen(onProgress: (state: EngineInstallationState) => void): Promise<UnlistenFn>;
}

export function createEngineInstallationRepository(): EngineInstallationRepository {
  return isTauriRuntime()
    ? nativeEngineInstallationRepository
    : browserEngineInstallationRepository;
}

const nativeEngineInstallationRepository: EngineInstallationRepository = {
  async getStatus(engineId) {
    return fromNativeStatus(
      await invoke<NativeEngineInstallationStatus>("get_narration_engine_status", { engineId })
    );
  },

  async install(engineId) {
    return fromNativeStatus(
      await invoke<NativeEngineInstallationStatus>("install_narration_engine", { engineId })
    );
  },

  listen(onProgress) {
    return listen<EngineInstallationProgressDto>(
      "narration-engine-installation-progress",
      ({ payload }) => {
        onProgress(projectEngineInstallationProgress(payload));
      }
    );
  }
};

const browserEngineInstallationRepository: EngineInstallationRepository = {
  async getStatus(engineId) {
    return readyBrowserEngine(engineId);
  },
  async install(engineId) {
    return readyBrowserEngine(engineId);
  },
  async listen() {
    return () => undefined;
  }
};

export function failedEngineInstallation(
  engineId: NarrationEngineId,
  message: string
): EngineInstallationState {
  return {
    engineId,
    status: "failed",
    modelRevision: "",
    downloadSizeBytes: 0,
    downloadedBytes: 0,
    progress: null,
    message
  };
}

export function projectEngineInstallationProgress(
  payload: EngineInstallationProgressDto
): EngineInstallationState {
  return {
    engineId: payload.engineId,
    status: payload.status === "ready" ? "ready" : "preparing",
    modelRevision: "",
    downloadSizeBytes: payload.totalBytes,
    downloadedBytes: payload.downloadedBytes,
    progress: payload.progress,
    message: payload.message
  };
}

function fromNativeStatus(status: NativeEngineInstallationStatus): EngineInstallationState {
  return {
    ...status,
    downloadedBytes: 0,
    progress: status.status === "ready" ? 100 : null
  };
}

function readyBrowserEngine(engineId: NarrationEngineId): EngineInstallationState {
  return {
    engineId,
    status: "ready",
    modelRevision: `${engineId}-browser`,
    downloadSizeBytes: 0,
    downloadedBytes: 0,
    progress: 100,
    message: "Ready to listen offline."
  };
}
