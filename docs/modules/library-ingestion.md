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
- EPUB parsing directly from transient Android provider URIs; source preparation stops at a durable
  readable file

## Interface

Renderer workflows depend on the small interfaces in `library-contracts.ts`. `BookImportGateway`
accepts either a request to choose a book or a source already supplied by a platform entry point. It
returns an explicit imported, selected-source, or cancelled outcome; unreadable sources reject. The desktop adapter
owns the file dialog, accepts drag-and-drop and file-open paths, invokes the native importer, and
resolves local assets through `MediaSourceGateway`. Shared workflows never call a desktop
selection interface or construct platform URLs directly.

The request's supplied source is intentionally opaque to the workflow. The desktop adapter treats it
as a path. The Android adapter opens the least-privilege system document picker with EPUB and common
fallback MIME types, normalizes the platform's rejected cancellation response, and probes the
returned document URI before publishing `BookImportSourceSelected`. It does not request broad
storage access. `BookImportSourceStore` copies that selected source into Sonelle-controlled storage
before provider permission can disappear. `BookImportSourcePrepared` then sends the managed file
through the shared native importer. Its transactional storage commit is followed by `BookImported`,
which refreshes the library projection and opens the book without an application restart. Native
`library_import` turns parsed EPUB data into a storage import. `library_migration` runs after startup on a blocking runtime task, reads legacy rows in
bounded keyset batches, and isolates individual repair failures.

## Domain Events

Import dispatches requested, source-selected, preparation-started, preparation-progressed,
source-prepared, cancelled, imported, and failed facts through the application
dispatcher. Native storage persists the resulting book, chapter, sentence, and paragraph
projections without maintaining a separate event history. Legacy repair logs failures to local
diagnostics and updates missing projections directly.

Readable manifest documents are available to spine extraction so relative footnote, endnote, and
citation targets can resolve across files. Reference markers are removed from narration text and
projected onto their owning sentence with an inline offset.

EPUB 3 navigation documents and NCX fallbacks are projected as an ordered, depth-bearing contents
list. Internal targets resolve to stored chapter identifiers and, when an anchor has readable text,
to the matching normalized sentence. Labels and hierarchy survive even when a publisher target is
missing; unresolved destinations remain explicitly unavailable instead of becoming unsafe links.

## Invariants

- library ports never import reader-owned DTOs
- exactly one platform import gateway is composed at the application edge
- cancellation is a normal outcome; unreadable sources are failures
- only fully written, synchronized Android sources receive an importable `.epub` path
- imported text, paragraph, sentence, and reference projections commit atomically
- contents metadata never injects publisher HTML or CSS into the reader
- repair never blocks Tauri setup and one unreadable book does not stop later repairs
- batches remain bounded and resumable by stable identifiers

## Tests

Rust tests cover EPUB edge cases, transactional import, search, assets, and multi-batch repair with an
isolated failure. A representative managed EPUB tracer covers parsing, atomic storage, immediate
listing, and reopening through the same native modules compiled for Android. Renderer workflow tests use a fake `BookImportGateway` to cover imported,
selected-source, cancelled, and unreadable-source outcomes through the same interface used by
production. The Android adapter contract instruments the picker and readability probe for successful
selection, platform cancellation, and revoked-source failure. Reader application and integration
tests preserve desktop dialog, drag-and-drop, and file-open behavior.
