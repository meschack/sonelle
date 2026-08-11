# Media Sources

## Owns

- Resolving stored book-cover and prepared-narration references into URLs a renderer can use.
- Classifying a requested source as available, missing, or invalid.
- Desktop and Android adapters that translate managed local paths for their own webviews.
- The fake adapter used by cover and narration tests.

## Refuses To Own

- Selecting, copying, deleting, downloading, or persisting media.
- EPUB cover extraction, narration preparation, audio playback, or reader presentation.
- Android document URIs and content-provider access; imported media must already be Sonelle-managed.

## Interface

`MediaSourceGateway.resolve()` accepts a media kind and an opaque stored source. It returns one of
three explicit outcomes: an available renderer URL, missing media, or invalid media. Callers do not
construct Tauri asset URLs or inspect application-data paths.

The desktop adapter preserves already usable URLs and explicitly converts local paths with Tauri's
desktop asset protocol. The Android adapter delegates conversion to the mobile webview without
assuming the desktop URL shape. It only receives Sonelle-managed paths, never transient document
provider URIs. The application composition root selects one platform adapter and shares it across the
catalog, import, export, metadata, legacy narration, and manifest narration adapters.

## Domain Events

None. Resolution is a synchronous platform projection. Import, metadata editing, narration
preparation, and playback continue to publish their owning domain events.

## Invariants

- Shared Solid components never construct platform-specific local URLs.
- Missing and invalid covers become absent presentation media.
- Manifest narration cannot enter playback without an available source.
- Platform conversion failures remain behind the gateway seam.

## Testing

Gateway tests cover existing URLs, desktop and Android local-path conversion, converter failures,
and all three fake outcomes. Cover and narration adapter tests exercise the same fake interface used
by each platform adapter.
