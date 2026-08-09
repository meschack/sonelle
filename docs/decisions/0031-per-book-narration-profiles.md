# 0031: Per-Book Narration Profiles

## Status

Accepted.

## Context

Books differ in language, preferred voice, and comfortable pace. One global narration profile makes
switching books overwrite those choices and can activate an unsuitable voice.

## Decision

Narration settings are stored under a book-specific local key. `ReaderOpened` includes the book
language; the settings workflow loads and activates that book's profile before playback activation.
The existing global profile remains a migration-safe fallback for a book with no saved profile.

Voice, playback rate, volume, and auto-advance are remembered together. Reset affects only the open
book. Playback does not own settings activation; it reacts to the settings already projected by the
event flow.

## Testing

Repository tests cover book isolation and fallback. Workflow tests prove that opening a book loads
its profile and projects it to narration output.
