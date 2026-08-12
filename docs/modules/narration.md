# Narration

## Owns

- language-aware routing to Kokoro for English and Supertonic for other supported languages
- versioned passage requests, manifests, sentence spans, cache identity, and playback sessions
- bounded native ONNX runtime construction, cancellation, and installed narration-file packs
- compatibility projection for legacy Piper sentence audio while that rollback path remains available
- resumable whole-book preparation and per-chapter cache summaries
- low-storage preflight and safe narration-only cleanup policy
- reproducible, explicitly unaccepted mobile-model candidates for device benchmarking

## Refuses To Own

- reader navigation, Solid state, bookmarks, or reading-position persistence
- EPUB parsing and sentence segmentation
- word-level timing or approximate sentence highlighting
- approving a mobile model without physical-device and listening evidence

## Interface

`@sonelle/audio` exposes settings and voice selection. `@sonelle/audio/narration` exposes the stable
manifest, routing, preparation, player, and session contracts. `@sonelle/audio/compatibility` keeps
Piper and legacy prefetch behavior out of the primary API; `@sonelle/audio/testing` contains fakes.

The desktop native adapter sends `ManifestNarrationRequest` values through Tauri. Installed engine
packs are verified by size and SHA-256 before either provider can render. Kokoro prepares English
passages with exact sentence spans. Its text boundary uses Misaki for dictionary and contextual
phonemization, then an embedded pure-Rust predictor for genuine unknown English words; hyphenated
compounds retain one spoken phrase while short initialisms remain spelled. Supertonic renders
supported non-English sentences into one manifest-backed WAV. Both providers reuse bounded native
sessions and accept terminable run options.

The mobile candidate tool transforms the exact pinned Supertonic snapshot into a dynamic QInt8
artifact set behind an ignored local catalog. Its manifest remains `candidate-not-accepted`; the
production catalog cannot discover it implicitly. Candidate identity includes every measured size
and SHA-256, and native synthesis must pass before the tool publishes the directory.

The session keeps three contextual Kokoro passages prepared. Supertonic groups at most two ordinary
sentences per passage and keeps two passages prepared, while one reusable runtime and one ONNX thread
bound CPU pressure. Long internally split sentences retain the provider's single-sentence path.
Upcoming-chapter preparation uses the same limits and is cancelled when reader context changes.
Whole-book preparation uses deterministic passage identities through the same adapter, runs
sequentially, and resumes from completed cached passages after cancellation or failure.

Prepared native paths cross `MediaSourceGateway` before reaching playback. Narration modules receive
an available renderer URL or a missing/invalid outcome; they never construct Tauri asset-protocol
URLs or depend on application-data directory layout.

Language-pack voices are projected only after their provider files report ready. Installation
updates refresh the current book's voice field immediately; the UI does not poll provider state.

The narration storage-maintenance module is the policy seam for mobile storage adapters. It checks
manifest download requirements against available space while retaining a post-install reserve.
Resumable staging counts toward bytes already present. Cleanup approves only a typed
prepared-audio book identity or verified voice-pack identity; books, bookmarks, settings, and
reading positions are absent from its interface. Prepared audio in an active listening session is
protected, and a selected voice pack must be replaced before it can be removed. Both cleanup paths
require explicit confirmation.

## Domain Events

The published lifecycle includes `NarrationPlaybackRequested`, `NarrationPreparationStarted`,
`PassageNarrationReady`, `NarrationSentenceEntered`, `PassageNarrationPlaybackEnded`,
`NarrationPlaybackPaused`, `NarrationPlaybackEnded`, `NarrationPlaybackFailed`,
`NarrationResetRequested`, and the upcoming-chapter preparation events.

Reader projections react synchronously to these facts. Narration events are not written to SQLite,
so storage latency cannot enter playback control flow.

Prepared-audio maintenance is scoped to the active book. Manifest assets persist their book and
chapter ownership; cached manifests from older builds acquire that ownership when reused without
regenerating audio. The legacy Piper rollback cache records a small book-ownership sidecar when an
entry is prepared or reused. Stats and clearing exclude unowned legacy entries rather than
misrepresenting library-wide data as belonging to the open book.

Voice and narration-file installation use requested, progress, ready, and failed facts.
`NarrationSettingsChanged` coordinates settings reactions through the same in-process dispatcher.
Whole-book preparation publishes requested, progressed, ready, cancelled, and failed facts. Session
limits publish changed and reached facts.

Narration settings are persisted by book. `ReaderOpened` carries the book language and activates
that book's saved voice, speed, volume, and auto-advance profile before playback activation. The
legacy global profile remains the fallback for books without an explicit profile.

## Invariants

- highlighted sentence spans must come from the prepared manifest; timing is never guessed
- cache identity includes engine, model revision, provider preparation revision, voice, source
  digest, and synthesis parameters
- cancellation prevents stale preparation from becoming current playback
- a playback run accepts manifest sentence-entry callbacks once and in reading order; duplicate,
  reordered, incomplete, failed, stopped, and post-completion callbacks cannot advance projection
- provider thread counts and ONNX allocator settings remain bounded
- user-facing errors describe recovery, not engine or queue internals
- narration cleanup cannot address reader-library storage, and cannot remove active narration assets
- a host-compatible mobile candidate is not an accepted offline voice pack

## Tests

Package tests cover routing, identity, sessions, cancellation, lookahead, and compatibility. The
session suite includes an adversarial player that duplicates and reorders callbacks, emits after
completion or failure, and resolves a stop while more callbacks are pending. Reader workflow tests
cover preparation events, settings reactions, reset, and cross-chapter prefetch. Native tests cover
pack verification, cache writes, provider input validation, manifests, and cancellation. The
release-candidate provider smoke installs local packs and runs real Kokoro and Supertonic inference
sequentially with one ONNX thread per provider.
Storage-maintenance tests cover resumable-install space accounting, insufficient-space recovery,
confirmation, verified-pack boundaries, active playback, and narrow narration-only deletion.
The mobile-candidate suite covers deterministic identity, catalog projection, corruption, and the
standard-pack size gate; candidate preparation additionally runs real native synthesis.
