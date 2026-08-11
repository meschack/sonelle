# 0041: Android Shell Continuation

## Status

Proposed. The decision is intentionally deferred until issue #131 contains complete physical-device
evidence for both baseline devices.

## Context

The initial Android architecture uses Tauri around the shared Solid reader and Rust book domain.
[0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md) defines strict
continuation gates and permits a native Kotlin reader only when measurements isolate the WebView
reader as the blocker after bounded remediation has been exhausted.

Emulator behavior, desktop measurements, and an incomplete device matrix cannot choose between those
paths. Import, storage, narration, playback, or lifecycle adapter failures are not evidence against
the reader shell.

## Decision

No continuation decision has been made yet. Run the guarded procedure in
[Android shell decision](../qa/android-shell-decision.md) against the complete two-device manifests.
It will replace this proposal with an accepted ADR that links the published report, summarizes passed
and failed gates, records failure ownership, preserves the shared Rust book domain, and states whether
Android evidence is sufficient to begin iOS planning.

Until then, Tauri remains the proof architecture and native Android UI remains an unauthorized
fallback. iOS planning remains deferred.
