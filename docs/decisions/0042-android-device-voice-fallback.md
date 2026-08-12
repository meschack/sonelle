# 0042: Keep Android device voices explicit and outside prepared narration

## Status

Accepted

## Context

Sonelle's preferred mobile narration remains its own offline voice models. Those models are larger
and require preparation, while Android devices often already expose usable speech voices. A device
voice can keep reading available when a Sonelle voice has not been installed or cannot run well on
the phone, but its implementation, network use, quality, and privacy behavior belong to the speech
provider selected on that device.

Android's text-to-speech API reports sentence completion but does not provide a reliable playback
position that Sonelle can use to resume halfway through a sentence.

## Decision

Android device voices are an optional fallback shown in the normal voice picker. Sonelle never
selects one automatically after preparation or playback failure. Each option uses humane labels,
identifies itself as a device voice, and says when Android reports that it may require a network
connection.

A dedicated platform repository owns voice discovery and Android text-to-speech commands. A
dedicated narration gateway translates one utterance at a time into Sonelle's existing sentence
lifecycle events. Stopping interrupts the utterance. Pausing stops it, and resuming restarts the
current sentence.

Device voices do not create narration manifests, prepared audio, cache entries, or whole-book
downloads. Their identifiers use a separate `android-device:` namespace. Returning to a Sonelle
voice therefore restores the existing model-derived preparation identity without rewriting it.

## Consequences

- The book remains readable if a device voice fails, and the user can retry or choose another voice.
- A network-backed device voice may send the current sentence to its provider, so that possibility
  is disclosed both beside the voice and in the privacy panel.
- Device narration retains sentence-level highlighting but cannot resume within a sentence.
- Exact engine availability, interruption behavior, audio focus, and accessibility still require
  validation on physical Android devices before the fallback is called release-ready.
