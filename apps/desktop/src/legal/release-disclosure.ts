import sonelleLicense from "./sonelle-mit.txt?raw";
import supertonicCodeLicense from "./supertonic-code-mit.txt?raw";
import supertonicModelLicense from "./supertonic-model-openrail-m.txt?raw";
import releaseScope from "./android-release-scope.json";

export const androidReleaseScope = releaseScope;

export const releasePrivacyStatements = [
  {
    title: "Your library stays on this device",
    body: "Sonelle stores imported books, reading progress, bookmarks, and prepared narration locally. Sonelle does not upload your books or reading activity."
  },
  {
    title: "Voice downloads are deliberate",
    body: "Offline voice files are downloaded only after you choose to install them. Sonelle verifies those files before using them, and offline narration is machine-generated audio."
  },
  {
    title: "Diagnostics are yours to share",
    body: "Sonelle writes bounded error diagnostics locally when something fails. They are never uploaded automatically; review them before sharing."
  },
  {
    title: "Device voices remain separate",
    body: "This build does not activate an Android device-provided voice. A future device-voice option must tell you whether the selected speech engine requires a network connection before any book text is sent to it."
  }
] as const;

export const sonelleReleaseNotice = {
  title: "Sonelle",
  summary: "Sonelle is released under the MIT License.",
  source: "https://github.com/meschack/sonelle",
  license: sonelleLicense
} as const;

export const standardOfflineVoiceNotices = [
  {
    title: "Supertonic integration",
    summary:
      "Sonelle's Supertonic integration is based on Supertone Inc.'s MIT-licensed sample code.",
    source:
      "https://github.com/supertone-inc/supertonic/tree/dff55dc00064c398736080c78195f577527832ae",
    license: supertonicCodeLicense
  },
  {
    title: "Supertonic 3 model",
    summary:
      "The downloadable Supertonic 3 model is licensed under OpenRAIL-M. Its use restrictions apply, and generated narration is machine-generated audio.",
    source:
      "https://huggingface.co/Supertone/supertonic-3/tree/3cadd1ee6394adea1bd021217a0e650ede09a323",
    license: supertonicModelLicense
  }
] as const;
