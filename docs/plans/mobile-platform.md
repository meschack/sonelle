# Mobile Platform Plan

## Status

Approved for the Android proof. Architecture is governed by
[decision 0035](../decisions/0035-android-first-mobile-architecture.md).

## Purpose

Extend Sonelle to mobile without duplicating its reader, book, and playback behavior. The mobile app must remain local-first, reader-first, and responsive on real devices. Performance is a release requirement, not a pleasant surprise that may or may not arrive after launch.

## Recommendation

Build an Android-first mobile proof using Tauri 2, the existing Solid renderer, and native mobile adapters for platform-sensitive work.

Keep the following shared:

- TypeScript domain packages for reader, text, library, audio contracts, and learning.
- Rust EPUB extraction, storage model, and command-facing use cases where they can run on mobile.
- Reader behavior: sentence-level highlighting, chapter navigation, progress, bookmarks, search, and word selection.
- The event and projection model already used for import, playback position, and narration state.

Implement the following with mobile-native code:

- Android document selection and copying a chosen EPUB into the application sandbox.
- Android audio focus, media controls, background playback, and lifecycle integration in Kotlin.
- Mobile-compatible on-device narration behind the shared native narration boundary.
- iOS platform equivalents in Swift only when the Android proof permits iOS work to begin.

Quantized Supertonic 3 is the standard mobile offline narration pack, subject to device,
listening, pronunciation, redistribution, memory, thermal, battery, and performance acceptance. It
is installed on demand and verified before use. Android device voices are an explicit fallback for
readers who choose them; Sonelle never silently substitutes one when its offline voice needs
attention. Kokoro remains an optional additional English voice only if a separate Android benchmark
accepts a quantized artifact.

Tauri remains the mobile shell only while it passes the real-device performance gates in this plan. A native Kotlin reader is the fallback for Android only if that evidence says the shared WebView reader cannot meet the product bar. Flutter, Expo, and React Native are not fallback choices merely because they sound more mobile; they would require a UI rewrite without guaranteeing that the product-specific bottlenecks disappear.

## Why This Fits Sonelle

The repository is already prepared for Tauri mobile targets:

- `apps/desktop/src-tauri/Cargo.toml` builds a shared library as well as the desktop binary.
- `apps/desktop/src-tauri/src/lib.rs` has the mobile entry point.
- The renderer already limits the visible sentence range for large chapters.
- The product modules were intentionally split so storage, import, audio, and reader behavior can have platform adapters.

The desktop implementation is not automatically mobile-ready. In particular:

- The desktop Kokoro and Supertonic artifacts and native runtime are not automatically suitable for
  mobile storage, memory, CPU, thermal, battery, or packaging constraints.
- EPUB import currently expects a desktop-style path and supports drag and drop.
- Desktop asset URLs assume app-data paths and the desktop asset protocol.
- The three-column reader shell is a desktop workspace, not a phone layout.

## Product Shape on Mobile

The reader remains the primary surface. A phone should not attempt to squeeze the desktop rails into a narrow screen.

| Desktop surface      | Mobile equivalent                                       |
| -------------------- | ------------------------------------------------------- |
| Library rail         | Library and table-of-contents sheet                     |
| Reader surface       | Full-screen reader                                      |
| Inspector rail       | Contextual sheet for word, search, bookmarks, and tools |
| Bottom playback rail | Compact playback dock with an expandable control sheet  |

Mobile interaction requirements:

- Tapping a word opens a definition without disturbing the reading position or narration.
- Chapter navigation remains available from the reader header or a sheet.
- Playback keeps sentence-level highlighting only. Word-level timing remains out of scope.
- Reader controls have touch-sized targets and do not cover the active passage.
- The app restores the reader and playback state appropriately after an interruption or return from the background.

## Architecture Boundary

```mermaid
flowchart TB
  domain["Shared domain packages\nreader, text, library, learning"]
  reader["Shared reader behavior\nsentence highlight and playback intent"]
  desktop["Desktop adapters\nmodel packs, file paths, desktop media"]
  mobile["Android adapters\ndocument picker, media session, lifecycle"]
  narration["Mobile offline narration\nverified Supertonic pack and prepared audio"]
  desktopUi["Desktop Solid shell\nrails and workspace"]
  mobileUi["Mobile Solid shell\nreader, sheets, playback dock"]

  domain --> reader
  reader --> desktop
  reader --> mobile
  reader --> narration
  reader --> desktopUi
  reader --> mobileUi
```

The reader UI must depend on small narration and book-library interfaces. It must not know which
model prepared an audio file, whether the reader explicitly chose a device voice, or whether a book
arrived through a desktop path or Android document URI.

### Proposed Platform Interfaces

| Interface             | Owns                                                                | Desktop adapter                                 | Mobile adapter                                                                              |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `BookImportGateway`   | Selecting, copying, and opening an EPUB source                      | Dialog plus path import and drag/drop           | Android document picker plus sandbox copy; share and file-association entry points later    |
| `LibraryStore`        | Local book, chapter, bookmark, position, and search persistence     | Current SQLite store                            | Mobile-safe SQLite and app-data location, verified on device                                |
| `NarrationGateway`    | Preparing, starting, stopping, and reporting sentence narration     | Current verified model packs and prepared audio | Verified Supertonic pack and prepared audio; explicitly selected device voice as a fallback |
| `MediaSessionGateway` | Background playback, audio focus, lock screen, and headset controls | Desktop audio behavior                          | Android media session and foreground playback; later, iOS audio and now-playing controls    |
| `MediaSourceGateway`  | Safe URLs for cover and prepared-audio media                        | Desktop asset protocol                          | Mobile-safe local media source or native playback handle                                    |

The narration interface must report one stable lifecycle to the reader:

- narration is ready or needs attention
- the sentence starts
- the sentence completes or fails
- playback stops or is interrupted

The reader uses those events to update sentence highlighting and advance playback. It does not
branch on Android, iOS, Supertonic, Kokoro, audio files, or device voice APIs.

### Mobile Offline Narration

The standard offline voice is not bundled into the base application. Sonelle downloads its pinned
artifacts only when a reader asks for offline narration. The narration module owns the manifest,
temporary download, integrity verification, compatibility check, atomic installation, and removal.
The UI sees only the download size and whether narration is being prepared, ready to listen, or
needs attention.

Prepared narration is reusable after restart and in airplane mode. Its identity includes normalized
text, voice, speed, model artifact revision, quantization format, and preparation revision. Sentence
spans are derived from the exact output that produced the audio; timings from desktop or a different
mobile artifact are never reused.

`NarrationGateway` owns audio preparation and emits the shared narration lifecycle. Bounded
lookahead may prepare the upcoming passage while the current passage plays. `MediaSessionGateway`
owns Android playback survival and external controls; it does not synthesize speech, choose voices,
or mutate sentence highlighting. Background preparation, if later required, must be represented as
explicit narration work rather than smuggled into a media-session callback.

The first mobile adapter starts quantized inference on the CPU for consistent behavior. Android
acceleration is evaluated only when the CPU path misses a gate, because model partitioning and
provider support vary by device. Exactly one model runtime is kept active at a time, and memory is
released when the active narration configuration no longer needs it.

## Delivery Phases

### Phase 0: Define the Benchmark Contract

Goal: decide what "fast enough" means before framework preference turns into religion.

Work:

- Choose two Android baseline devices: one midrange and one lower-cost device representative of the intended audience.
- Select a representative EPUB corpus: a small book, a large book with long chapters, and a book with a cover and complex navigation metadata.
- Record release-build metrics, never dev-server impressions.
- Add a device QA worksheet for startup, import, reading, model installation and load, narration
  preparation, interruption, background playback, memory, thermal behavior, battery use, and resume.

Exit criteria:

- Baseline devices and test books are named.
- Metric capture is repeatable.
- The team agrees that measured results, not framework reputation, decide whether Tauri proceeds.

### Phase 1: Mobile Boot and Capability Setup

Goal: run the existing app on an Android device with no feature redesign yet.

Work:

- Initialize the Android Tauri target and mobile capability configuration.
- Confirm the Rust shared library and mobile entry point build correctly.
- Add a mobile capability file rather than granting desktop permissions indiscriminately.
- Run the fixture reader on a physical device and establish release-build profiling tools.
- Document Android SDK, emulator, and real-device development commands.

Exit criteria:

- The fixture reader launches on a physical Android device.
- The app can be profiled in a release-like build.
- No desktop-only capability is assumed to work on mobile.

### Phase 2: Platform Seams Before Product Work

Goal: make desktop behavior explicit adapters rather than accidental assumptions in shared code.

Work:

- Move path selection, media URL creation, narration implementation, and platform-specific lifecycle behavior behind the proposed interfaces.
- Keep the existing desktop adapters working and covered by their current tests.
- Replace broad runtime checks with adapter composition at the application boundary.
- Add fake mobile adapters for interface-level tests before native code exists.

Exit criteria:

- Reader and library UI can execute against desktop, fake, or mobile adapters without platform checks scattered through components.
- Import, playback position, and narration projections remain driven by domain events.
- Desktop regression checks still pass.

### Phase 3: Android Local Library Vertical Slice

Goal: prove a real EPUB can become a durable, readable mobile book.

Work:

- Implement Android document selection and copy the selected EPUB into Sonelle-controlled storage.
- Adapt the Rust importer and SQLite store to the mobile app-data directory; resolve any mobile build or filesystem limitations here.
- Replace desktop-only cover and audio source assumptions with the media-source interface.
- Implement mobile import states and resume reading from saved position.
- Add a mobile entry point for receiving a shared EPUB later, but do not make it a release blocker.

Exit criteria:

- A user imports each representative EPUB on-device.
- Imported books survive app restart.
- Chapter navigation, search, bookmarks, and reading position work against the real mobile store.
- Import never freezes the reader surface.

### Phase 4: Offline Narration and Background Playback

Goal: make listening dependable in the ways users notice immediately.

Work:

- Benchmark the pinned quantized Supertonic pack on the baseline Android devices before production
  integration.
- Run the listening and pronunciation corpus against desktop and mobile output.
- Install and verify the accepted pack on demand without adding it to the base application bundle.
- Implement on-device preparation behind `NarrationGateway`, preserving exact sentence spans and
  prepared-audio identity.
- Reuse prepared narration after restart and in airplane mode, and prepare only bounded lookahead.
- Configure audio focus, media session controls, headset and Bluetooth actions, and foreground playback as required by Android.
- Offer a compatible Android device voice only when a reader explicitly chooses that fallback.
- Handle interruption, pause, stop, headset disconnect, app backgrounding, and return-to-app states.
- Keep sentence highlighting, preparation intent, and playback progression independent from the
  selected narration adapter and Android media session.

Exit criteria:

- Playback advances sentence by sentence without stale highlights or double advancement.
- The accepted Supertonic pack meets the model load, narration preparation, memory, thermal, battery,
  listening, and pronunciation gates on both devices.
- Prepared narration remains playable after restart and in airplane mode.
- The app can continue, pause, and resume narration correctly from the lock screen and background.
- A user can recover from an interrupted voice session without reopening the book.

### Phase 5: Mobile Reader Shell

Goal: present the shared reader behavior in a touch-first layout.

Work:

- Introduce `DesktopReaderShell` and `MobileReaderShell` compositions around shared reader content.
- Implement the library/table-of-contents sheet, tools sheet, compact header, and playback dock.
- Preserve a stable reading column and avoid layout shifts when sheets, word insight, or playback state changes.
- Add touch and accessibility behavior: focus order, screen-reader labels, dynamic text sizing, safe-area padding, and minimum target sizes.

Exit criteria:

- A reader can complete the core mobile flow without encountering a desktop rail.
- Active narration, word insight, and playback controls never cover the current sentence incoherently.
- Desktop layout remains unchanged apart from shared component extraction where needed.

### Phase 6: Reliability and Release Readiness

Goal: turn a successful demo into a trustworthy local reader.

Work:

- Test cold launch, warm launch, background/foreground transitions, low-storage behavior, and process recovery.
- Test long reading and listening sessions with the representative EPUB corpus.
- Test pack installation, integrity failure, removal, model switching, prepared-audio reuse, and
  cache invalidation after an artifact revision changes.
- Add Android crash reporting and privacy-preserving local diagnostics only after the core flow is stable.
- Prepare Play Store packaging, privacy disclosure, icon assets, signing, and release workflow.
- Repeat the same plan for iOS only after Android passes its performance gate and macOS/Xcode build infrastructure is available.

Exit criteria:

- Android passes the performance and reliability gates below.
- A release checklist has manual device evidence, not just emulator screenshots.
- The team has an explicit go/no-go decision for iOS and for continuing with Tauri.

## Performance and Reliability Gates

These targets apply to release builds on both baseline Android devices. Exact tooling can vary, but every result must include device model, OS version, book, and build version.

| Area                  | Gate                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reader scroll         | 95th percentile frame time at or below 16.7ms during a scripted reading scroll; no sustained jank while the active sentence changes                                     |
| Input response        | Tap feedback and reader controls visibly respond within 100ms under the reading stress case                                                                             |
| Book open             | Persisted-book open and chapter switch complete within 400ms at the 95th percentile for the large-book corpus                                                           |
| Import                | Import runs off the UI path; the app remains responsive, and the completed book opens without an avoidable second parse                                                 |
| Model installation    | An interrupted, corrupt, incompatible, or low-storage installation never becomes ready; verified installation survives restart and airplane mode                        |
| Model load            | Cold and warm load remain within the device-specific budget recorded before integration; loading never blocks reader interaction or leaves two engines resident         |
| Narration preparation | Warm preparation remains faster than playback for the accepted corpus and bounded lookahead; sentence spans match the exact generated audio                             |
| Narration handoff     | Ready narration changes sentences with no audible or visual gap above 250ms at the 95th percentile                                                                      |
| Background narration  | Lock-screen, headset, Bluetooth, interruption, pause, resume, and app return pass manually on both devices                                                              |
| Memory                | A 60-minute reading/listening run reaches a stable memory range and does not trigger a process kill, progressive slowdown, or lost position                             |
| Thermal and battery   | The 60-minute session stays within the named device's accepted thermal and battery budgets without sustained throttling                                                 |
| Reliability           | No data loss for imported books, bookmarks, reading position, verified voice packs, or compatible prepared narration across normal restart and recoverable interruption |

## Tauri Continuation Gate

Continue with the Tauri mobile shell only when all of the following are true:

- The Android proof slice meets the performance and reliability gates.
- The WebView reader remains smooth with the real large-book corpus.
- Native adapters provide reliable narration and background playback.
- Mobile import and local storage work without broad filesystem permissions or fragile path assumptions.

If any gate fails, first isolate the cause. A slow importer or a poor TTS lifecycle is an adapter problem, not automatic proof that the renderer must be replaced.

Choose a native Android reader only when the measured blocker is specifically the shared WebView reader or its interaction model, and the issue cannot be fixed through rendering limits, component structure, or native adapter boundaries. That fallback means Kotlin UI on Android and a later SwiftUI implementation on iOS, with a deliberate plan for sharing Rust core logic. It is a costly fork, not a casual optimization.

## Testing Strategy

| Layer                   | Coverage                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared packages         | Existing unit tests plus adapter-contract tests for import, narration lifecycle, media source, and media-session behavior                               |
| Rust core               | EPUB extraction, storage migrations, search, bookmarks, reading position, pack verification, prepared-audio identity, sentence spans, and mobile paths  |
| Mobile narration        | Pinned real-model tests for load, preparation, exact sentence spans, interruption, artifact revisions, and runtime release                              |
| Native Android adapters | Instrumented tests for document import, device-voice fallback, audio focus, media session, background playback, and lifecycle transitions               |
| Mobile renderer         | Component tests for reader and sheet transitions, voice readiness, recovery actions, and accessibility labels                                           |
| Device QA               | Release-build runs against representative books, voice packs, backgrounding, lock screen, Bluetooth, interruption, low storage, and process reclamation |
| Performance             | Repeatable scripted runs with frame, latency, model load, preparation, handoff, memory, thermal, battery, import, and book-open measurements            |

## Explicitly Out of Scope for the First Mobile Release

- Cloud sync or automatic desktop-to-phone library transfer.
- iOS implementation before Android proves the architecture.
- Word-level audio highlighting.
- Full parity for every desktop power tool before the mobile core flow is trustworthy.
- Bundling a large offline narration pack into the base application.
- Silently falling back to a device voice when Sonelle's offline narration needs attention.
- A platform rewrite based on aesthetics or framework fashion rather than benchmark evidence.
- Marketplace, social, DRM, or remote-TTS dependencies.

## Deliverables

- Android build and device setup documentation.
- Mobile capability configuration and a platform adapter module map.
- Android EPUB import, local storage, verified offline narration, media session, and lifecycle
  adapters.
- A pinned mobile voice-pack manifest, on-demand installation, prepared-audio reuse, and measured
  Supertonic acceptance report.
- Shared reader interfaces with desktop, mobile, and fake implementations.
- Mobile Solid reader shell and touch-first sheets.
- Device QA worksheet, representative EPUB corpus, and captured performance results.
- A decision record confirming either Tauri mobile continuation or a native-UI fallback after the proof slice.

## Review Questions

Resolve these before Phase 1 begins:

1. Which two real Android devices define the minimum acceptable experience?
2. Which Android versions and processor architectures define the supported release range?
3. Is a separate local library on each device acceptable for the first mobile release?
4. Which Supertonic voice styles should ship in the standard mobile pack after listening QA?
5. Must shared EPUB links and file associations ship in the first release, or can document picking launch first?
6. What model-load, thermal, and battery budgets should the device benchmark contract enforce?
