# 0004: Local Sentence Narration

## Status

Accepted.

## Decision

Readex Next prepares and plays narration one sentence at a time.

The renderer talks to a small `NarrationGateway` from `packages/audio`. The gateway exposes three actions:

- prepare sentence audio
- play prepared sentence audio
- stop prepared sentence audio

The desktop app provides the real gateway through Tauri commands. Browser and test workflows use a deterministic fake gateway.

Native audio preparation caches sentence narration locally. When a local TTS command can write a WAV file, the native layer stores `sentence.wav` and returns it as an audio data URL. When only Speech Dispatcher is available, the native layer stores the sentence text and plays it through `spd-say`.

## Why

Sentence narration needs native capabilities, but reader UI should not know about subprocesses, cache paths, or installed speech tools.

This boundary keeps responsibilities clean:

- `packages/audio` owns the narration contract and fake adapter.
- Tauri commands own local process and cache access.
- Reader UI owns playback intent, sentence highlighting, and friendly status text.

The fake adapter is intentionally deterministic so tests and fixture workflows do not depend on machine voices, codecs, or timing metadata.

## Alternatives Considered

Word-level audio:

- Requires word timestamp metadata or engine-specific alignment.
- Adds timing churn to the reading surface.
- Conflicts with the sentence-level highlighting decision.

Renderer-owned TTS:

- Easier for a prototype.
- Would leak platform details into UI code.
- Makes offline desktop behavior harder to test cleanly.

Remote TTS first:

- Useful later for better voices.
- Wrong first dependency for an offline-first local reader.

## Consequences

The first native adapter is intentionally modest:

- It prefers file-producing local TTS commands such as `espeak-ng`, `espeak`, or `pico2wave`.
- It falls back to Speech Dispatcher when available.
- It reports `needs attention` when no local speech path exists.

The renderer advances highlighting when the active sentence finishes playing. It does not expose cache generation, subprocess work, chunks, queues, or other internals to the user.

Future adapters can add richer voices, remote synthesis, or better timing without changing reader UI.

## User-Facing Language

Use:

- ready to listen
- preparing audio
- needs attention

Avoid:

- chunk
- worker
- job
- queue
- synthesis pipeline
