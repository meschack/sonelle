import {
  createDomainEventDispatcher,
  normalizeLanguageCode,
  type DomainEventDispatcher
} from "@sonelle/domain";
import { createNoopMediaSessionGateway, type MediaSessionGateway } from "@sonelle/reader";
import {
  activateAudioSettingsForLanguage,
  activateHybridAudioSettingsForLanguage,
  hybridNarrationVoicesForLanguage,
  isAndroidDeviceVoiceId,
  SUPPORTED_NARRATION_VOICES,
  type AudioSettings,
  type NarrationVoice
} from "@sonelle/audio";
import {
  createNarrationSession as createManifestNarrationSession,
  prepareNarrationBook,
  type NarrationGateway,
  type NarrationBookPreparationProgress,
  type NarrationRoutingMode,
  type NarrationPreparationAdapter
} from "@sonelle/audio/narration";
import {
  createPrefetchingNarrationGateway,
  PiperCompatibilityAdapter,
  type LegacyPrefetchingNarrationGateway
} from "@sonelle/audio/compatibility";
import {
  createAudioCacheRepository,
  type AudioCacheRepository
} from "../audio/audio-cache-repository";
import {
  createAudioSettingsRepository,
  type AudioSettingsRepository
} from "../audio/audio-settings-repository";
import { createHtmlAudioPlayer } from "../audio/html-audio-player";
import { createHtmlManifestNarrationPlayer } from "../audio/html-manifest-narration-player";
import { reportAppError } from "../platform/error-reporting";
import { createAndroidMediaSessionGateway } from "../platform/android-media-session-gateway";
import {
  createExternalLinkOpener,
  type ExternalLinkOpener
} from "../platform/external-link-opener";
import {
  createAppWindowController,
  type AppWindowController
} from "../platform/app-window-controller";
import {
  createEngineInstallationRepository,
  type EngineInstallationRepository,
  type EngineInstallationState,
  type NarrationEngineId
} from "../audio/engine-installation-repository";
import { createNativeManifestNarrationAdapter } from "../audio/native-manifest-narration-adapter";
import {
  createAndroidDeviceVoiceRepository,
  type AndroidDeviceVoice
} from "../audio/android-device-voice-repository";
import { createNarrationRepository } from "../audio/narration-repository";
import {
  createVoiceInstallationRepository,
  type VoiceInstallationRepository
} from "../audio/voice-installation-repository";
import {
  createDictionaryRepository,
  type DictionaryRepository
} from "../learning/dictionary-repository";
import {
  type BookCatalog,
  type BookDropAdapter,
  type BookOpenRequestAdapter,
  type BookExporter,
  type BookImportGateway,
  type BookImportSourceStore,
  type BookMetadataEditor,
  type BookmarkStore,
  type LibrarySearch,
  type ReadingPositionStore
} from "../library/library-contracts";
import type { ReaderDocumentDto } from "../library/library-models";
import { createBookCatalog } from "../library/book-catalog";
import { createBookDropAdapter } from "../library/book-drop-adapter";
import { createBookOpenRequestAdapter } from "../library/book-open-request-adapter";
import { createBookExporter } from "../library/book-exporter";
import { createBookImportGateway } from "../library/book-import-gateway";
import { createBookImportSourceStore } from "../library/book-import-source-store";
import { createBookMetadataEditor } from "../library/book-metadata-editor";
import { createBookmarkStore } from "../library/bookmark-store";
import { createLibrarySearch } from "../library/library-search";
import { createReadingPositionStore } from "../library/reading-position-store";
import {
  createAppLifecycleGateway,
  type AppLifecycleGateway
} from "../platform/app-lifecycle-gateway";
import { isAndroidRuntime, isTauriRuntime } from "../platform/tauri-runtime";
import { createSystemFontCatalog, type SystemFontCatalog } from "../platform/system-font-catalog";
import { createPlatformMediaSourceGateway } from "../platform/media-source-gateway";
import {
  createReaderShellViewport,
  type ReaderShellViewport
} from "../platform/reader-shell-viewport";
import { createQuoteImageExporter, type QuoteImageExporter } from "./reader-quote-image";
import {
  createReaderPreferencesRepository,
  type ReaderPreferencesRepository
} from "./reader-preferences-repository";
import {
  createDesktopNarrationGateway,
  type DesktopNarrationGatewayOptions
} from "./reader-narration-workflow";
import { createReaderNarrationPrefetchWorkflow } from "./reader-narration-prefetch-workflow";
import { buildReaderViewFromDocument } from "./reader-view";
import { createReaderNarrationSessionChapter } from "./reader-narration";
import {
  createAndroidDeviceNarrationGateway,
  routeNarrationGateway
} from "./android-device-narration-gateway";

export interface ReaderBookNarrationIdentity {
  voiceId: string;
  modelRevision: string;
}

export interface ReaderNarrationService {
  capabilities: {
    offlineLibrary: "individual-voice" | "language-pack";
    preparesAcrossChapters: boolean;
  };
  activateSettings(settings: AudioSettings, language: string | null): AudioSettings;
  voices(language: string | null): readonly NarrationVoice[];
  refreshVoices?(language: string | null): Promise<readonly NarrationVoice[]>;
  observeEngineInstallation(installation: EngineInstallationState): void;
  createGateway(
    options: Omit<DesktopNarrationGatewayOptions, "engineInstallations">
  ): NarrationGateway;
  bookIdentity(document: ReaderDocumentDto, voiceId: string): ReaderBookNarrationIdentity | null;
  prepareBook(
    document: ReaderDocumentDto,
    voiceId: string,
    options: {
      signal?: AbortSignal;
      onProgress(progress: NarrationBookPreparationProgress): void;
    }
  ): Promise<{ sentenceCount: number }>;
}

export interface ReaderExperienceDependencies {
  appLifecycle: AppLifecycleGateway;
  appWindow: AppWindowController;
  audioCacheRepository: AudioCacheRepository;
  audioSettingsRepository: AudioSettingsRepository;
  bookCatalog: BookCatalog;
  bookDropAdapter: BookDropAdapter;
  bookOpenRequestAdapter: BookOpenRequestAdapter;
  bookExporter: BookExporter;
  bookImportGateway: BookImportGateway;
  bookImportSourceStore: BookImportSourceStore;
  bookMetadataEditor: BookMetadataEditor;
  bookmarkStore: BookmarkStore;
  dictionaryRepository: DictionaryRepository;
  engineInstallationRepository: EngineInstallationRepository;
  eventDispatcher: DomainEventDispatcher;
  externalLinkOpener: ExternalLinkOpener;
  fontCatalog: SystemFontCatalog;
  librarySearch: LibrarySearch;
  mediaSession: MediaSessionGateway;
  narration: ReaderNarrationService;
  quoteImageExporter: QuoteImageExporter;
  readerShellViewport: ReaderShellViewport;
  readerPreferencesRepository: ReaderPreferencesRepository;
  readingPositionStore: ReadingPositionStore;
  voiceInstallationRepository: VoiceInstallationRepository;
}

export function createReaderExperienceDependencies(): ReaderExperienceDependencies {
  const eventDispatcher = createDomainEventDispatcher();
  const mediaSources = createPlatformMediaSourceGateway();
  const htmlAudioPlayer = createHtmlAudioPlayer();
  const narrationRepository = createPrefetchingNarrationGateway(
    createNarrationRepository(mediaSources)
  );
  const narrationSessionRoutingMode = resolveDevelopmentNarrationSessionRoutingMode(
    import.meta.env.VITE_SONELLE_NARRATION_SESSION
  );
  const narrationPreparationAdapter = createNarrationPreparationAdapterForMode(
    narrationSessionRoutingMode,
    narrationRepository,
    { createNativeAdapter: () => createNativeManifestNarrationAdapter({ mediaSources }) }
  );
  const bookCatalog = createBookCatalog(mediaSources);
  const usesLanguagePacks = narrationSessionRoutingMode === "hybrid-v1";
  const engineInstallations: Partial<Record<NarrationEngineId, EngineInstallationState>> = {};
  const deviceVoices = createAndroidDeviceVoiceRepository();
  let availableDeviceVoices: readonly AndroidDeviceVoice[] = [];
  const voicesForLanguage = (language: string | null): readonly NarrationVoice[] => {
    const sonelleVoices = usesLanguagePacks
      ? availableHybridNarrationVoicesForLanguage(language, engineInstallations)
      : SUPPORTED_NARRATION_VOICES;
    const languageCode = normalizeLanguageCode(language);
    const matchingDeviceVoices = availableDeviceVoices.filter(
      (voice) => languageCode == null || normalizeLanguageCode(voice.locale) === languageCode
    );
    return [...sonelleVoices, ...matchingDeviceVoices];
  };

  return {
    appLifecycle: createAppLifecycleGateway(),
    appWindow: createAppWindowController(),
    audioCacheRepository: createAudioCacheRepository(),
    audioSettingsRepository: createAudioSettingsRepository(),
    bookCatalog,
    bookDropAdapter: createBookDropAdapter(),
    bookOpenRequestAdapter: createBookOpenRequestAdapter({
      reportError: (error) => void reportAppError("book-open-request.delivery", error)
    }),
    bookExporter: createBookExporter(mediaSources),
    bookImportGateway: createBookImportGateway(mediaSources),
    bookImportSourceStore: createBookImportSourceStore(),
    bookMetadataEditor: createBookMetadataEditor(mediaSources),
    bookmarkStore: createBookmarkStore(),
    dictionaryRepository: createDictionaryRepository(),
    engineInstallationRepository: createEngineInstallationRepository(),
    eventDispatcher,
    externalLinkOpener: createExternalLinkOpener(),
    fontCatalog: createSystemFontCatalog(),
    librarySearch: createLibrarySearch(),
    mediaSession: isAndroidRuntime()
      ? createAndroidMediaSessionGateway({
          reportError: (error) => void reportAppError("android.audio-focus", error)
        })
      : createNoopMediaSessionGateway(),
    narration: {
      capabilities: {
        offlineLibrary: usesLanguagePacks ? "language-pack" : "individual-voice",
        preparesAcrossChapters: usesLanguagePacks
      },
      activateSettings(settings, language) {
        return usesLanguagePacks
          ? activateHybridAudioSettingsForLanguage(settings, language)
          : activateAudioSettingsForLanguage(settings, language);
      },
      voices(language) {
        return voicesForLanguage(language);
      },
      async refreshVoices(language) {
        try {
          availableDeviceVoices = await deviceVoices.list();
        } catch (error) {
          availableDeviceVoices = [];
          void reportAppError("android-device-voice.list", error);
        }
        return voicesForLanguage(language);
      },
      observeEngineInstallation(installation) {
        engineInstallations[installation.engineId] = installation;
      },
      createGateway(options) {
        const session = createManifestNarrationSession({
          adapter: narrationPreparationAdapter,
          player: createHtmlManifestNarrationPlayer(htmlAudioPlayer),
          eventDispatcher,
          onEventError: reportEventFailure,
          onError: (error) => options.reportError(error, "playback", "unknown")
        });
        const prefetchWorkflow = createReaderNarrationPrefetchWorkflow({
          adapter: narrationPreparationAdapter,
          eventDispatcher,
          repository: bookCatalog,
          routingMode: narrationSessionRoutingMode,
          engineInstallations: () => engineInstallations
        });
        const sonelleGateway = createDesktopNarrationGateway(
          {
            eventDispatcher,
            prefetchWorkflow,
            routingMode: narrationSessionRoutingMode,
            session
          },
          { ...options, engineInstallations: () => engineInstallations }
        );
        const deviceGateway = createAndroidDeviceNarrationGateway(
          { eventDispatcher, repository: deviceVoices },
          options
        );
        return routeNarrationGateway(sonelleGateway, deviceGateway, () =>
          isAndroidDeviceVoiceId(options.currentSettings().voiceId)
        );
      },
      bookIdentity(document, voiceId) {
        if (isAndroidDeviceVoiceId(voiceId)) return null;
        const chapter = document.chapters[0];
        if (chapter == null) return null;
        const sessionChapter = createReaderNarrationSessionChapter(
          buildReaderViewFromDocument(document, { chapterId: chapter.id }),
          voiceId,
          narrationSessionRoutingMode,
          engineInstallations
        );
        return {
          voiceId: sessionChapter.voiceId,
          modelRevision: sessionChapter.modelRevision
        };
      },
      async prepareBook(document, voiceId, options) {
        if (isAndroidDeviceVoiceId(voiceId)) {
          throw new Error("Device voices read while the book is open.");
        }
        const chapters = document.chapters.map((chapter) =>
          createReaderNarrationSessionChapter(
            buildReaderViewFromDocument(document, { chapterId: chapter.id }),
            voiceId,
            narrationSessionRoutingMode,
            engineInstallations
          )
        );
        const result = await prepareNarrationBook(
          { adapter: narrationPreparationAdapter },
          { bookId: document.book.id, chapters },
          options
        );
        return { sentenceCount: result.sentenceCount };
      }
    },
    quoteImageExporter: createQuoteImageExporter(),
    readerShellViewport: createReaderShellViewport(),
    readerPreferencesRepository: createReaderPreferencesRepository(),
    readingPositionStore: createReadingPositionStore(),
    voiceInstallationRepository: createVoiceInstallationRepository()
  };
}

export function availableHybridNarrationVoicesForLanguage(
  language: string | null,
  installations: Partial<Record<NarrationEngineId, EngineInstallationState>>
): readonly NarrationVoice[] {
  const voices = hybridNarrationVoicesForLanguage(language);
  const engineId = voices[0]?.id.split(":", 1)[0] as NarrationEngineId | undefined;
  return engineId != null && installations[engineId]?.status === "ready" ? voices : [];
}

export function resolveDevelopmentNarrationSessionRoutingMode(mode: unknown): NarrationRoutingMode {
  return mode === "legacy-piper" ? mode : "hybrid-v1";
}

export function createNarrationPreparationAdapterForMode(
  routingMode: NarrationRoutingMode,
  narrationRepository: LegacyPrefetchingNarrationGateway,
  options: {
    nativeRuntime?: boolean;
    createNativeAdapter?: () => NarrationPreparationAdapter;
    createBrowserFallbackAdapter?: () => NarrationPreparationAdapter;
  } = {}
): NarrationPreparationAdapter {
  if (routingMode === "legacy-piper") return new PiperCompatibilityAdapter(narrationRepository);
  if (routingMode === "hybrid-v1") {
    const nativeRuntime = options.nativeRuntime ?? isTauriRuntime();
    if (nativeRuntime)
      return (options.createNativeAdapter ?? createNativeManifestNarrationAdapter)();
    return options.createBrowserFallbackAdapter?.() ?? unavailableNarrationPreparationAdapter;
  }
  return unavailableNarrationPreparationAdapter;
}

const unavailableNarrationPreparationAdapter: NarrationPreparationAdapter = {
  async prepare() {
    throw new Error("Narration is available in the desktop app.");
  }
};

function reportEventFailure(error: unknown) {
  void reportAppError("events.narration-reaction", error);
}
