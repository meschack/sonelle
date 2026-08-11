# 0039: Narration Cleanup Uses Typed, Guarded Targets

## Status

Accepted.

## Context

Offline voice packs and prepared narration can consume meaningful storage on a phone. Cleanup must
reclaim those files without giving narration code broad deletion access to the application-data
directory, where books, bookmarks, settings, and reading positions also live. Installation also
needs a deterministic space check before it begins writing a large pack.

The Android storage adapter and installed mobile narration packs are still being built. The safety
policy must be testable without inventing a premature filesystem interface around paths that are not
yet stable.

## Decision

`@sonelle/audio/narration` owns two pure storage-maintenance decisions:

- voice-pack installation preflight compares available bytes with the unstaged manifest bytes plus
  a retained free-space reserve;
- cleanup planning approves only a typed prepared-audio book target or verified voice-pack target.

Cleanup requires explicit confirmation. Prepared audio for an active listening session cannot be
approved for removal, even while paused, until the session is stopped. The selected voice pack
cannot be approved until another pack is selected. Unverified directories are not presented as
ready packs and therefore cannot cross the verified-pack removal path.

The policy returns a plan and performs no filesystem operation. The future Android adapter will
inspect native storage and execute only an approved narration target. Reader-library entities and
paths are deliberately absent from the policy interface.

## Consequences

- Low-space failure is recoverable before installation commits files.
- Resumed downloads receive credit for bytes already staged without consuming the safety reserve.
- Cleanup adapters do not need to duplicate confirmation, activity, or verified-pack rules.
- A later native adapter can use platform storage APIs without changing the product policy.
- Partial-install quarantine and deletion remain owned by the installer, not the ready-pack cleanup
  path.

## Testing

Package tests cover sufficient and insufficient space, staged-byte accounting, confirmation,
active prepared audio, active voice packs, verified-pack boundaries, missing targets, and exact
narration-only removal plans.

Native integration tests will prove available-space inspection and exact target deletion when the
Android voice-pack and prepared-audio adapters land.

## Related Decisions

- [0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md)
- [0036: Stable Narration Gateway](0036-narration-gateway.md)
- [0038: Restore Durable Reading State, Not Transient Playback](0038-process-reclamation-recovery.md)
