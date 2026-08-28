# Android Supertonic INT8 Candidate

## Status

Host preparation is available. The generated pack is a benchmark candidate, not an accepted Sonelle
voice pack. Issues #102 and #103 still require physical-device measurements and listening evidence
before production integration.

## Owns

- reproducing dynamic QInt8 Supertonic graphs from the pinned model snapshot;
- copying the exact configuration, language index, license, and voice-style inputs beside them;
- measuring and hashing every candidate artifact;
- refusing candidates above the 175 MB standard-pack gate;
- proving that Sonelle's pinned Rust ONNX Runtime can render real audio from the result.

## Refuses To Own

- claiming Android performance from host timings;
- choosing the standard mobile voice styles;
- accepting the candidate for public builds;
- replacing the two-device benchmark or listening and pronunciation review.

## Interface

Prepare the pinned source models first, then generate the candidate:

```sh
pnpm spike:narration:models -- --engine=supertonic
pnpm spike:narration:supertonic-int8
```

The second command creates a dedicated Python environment with ONNX and ONNX Runtime pinned to the
quantizer versions, transforms all four Supertonic graphs, validates their ONNX structure, and runs
real synthesis through Sonelle's native runtime. It publishes the result atomically only after those
checks pass.

The ignored output lives at
`.sonelle/narration-spike/mobile-candidates/supertonic-android-int8/`. Its
`candidate-manifest.json` records source revision, transformation, runtime compatibility, exact
sizes, SHA-256 values, aggregate candidate revision, and the explicit
`candidate-not-accepted` status. `engine-catalog.json` is a local test catalog. The internal arm64
application feature consumes the separately tracked, hosted-artifact projection at
`tools/narration-spike/android-supertonic-candidate.json`; normal Android builds cannot discover or
install it.

Verify an existing candidate without regenerating it:

```sh
pnpm spike:narration:supertonic-int8:verify
```

Compile the native internal seam without producing an APK:

```sh
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --target aarch64-linux-android \
  --features android-offline-voice-candidate
```

The feature is intentionally invalid as a release claim by itself. A physical arm64 build must still
record the benchmark and listening evidence required by #102 and #103.

Use `pnpm spike:narration:supertonic-int8 -- --replace` only when deliberately rebuilding the
ignored candidate from the same pinned inputs or after changing the quantization contract.

## Current Host Evidence

The first reproducible candidate is 102,975,099 bytes, versus 398,960,177 bytes for the pinned FP32
pack. Candidate revision `b362ed2d6f9bc9d255ea10fea2d64585ff997614` loads through the Rust
`ort 2.0.0-rc.12` runtime and renders a two-sentence, 9.29-second sample without skipped output.

The non-isolated Linux debug smoke reported an RTF of 1.816. That number is compatibility evidence,
not an Android performance result: it uses a different CPU, build profile, and execution-provider
path. It neither passes nor fails #102. ONNX Runtime documents that dynamic quantization computes
activation parameters at inference time and may trade additional runtime cost for accuracy, so only
the pinned Android benchmark can decide whether this candidate is useful:
<https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html>.

## Testing

`scripts/prepare-supertonic-int8.test.ts` covers manifest identity, local-catalog projection,
artifact corruption, and the pack-size gate. The preparation command verifies the source catalog,
checks each generated graph, validates every output hash and byte count, and runs real native
Supertonic synthesis before committing the candidate directory. Physical load, RTF, memory, CPU,
thermal, and battery evidence remain intentionally deferred.
