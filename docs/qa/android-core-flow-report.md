# Android Core-Flow Evidence Report

## Purpose

Issue #131 requires one coherent release-candidate record across the complete reader and narration
flow on both baseline devices. `scripts/report-android-core-flow.mjs` creates the device manifests,
rejects incomplete or mismatched evidence, and renders the report used to decide whether the Android
proof is eligible for the Tauri continuation decision.

## Ownership and interface

The reporter owns the evidence schema, exact device and EPUB matrix, required flow and gate inventory,
same-build comparison, failure-to-issue linkage, and final eligibility calculation. Its interface is
`pnpm report:android-core` plus two local JSON manifests. It emits no product domain events and does
not read Sonelle's library or reader state.

It refuses to run device scenarios, interpret raw traces, change benchmark gates, average devices,
or choose Tauri versus native Android UI. The physical procedures and their raw artifacts remain the
authority. This module merely stops a pile of screenshots and optimistic prose from cosplaying as a
release result.

## Create the manifests

Keep device evidence outside the tracked source tree:

```bash
pnpm report:android-core -- --init artifacts/android-core-flow
```

This writes `pixel-8a.json` and `galaxy-a16-5g.json` with every required EPUB flow and benchmark gate
set to `pending`. Fill identity fields from the signed build metadata and device captures. For every
result:

- use only `pending`, `pass`, or `fail`;
- attach at least one raw evidence path or URL before recording `pass`;
- record a measurement for every numeric or budgeted gate;
- link every `fail` to a focused Sonelle issue such as
  `https://github.com/meschack/sonelle/issues/123`.

Do not commit manifests containing serial suffixes, tester identity, or local paths. Attach the final
evidence bundle to issue #131.

## Generate the report

```bash
pnpm report:android-core -- \
  --midrange artifacts/android-core-flow/pixel-8a.json \
  --lower-cost artifacts/android-core-flow/galaxy-a16-5g.json \
  --output artifacts/android-core-flow/report.md
```

The command exits unsuccessfully while either device has pending work, validation errors, mismatched
build identity, or failed results. It still writes `report.md` so the omissions and linked failures
are visible. Eligibility requires every representative-book flow and every performance/reliability
gate to pass independently on both devices using the same signed build.

## Evidence sources

Use the benchmark contract and the specialized procedures rather than manually inventing new gates:

- [Android benchmark contract](android-benchmark-contract.md)
- [Android device profiling](android-device-profiling.md)
- [Android 60-minute stability run](android-stability-run.md)
- [Android internal build](android-internal-build.md)

The generated report answers only whether the evidence is complete enough for the architecture
decision. The decision itself belongs in a follow-up ADR after failures are traced to their owning
boundaries.

## Verification

Template completeness, exact matrix validation, raw-evidence requirements, numeric measurements,
failure issue linkage, same-build comparison, eligibility, and report language are unit-tested in
`scripts/report-android-core-flow.test.ts`. The actual results remain physical-device evidence.
