# 0033: Preserve EPUB Reading Structure

## Status

Accepted.

## Decision

EPUB import preserves lightweight paragraph presentation metadata alongside normalized reader text.
The projection records headings, quotations, ordered and unordered list entries, navigation entries,
indentation, numbering, and emphasis without storing or rendering arbitrary publisher HTML.

The book-level EPUB 3 navigation document, with NCX as fallback, is also retained as lightweight
contents metadata: readable label, nesting depth, stored chapter target, and optional sentence
target resolved from an internal anchor.

Native HTML lists provide their hierarchy directly. EPUBs that encode contents pages as flat
paragraphs are interpreted from their referenced CSS classes and inline styles. The reader applies
the resulting presentation while continuing to render the same sentence records used by narration,
search, bookmarks, and reading progress.

## Boundaries

- EPUB parsing owns interpreting safe structural HTML and the small CSS subset needed for hierarchy.
- Native storage owns persistence of the paragraph presentation projection, not visual styling.
- Missing navigation targets remain unavailable; import and reader code do not guess destinations.
- The reader owns mapping presentation metadata to Sonelle's typography and spacing.
- Publisher CSS is never injected into the webview.

## Testing

- Import tests cover nested native lists, ordered-list start values, CSS-authored indentation, and
  descendant emphasis.
- Storage tests cover presentation persistence across a reopened database.
- Reader tests cover presentation projection and structured rendering.
- Navigation tests cover hierarchy, internal anchors, and missing targets.

## Migration

Existing chapter rows receive an empty presentation collection and retain the current flat rendering.
Books imported before this decision must be imported again to recover structure and navigation
metadata discarded by the old importer. Their chapter-order fallback remains readable meanwhile.
