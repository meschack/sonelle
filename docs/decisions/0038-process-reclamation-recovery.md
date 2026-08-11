# 0038: Restore Durable Reading State, Not Transient Playback

## Status

Accepted.

## Context

Android may reclaim Sonelle's process while the app is backgrounded. On the next launch, the reader
must return to the stored book, chapter, and sentence without pretending that narration survived a
process that no longer exists. Persisting a frontend playback snapshot would duplicate authoritative
reading state and could restore a stale `playing` status after audio, voice packs, or prepared files
have disappeared.

## Decision

The native library remains the source of truth for recovery. Its reading position and `lastReadAt`
projection identify the most recently read book; opening that book restores and bounds the stored
chapter and sentence through the existing catalog interface.

When startup finds a previously read book, the reader projects playback as `paused`. It never
serializes or restores `playing`, an in-flight narration request, or a platform media-session
snapshot. An unread library may still open its first book with the ordinary idle state.

Prepared narration is not trusted merely because the reading position survived. Playback re-enters
through `NarrationGateway`, whose cache lookup must validate the current engine, voice-pack identity,
and audio artifacts. Missing or invalid preparation falls back to preparing audio through that
gateway. Recovery itself neither touches the cache nor starts narration.

If the catalog cannot reopen the selected book, the application keeps its safe current surface and
shows the existing humane library notice. It does not manufacture a position or claim playback.

## Ownership

- Native storage owns the durable book, chapter, sentence, and last-read timestamp.
- The library application selects the recovery candidate and requests paused playback projection.
- The playback application owns the in-memory paused state and starts no audio during activation.
- `NarrationGateway` owns prepared-audio validation and regeneration.
- The future Android foreground-service adapter owns continuity while playback is legitimately
  alive; process recovery does not impersonate that service.

## Consequences

- A reclaimed process returns readers to their passage without surprise audio.
- Corrupt audio or a removed voice pack cannot be made valid by stale frontend state.
- Recovery uses the same bounded storage path as a normal book open, avoiding a second persistence
  model.
- Full Android process-reclamation and cache-reuse acceptance still requires the native narration
  and foreground-service work tracked separately.

## Testing

- Library application tests simulate a fresh application instance over persisted summaries and
  assert that the latest read book opens paused.
- An unread-library test proves that startup does not invent a reclaimed playback session.
- Native storage restart tests continue to cover chapter and sentence restoration, stale chapters,
  and missing managed sources.
- Device QA will kill the Android process, relaunch it, and verify both the restored passage and
  silent paused state once the native runtime is available.

## Related Decisions

- [0009: Reading Progress and Jumps](0009-reading-progress-and-jumps.md)
- [0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md)
- [0036: Stable Narration Gateway](0036-narration-gateway.md)
- [0037: Platform Playback Through MediaSessionGateway](0037-media-session-gateway.md)
