# Android Benchmark Contract

## Status

Accepted for the Android proof. Results are evidence only when they follow this contract and name the
exact device, build, book, and narration configuration used.

## Purpose

This contract decides whether Sonelle's Tauri Android shell, local library, and offline narration are
fast and dependable enough for release. Emulator results may validate behavior, but performance
numbers come from the two physical baseline devices below using release builds.

The gates are intentionally reader-first. A fast model does not compensate for a sticky reading
surface, and a smooth reader does not compensate for narration that skips sentences, drains the
battery, or disappears when the screen locks.

## Physical Device Matrix

| Tier       | Required device and variant             | Chipset                   | Memory | Test operating system             | Why it exists                                                                                                 |
| ---------- | --------------------------------------- | ------------------------- | -----: | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Midrange   | Google Pixel 8a, 128 GB                 | Google Tensor G3          |   8 GB | Android 16, API 36, current patch | Reference Android behavior, modern ARM64 CPU, and enough memory to expose UI rather than low-memory limits    |
| Lower-cost | Samsung Galaxy A16 5G, SM-A166B, 128 GB | Samsung Exynos 1330, 5 nm |   4 GB | Android 14, API 34, One UI 6.1    | Entry-level memory pressure, slower CPU, vendor WebView and lifecycle behavior, and a 60 Hz performance floor |

The Pixel specification is pinned to Google's
[Pixel hardware specification](https://support.google.com/pixelphone/answer/7158570?hl=en-gb).
The Galaxy variant, chipset, memory, and launch operating system are pinned to Samsung's
[SM-A166B comparison](https://www.samsung.com/de/support/mobile-devices/vergleich-galaxy-a16-5g-a35/),
[product specification](https://www.samsung.com/uk/smartphones/galaxy-a/galaxy-a16-5g-blue-black-128gb-sm-a166bzkdeub/),
and [platform report](https://images.samsung.com/is/content/samsung/assets/global/ir/docs/2025_1Q_Interim_Report.pdf).

Use physical devices matching these variants. A different memory tier, chipset variant, or operating
system is a separate observation and does not replace the required result. Before each run, record
the model code, serial suffix, build fingerprint, WebView version, available storage, battery health,
and installed Android security patch.

## EPUB Corpus

The books remain local QA inputs and are never committed or redistributed by Sonelle. Resolve them
through `SONELLE_QA_EPUBS` or the existing `~/Downloads/books` convention and verify their hashes
before collecting results.

| Role                | Local fixture                            |     Bytes | SHA-256                                                            | Existing import shape                                | What it proves                                                                                                |
| ------------------- | ---------------------------------------- | --------: | ------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Small reading flow  | `industrial-society-and-its-future.epub` |   536,980 | `8cd009f23bd394666f79d25f61596ece4cf2e75dc1a0e1be32e26a7eb4c2387d` | 33 chapters, 1,915 sentences, largest chapter 229    | Fast iteration for launch, import, navigation, search, bookmark, resume, and interruption checks              |
| Large reader stress | `the-selfish-gene.epub`                  |   718,041 | `810c350d5c9a74bcf97e31c0b62fd4ee2542f0859523a52c3a67f4a693b67af4` | 50 chapters, 8,134 sentences, largest chapter 774    | Library scale, a very large chapter, bounded rendering, scrolling, search, and 60-minute stability            |
| Structural stress   | `basic-economics-thomas-sowell.epub`     | 2,977,666 | `34370f18abc1a1b027b180e92a7f8c36db32e82025aae265139019cb99fc11a3` | 70 chapters, 11,734 sentences, largest chapter 1,610 | Cover persistence, complex navigation, links, lists, CSS-authored contents hierarchy, and long-book narration |

If a fixture changes, update its hash and establish its new chapter and sentence counts through the
real-book QA workflow before it can replace the pinned input.

## Build and Device Preparation

1. Start from a clean worktree at the revision being evaluated.
2. Build the signed or release-like Android artifact with debug assertions and development servers
   disabled. Record the commit, version, application ID, ABI, Rust profile, and artifact SHA-256.
3. Install the artifact fresh for cold-import runs. Use an upgrade install only for an explicitly
   named upgrade scenario.
4. Disable automatic application and operating-system updates for the run. Leave adaptive battery
   enabled because it is normal device behavior.
5. Set display refresh to 60 Hz on both devices, brightness to 50%, font scale to 1.0, and display
   scale to the platform default. Record deviations for accessibility scenarios.
6. Charge to 80-100%, let the device return to a nominal thermal state, unplug it for battery runs,
   close other foreground applications, and wait five minutes before capture.
7. Use the same Wi-Fi network for model installation. Enable airplane mode after the verified voice
   pack and required books are installed for offline reading and listening scenarios.
8. Reset application data, `batterystats`, and performance traces only when the scenario calls for a
   clean state. Never mix cold and warm samples in one distribution.

Android Macrobenchmark is the preferred repeatable harness for startup, frame, power, and named
trace-section measurements. It produces machine-readable JSON and Perfetto traces; Android's
[Macrobenchmark metric reference](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-metrics)
defines the captured distributions. Use `adb shell dumpsys meminfo`, Perfetto, `dumpsys
thermalservice`, and Power Profiler or Macrobenchmark `PowerMetric` for resource evidence. Battery
Historian is a diagnostic fallback, not the primary power metric, because Android documents it as no
longer actively maintained.

## Measurement Rules

- Run startup, book-open, chapter-switch, input, scrolling, model-load, preparation, and handoff
  scenarios at least ten times per device and report p50, p95, minimum, and maximum.
- Use three independent cold model loads with process termination between samples. Use at least ten
  warm preparations after the accepted model is resident.
- Store raw Macrobenchmark JSON, Perfetto traces, memory samples, thermal samples, power output, and
  the completed worksheet together under a directory named with date, device, and commit.
- Instrument Sonelle-owned phases with stable trace names. Do not infer import, model load,
  preparation, or book-open duration from video timestamps when a trace boundary can record it.
- Treat missing measurements as failures. Do not average the two devices or allow the Pixel result to
  excuse a Galaxy failure.
- A run affected by an incoming call, operating-system update, charger connection, or unrelated
  foreground work is invalid and must be repeated. Interruption scenarios are the exception because
  the interruption is the subject of the run.

## Release Gates

| Area                        | Scenario and capture                                                                      | Pass condition on both devices                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cold launch                 | Macrobenchmark `StartupTimingMetric`; ten force-stopped launches                          | p95 time to fully drawn <= 3,000 ms                                                                                |
| Warm launch                 | Macrobenchmark warm startup; ten launches                                                 | p95 time to fully drawn <= 1,000 ms                                                                                |
| Import                      | Fresh import of every corpus book with Sonelle trace sections                             | Small <= 8 s; large and structural <= 45 s; no ANR, partial durable book, or blocked reader input                  |
| Persisted book open         | Open each imported book from the library                                                  | p95 <= 400 ms                                                                                                      |
| Chapter switch              | Alternate ordinary and largest chapters ten times                                         | p95 <= 400 ms                                                                                                      |
| Reader input                | Tap header and playback controls during large-chapter scrolling                           | visible response <= 100 ms in every valid sample                                                                   |
| Reader scroll               | Macrobenchmark `FrameTimingMetric` through the largest chapter                            | p95 frame CPU duration <= 16.7 ms; no sustained cluster of positive frame-overrun samples                          |
| Search                      | Query a common and a non-Latin term across the full local corpus                          | p95 results projection <= 500 ms; selecting a result opens the correct sentence                                    |
| Voice-pack verification     | Install valid, interrupted, corrupt, incompatible, and insufficient-space cases           | valid pack commits atomically; every invalid case remains not ready; local verification <= 8 s                     |
| Cold model load             | Three process-cold loads of the accepted Supertonic pack                                  | every load <= 3,000 ms on Pixel and <= 5,000 ms on Galaxy; reader input remains responsive                         |
| Warm narration preparation  | Accepted pronunciation corpus and real-book passages; report real-time factor             | p95 real-time factor <= 0.80 and no skipped, repeated, truncated, or reordered sentence                            |
| First narration readiness   | Play from an unprepared sentence with the pack installed                                  | audible start <= 3,000 ms on Pixel and <= 5,000 ms on Galaxy                                                       |
| Prepared narration handoff  | Continuous playback across at least 100 sentence or passage boundaries                    | p95 audible or visual gap <= 250 ms; highlight enters each sentence exactly once                                   |
| Working memory              | Total PSS every minute during the 60-minute scenario                                      | peak <= 550 MiB on Pixel and <= 420 MiB on Galaxy; final 15-minute range is stable within 5%                       |
| Installed narration storage | Base application, standard voice pack, and prepared-audio totals                          | standard voice pack <= 175 MB; removal reclaims its files without touching books or progress                       |
| Thermal stability           | Thermal status and CPU frequency during the 60-minute scenario                            | no severe, critical, or emergency status; no sustained throttling that causes another performance gate to fail     |
| Battery use                 | Macrobenchmark power or Power Profiler plus unplugged battery delta for the 60-minute run | <= 12% Pixel and <= 15% Galaxy; report screen-on and background-listening portions separately                      |
| Background playback         | Lock screen, app switch, ten-minute screen-off playback, and return                       | uninterrupted audio where requested; playback and highlight state agree on return                                  |
| Audio interruption          | Phone call or focus loss during preparation, playback, and handoff                        | audible playback yields; no double advancement; resume or paused state follows the documented policy               |
| Headset and Bluetooth       | Play, pause, previous, next, disconnect, and reconnect                                    | actions occur once; disconnect pauses before audio can spill through the phone speaker                             |
| Process recovery            | Remove the process after reading, during prepared playback, and while paused              | reopen restores the last confirmed book and sentence in a safe paused state; no book, bookmark, or position loss   |
| Offline recovery            | Restart in airplane mode after import and voice installation                              | books open, compatible prepared narration plays, and missing narration reports a recoverable needs-attention state |

The time and resource limits are initial product gates, not performance aspirations. Change them
only through an explicit plan or decision update with evidence; do not loosen a gate inside a failed
result report.

## Required Scenario Order

Run these in order on each device so failures are attributable:

1. fresh install and cold/warm launch;
2. small-book import, open, navigation, search, bookmark, position restore, and restart;
3. large and structural import, largest-chapter open, chapter switching, search, and scroll;
4. standard voice installation, verification failures, cold load, and warm preparation;
5. first narration, prepared handoff, pause, resume, stop, and airplane-mode reuse;
6. audio focus, phone call, background, lock screen, headset, and Bluetooth;
7. low storage, pack removal, corrupt prepared audio, and process recovery;
8. the 60-minute mixed reading and listening stability run.

Stop after a correctness failure. Performance data from a run that skipped text, lost position, or
loaded the wrong fixture is invalid.

## Result Record

Every device report begins with this header:

```text
Date/time and timezone:
Tester:
Device role: midrange | lower-cost
Manufacturer/model/model code:
Serial suffix:
Chipset and memory:
Android version/API/security patch/build fingerprint:
Android System WebView version:
Available storage before/after:
Battery level/health and charger state:
Display refresh/brightness/font scale/display scale:
Network and airplane-mode state:
Thermal status at start/end:
Sonelle version/commit/build type/artifact SHA-256:
EPUB filename/SHA-256/chapter count/sentence count:
Narration adapter:
Voice-pack ID/revision/quantization/artifact SHA-256:
Voice/style/language/speed/preparation revision:
Raw artifact directory:
```

For each gate, record the command or test name, raw artifact path, sample count, p50, p95, maximum,
pass or fail, and a linked issue for any failure. A narrative summary without the raw evidence is not
a completed benchmark.

## Existing Commands

The physical-device capture procedure and its guarded helper are documented in
[Android device profiling](android-device-profiling.md). The helper refuses emulators and writes a
device-specific worksheet beside its raw captures.

The one-hour mixed reader and narration procedure is documented in
[Android 60-minute stability run](android-stability-run.md). Its guarded helper binds the signed APK
to internal build metadata, samples the physical device throughout the run, and leaves audible
sentence correctness as an explicit human verdict.

Before device capture, verify the same EPUBs through the native QA paths:

```sh
SONELLE_QA_EPUBS="$HOME/Downloads/books/industrial-society-and-its-future.epub;$HOME/Downloads/books/the-selfish-gene.epub;$HOME/Downloads/books/basic-economics-thomas-sowell.epub" pnpm qa:real-books

SONELLE_QA_EPUBS="$HOME/Downloads/books/industrial-society-and-its-future.epub;$HOME/Downloads/books/the-selfish-gene.epub;$HOME/Downloads/books/basic-economics-thomas-sowell.epub" pnpm perf:large-books
```

Prepare and verify the exact Supertonic INT8 candidate described in
[Android Supertonic INT8 candidate](android-supertonic-int8-candidate.md) before #102 capture:

```sh
pnpm spike:narration:supertonic-int8
pnpm spike:narration:supertonic-int8:verify
```

Copy the candidate revision, artifact-set SHA-256, quantization format, and individual artifact
hashes into the device evidence. Regenerating an apparently equivalent candidate without recording
its new identity invalidates comparisons.

These commands validate inputs and shared native behavior. They do not replace physical-device
Android results.
