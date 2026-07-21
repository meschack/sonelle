# 0028: Preserve EPUB References At Import

## Status

Accepted.

## Context

Flattening EPUB XHTML into chapter text discards links between noteref anchors and footnote,
endnote, or citation targets. It also leaves marker numbers in narration text and forces a reader to
navigate away from the chapter to inspect a note.

## Decision

Import reads every readable manifest document, including non-linear note documents. While extracting
spine text, it resolves fragment references relative to the source document, removes their visible
markers from narration text, and records marker, kind, content, sentence, and inline offset.

References are stored as a chapter projection and loaded only for the active chapter during ordinary
reading. The renderer inserts compact inline triggers and opens their content in a portal-backed
popover. The reader position and chapter never change.

## Consequences

- Newly imported books retain standards-based footnotes, endnotes, notes, and citations.
- Existing flattened books must be re-imported to acquire reference metadata.
- Unresolvable or untyped fragment links remain ordinary text rather than being guessed into notes.
- Reference text is excluded from narration until a future explicit note-narration feature exists.

## Testing

Rust fixtures cover cross-document notes and non-linear targets. Import and storage tests cover
sentence offsets and persistence. Reader integration covers opening a reference popover.
