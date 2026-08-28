# 0043: Gate Android offline narration behind an arm64 candidate boundary

## Status

Accepted for internal validation. The model candidate is not accepted for public release.

## Context

Sonelle needs its own local mobile narration rather than silently delegating the primary experience
to an Android speech provider. The reproducible Supertonic INT8 candidate is substantially smaller
than the desktop pack and passes host synthesis, but it has not passed the baseline-device memory,
latency, thermal, listening, or pronunciation gates. Shipping it in every Android build would turn
unfinished evidence into a product promise and burden 32-bit devices with a runtime they cannot
reasonably support.

## Decision

The existing verified pack installer, manifest cache, sentence-span playback contract, and bounded
Supertonic renderer become the Android offline-voice path. Android uses one product profile,
“Sonelle offline voice,” and routes every supported language through Supertonic. Device voices remain
explicitly selected fallbacks outside this prepared-audio path.

Native inference is compiled only when all three conditions hold:

- the target is Android;
- the ABI is `arm64-v8a` (`aarch64-linux-android`);
- the Cargo feature `android-offline-voice-candidate` is enabled.

The feature consumes a separate pinned catalog whose ten artifacts have fixed byte counts and
SHA-256 digests. Downloads resume into staging, verify the complete artifact set, and become visible
only through the installer's atomic commit. Prepared narration uses the existing revision-qualified
cache, so completed passages survive restarts and are reused offline.

Normal Android builds expose the same narrow commands but report the Sonelle voice as unavailable.
They do not compile ONNX Runtime or the model adapter. This keeps armv7 builds working and prevents
the renderer from inventing availability based on JavaScript environment flags.

## Consequences

- Internal arm64 builds can install the real candidate and prepare real sentence-aligned audio.
- Public and armv7 builds remain honest and retain explicitly chosen Android device voices.
- The model is not bundled into the APK, but the runtime increases an internal arm64 build and must
  be measured before public release.
- The feature may become a normal arm64 capability only after #102 and #103 produce accepted device
  and listening evidence. Acceptance changes the candidate status; it does not bypass the pinned
  catalog or verified installer.

## Testing

- Routing tests prove Android English, multilingual, and unknown-language books use Supertonic.
- Reader integration tests prove one mobile profile is shown and unavailable builds offer no bogus
  download action.
- Strict cross-target Clippy checks cover armv7 without the feature and arm64 with it.
- The candidate preparation suite verifies artifact identity and real host synthesis. Physical-device
  release acceptance remains deliberately outstanding.
