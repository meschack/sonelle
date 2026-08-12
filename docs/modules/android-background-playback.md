# Android Background Playback

## Owns

- Keeping an active Android narration process in the foreground while audio is playing.
- The low-importance narration notification and Android media session.
- Lock-screen resume, pause, stop, previous-sentence, and next-sentence actions.
- Wired-headset and Bluetooth media-button delivery plus safe active-output disconnection handling.
- Translating notification actions into `MediaSessionGateway` intents.
- Releasing the foreground service when playback ends, the reader closes, or the user stops it.

## Refuses to own

- Narration generation, prepared-audio storage, or voice selection.
- Reader playback state, sentence highlighting, chapter transitions, or reading-position storage.
- Audio-focus policy, which remains in the Android audio-focus adapter.
- Restarting narration after Android kills the application process.

## Interface

The renderer publishes the same book, chapter, and playback snapshot used by the shared media-session
seam. `BackgroundPlaybackPlugin` maps that snapshot to a small native service policy:

- `playing` starts the foreground service or updates its notification;
- `paused` updates an already-active service but never starts one by itself;
- `idle`, `ended`, reader close, and explicit clear stop the service;
- notification and lock-screen controls return `play`, `pause`, `stop`, and sentence-seek intents to
  the shared playback application.

The media session publishes the book as the title, author as the artist, chapter as the album, and
active sentence index/count as track-number metadata. It deliberately omits a duration and timeline:
Sonelle can navigate exact sentences but cannot honestly promise book-wide millisecond seeking.
Previous and next therefore move exactly one sentence through the shared bounded jump behavior.
Repeated play or pause callbacks are suppressed after the first state change; repeated previous and
next actions remain meaningful user navigation.

Headset and Bluetooth media buttons enter through the same Android media-session callbacks, so they
cannot grow accessory-specific reader branches. While narration is playing, Android's
`ACTION_AUDIO_BECOMING_NOISY` signal emits one `output-disconnected` intent and immediately projects
the native session as paused. Duplicate disconnect broadcasts are ignored until the user deliberately
starts playback again. Reconnecting an output emits nothing and never resumes narration.

The service never edits reader state. This prevents notification state and the visible reader from
becoming competing authorities.

## Android behavior and restrictions

- Android 8 and newer use `startForegroundService`; Sonelle posts the notification immediately.
- Android 13 and newer ask for notification permission when narration first starts. A denied prompt
  does not silently change reader state, though Android may keep foreground-service disclosure out of
  the normal notification drawer.
- Android 14 and newer declare both the media-playback foreground-service permission and service type.
- The service is started by the user's visible playback action. Sonelle does not attempt a restricted
  cold background start or resurrect narration after process death.
- The notification is low importance and silent. It exists for playback survival and controls, not
  to nag the reader like a needy group chat.

## Domain events

The service emits no domain events directly. Notification actions cross `MediaSessionGateway`; the
reader playback application then updates narration and reading projections through the existing
domain lifecycle.

## Testing

- TypeScript adapter tests cover metadata publication, duplicate suppression, native controls, and
  clear behavior.
- JVM tests cover start, update, pause, end, and notification-stop service policy.
- Lock-screen policy tests cover idempotent play/pause, explicit stop, and sentence navigation.
- Output-disconnect policy tests cover inactive output changes, duplicate broadcasts, and explicit
  playback restart.
- An Android instrumented test verifies the service is private and declares `mediaPlayback`.
- Reader integration coverage verifies backgrounding flushes reading position without pausing.
- Physical background, lock-screen, notification-permission, and vendor battery-policy QA remains a
  release-device check.
