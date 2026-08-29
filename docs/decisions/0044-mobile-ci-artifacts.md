# 0044 — Mobile CI artifacts

## Status

Accepted.

## Context

Sonelle already produces desktop releases, a manually requested signed ARM64 Android build for
internal offline-voice evaluation, and a signed universal Android App Bundle for controlled Play
Store submission. Those workflows do not provide ordinary install artifacts for older 32-bit ARM
Android phones, newer 64-bit ARM Android phones, or unsigned iOS handoff.

Android CPU compatibility and narration capability are separate concerns. The internal ARM64
offline-voice candidate is still explicitly unaccepted, so making every ARM64 CI artifact include
that candidate would silently turn internal evaluation machinery into a public distribution path.

iOS device archives can be compiled without an Apple identity as of Tauri CLI 2.11, but Apple does
not allow an unsigned application to be installed directly on an ordinary iPhone. An unsigned IPA
is therefore a build and signing handoff artifact, not a user-ready installer.

## Decision

After the main-branch verification job succeeds, CI calls a reusable mobile-artifact workflow.
That workflow can also be run manually for any revision already merged into `main`.

The Android matrix produces two signed, reader-only APKs using the existing internal Android
artifact signing identity:

- `armeabi-v7a` for 32-bit ARM devices;
- `arm64-v8a` for 64-bit ARM devices.

Each APK is built independently, checked for the expected native library and the absence of the
other ARM library, linted, signature-verified, hashed, and accompanied by build metadata. The
project minimum remains Android 7.0 / API 24; “older” here describes supported 32-bit ARM hardware,
not Android versions below the declared minimum.

The iOS job runs on macOS, initializes the generated Tauri iOS project, and builds an ARM64 device
archive with `--archive-only --no-sign`. CI verifies that the application has no code-signature
directory and that its executable is ARM64, then wraps the application in the standard
`Payload/<application>.app` IPA layout and publishes a checksum.

All three products are first stored as GitHub Actions artifacts retained for 30 days. After the
desktop release matrix succeeds, the release workflow retrieves the mobile artifacts from the exact
CI run that triggered it, verifies their checksums, and permanently attaches them to the matching
public GitHub Release. This does not change the Play Store workflow.

## Consequences

- Android testers can choose an installable APK matching old or new ARM hardware.
- The normal Android CI artifacts retain device-voice fallback and do not cross the internal
  offline-voice candidate boundary.
- The unsigned IPA proves that the iOS device application compiles and gives a later signing process
  a concrete input, but it cannot be installed on a stock iPhone without valid signing and
  provisioning.
- Mobile artifact generation becomes part of successful `main` CI, while pull requests avoid the
  cost and secret exposure of release packaging.
- The GitHub Release becomes the permanent download surface for the two APKs and unsigned IPA;
  App Store signing, TestFlight upload, and expanding the Android minimum below API 24 remain
  separate distribution decisions.
