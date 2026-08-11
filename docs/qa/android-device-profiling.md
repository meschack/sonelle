# Android Device Profiling

This procedure captures the first physical-device fixture-reader baseline defined by
[`android-benchmark-contract.md`](android-benchmark-contract.md). It deliberately rejects emulators:
they remain useful for behavior, but their startup, graphics, memory, and power figures are not
release evidence.

## What the helper owns

`scripts/profile-android-device.mjs` validates one explicitly selected physical ADB device,
fresh-installs an already signed release-like APK, captures cold and warm startup samples, and writes
raw frame, memory, CPU, battery, thermal, package, and WebView output. It also creates the device QA
worksheet from those captures.

It refuses to build or sign the application, reset device-wide battery history, invent missing
measurements, automate later real-book or narration scenarios, or mark the manual reader checks as
passed. Those actions have different safety and evidence boundaries.

## Build a release-like ARM64 APK

Start from a clean worktree and record the commit. Use the production frontend and Rust/Gradle
release profiles; a debug APK is not performance evidence.

```bash
pnpm install --frozen-lockfile
pnpm --filter @sonelle/desktop tauri android build --target aarch64 --apk --ci
```

The Android release artifact is unsigned unless a release signing configuration is supplied. For a
local profiling build, sign that artifact with a dedicated local QA key using Android Build Tools'
`apksigner`, then verify it. Do not commit the key or its passwords.

```bash
apksigner sign \
  --ks <qa-keystore-path> \
  --out artifacts/sonelle-profile-arm64.apk \
  apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk

apksigner verify --verbose artifacts/sonelle-profile-arm64.apk
sha256sum artifacts/sonelle-profile-arm64.apk
```

The QA key proves installability, not production identity. Production release signing belongs to the
distribution work and must not quietly reuse a developer's personal key.

## Prepare the physical device

Follow the device, display, battery, thermal, network, and storage preparation in the benchmark
contract. Enable USB debugging, connect only the selected device where practical, and verify ADB:

```bash
adb devices -l
```

The first required devices are the exact Pixel 8a and Galaxy A16 5G variants in the contract. A
different phone can be recorded as an additional observation, but cannot replace either baseline.

## Capture the fixture baseline

The `--fresh-install` flag is required because it removes the existing Sonelle installation and its
app data before installing the named APK. The script refuses to make that destructive scope implicit.

```bash
pnpm profile:android -- \
  --artifact artifacts/sonelle-profile-arm64.apk \
  --fresh-install \
  --serial <adb-serial> \
  --samples 10
```

The result is written under `artifacts/android-device/<date>-<model>-<commit>/` unless `--output` is
provided. That directory contains:

- artifact hash, commit, device identity, Android patch, build fingerprint, and WebView identity;
- raw cold and warm startup samples;
- `dumpsys gfxinfo` frame timing;
- `dumpsys meminfo` memory evidence;
- CPU, battery/package power accounting, and thermal snapshots;
- package metadata and a generated `worksheet.md`.

With Sonelle still open, complete the worksheet's manual fixture check: read Chapter 1, select Chapter
2, scroll, operate the supported controls, and record any crash, ANR, delayed response, or persistence
error. Raw results stay together in the device directory and should be attached to the relevant QA
record; do not commit device serials or local filesystem paths to the repository.

## Extending the capture

Add a measurement only when its owner can define the scenario, reset policy, raw artifact, and pass
gate. Prefer Android Macrobenchmark and Perfetto for repeatable interaction traces. Keep the simple ADB
captures as diagnostics and metadata, not as a flattering substitute for the contract's later
instrumented gates.

## Verification

Pure parsing, physical-device selection, percentile calculation, and worksheet generation are unit
tested in `scripts/profile-android-device.test.ts`. Hardware capture is verified only by running the
command against a named physical device; an emulator run is expected to fail before installation.
