# 0029: Narration Session Limits React To Playback Events

## Status

Accepted.

## Context

Duration timers can stop immediately, but paragraph and chapter limits must follow actual narration
boundaries. UI timers or sentence-index polling can race playback and accidentally enter the next
passage or chapter.

## Decision

The reader session-control application publishes a selected limit and reacts to canonical playback
events. Paragraph limits stop only when a passage ends on the paragraph's final sentence. Chapter
limits react to chapter playback end and temporarily block the automatic chapter handoff. Duration
limits publish the same reached event from an owned timer.

The narration session rechecks cancellation after passage-end listeners run, preventing a listener
that paused playback from being followed by automatic entry into the next passage.

## Consequences

- Limits are scoped to the current reader session and clear after they fire or the reader closes.
- Playback orchestration remains the only owner of audio stopping and chapter transition.
- No background timer survives application cleanup.

## Testing

Application tests cover duration, true paragraph boundaries, and chapter blocking. Audio tests prove
that stopping from a passage-end listener cannot start the next passage.
