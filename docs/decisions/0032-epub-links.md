# 0032: Preserve EPUB Links

## Status

Accepted.

## Decision

EPUB import preserves links as chapter annotations while keeping their visible labels inside the
normalized sentence text.

Safe `http`, `https`, and `mailto` destinations are opened through a narrow platform adapter.
Internal EPUB destinations are resolved into a Sonelle chapter and sentence position, then routed
through the existing reader navigation application. Unsupported or executable URL schemes remain
readable text and are never passed to the operating system.

## Boundaries

- EPUB parsing owns resolving relative paths, fragments, and safe external destinations.
- Native storage owns persistence of link annotations, not link behavior.
- The reader owns rendering links without changing narration or search text.
- Reader navigation owns internal chapter and sentence jumps.
- The platform opener owns leaving Sonelle for the user's default browser or mail application.

## Testing

- Import tests cover safe external links, unsafe schemes, and internal chapter fragments.
- Projection and storage tests cover sentence destinations and persistence.
- Reader tests cover same-chapter and cross-chapter navigation.
- Platform tests cover the external URL-scheme allowlist.

## Migration

Existing chapter rows receive an empty link collection. Books imported before this decision must be
imported again because their stored plain text no longer contains the original destinations.
