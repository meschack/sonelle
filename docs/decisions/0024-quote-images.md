# 0024: Quote Images

## Status

Accepted.

## Context

Readers may want to keep or share a precise passage without taking an operating-system screenshot
and manually rebuilding its context. Paragraphs are often too broad for a quote, while arbitrary
text selection would turn the reader into a small image editor.

## Decision

The reader top bar offers one icon action that opens a scrollable sentence picker centered on the
active sentence. The reader can choose up to four contiguous sentences. The action dispatches
`QuoteImageRequested`; a dedicated workflow resolves the ordered selection, asks an exporter to
create a PNG, and dispatches either `QuoteImageCreated` or `QuoteImageFailed`.

The browser-edge exporter owns canvas rendering, PNG encoding, and download. It uses a fixed 2046
pixel landscape width, justified SpaceMono for the quote, Satoshi for references, Sonelle's actual
logo asset and color signature, and only the book title, author, and chapter. The canvas height is
derived from the wrapped quote within bounded minimum and maximum heights, so short quotes remain
balanced and longer quotes are not silently truncated.

## Ownership

- `reader-quote-image-workflow.ts` owns request handling, domain events, and UI notices.
- `reader-quote-image.ts` owns layout, drawing, PNG encoding, and download.
- `ProductBar` only exposes the command beside the local-storage status; it does not know how images
  are produced.

The feature refuses to own reader navigation, filesystem paths, remote sharing, templates, or an
image editor. It does not upload book text.

## Interface

- `QuoteImageExporter.export(content)` creates and downloads one PNG.
- `createReaderQuoteImageWorkflow(...).request(sentenceIds)` requests the selected passage.
- `createQuoteImageLayout(sentences, measureText)` produces a testable bounded layout.

## Domain Events

- `QuoteImageRequested`
- `QuoteImageCreated`
- `QuoteImageFailed`

## Testing

- Layout tests cover compact, growing, multi-sentence, and unusually long-token passages without
  text loss.
- Workflow tests cover successful export, failure reporting, and event projection.
- Reader integration verifies the top-bar action reaches the exporter and projects success.
