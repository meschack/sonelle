# 0006: Library Power Tools

Status: accepted

## Context

Sonelle needs to move from a reader/playback demo toward a usable private library. The next layer must help users find books, jump around inside a book, keep useful places, export their data, tune audio playback, and clean prepared audio without exposing internal jobs or cache mechanics.

## Decision

Library power tools are split by responsibility:

- `@sonelle/library` owns pure book filtering, query normalization, and bookmark grouping helpers.
- `@sonelle/reader` owns in-reader sentence search and playback completion behavior.
- `@sonelle/audio` owns durable audio settings parsing and clamping.
- The desktop renderer owns user interaction, keyboard shortcuts, local settings storage, and download creation.
- Tauri commands own persisted library state: bookmarks, library search, book export data, and prepared audio cache cleanup.

Bookmarks, persisted search, and exports are backed by SQLite for imported books. The sample reader uses a local browser fallback so the development preview remains useful without requiring native storage.

## Consequences

- The user can bookmark the current sentence, search the current chapter, search/filter the library, export book data, adjust playback speed, disable auto-advance, and clear prepared audio.
- Keyboard shortcuts remain additive: space toggles playback, arrows move sentences, `b` toggles a bookmark, `/` focuses chapter search, and escape clears transient selection/search.
- The UI uses reader-facing states like "Prepared audio" and "Export ready" instead of leaking implementation details.
- Future work can expand exports and settings without moving persistence logic into the renderer.
