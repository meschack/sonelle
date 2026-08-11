import { invoke } from "@tauri-apps/api/core";
import { reportAppError } from "../platform/error-reporting";
import { isTauriRuntime } from "../platform/tauri-runtime";
import {
  createDesktopMediaSourceGateway,
  type MediaSourceGateway
} from "../platform/media-source-gateway";
import {
  type LegacyNarrationGateway,
  type NarrationPlaybackMode,
  type SentenceNarration
} from "@sonelle/audio/compatibility";

interface NarrationDevelopmentErrorContext {
  stage: "prepare" | "playback" | "prefetch" | "stop";
  sentenceId: string;
  voiceId: string;
  playbackMode?: NarrationPlaybackMode | "manifest" | null;
}

export function createNarrationRepository(
  mediaSources: MediaSourceGateway = createDesktopMediaSourceGateway()
): LegacyNarrationGateway {
  return isTauriRuntime()
    ? createNativeNarrationRepository(mediaSources)
    : unavailableNarrationRepository;
}

const unavailableNarrationRepository: LegacyNarrationGateway = {
  async prepareSentenceAudio() {
    throw new Error("Narration is available in the desktop app.");
  },
  async playPreparedSentenceAudio() {
    throw new Error("Narration is available in the desktop app.");
  },
  async stopPreparedSentenceAudio() {}
};

function createNativeNarrationRepository(mediaSources: MediaSourceGateway): LegacyNarrationGateway {
  return {
    async prepareSentenceAudio(request) {
      const narration = await invoke<SentenceNarration>("prepare_sentence_audio", { request });
      const resolved = mediaSources.resolve({
        kind: "prepared-narration",
        source: narration.sourceUrl
      });
      return {
        ...narration,
        sourceUrl: resolved.status === "available" ? resolved.url : null
      };
    },

    async playPreparedSentenceAudio(request, narration) {
      if (narration.playbackMode === "native-speech") {
        await invoke("play_sentence_audio", { request });
      }
    },

    async stopPreparedSentenceAudio() {
      await invoke("stop_sentence_audio");
    }
  };
}

export function toFriendlyNarrationError(error: unknown): string {
  const message = diagnosticErrorMessage(error).toLocaleLowerCase();
  if (message.includes("download") || message.includes("network")) {
    return "We couldn't download narration files. Check your connection and try again.";
  }
  if (message.includes("catalog") || message.includes("verify")) {
    return "We couldn't verify the offline narration files. Please try again.";
  }
  if (message.includes("files changed")) {
    return "Narration files changed. Please try again.";
  }
  if (message.includes("cancel")) return "Narration preparation was cancelled.";

  return "Narration needs attention. Please try again.";
}

export function reportNarrationError(error: unknown, context: NarrationDevelopmentErrorContext) {
  void reportAppError(`audio.${context.stage}`, error, [context]);
}

function diagnosticErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Unknown narration error";
}
