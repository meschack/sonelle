# 0037: Platform Playback Through MediaSessionGateway

## Status

Accepted.

## Context

Android must publish now-playing information and respond to lock-screen, headset, Bluetooth, audio
focus, and interruption callbacks. Those mechanics do not belong in narration generation or Solid
reader state. Without a stable seam, native lifecycle details would spread through the playback
orchestrator and make desktop and mobile behavior diverge.

Sonelle highlights and navigates narration by sentence. It does not maintain one reliable,
book-wide audio timeline that could support arbitrary second-based seeking across prepared passages.

## Decision

`@sonelle/reader` owns `MediaSessionGateway`, the narrow seam between reader playback orchestration
and platform media-session adapters.

The playback orchestrator publishes a snapshot containing the current book, chapter, active
sentence, and playback status. It receives play, pause, stop, sentence-seek, headset, and
interruption intents from the gateway. Closing the reader or disposing playback clears the platform
session.

Platform seek actions move one sentence backward or forward. They use the same bounded reader jump
behavior as visible controls, preserving sentence-level highlighting and reading-position updates.
Arbitrary time-based seeking remains unavailable until Sonelle has a stable timeline that spans the
active narration session.

An interruption pauses playback. Sonelle resumes afterward only when playback was active before the
interruption and the platform explicitly permits automatic resumption. A user pause or stop clears
that pending resumption.

Disconnecting the active wired or Bluetooth output is not a resumable interruption. The platform
adapter emits `output-disconnected`; the playback application pauses without changing the active
sentence and clears any pending automatic resume. Reconnection never resumes narration on its own.
Duplicate or delayed disconnect callbacks are idempotent once playback is paused.

Desktop uses a no-op adapter, preserving existing behavior. Tests use a deterministic fake adapter
that publishes snapshots and drives platform or headset controls without native media APIs. Android
will provide the first real platform adapter behind the same interface.

## Ownership

- `MediaSessionGateway` owns now-playing publication, external control delivery, and platform-session
  clearing.
- The reader playback application owns how those intents change reader playback and sentence
  selection.
- `NarrationGateway` owns narration preparation and audio playback.
- Platform adapters own media sessions, audio focus, foreground playback, and native callback
  translation.
- The media-session gateway refuses narration generation, voice or engine selection, reader
  rendering, and reading-position persistence.

## Consequences

- Android lifecycle and headset code can be added without platform branches in reader state.
- Desktop playback remains unchanged until a desktop media-session adapter is justified.
- Interruption resumption follows one testable policy rather than adapter-specific guesses.
- Sentence seek stays aligned with Sonelle's sentence-level playback contract.
- Native adapters may publish the same snapshot differently, but cannot mutate highlighting
  directly.

## Testing

- The fake adapter drives play, pause, stop, headset seek, and interruption scenarios.
- Output-disconnect coverage proves one pause, stable sentence selection, and no automatic resume.
- Playback application tests assert published book and playback snapshots.
- Reader-close and disposal tests assert platform-session clearing.
- Existing narration and playback tests continue to verify highlighting, persistence, jumps, and
  chapter handoff through their stable interfaces.

## Related Decisions

- [0001: Sentence-Level Narration Highlighting](0001-sentence-highlighting.md)
- [0009: Reading Progress and Jumps](0009-reading-progress-and-jumps.md)
- [0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md)
- [0036: Stable Narration Gateway](0036-narration-gateway.md)
