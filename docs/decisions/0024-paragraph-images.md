# 0024: Paragraph Images

## Status

Accepted.

## Context

Readers may want to keep or share a paragraph without taking an operating-system screenshot and
manually rebuilding its context. The image must preserve the full paragraph, remain recognizably
Sonelle, and avoid turning the reading surface into a social-media editor.

## Decision

The reader top bar offers one icon action for the paragraph containing the active sentence. The
action dispatches `ParagraphImageRequested`; a dedicated workflow resolves the paragraph, asks an
exporter to create a PNG, and dispatches either `ParagraphImageCreated` or
`ParagraphImageFailed`.

The browser-edge exporter owns canvas rendering, PNG encoding, and download. It uses a restrained
2046 x 1440 landscape composition with justified SpaceMono for the passage, Satoshi for references,
Sonelle's actual logo asset and color signature, and only the book title, author, and chapter. Type
reduces within the fixed canvas for long paragraphs rather than silently dropping text.

## Ownership

- `reader-paragraph-image-workflow.ts` owns request handling, domain events, and UI notices.
- `reader-paragraph-image.ts` owns layout, drawing, PNG encoding, and download.
- `ProductBar` only exposes the command beside the local-storage status; it does not know how images
  are produced.

The feature refuses to own paragraph selection, reader navigation, filesystem paths, remote
sharing, templates, or an image editor. It does not upload book text.

## Interface

- `ParagraphImageExporter.export(content)` creates and downloads one PNG.
- `createReaderParagraphImageWorkflow(...).request()` requests the active paragraph image.
- `createParagraphImageLayout(text, measureText)` produces a testable bounded layout.

## Domain Events

- `ParagraphImageRequested`
- `ParagraphImageCreated`
- `ParagraphImageFailed`

## Testing

- Layout tests cover short, long, and unusually long-token paragraphs without text loss.
- Workflow tests cover successful export, failure reporting, and event projection.
- Reader integration verifies the top-bar action reaches the exporter and projects success.
