# Reader Experience

## Owns

- composing the reader's UI state and user workflows
- coordinating library, narration, dictionary, preferences, and dispatcher interfaces
- projecting domain state into reader, library, and inspector surfaces

## Refuses To Own

- SQLite statements, EPUB parsing, TTS subprocesses, or HTTP response parsing
- construction details for platform adapters
- reusable playback, progress, segmentation, or dictionary rules

## Interface

`ReaderExperience` accepts an optional `ReaderExperienceDependencies` bundle. Production callers use
`createReaderExperienceDependencies`; integration tests can provide stable fakes.

The composition root exposes stable, getter-backed view models to the library and inspector
surfaces. Each model is split by responsibility so those surfaces receive one meaningful interface
instead of mirroring every signal and workflow as a component prop.

The Tools inspector exposes separate color swatches for active narration and bookmarked passages.
The reader shell projects those preferences as CSS variables and derives readable foreground colors
without putting persistence or validation logic in Solid components.

Rendered paragraphs receive layout data directly and obtain reading interactions from the scoped
`ReaderContentProvider`. The provider owns no state or services; it only exposes reader-content
actions and projections for the current reader tree. Active-sentence membership uses Solid's
selector primitive so a narration step invalidates the previous and next sentence consumers rather
than every visible sentence. Imported Android books enter this same reader projection: persisted
sentence identifiers, paragraphs, lists, links, and lightweight presentation metadata are not
reconstructed by a mobile-only UI.

The window key listener delegates interpretation to `resolveReaderKeyboardShortcut`. The
composition root only routes semantic commands into existing workflows; it does not duplicate
playback, navigation, import, or export logic for keyboard input.

Cross-book search is projected as a full Library workspace rather than a sidebar-only result list.
The composition root owns only the debounced query and result projections; native storage owns
full-text matching, while the navigation application opens a result at its book, chapter, and
sentence context.
Empty queries remain idle, no-result feedback stays inside the Library workspace, and matching text
is highlighted without changing the persisted excerpt. Because the command is asynchronous and the
matching database is local, searching does not introduce a network dependency or block the active
reader path on Android.

Distraction-free reading is transient presentation state. It hides application chrome without
mutating either sidebar preference, so leaving the mode restores the reader layout exactly as the
user left it. Narration and sentence-level keyboard controls remain active while the chrome is
hidden.

Reading-position changes continue through the shared throttled scheduler. Manual navigation saves
immediately, narration progress is coalesced, and backgrounding the webview flushes the pending
position before pausing playback. On a cold start, the library application opens the book with the
latest persisted reading activity; native storage remains the authority for its chapter and sentence
fallback.

The responsive reader exposes the stored EPUB contents through a temporary touch-safe panel. Its
entries preserve nesting through indentation and route valid chapter or anchor selections through
the shared navigation application. Closing the panel returns to the unchanged reader; unavailable
publisher targets are shown disabled rather than guessed.

At phone width, the composition root selects the dedicated mobile reader shell described in
`mobile-reader-shell.md`. Reader content and applications remain shared; only their chrome and slot
placement change. Desktop rails are not mounted and squeezed into the phone viewport.

Bookmark controls remain part of the shared reader and playback surfaces on Android. Saving or
removing the active sentence refreshes the native bookmark projection through domain events, while
opening a saved passage uses the same book, chapter, and sentence navigation path as desktop.

## Domain Events

Library workflows complete their core operation and dispatch the resulting event. `ReaderOpened`
and `ReaderClosed` independently drive playback, surfaces, rails, and bookmark refresh. Settings,
lookup, installation, export, cache clearing, and narration reactions follow the same pattern.
Domain events are dispatched to live listeners and are not journaled in the database.

## Invariants

- initiating workflows publish facts; independent listeners own follow-up reactions
- UI modules depend on product-facing application views, not platform or narration-provider types
- surface models are stable objects whose getters preserve Solid's fine-grained tracking
- scoped reader-content interactions must not grow into an application-wide service locator
- closing the reader stops its playback scope before the library surface becomes active

## Tests

Pure reader behavior is tested in `apps/desktop/src/reader/*.test.ts`. Workflow tests use fake
repositories and the real dispatcher to prove that producers publish facts and listeners react
without mocking Tauri globals. `reader-experience.integration.test.tsx` characterizes navigation
across every inspector surface through the composed reader shell.
An imported-book tracer opens a structurally rich document from the Library and verifies its first
chapter, link and list presentation, stable sentence range, and bounded mounted content. Native EPUB
tests commit both small and structurally complex fixtures before reopening their reader documents.
Lifecycle tests cover background flushing and most-recent-book restoration, while the shared
scheduler tests bound write frequency during narration.
Contents tests cover nested labels, anchor-level navigation, panel dismissal, and unavailable
targets across native import, storage, projection, and the composed reader.
The Android bookmark tracer covers visible add/remove state and an exact saved-passage jump; native
tests cover restart, duplicate saves, and vanished targets.
The Android library-search tracer covers idle empty input, no matches, non-Latin highlighting, book
and chapter context, and navigation to the exact persisted sentence.
