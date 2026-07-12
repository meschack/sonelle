import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type VoiceInstallationReadiness = "not-installed" | "preparing" | "ready" | "failed";

export interface VoiceInstallationState {
  voiceId: string;
  status: VoiceInstallationReadiness;
  downloadSizeBytes: number;
  progress: number | null;
  message: string;
}

interface NativeVoiceInstallationStatus {
  voiceId: string;
  status: "not-installed" | "ready";
  downloadSizeBytes: number;
  message: string;
}

interface NativeVoiceInstallationProgress {
  voiceId: string;
  status: "downloading" | "installing" | "preparing" | "ready";
  progress: number | null;
  message: string;
}

export interface VoiceInstallationRepository {
  getStatus(voiceId: string): Promise<VoiceInstallationState>;
  install(voiceId: string): Promise<VoiceInstallationState>;
  listen(onProgress: (state: VoiceInstallationState) => void): Promise<UnlistenFn>;
}

export function createVoiceInstallationRepository(): VoiceInstallationRepository {
  return isTauriRuntime() ? nativeVoiceInstallationRepository : browserVoiceInstallationRepository;
}

const nativeVoiceInstallationRepository: VoiceInstallationRepository = {
  async getStatus(voiceId) {
    return fromNativeStatus(
      await invoke<NativeVoiceInstallationStatus>("get_narration_voice_status", { voiceId })
    );
  },

  async install(voiceId) {
    return fromNativeStatus(
      await invoke<NativeVoiceInstallationStatus>("install_narration_voice", { voiceId })
    );
  },

  listen(onProgress) {
    return listen<NativeVoiceInstallationProgress>(
      "narration-voice-installation-progress",
      ({ payload }) => {
        onProgress({
          voiceId: payload.voiceId,
          status: payload.status === "ready" ? "ready" : "preparing",
          downloadSizeBytes: 0,
          progress: payload.progress,
          message: payload.message
        });
      }
    );
  }
};

const browserVoiceInstallationRepository: VoiceInstallationRepository = {
  async getStatus(voiceId) {
    return readyBrowserVoice(voiceId);
  },
  async install(voiceId) {
    return readyBrowserVoice(voiceId);
  },
  async listen() {
    return () => undefined;
  }
};

export function failedVoiceInstallation(voiceId: string, message: string): VoiceInstallationState {
  return {
    voiceId,
    status: "failed",
    downloadSizeBytes: 0,
    progress: null,
    message
  };
}

function fromNativeStatus(status: NativeVoiceInstallationStatus): VoiceInstallationState {
  return {
    ...status,
    progress: status.status === "ready" ? 100 : null
  };
}

function readyBrowserVoice(voiceId: string): VoiceInstallationState {
  return {
    voiceId,
    status: "ready",
    downloadSizeBytes: 0,
    progress: 100,
    message: "Ready to listen offline."
  };
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
