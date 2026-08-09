# 0030: Editable Local Book Metadata

## Status

Accepted.

## Context

EPUB metadata and covers are often incomplete or ugly. Editing the archive itself would couple a
reader preference to ZIP rewriting and could damage the user's original file.

## Decision

Sonelle edits its local library projection only. A native storage command validates title and
author, copies a selected cover into managed application storage, and transactionally updates the
book row. The original EPUB remains untouched.

`BookMetadataUpdateRequested` starts the work. Independent `BookMetadataUpdated` listeners project
the open Reader, refresh Library cards, and show completion feedback. Failures publish
`BookMetadataUpdateFailed` and are recorded by diagnostics.

## Testing

Rust storage tests prove that a selected cover remains available after its source file is removed.
Workflow tests cover event reactions, and Reader integration covers editing the active book.
