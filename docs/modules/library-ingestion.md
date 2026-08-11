# Library Ingestion And Repair

## Owns

- platform-neutral library interfaces and document models
- EPUB source acquisition through `BookImportGateway`, followed by import, metadata recovery,
  reference resolution, segmentation, and transactional persistence
- background repair of missing language and paragraph projections in legacy libraries
- catalog, bookmark, search, export, cover-asset, and reading-position adapters

## Refuses To Own

- reader presentation models, playback activation, Solid state, or narration preparation
- dictionary lookup and provider selection
- Android document-picker and sandbox-copy mechanics; the Android gateway adapter owns those when it
  is introduced

## Interface

Renderer workflows depend on the small interfaces in `library-contracts.ts`. `BookImportGateway`
accepts either a request to choose a book or a source already supplied by a platform entry point. It
returns an explicit imported or cancelled outcome; unreadable sources reject. The desktop adapter
owns the file dialog, accepts drag-and-drop and file-open paths, invokes the native importer, and
resolves local assets through `MediaSourceGateway`. Shared workflows never call a desktop
selection interface or construct platform URLs directly.

The request's supplied source is intentionally opaque to the workflow. The desktop adapter treats it
as a path; a later Android adapter may treat it as a document URI and copy the content into
Sonelle-controlled storage before opening it. Native `library_import` turns parsed EPUB data into a
storage import. `library_migration` runs after startup on a blocking runtime task, reads legacy rows in
bounded keyset batches, and isolates individual repair failures.

## Domain Events

Import dispatches requested, cancelled, imported, and failed facts through the application
dispatcher. Native storage persists the resulting book, chapter, sentence, and paragraph
projections without maintaining a separate event history. Legacy repair logs failures to local
diagnostics and updates missing projections directly.

Readable manifest documents are available to spine extraction so relative footnote, endnote, and
citation targets can resolve across files. Reference markers are removed from narration text and
projected onto their owning sentence with an inline offset.

## Invariants

- library ports never import reader-owned DTOs
- exactly one platform import gateway is composed at the application edge
- cancellation is a normal outcome; unreadable sources are failures
- imported text, paragraph, sentence, and reference projections commit atomically
- repair never blocks Tauri setup and one unreadable book does not stop later repairs
- batches remain bounded and resumable by stable identifiers

## Tests

Rust tests cover EPUB edge cases, transactional import, search, assets, and multi-batch repair with an
isolated failure. Renderer workflow tests use a fake `BookImportGateway` to cover imported,
cancelled, and unreadable-source outcomes through the same interface used by production. Reader
application and integration tests preserve desktop dialog, drag-and-drop, and file-open behavior.
