# 0027: Whole-Book Narration Reuses Passage Assets

## Status

Accepted.

## Context

Readers need to know which chapters will work offline and prepare a full book before leaving a
network connection. Preparation can take long enough to be cancelled or interrupted, especially
with the multilingual provider. Repeating completed synthesis would waste time, storage writes, and
CPU.

## Decision

Whole-book preparation walks deterministic chapter passages through the existing narration adapter.
It prepares one passage at a time, reports chapter progress as domain events, and uses the same
versioned native cache as ordinary playback. Cancellation aborts the active request. Starting again
walks the same identities, so completed passages are cache hits and preparation resumes at the first
missing asset.

Native cache summaries group valid manifests by book, voice, model revision, and chapter. The reader
projects those summaries as ready, preparing, or unavailable and estimates full-book storage from
known assets when possible.

## Consequences

- No second download or audio store is introduced.
- Supertonic preparation remains sequential and bounded instead of multiplying CPU-heavy inference.
- Resume granularity is one completed passage; an interrupted passage may be synthesized again.
- Ordinary book opening remains active-chapter-only. Full chapter hydration happens only after the
  reader requests whole-book preparation.

## Testing

Package tests cover ordering, cancellation, progress, and cached results. Native tests cover chapter
cache summaries. Reader application tests cover full chapter hydration and event-driven projection.
