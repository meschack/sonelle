# 0010: Active Chapter Reader Payload

Status: accepted

## Context

Large EPUBs made the reader pay for too much data on open and chapter switch. The reader UI only renders and narrates one chapter at a time, but the storage read model returned every sentence from every chapter. That made large books sluggish even when the active chapter was modest.

Chapter navigation still needs stable metadata for the whole book: title, order, and sentence count. Export and QA workflows still need full book data.

## Decision

The library reader document is now a lightweight active-chapter read model. It returns every chapter as navigation metadata, including sentence count, and hydrates sentence text only for the resolved active chapter.

The active chapter is selected in this order:

1. Requested chapter id, when valid.
2. Saved reading position chapter, when valid.
3. First chapter.

Full-book export uses a separate storage path that hydrates every chapter. UI code should not treat the reader document as a backup/export representation.

## Consequences

Opening a book and switching chapters avoids moving whole-book sentence payloads through Tauri and Solid state.

Reader progress and chapter navigation use sentence counts from chapter summaries rather than deriving totals from hydrated sentence arrays.

Any feature that needs a different chapter's sentence text must request that chapter explicitly instead of reaching into an already-open document.
