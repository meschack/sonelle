# 0035: Android-First Mobile Architecture

## Status

Accepted.

## Context

Sonelle's mobile app must preserve the local-first reading experience without creating a second
implementation of book import, normalized text, sentence highlighting, progress, bookmarks, search,
and narration state. The existing Solid reader and Rust book domain already express those behaviors,
but the desktop shell also contains filesystem, media, lifecycle, and narration assumptions that do
not transfer directly to a phone.

Starting Android and iOS together would multiply those platform uncertainties before the shared
architecture has been proven. Starting with a native Kotlin reader would duplicate the reader before
there is evidence that the existing WebView reader is the performance bottleneck. Using only Android
system voices would reduce model weight, but it would also make Sonelle's normal narration quality
depend on whichever voices a device happens to provide.

## Decision

Sonelle will prove the mobile architecture on Android first. The initial Android app uses Tauri 2 as
the shell around the existing Solid reader and shared Rust book domain.

The following remain shared:

- EPUB extraction, safe structure interpretation, and normalized sentence text;
- library storage behavior and migrations for books, chapters, search, bookmarks, and reading
  positions;
- reader behavior, including chapter navigation, word selection, and sentence-level highlighting;
- narration, import, and playback domain events and the projections derived from them;
- engine-independent interfaces for book import, media sources, narration, and platform playback
  controls;
- prepared-audio identity and sentence-span manifests.

Android adapters own the platform-sensitive edges:

- document selection and copying an EPUB into Sonelle-controlled storage;
- application data locations, safe local media access, and mobile capability configuration;
- audio focus, foreground playback, media sessions, lock-screen controls, and headset or Bluetooth
  actions;
- interruption, background, and process-lifecycle integration;
- installation and execution of mobile-compatible offline narration artifacts behind the shared
  narration interface.

The phone UI uses a mobile composition around shared reader content: a full-screen reader, contextual
sheets, and a compact narration dock. It does not compress the desktop rails into a narrow viewport,
and shared reader components do not branch on Android, an inference engine, filesystem paths, or
native media APIs.

Quantized Supertonic 3 is the standard mobile offline narration pack, subject to the Android device,
listening, pronunciation, redistribution, memory, thermal, battery, and performance gates. The pack
is installed on demand and verified before it becomes ready to listen. Prepared audio remains the
playback authority, and its sentence spans come from the exact model artifact that generated it.

Android system voices are an explicit reader choice for devices or situations where the Sonelle
offline voice is unsuitable. Failure of the standard offline voice never silently switches the
reader to a device voice. Kokoro may become an optional additional English voice pack only if a
separate mobile benchmark and listening gate accepts a quantized artifact.

## Continuation Gates

Tauri remains the Android shell only when release builds on the named midrange and lower-cost
baseline devices satisfy all of the following:

- scripted reader scrolling has a 95th-percentile frame time at or below 16.7 ms;
- reader controls visibly respond within 100 ms under the reading stress case;
- a persisted book opens and changes chapter within 400 ms at the 95th percentile for the large-book
  corpus;
- prepared narration hands off between sentences or passages without an audible or visual gap above
  250 ms at the 95th percentile;
- a 60-minute reading and listening run reaches stable memory, remains within the accepted thermal
  and battery budgets, and does not lose the book or playback position;
- import stays off the reader interaction path, and background, lock-screen, headset, Bluetooth,
  interruption, pause, resume, and recovery scenarios pass on both devices.

A failed gate must first be traced to its owning boundary. Import, storage, model inference, audio
playback, or lifecycle failures are adapter problems unless measurements identify the shared WebView
reader or its interaction model as the blocker.

Sonelle will replace the Android reader shell with native Kotlin UI only when the measured blocker is
the WebView reader, bounded rendering and adapter work cannot meet the gate, and the native fallback
continues to share the Rust book domain and engine-independent behavior. Framework reputation or a
preference for native aesthetics is not sufficient evidence.

iOS implementation begins only after the Android core flow passes these gates, the Tauri continuation
decision is recorded, and suitable macOS/Xcode build infrastructure is available. The Android result
may validate the shared domain and interfaces, but iOS still requires its own platform adapters and
device evidence.

## Consequences

- Android provides one bounded proving ground before Sonelle accepts the cost of a second mobile
  platform.
- Existing reading behavior can improve once for desktop and mobile while platform mechanics remain
  replaceable at the edge.
- The base application stays smaller because offline voices are downloaded only when requested, at
  the cost of a first-use installation and substantial on-device model storage.
- A native Android reader remains a deliberate fallback rather than an architectural fork created in
  advance.
- Android and desktop may use different model artifacts or platform integrations while preserving the
  same narration lifecycle and sentence-level playback contract.

## Intentionally Deferred

- iOS implementation before Android proves the architecture;
- cloud sync or automatic desktop-to-phone library transfer;
- word-level narration timing or highlighting;
- full parity with every desktop power tool;
- shared-file intents and file associations as first-release blockers;
- remote narration, voice cloning, social features, marketplaces, and DRM integrations.

## Related Decisions and Plan

- [0001: Sentence-Level Narration Highlighting](0001-sentence-highlighting.md)
- [0003: Application Base](0003-application-base.md)
- [0012: Native Performance Boundaries](0012-native-performance-boundaries.md)
- [0015: In-App Offline Voice Installation](0015-in-app-voice-installation.md)
- [0016: Hybrid Local Narration](0016-hybrid-local-narration.md)
- [Mobile Platform Plan](../plans/mobile-platform.md)
