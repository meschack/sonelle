# 0042: Narration Failure Recovery

## Status

Accepted.

## Context

Narration preparation and playback previously reduced every provider, storage, voice-file, and
media-source failure to one generic sentence. That kept native details away from readers, but it also
made relevant recovery impossible: the reader could not distinguish retrying narration from repairing
an offline voice or freeing storage. The failed sentence was also implicit in mutable playback state.

## Decision

`NarrationPlaybackFailed` carries one stable outcome in addition to humane reader copy:

- offline voice files missing;
- offline voice files invalid;
- storage full;
- narration preparation failed;
- prepared audio unavailable;
- device voice unavailable;
- unknown.

The audio boundary converts typed adapter failures and legacy diagnostic messages into that vocabulary.
Provider paths, runtime names, and other diagnostics remain in local error reporting rather than the
reader surface.

The playback application retains the failed book, chapter, and sentence as an explicit retry target.
Failure pauses on that sentence. Retry starts that same sentence and does not advance until the normal
sentence-entry lifecycle reports progress. Moving elsewhere, opening another book, changing voices, or
stopping clears the stale retry target.

The reader projects the smallest relevant recovery action from the stable outcome: download or repair
the offline voice, manage storage, retry narration, or choose another voice. An Android device voice may
be offered as an explicit fallback when one is available, but Sonelle never switches voices silently.

## Consequences

- Platform adapters can change without changing recovery copy or action policy.
- Reading remains available and the current sentence remains stable after narration fails.
- The upcoming Android offline-voice adapter must emit typed failures at its platform boundary.
- Failure classification remains a compatibility layer for untyped native errors; new adapters should
  prefer `NarrationFailureError`.

## Testing

- Audio contract tests cover every known classification and safe unknown copy.
- Reader policy tests cover outcome-to-action mapping and relevant fallback visibility.
- Playback and reader integration tests cover exact-sentence retry without duplicate advancement.

## Related Decisions

- [0004: Local Sentence Narration](0004-local-narration.md)
- [0016: Hybrid Local Narration](0016-hybrid-local-narration.md)
- [0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md)
