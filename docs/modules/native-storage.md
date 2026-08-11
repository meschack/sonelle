# Native Storage

## Owns

- SQLite schema, migrations, transactions, and durable library projections
- local cover assets, EPUB reference projections, and reading-data queries

## Refuses To Own

- Solid state, UI copy decisions, TTS subprocesses, or dictionary HTTP requests
- EPUB archive parsing and text segmentation rules

## Interface

Chapter records persist EPUB references, links, and paragraph presentation metadata as separate JSON
projections. Links retain their sentence-relative UTF-16 range so the webview can render them without
altering the sentence text used by narration, search, and reading progress. Presentation records keep
structural kind, indentation, marker, and emphasis separate from normalized chapter text.
Book records persist the lightweight contents projection separately, including label, depth, chapter
target, and optional sentence target. Existing libraries migrate with an empty projection and fall
back to their stored chapter order.

`SonelleStore` exposes library use cases to thin Tauri commands. Transport models live in
`storage/model.rs`. Domain event dispatch stays outside native storage.

The database, managed covers, and managed EPUB sources are all derived from the application-data
directory behind one storage path model. Android cold starts therefore reopen the same SQLite
library; opening a book hydrates stored chapter projections and does not inspect or reparse its EPUB.
Library summaries perform only a lightweight health check for Sonelle-managed EPUB sources. A
missing or damaged source is reported as recoverable `needs-attention` state while the stored book
remains readable and can be restored by reimporting.

Reading-position updates also project their timestamp into library summaries. Startup uses that
fact to resume the most recently read book, while `open_book` restores the stored chapter and clamps
the sentence index to its readable range. A stale removed chapter is discarded and falls back to the
first readable chapter instead of leaking an invalid position to the reader.
After process reclamation, that durable position is restored with playback explicitly paused. The
storage layer never persists transient playing state, narration requests, or media-session state.

The `.readex` application-data directory is retained as an intentional compatibility path for
existing local libraries. New user-facing naming remains Sonelle.

Chapter references are stored as a compact JSON projection beside chapter metadata. Normal reader
queries load them only for the active chapter; export queries hydrate every chapter.

Book title, author, and cover edits update the local library projection without rewriting the
source EPUB. Replacement covers are copied into Sonelle's managed cover directory before the
database transaction commits; superseded managed covers are removed only after a successful commit.

Bookmark writes identify a stored book, chapter, and sentence, but native storage resolves the
sentence index and text from SQLite before committing. The deterministic bookmark identity and
unique passage constraint make repeated saves idempotent. Bookmark reads join the full target chain,
so a stale legacy row whose sentence disappeared is omitted instead of exposing a broken jump.

Library search runs against the persisted SQLite FTS projection and never requires a network
connection or the source EPUB. Queries use Unicode-aware tokenization and the same normalized
sentence text used by narration, so accented Latin, non-Latin scripts, and ordinary local passages
share one search path. Results include the stored book, chapter, sentence identity, sentence index,
and excerpt needed to open the exact passage without reparsing the book.

## Domain Events

Native storage does not journal domain events. Application workflows publish events through the
in-process dispatcher after their core storage operation succeeds.

## Invariants

- durable product state is stored in purpose-built tables rather than reconstructed from events
- library projections expose reading progress as a cumulative completed-sentence count across the
  book, derived from the active chapter position and bounded by the book's sentence count
- initialization removes the discontinued `domain_events` table from existing libraries
- opening a persisted book never depends on the continued presence of its managed EPUB source
- restored reading positions always address the active stored chapter and a bounded sentence index
- unresolved contents entries cannot manufacture a chapter or sentence destination
- bookmark text and position come from the stored sentence rather than renderer-supplied copies
- library search reads only persisted local projections and returns authoritative navigation context
- unmanaged desktop source paths retain their existing behavior and are not polled for health
- migrations preserve existing local libraries, including the intentional `.readex` compatibility path

## Tests

Rust tests use temporary SQLite databases and exercise the public store behavior, migrations,
search, bookmarks, exports, editable metadata and managed covers, cumulative cross-chapter progress,
removal of legacy event history, mobile-safe application-data paths, and cold restart behavior with
healthy, damaged, and missing managed EPUB sources.
Bookmark coverage includes idempotent saves, restart persistence, removal, authoritative passage
data, and stale-target filtering.
Search coverage includes empty and missing queries, accent-normalized Latin text, Japanese and
Cyrillic passages, result context, and exact stored sentence positions.
