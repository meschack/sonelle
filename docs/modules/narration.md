# Narration

## Owns

- voice catalog metadata and language-aware voice resolution
- narration request identity, prefetching, and playback readiness contracts
- the desktop adapter for native Piper preparation and playback
- selected-voice installation status, progress, verification, and retry

## Refuses To Own

- reader UI state, chapter navigation, or reading progress
- book-language detection and EPUB metadata extraction
- persisted reader preferences

## Interface

Reader workflows depend on `PrefetchingNarrationGateway`. Voice labels, locales, descriptions, and
the default voice come from `packages/audio/src/narration-voices.json`. Browser media lifecycle is
hidden behind the injected `HtmlAudioPlayer` interface.

## Domain Events

`AudioPreparationRequested`, `SentenceAudioReady`, and `AudioPreparationFailed` describe the
reader-visible narration lifecycle. `VoiceInstallationRequested`, `VoiceInstallationReady`, and
`VoiceInstallationFailed` describe the separately managed offline voice lifecycle.

## Tests

Package tests cover voice selection, settings, request identity, and prefetch behavior. Rust tests
cover native request validation, cache behavior, the shared default voice catalog, platform
selection, safe extraction, and verified voice files without making network requests.
