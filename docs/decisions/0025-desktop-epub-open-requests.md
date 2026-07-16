# 0025: Desktop EPUB Open Requests

## Status

Accepted.

## Context

Desktop readers expect to open a supported book from a terminal, from the operating system's
`Open With` menu, or by assigning the reader as the default application for that file type. These
requests may launch Sonelle or arrive while it is already running. A cold-start request can arrive
before the webview subscribes, while a second process must hand its arguments to the existing
instance rather than opening a competing library connection.

## Decision

Desktop bundles register Sonelle as an EPUB viewer. The native shell accepts file paths from the
initial process arguments, Tauri opened-file events, and the single-instance plugin. Relative CLI
paths resolve against the caller's working directory, and a missing extension becomes `.epub`
because EPUB is the only supported book format.

Linux packages use an explicit desktop-entry template with `%F`; declaring the MIME association
without that field code lists Sonelle in `Open With` but does not pass the selected paths to the
process.

The native shell stores normalized paths in a drainable inbox and emits `book-open-requested` only
as a wake-up signal. The frontend adapter subscribes before draining the inbox, drains it again for
every signal, and delivers paths serially. It then hands each path to the existing library
application, which dispatches `BookImportRequested`. Existing import listeners remain responsible
for importing or replacing the stored book, refreshing the library, and opening the resulting
reader document.

## Ownership

- `book_open_request.rs` owns desktop argument normalization, cold-start buffering,
  single-instance focus, and opened-file delivery.
- `book-open-request-adapter.ts` owns the Tauri event/command bridge and serial path delivery.
- `ReaderLibraryApplication` owns translating a delivered path into the existing import request.
- Tauri bundle configuration owns EPUB operating-system registration.

The platform adapter refuses to parse EPUBs, inspect library storage, determine whether a book was
already imported, or navigate the reader. The library workflow refuses to know whether a path came
from a terminal, file manager, or drag and drop.

## Interface

- `take_pending_book_open_requests` atomically drains native cold/warm requests.
- `BookOpenRequestAdapter.listen(onPath)` delivers requested paths in order and returns cleanup.
- `ReaderLibraryApplication.importFromPath(path)` remains the application entry point.

## Domain Events

- `BookImportRequested`
- `BookImported`
- `BookImportCancelled`
- `BookImportFailed`

`book-open-requested` is a platform wake-up signal, not a domain event and not journaled.

## Testing

- Native tests cover relative paths, omitted extensions, case-insensitive EPUB extensions,
  unsupported arguments, and exactly-once inbox draining.
- Adapter tests cover cold-start delivery, already-running delivery, serial imports, and cleanup.
- Library application tests prove an operating-system request enters the established event-driven
  import and open flow.
- Bundle verification inspects the generated Linux desktop entry for the EPUB MIME association.
