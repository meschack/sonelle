import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  FakeNarrationGateway,
  type NarrationGateway,
  type SentenceNarration
} from "@sonelle/audio";

export function createNarrationRepository(): NarrationGateway {
  return isTauriRuntime() ? nativeNarrationRepository : new FakeNarrationGateway();
}

const nativeNarrationRepository: NarrationGateway = {
  async prepareSentenceAudio(request) {
    const narration = await invoke<SentenceNarration>("prepare_sentence_audio", { request });
    return {
      ...narration,
      sourceUrl: narration.sourceUrl == null ? null : convertFileSrc(narration.sourceUrl, "asset")
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

export function toFriendlyNarrationError(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;

  return "Narration needs attention. Please try again.";
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
