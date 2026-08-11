# 0036: Stable Narration Gateway

## Status

Accepted.

## Context

The desktop reader previously depended on a `ReaderNarrationWorkflow` that combined reader commands,
desktop engine routing, narration-session setup, and prefetch coordination. That shape preserved the
current experience, but it was not a stable boundary for Android: a mobile adapter would either need
to reproduce desktop wiring or leak its inference and lifecycle choices into reader state.

An older Piper compatibility interface was also named `NarrationGateway`, despite owning only
sentence-audio preparation and playback calls. Keeping that name would make the mobile boundary
ambiguous.

## Decision

`@sonelle/audio/narration` owns the platform-neutral `NarrationGateway`. It exposes commands to
prepare, start, pause, resume, stop, change output, and prepare upcoming narration; reports readiness;
and publishes preparation, readiness, sentence-entry, completion, failure, pause, and interruption
facts to subscribers.

The reader depends on this contract. It does not select an engine or branch on a platform. The
desktop adapter owns engine routing, narration-session creation, prepared-audio playback, and the
translation between gateway lifecycle facts and the existing domain-event projections. A future
Android adapter may use different model artifacts and playback machinery behind the same contract.

The discontinued sentence-at-a-time Piper boundary remains temporarily available as
`LegacyNarrationGateway` and `LegacyPrefetchingNarrationGateway`. Those names make its compatibility
role explicit and reserve `NarrationGateway` for the reader lifecycle.

## Ownership

- `@sonelle/audio/narration` owns the gateway interface, readiness vocabulary, and lifecycle event
  surface.
- Narration sessions own preparation, manifest playback, stale-run suppression, and sentence timing.
- Platform adapters own engine selection and platform playback integration.
- The reader owns rendering, highlighting, progress, and humane notices derived from gateway facts.
- The gateway refuses model installation UI, reading-position persistence, reader rendering, and
  platform media-session controls.

## Consequences

- Desktop and Android can use different inference machinery without forking reader behavior.
- Interruption is an explicit lifecycle outcome instead of being inferred from unrelated pause or
  failure state.
- Starting a newer request cannot leak an older sentence-entry event into highlighting.
- Duplicate sentence-entry callbacks are idempotent because projections select a sentence by stable
  identifier rather than incrementing reader position.
- The legacy Piper compatibility API remains available while its callers are retired deliberately.

## Testing

- The deterministic fake gateway exercises readiness, sentence entry, completion, failure, and
  interruption without platform audio.
- Contract tests cover superseded playback and duplicate completion callbacks.
- Narration-session tests cover stale-run suppression, preparation order, and prepared-audio reuse.
- Desktop adapter tests verify preparation and playback reuse the same routed session.

## Related Decisions

- [0001: Sentence-Level Narration Highlighting](0001-sentence-highlighting.md)
- [0016: Hybrid Local Narration](0016-hybrid-local-narration.md)
- [0026: Domain Events Are Not Persisted](0026-ephemeral-domain-events.md)
- [0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md)
