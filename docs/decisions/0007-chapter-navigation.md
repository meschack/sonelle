# 0007: Chapter Navigation

Status: accepted

## Context

Sonelle needs real-book navigation before progress, jumping, and QA can be useful. The reader previously rendered only the active chapter, which meant the UI had no stable table-of-contents model.

## Decision

`ReaderView` now carries lightweight chapter navigation items alongside the active chapter sentences. The active chapter still owns the rendered sentence list; other chapters are represented only by title, id, index, and sentence count.

Selecting a chapter rebuilds the active reader view for that chapter and starts at sentence `0`. This keeps sentence highlighting, reader search, bookmark filtering, audio prefetch, and saved reading position tied to one active chapter at a time.

The sample book includes multiple chapters so the web/dev preview can exercise chapter navigation without importing an EPUB.

## Consequences

- Imported books can expose a usable table of contents without loading extra renderer state.
- Chapter switching intentionally resets transient reader state such as active word selection and in-chapter search.
- Later progress and jump behavior can build on the same chapter list instead of deriving navigation from raw import DTOs.
