# Android Book Import Sources

## Owns

- reading picker-granted Android document sources while their permission is valid
- copying selected EPUB bytes into Sonelle-controlled application storage
- content-addressed naming, duplicate reuse, progress reporting, cancellation, and partial cleanup

## Refuses To Own

- Android document selection and MIME filtering
- EPUB parsing, metadata extraction, library persistence, or reader presentation
- broad storage access or long-lived dependence on document-provider permissions

## Interface

Renderer workflows depend on `BookImportSourceStore`. Its native adapter accepts the opaque source
selected by `BookImportGateway`, a unique request ID, an abort signal, and a progress observer. A
successful preparation returns a filesystem path under the application's `import-sources` directory
and whether an identical source was already present.

Native copying streams into a request-scoped `.partial` file while calculating SHA-256. After the
file is flushed and synchronized, it is atomically renamed to `<sha256>.epub`. Existing content with
the same digest is reused. A staged-file guard removes partial data after read errors, write errors,
insufficient space, or cancellation.

## Domain Events

The shared library workflow publishes preparation started, byte progress, source prepared, and
preparation cancelled events. Copy failures use the existing `BookImportFailed` fact so the library
surface can provide humane feedback without learning filesystem or document-provider details.

## Invariants

- document-provider URIs are transient inputs, never durable library sources
- only a completed atomic promotion creates an importable managed source
- destination identity depends on source content, not provider naming or URI stability
- duplicate selection reuses one durable source
- cancellation and failure leave no `.partial` source behind

## Tests

Rust tests cover durable success, readability after the original reader is gone, duplicate reuse,
interruption cleanup, and insufficient-space feedback. Renderer adapter and workflow tests cover
native progress forwarding, cancellation delivery, lifecycle events, and prepared-source handoff.
