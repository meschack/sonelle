import { normalizeLanguageCode, type NarrationSettingsSnapshot } from "@sonelle/domain";
import narrationVoiceConfig from "./narration-voices.json";

export interface NarrationVoice {
  id: string;
  label: string;
  locale: string;
  description: string;
}

export interface AudioSettings extends NarrationSettingsSnapshot {}

interface SerializedAudioSettingsV2 extends AudioSettings {
  schemaVersion: 2;
}

export const DEFAULT_NARRATION_VOICE_ID = narrationVoiceConfig.defaultVoiceId;
export const ANDROID_DEVICE_VOICE_PREFIX = "android-device:";

export const NARRATION_PLAYBACK_RATES = [0.75, 0.9, 1, 1.25, 1.5] as const;

export const SUPPORTED_NARRATION_VOICES =
  narrationVoiceConfig.voices satisfies readonly NarrationVoice[];

export const HYBRID_NARRATION_VOICES = [
  {
    id: "kokoro:af-heart",
    label: "American Female",
    locale: "en-US",
    description: "Kokoro English narration"
  },
  {
    id: "kokoro:bf-emma",
    label: "English Female",
    locale: "en-GB",
    description: "Kokoro British English narration"
  },
  {
    id: "supertonic:F1",
    label: "Multilingual Female",
    locale: "*",
    description: "Supertonic fallback narration"
  },
  {
    id: "supertonic:M1",
    label: "Multilingual Male",
    locale: "*",
    description: "Supertonic fallback narration"
  }
] satisfies readonly NarrationVoice[];

const SELECTABLE_NARRATION_VOICES = [
  ...SUPPORTED_NARRATION_VOICES,
  ...HYBRID_NARRATION_VOICES
] satisfies readonly NarrationVoice[];

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  playbackRate: 0.9,
  volume: 1.2,
  voiceId: DEFAULT_NARRATION_VOICE_ID,
  voicePreferences: { en: DEFAULT_NARRATION_VOICE_ID },
  autoAdvance: true
};

export function createAudioSettings(input: Partial<AudioSettings> = {}): AudioSettings {
  const voiceId = normalizeNarrationVoiceId(input.voiceId);
  return {
    playbackRate: clampPlaybackRate(input.playbackRate ?? DEFAULT_AUDIO_SETTINGS.playbackRate),
    volume: clampVolume(input.volume ?? DEFAULT_AUDIO_SETTINGS.volume),
    voiceId,
    voicePreferences: normalizeVoicePreferences(input.voicePreferences, voiceId),
    autoAdvance:
      typeof input.autoAdvance === "boolean"
        ? input.autoAdvance
        : DEFAULT_AUDIO_SETTINGS.autoAdvance
  };
}

export function cycleNarrationPlaybackRate(currentRate: number, direction: -1 | 1): number {
  const currentIndex = NARRATION_PLAYBACK_RATES.findIndex(
    (rate) => Math.abs(rate - currentRate) < Number.EPSILON
  );
  if (currentIndex >= 0) {
    const nextIndex =
      (currentIndex + direction + NARRATION_PLAYBACK_RATES.length) %
      NARRATION_PLAYBACK_RATES.length;
    return NARRATION_PLAYBACK_RATES[nextIndex];
  }

  const directionalRates =
    direction > 0 ? NARRATION_PLAYBACK_RATES : [...NARRATION_PLAYBACK_RATES].reverse();
  return (
    directionalRates.find((rate) => (direction > 0 ? rate > currentRate : rate < currentRate)) ??
    directionalRates[0]
  );
}

export function serializeAudioSettings(settings: AudioSettings): string {
  const normalized = createAudioSettings(settings);
  const serialized: SerializedAudioSettingsV2 = { schemaVersion: 2, ...normalized };
  return JSON.stringify(serialized);
}

export function parseAudioSettings(value: string | null): AudioSettings {
  if (value == null) return DEFAULT_AUDIO_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<SerializedAudioSettingsV2> | null;
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_AUDIO_SETTINGS;
    }
    if (parsed.schemaVersion != null && parsed.schemaVersion !== 2) {
      return DEFAULT_AUDIO_SETTINGS;
    }
    return createAudioSettings(parsed);
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function selectNarrationVoicePreference(
  settings: AudioSettings,
  language: string | null | undefined,
  voiceId: string
): AudioSettings {
  const normalizedVoiceId = normalizeNarrationVoiceId(voiceId);
  const languageCode = normalizeLanguageCode(language) ?? "*";
  return createAudioSettings({
    ...settings,
    voiceId: normalizedVoiceId,
    voicePreferences: {
      ...settings.voicePreferences,
      [languageCode]: normalizedVoiceId
    }
  });
}

export function activateAudioSettingsForLanguage(
  settings: AudioSettings,
  language: string | null | undefined
): AudioSettings {
  const languageCode = normalizeLanguageCode(language);
  const preferredVoiceId =
    (languageCode == null
      ? settings.voicePreferences["*"]
      : settings.voicePreferences[languageCode]) ?? settings.voicePreferences["*"];
  const voiceId = resolveNarrationVoiceForLanguage(language, preferredVoiceId ?? settings.voiceId);
  return createAudioSettings({ ...settings, voiceId });
}

export function hybridNarrationVoicesForLanguage(
  language: string | null | undefined
): readonly NarrationVoice[] {
  const enginePrefix = normalizeLanguageCode(language) === "en" ? "kokoro:" : "supertonic:";
  return HYBRID_NARRATION_VOICES.filter((voice) => voice.id.startsWith(enginePrefix));
}

export function resolveHybridNarrationVoiceForLanguage(
  language: string | null | undefined,
  currentVoiceId: string
): string {
  if (isAndroidDeviceVoiceId(currentVoiceId)) return currentVoiceId;
  const availableVoices = hybridNarrationVoicesForLanguage(language);
  if (availableVoices.some((voice) => voice.id === currentVoiceId)) return currentVoiceId;

  if (normalizeLanguageCode(language) === "en") {
    return currentVoiceId.toLocaleLowerCase().includes("gb") ? "kokoro:bf-emma" : "kokoro:af-heart";
  }

  return currentVoiceId.toLocaleLowerCase().includes("male") || currentVoiceId.endsWith(":M1")
    ? "supertonic:M1"
    : "supertonic:F1";
}

export function activateHybridAudioSettingsForLanguage(
  settings: AudioSettings,
  language: string | null | undefined
): AudioSettings {
  const languageCode = normalizeLanguageCode(language) ?? "*";
  const preferredVoiceId =
    settings.voicePreferences[languageCode] ?? settings.voicePreferences["*"] ?? settings.voiceId;
  const voiceId = resolveHybridNarrationVoiceForLanguage(language, preferredVoiceId);
  return createAudioSettings({
    ...settings,
    voiceId,
    voicePreferences: { ...settings.voicePreferences, [languageCode]: voiceId }
  });
}

export function isSupportedNarrationVoiceId(voiceId: string): boolean {
  return (
    SELECTABLE_NARRATION_VOICES.some((voice) => voice.id === voiceId) ||
    isAndroidDeviceVoiceId(voiceId)
  );
}

export function isAndroidDeviceVoiceId(voiceId: string): boolean {
  return (
    voiceId.startsWith(ANDROID_DEVICE_VOICE_PREFIX) &&
    voiceId.length > ANDROID_DEVICE_VOICE_PREFIX.length
  );
}

export function narrationVoiceLabel(voiceId: string): string {
  if (isAndroidDeviceVoiceId(voiceId)) return "Device voice";
  return (
    SELECTABLE_NARRATION_VOICES.find((voice) => voice.id === voiceId)?.label ??
    SUPPORTED_NARRATION_VOICES[0].label
  );
}

export function resolveNarrationVoiceForLanguage(
  language: string | null | undefined,
  currentVoiceId: string
): string {
  const languageCode = normalizeLanguageCode(language);
  const currentVoice = SELECTABLE_NARRATION_VOICES.find((voice) => voice.id === currentVoiceId);
  if (languageCode == null || currentVoice == null) return currentVoiceId;

  const currentVoiceLanguage = normalizeLanguageCode(currentVoice.locale);
  if (currentVoice.locale === "*") return currentVoiceId;
  if (currentVoiceLanguage === languageCode) return currentVoiceId;

  const exactLocaleVoice = SUPPORTED_NARRATION_VOICES.find(
    (voice) => normalizeLocale(voice.locale) === normalizeLocale(language)
  );
  if (exactLocaleVoice != null) return exactLocaleVoice.id;

  return (
    SUPPORTED_NARRATION_VOICES.find((voice) => normalizeLanguageCode(voice.locale) === languageCode)
      ?.id ?? DEFAULT_NARRATION_VOICE_ID
  );
}

function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_AUDIO_SETTINGS.playbackRate;
  return Math.min(1.5, Math.max(0.75, rate));
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_AUDIO_SETTINGS.volume;
  return Math.min(1.5, Math.max(0, volume));
}

function normalizeNarrationVoiceId(voiceId: string | undefined): string {
  if (voiceId != null && isSupportedNarrationVoiceId(voiceId)) return voiceId;
  return DEFAULT_AUDIO_SETTINGS.voiceId;
}

function normalizeVoicePreferences(
  preferences: Readonly<Record<string, string>> | undefined,
  activeVoiceId: string
): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {};
  for (const [language, voiceId] of Object.entries(preferences ?? {})) {
    if (!isSupportedNarrationVoiceId(voiceId)) continue;
    const languageCode = language === "*" ? "*" : normalizeLanguageCode(language);
    if (languageCode == null) continue;
    const voice = SELECTABLE_NARRATION_VOICES.find((candidate) => candidate.id === voiceId);
    if (
      languageCode !== "*" &&
      voice?.locale !== "*" &&
      normalizeLanguageCode(voice?.locale) !== normalizeLanguageCode(languageCode)
    ) {
      continue;
    }
    normalized[languageCode] = voiceId;
  }

  const activeVoice = SELECTABLE_NARRATION_VOICES.find((voice) => voice.id === activeVoiceId);
  const languageCode = normalizeLanguageCode(activeVoice?.locale) ?? "*";
  if (normalized[languageCode] == null) {
    normalized[languageCode] = activeVoiceId;
  }
  return normalized;
}

function normalizeLocale(language: string | null | undefined): string | null {
  if (language == null) return null;
  const locale = language.trim().toLocaleLowerCase().replace(/_/gu, "-");
  return locale.length > 0 ? locale : null;
}
