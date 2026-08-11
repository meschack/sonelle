# 0040: Internal Android Builds Use Ephemeral CI Signing

## Status

Accepted.

## Context

Physical-device QA needs an installable artifact built with production optimization and Android
release behavior. Debug builds depend on development machinery and distort performance evidence.
Signing credentials are sensitive, while every tested artifact must remain traceable to its source
and narration model manifest.

## Decision

A manually dispatched GitHub workflow builds one ARM64 internal APK from an explicitly requested Git
revision. A dedicated QA keystore is stored only as encrypted environment secrets. The workflow
reconstructs the keystore and ignored Gradle properties inside the runner, signs the release build,
verifies the result with `apksigner`, uploads it with build metadata, then removes the signing files.
Before any signing secret is exposed, the requested revision must be an ancestor of `main`.

The internal key proves installability only. It is not a developer's personal debug key, a Play
upload key, or a production distribution identity.

Build metadata records the application version, commit, build type, ABI, artifact SHA-256,
narration-catalog SHA-256, and pinned engine model revisions. Commit and catalog identity also enter
local error diagnostics through compile-time values. No book, device, or signing data enters this
metadata.

## Consequences

- Device QA receives a repeatable release-like artifact without committing credentials.
- An unsigned output fails before upload.
- A commit SHA and artifact hash connect every test report to immutable source.
- ARM64 covers the two baseline devices; additional ABI artifacts require an explicit matrix change.
- Device installation, launch, and background-playback acceptance remain physical tests rather than
  claims made by packaging CI.

## Testing

- Metadata tests verify revision, release profile, artifact identity, and pinned model projection.
- Native diagnostics tests verify build identity fields serialize with every error entry.
- The workflow runs production Android packaging and `apksigner` verification when configured with
  the protected secrets.
- Both baseline devices must still install and launch the downloaded APK before issue #129 closes.

## Related Decisions

- [0023: Local Error Diagnostics](0023-local-error-diagnostics.md)
- [0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md)
