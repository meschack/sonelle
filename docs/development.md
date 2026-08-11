# Development

## Requirements

- Node.js
- pnpm
- Rust 1.95 and Cargo (selected by the checked-in `rust-toolchain.toml`)
- Tauri Linux prerequisites when developing on Linux

Tauri's scaffold reported missing Linux desktop dependencies on this machine. Install the platform prerequisites from the official Tauri docs before running the native desktop shell.

On Debian/Ubuntu-like systems, use the full Tauri prerequisite set:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev gstreamer1.0-plugins-bad build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

`gstreamer1.0-plugins-bad` supplies WebKit's `webvttenc` and `fakevideosink` elements. Without it,
the desktop shell logs degraded subtitle handling and missing video-sink warnings at startup.

If installing dependencies piecemeal, the direct errors seen on this machine were `dbus-1`, `glib-2.0`, and `gdk-3.0`. Those are provided by development packages such as:

```bash
sudo apt install libdbus-1-dev libglib2.0-dev libgtk-3-dev pkg-config
```

### Android requirements

The tracked Tauri Android project requires:

- JDK 17 or newer
- Android SDK platform and build tools 36
- Android platform tools
- Android NDK `27.1.12297006` (r27b)
- Rust targets for Android arm64, armv7, x86, and x86_64

Install the SDK packages with Android's command-line tools:

```bash
sdkmanager \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.1.0" \
  "ndk;27.1.12297006"

rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android
```

Set `ANDROID_HOME` to the SDK directory and either set `JAVA_HOME` or ensure the selected `java`
belongs to the intended JDK. The Gradle wrapper is checked in and downloads its pinned distribution
on the first build.

## Commands

```bash
pnpm install
pnpm dev:desktop
pnpm dev:android
pnpm dev:web
pnpm dev:stop
pnpm typecheck
pnpm test
pnpm build
pnpm build:desktop
pnpm check
pnpm check:native
pnpm qa:real-books
pnpm perf:large-books
cargo check
cargo clippy --workspace --all-targets --locked -- -D warnings
```

## Android emulator

The Android target is already initialized in `apps/desktop/src-tauri/gen/android`; do not run
`tauri android init` after cloning. Create an x86_64 AVD if one is not already available:

```bash
sdkmanager "system-images;android-35;default;x86_64"
echo no | avdmanager create avd \
  --force \
  --name Parcel_API_35 \
  --package "system-images;android-35;default;x86_64" \
  --device pixel_7
```

Start it and wait for Android to finish booting:

```bash
emulator -avd Parcel_API_35 -no-audio -no-boot-anim -gpu host
adb wait-for-device
adb shell getprop sys.boot_completed
```

Launch Sonelle from the repository root. Pass the AVD name, not the `emulator-5554` ADB serial.
The host address must be reachable from the emulator so its WebView can load Vite:

```bash
pnpm dev:android Parcel_API_35 --host <host-lan-ip> --no-watch --exit-on-panic
```

The first run downloads the pinned Gradle distribution and Android dependencies. Later runs reuse
those caches. The current Android proof deliberately boots the existing fixture reader without a
mobile redesign. Desktop narration runtimes are excluded from the Android target because the mobile
runtime and accepted model pack belong to the later narration slices. Android document selection,
background audio, platform controls, and physical-device performance are also not proved by this
emulator loop. On Linux hosts without usable GPU passthrough, replace `-gpu host` with
`-gpu swiftshader_indirect`; software rendering can make WebView attachment and screenshots time
out under load, so it is useful for compatibility checks but not performance evidence.

## TUI

The project includes a small local TUI at `scripts/dev-tui.mjs`. It reads `.dev-tui.json` with entries for:

- desktop app
- web renderer
- dev server stop command
- tests
- full JS/TS check
- native Rust/Tauri check
- real-book QA
- large-book performance harness

Run it with:

```bash
pnpm dev:tui
```

Use arrow keys or `j`/`k`, press Enter to run a command, and press `q` to quit.

For non-interactive checks, list the configured commands with:

```bash
pnpm dev:tui -- --list
```

## Verification Notes

Current verified commands:

- `pnpm install`
- `pnpm dev:tui -- --list`
- `pnpm dev:stop`
- `pnpm dev:desktop`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm check`
- `pnpm check:native`
- `cargo fmt --check`
- `cargo check`
- `cargo clippy --workspace --all-targets --locked -- -D warnings`

Current blocked commands:

- None known after Linux Tauri prerequisites are installed.

Run this from the repository root. The root `Cargo.toml` is a workspace that points to `apps/desktop/src-tauri`.

If native checks report missing system packages through `pkg-config`, install the Tauri prerequisite set above and retry.

If `pnpm dev:desktop` reports that port `1420` is already in use, run `pnpm dev:stop` and rerun the command.

## Real-Book QA

Run the release-oriented EPUB workflow check with:

```bash
pnpm qa:real-books
```

By default, the test looks for known local EPUB files in `~/Downloads/books`. To use specific files, pass a semicolon-separated list:

```bash
SONELLE_QA_EPUBS="/path/book-one.epub;/path/book-two.epub" pnpm qa:real-books
```

Use at least two books. The check imports each EPUB, verifies chapter titles do not collapse into the book title, saves and reopens reading position, creates a bookmark, searches the imported text, and exports the book data.

## Large-Book Performance Harness

Run the reader performance harness with:

```bash
pnpm perf:large-books
```

The harness always measures a synthetic large book, then adds any configured real EPUBs from `SONELLE_QA_EPUBS` or `~/Downloads/books`. It reports book size, chapter count, sentence count, import timing, persistence timing, open-book timing, and chapter-switch timing.

Use the same EPUB override format as real-book QA:

```bash
SONELLE_QA_EPUBS="/path/book-one.epub;/path/book-two.epub" pnpm perf:large-books
```

## Local Narration Providers

The primary narration path uses Kokoro for English books and Supertonic for other supported
languages. The app downloads verified offline narration files and then works without a network
connection. Piper remains available only through the explicit `legacy-piper` compatibility mode.

To prepare the pinned real-provider fixtures used by native development and release-candidate QA:

```bash
pnpm spike:narration:models
pnpm spike:narration:local-catalog
pnpm qa:narration-providers
```

The generated `.sonelle/narration-spike/local-engine-catalog.json` points both engine packs at local
`file://` artifacts while preserving the same size, SHA-256, revision, and installed-pack checks used
by hosted files. Start the desktop app against it with:

```bash
SONELLE_NARRATION_ENGINE_CATALOG=.sonelle/narration-spike/local-engine-catalog.json pnpm dev:desktop
```

Provider smoke tests run sequentially with one ONNX thread per provider. They use the exact pinned
production artifacts and cover direct manifest rendering plus install-then-render for both packs.
The Python Kokoro export and corpus commands remain separate research tools. Optional Piper setup
remains available with `pnpm setup:piper` when explicitly testing the compatibility adapter.

## CI and Releases

GitHub Actions runs two workflows:

- `CI`: verifies formatting, TypeScript, tests, frontend build, strict native linting/tests, and a Linux desktop bundle.
- `Release Candidate`: is called by `dev` CI after standard verification and the Linux bundle succeed,
  then executes real-provider smoke tests and builds platform candidates from that same commit. Candidate
  bundles use the next release version derived from Git tags so they can safely replace the latest installed release.
- `Release`: runs only after successful `main` CI and publishes GitHub Releases for Linux, macOS Apple Silicon, and Windows.

The release and candidate workflows use `scripts/prepare-release-version.mjs` to compute the next patch version from existing `v*` tags. The computed version is applied to the package, Tauri, and Cargo manifests inside the workflow workspace before the desktop bundles are built.

Release versions are not committed back to `main`; the immutable GitHub tag and release represent the shipped build. To intentionally move to a new base version, update the manifest versions in source and let the next release start from that value.

Release and candidate workflows do not accept unverified manual dispatches.
