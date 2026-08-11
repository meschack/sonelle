# Android 60-Minute Stability Run

## Purpose

This procedure turns issue #130's one-hour mixed reading and narration session into reproducible
evidence. It samples memory, battery, thermal state, and process presence while a tester performs the
reader-first interaction schedule. It produces raw captures, an automated gate result, and a manual
correctness worksheet without pretending that ADB can judge whether the highlighted sentence was the
one a human heard.

## Ownership

`scripts/run-android-stability.mjs` owns artifact and device preflight, the timed interaction schedule,
one-minute resource sampling, raw evidence capture, and evaluation of the benchmark contract's
numeric gates. It refuses emulators, unsigned or mismatched artifacts, debug packages, non-baseline
devices, and missing measurements.

Its interface is the `pnpm stability:android` command and the evidence directory it writes. It emits
no product domain events and never mutates Sonelle's reader state directly; the visible schedule is a
tester protocol, not playback orchestration wearing a fake moustache.

The helper does not build or sign Sonelle, install a voice pack, import the private QA book, operate
the reader, manufacture headset or audio-focus events, or auto-pass subjective correctness. Those
steps remain visible tester responsibilities. A shorter duration is useful for checking the harness,
but is explicitly reported as a non-contract smoke run and cannot pass.

## Prepare the run

1. Download the signed APK and `build-metadata.json` produced by the protected Android internal build
   workflow. Keep the files together.
2. Complete the earlier device scenarios in the benchmark contract. The representative large book
   (`the-selfish-gene.epub`) and verified standard voice must already be installed and usable offline.
3. Follow the benchmark contract's display, battery, thermal, network, and storage preparation. The
   phone must be unplugged before capture.
4. Connect exactly one named baseline device over ADB. The helper accepts only the Pixel 8a on API 36
   for `midrange`, or the SM-A166B on API 34 for `lower-cost`.
5. Have the headset and the source of the planned audio-focus interruption ready. Open the large book
   at a known sentence before the countdown ends.

The APK is installed with `adb install -r`, preserving the prepared local library. `--install-update`
and `--confirm-ready` are required acknowledgements; neither reader data nor device-wide battery
history is silently cleared.

## Run

```bash
pnpm stability:android -- \
  --artifact artifacts/android-internal/sonelle-internal-arm64.apk \
  --metadata artifacts/android-internal/build-metadata.json \
  --serial <adb-serial> \
  --device-role midrange \
  --install-update \
  --confirm-ready
```

Use `--device-role lower-cost` for the Galaxy. The helper prints each interaction checkpoint at its
scheduled minute and records it in `events.log`. Follow the prompt when it appears; do not perform the
whole choreography early and call it automation.

For a quick harness check only, override `--duration-minutes`, `--sample-seconds`, and
`--start-delay-seconds`. The generated report remains failed/incomplete because only exactly 60
minutes satisfies the contract.

## Evidence and verdict

Results are written under `artifacts/android-stability/<date>-<device>-<commit>/` unless `--output` is
provided. Keep the entire directory:

- exact build metadata, device identity, schedule, and timestamped events;
- incremental `samples.json` plus every raw memory and thermal snapshot;
- per-sample CPU and CPU-frequency snapshots for throttling diagnosis;
- filtered crash/ANR-relevant logcat output and application exit history before and after;
- battery statistics, final CPU state, and storage before and after;
- `automated-result.json` and `report.md`.

The automated result checks the role-specific PSS and battery ceilings, final 15-minute memory range,
thermal severity, process presence, and full duration. Complete every manual correctness checkbox in
`report.md`, compare the before/after exit history, and attach the report with all raw captures to
issue #130. Any missing resource sample or unreviewed reader behavior is a failed result.

Run the same signed build independently on both baseline devices. Do not average them; a warm Pixel
cannot absolve a struggling Galaxy of its sins.

## Verification

Pure parsing, artifact binding, gate evaluation, schedule coverage, and report generation are tested
in `scripts/run-android-stability.test.ts`. The command itself is verified only by completing it on a
named physical device; emulator or host-only output is not release evidence.
