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
`library_import` turns parsed EPUB data into a storage import. EPUB reading, normalization, and the
SQLite transaction run on a blocking runtime worker rather than the Tauri async runtime, so a large
book cannot hold the webview's command loop. The native command reports `reading` and `saving`
phases through its IPC channel; the shared workflow republishes those as `BookImportProgressed`
facts, and the library application projects humane status text without letting platform callbacks
mutate Solid state directly. `library_migration` runs after startup on a blocking runtime task, reads
legacy rows in bounded keyset batches, and isolates individual repair failures.

## Domain Events

Import dispatches requested, source-selected, preparation-started, preparation-progressed,
source-prepared, import-progressed, cancelled, imported, and failed facts through the application
dispatcher. Native storage persists the resulting book, chapter, sentence, and paragraph
projections without maintaining a separate event history. Legacy repair logs failures to local
diagnostics and updates missing projections directly.

Backgrounding does not cancel an active native import. If Android keeps the process, its progress and
terminal fact reconcile through the same projection when the webview resumes. If Android removes the
process, the SQLite transaction exposes no partial book and the content-addressed managed source can
be reused when the reader retries the import. This is the recoverable state; Sonelle never guesses
that an interrupted book was successfully added.

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
- native EPUB parsing and persistence never execute on the async command runtime
- import progress reaches presentation only through domain facts and application projections
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
tests preserve desktop dialog, drag-and-drop, and file-open behavior. The large-import concurrency
tracer holds the native gateway unresolved while proving reader navigation remains available, then
checks ordered phase projection and terminal reconciliation. The ignored performance harness records
real EPUB parse, persistence, open, and chapter-switch durations against the benchmark corpus; device
ANR and timing gates remain part of the physical-device worksheet.
