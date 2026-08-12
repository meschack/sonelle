# Android Device Voice

## Owns

- discovery and humane projection of Android-provided voices
- the native text-to-speech bridge for speaking and stopping one sentence
- translation of native completion, interruption, and failure into narration domain events
- explicit routing between Sonelle narration and the selected device voice

## Refuses To Own

- automatic fallback selection
- prepared narration, model installation, caching, or whole-book downloads
- reader navigation, sentence segmentation, or settings persistence
- claims about a third-party speech provider's privacy or offline availability

## Interface

The native plugin exposes list, speak, and stop commands. The frontend repository converts native
voice records to `NarrationVoice` values under the `android-device:` identifier namespace. The
device narration gateway implements `NarrationGateway`; the routing gateway delegates to it only
while an explicit device identifier is selected.

Android reports whether each voice requires a network connection. Sonelle retains that fact in the
voice description and privacy disclosure. Pause is intentionally modeled as stop plus restart of
the current sentence because Android provides no trustworthy mid-utterance resume position.

## Domain Events

The gateway publishes `NarrationPreparationStarted`, `PassageNarrationReady`,
`NarrationSentenceEntered`, `NarrationPlaybackPaused`, `NarrationPlaybackInterrupted`,
`NarrationPlaybackEnded`, and `NarrationPlaybackFailed` using the same sentence contract as Sonelle
voices.

## Testing

Repository tests cover discovery, labels, network disclosure, and command validation. Gateway tests
cover lifecycle order, stale native completion, stop, restart-on-resume, failure, and explicit-only
routing. Rust tests cover request validation. Android builds verify the Kotlin bridge; physical
device behavior remains a deferred release-validation task.
