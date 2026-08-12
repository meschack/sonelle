import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  ANDROID_DEVICE_VOICE_PREFIX,
  isAndroidDeviceVoiceId,
  type NarrationVoice
} from "@sonelle/audio";
import { isAndroidRuntime, isTauriRuntime } from "../platform/tauri-runtime";

interface NativeAndroidDeviceVoice {
  name: string;
  label: string;
  locale: string;
  networkRequired: boolean;
}

export interface AndroidDeviceVoice extends NarrationVoice {
  nativeName: string;
  networkRequired: boolean;
}

export interface AndroidDeviceSpeechRequest {
  utteranceId: string;
  text: string;
  voiceId: string;
  locale: string;
  playbackRate: number;
  volume: number;
}

export interface AndroidDeviceVoiceRepository {
  list(): Promise<readonly AndroidDeviceVoice[]>;
  speak(request: AndroidDeviceSpeechRequest): Promise<void>;
  stop(): Promise<void>;
}

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function createAndroidDeviceVoiceRepository(
  options: { invoke?: InvokeCommand; available?: boolean } = {}
): AndroidDeviceVoiceRepository {
  const invoke = options.invoke ?? tauriInvoke;
  const available = options.available ?? (isTauriRuntime() && isAndroidRuntime());

  return {
    async list() {
      if (!available) return [];
      const voices = (await invoke("list_android_device_voices")) as NativeAndroidDeviceVoice[];
      return voices.map(projectDeviceVoice).sort(compareDeviceVoices);
    },
    async speak(request) {
      if (!available) throw new Error("Android device voices are unavailable on this platform.");
      const voiceName = nativeDeviceVoiceName(request.voiceId);
      await invoke("speak_android_device_sentence", {
        request: {
          utteranceId: request.utteranceId,
          text: request.text,
          voiceName,
          locale: request.locale,
          playbackRate: request.playbackRate,
          volume: request.volume
        }
      });
    },
    async stop() {
      if (available) await invoke("stop_android_device_voice");
    }
  };
}

export function deviceVoiceId(nativeName: string): string {
  return `${ANDROID_DEVICE_VOICE_PREFIX}${encodeURIComponent(nativeName)}`;
}

function nativeDeviceVoiceName(voiceId: string): string {
  if (!isAndroidDeviceVoiceId(voiceId)) {
    throw new Error("The selected narration voice is not an Android device voice.");
  }
  return decodeURIComponent(voiceId.slice(ANDROID_DEVICE_VOICE_PREFIX.length));
}

export { isAndroidDeviceVoiceId };

function projectDeviceVoice(voice: NativeAndroidDeviceVoice): AndroidDeviceVoice {
  return {
    id: deviceVoiceId(voice.name),
    nativeName: voice.name,
    label: `${voice.label} — device voice`,
    locale: voice.locale,
    description: voice.networkRequired
      ? "Provided by this device · may use a network connection"
      : "Provided by this device · works offline",
    networkRequired: voice.networkRequired
  };
}

function compareDeviceVoices(left: AndroidDeviceVoice, right: AndroidDeviceVoice): number {
  return (
    Number(left.networkRequired) - Number(right.networkRequired) ||
    left.locale.localeCompare(right.locale) ||
    left.label.localeCompare(right.label)
  );
}
