import { normalizeLanguageCode } from "@sonelle/domain";
import type { NarrationEngineId, NarrationPreparationKind } from "./narration-contracts";

export interface NarrationEngineRoute {
  engineId: NarrationEngineId;
  preparationKind: NarrationPreparationKind;
  language: string;
}

export type NarrationRoutingMode = "legacy-piper" | "hybrid-v1" | "mobile-supertonic-v1";

export interface NarrationRoutingOptions {
  mode?: NarrationRoutingMode;
}

const supertonicLanguages = new Set([
  "ar",
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "es",
  "et",
  "fi",
  "fr",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "lt",
  "lv",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "tr",
  "uk",
  "vi"
]);

export function routeNarrationEngine(
  language: string | null | undefined,
  options: NarrationRoutingOptions = {}
): NarrationEngineRoute {
  if (options.mode === "legacy-piper") {
    return { engineId: "piper", preparationKind: "sentence-batch", language: "en" };
  }

  const normalizedLanguage = normalizeLanguageCode(language);
  if (options.mode === "mobile-supertonic-v1") {
    return {
      engineId: "supertonic",
      preparationKind: "sentence-batch",
      language:
        normalizedLanguage === "en" ||
        (normalizedLanguage != null && supertonicLanguages.has(normalizedLanguage))
          ? normalizedLanguage
          : "na"
    };
  }
  if (normalizedLanguage === "en") {
    return { engineId: "kokoro", preparationKind: "passage", language: "en" };
  }

  return {
    engineId: "supertonic",
    preparationKind: "sentence-batch",
    language:
      normalizedLanguage != null && supertonicLanguages.has(normalizedLanguage)
        ? normalizedLanguage
        : "na"
  };
}

export function isSupertonicLanguage(language: string): boolean {
  return language === "na" || supertonicLanguages.has(language);
}
