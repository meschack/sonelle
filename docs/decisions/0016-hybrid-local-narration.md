# 0016: Hybrid Local Narration

## Status

Proposed. Engine selection is approved; the production runtime remains gated by the Phase 0 spike.

## Context

Piper gives Sonelle deterministic sentence-sized local audio, but it cannot provide paragraph-level
English prosody or a timing manifest for sentence highlighting inside a longer utterance. Persisting
one global Piper voice also makes engine, model, language, installation, and user preference look
like the same concern.

Kokoro exposes predicted durations that its official English pipeline projects into token timing.
Supertonic provides fast local multilingual synthesis for 31 languages plus a language-agnostic
fallback, but it does not expose intra-utterance text timing.

Sonelle must improve narration without weakening its reader-first behavior, sentence highlighting,
offline use, or platform independence.

## Decision

- Route confidently English books to Kokoro.
- Prepare English narration as paragraph-sized passages where model limits allow it.
- Project Kokoro timing into a validated manifest of Sonelle sentence IDs and sample offsets.
- Fall back to independent Kokoro sentence preparation when a passage manifest cannot be validated.
- Route known non-English and unresolved-language books to Supertonic.
- Give Supertonic independent Sonelle sentences as bounded batch items so exact sentence boundaries
  come from returned sample lengths rather than estimates.
- Keep playback, highlighting, navigation, bookmarks, and reading progress sentence-oriented.
- Persist voice preferences per normalized language instead of one global engine-native voice ID.
- Install shared engine/model packs on demand while presenting voice readiness in reader language.
- Prefer one native ONNX Runtime integration for both engines, subject to cross-platform spike
  evidence for Kokoro preprocessing, lifecycle, memory, packaging, and licensing.
- Keep Piper as a compatibility adapter until the complete hybrid path passes release-candidate QA.

The implementation follows the staged migration in
[`../plans/kokoro-supertonic-narration.md`](../plans/kokoro-supertonic-narration.md).

## Events

Long-running preparation and playback consequences are projected from domain events. The final
event names and payloads are introduced with the engine-independent audio contracts, but they must
represent passage readiness, sentence entry, playback lifecycle, and voice installation without
exposing inference or cache machinery.

## Consequences

- English readers can receive contextual paragraph narration without losing sentence highlighting.
- Non-English narration remains sentence-isolated but can use one multilingual model and batched
  inference.
- The audio module gains a real adapter seam because Kokoro, Supertonic, compatibility Piper, and
  deterministic fakes provide distinct behavior behind one interface.
- Prepared audio cache identity changes from one Piper WAV per sentence to versioned assets plus
  validated sentence-span manifests.
- Installation readiness becomes internally pack-based because many selectable voices share one
  model.
- Native model downloads and memory use increase substantially and must pass explicit release gates.
- Invalid alignment degrades prosody for one passage before it degrades synchronization.
- Word-level highlighting, cloud narration, voice cloning, and forced alignment remain out of scope.

## Acceptance

This decision becomes Accepted only when the Phase 0 report records:

- a self-contained runtime on every desktop release target;
- reviewed and pinned model/runtime dependencies;
- accurate Kokoro sentence manifests on the alignment corpus;
- clean engine shutdown or switching without process termination tricks;
- accepted load time, RTF, peak memory, and bundle/download budgets;
- verified redistribution obligations and prepared notices.

Until then, this ADR does not authorize production adapter replacement.
