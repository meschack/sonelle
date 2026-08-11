# Media Sources

## Owns

- Resolving stored book-cover and prepared-narration references into URLs a renderer can use.
- Classifying a requested source as available, missing, or invalid.
- The desktop adapter that translates local paths through Tauri's asset protocol.
- The fake adapter used by cover and narration tests.

## Refuses To Own

- Selecting, copying, deleting, downloading, or persisting media.
- EPUB cover extraction, narration preparation, audio playback, or reader presentation.
- Android document URIs and content-provider access until an Android adapter owns them.

## Interface

`MediaSourceGateway.resolve()` accepts a media kind and an opaque stored source. It returns one of
three explicit outcomes: an available renderer URL, missing media, or invalid media. Callers do not
construct Tauri asset URLs or inspect application-data paths.

The desktop adapter preserves already usable URLs and converts local paths with Tauri's asset
protocol. The application composition root shares one adapter across the catalog, import, export,
metadata, legacy narration, and manifest narration adapters. A future Android adapter can resolve
Sonelle-controlled files or content-provider sources without changing those consumers.

## Domain Events

None. Resolution is a synchronous platform projection. Import, metadata editing, narration
preparation, and playback continue to publish their owning domain events.

## Invariants

- Shared Solid components never construct platform-specific local URLs.
- Missing and invalid covers become absent presentation media.
- Manifest narration cannot enter playback without an available source.
- Platform conversion failures remain behind the gateway seam.

## Testing

Gateway tests cover existing URLs, desktop local-path conversion, converter failures, and all three
fake outcomes. Cover and narration adapter tests exercise the same fake interface used by later
platform adapters.
