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

Voice-pack identities are revision-qualified. A removal request names one exact pack id and one
exact revision; a stale request never resolves to a newly installed revision, and duplicate or
ambiguous inventory fails closed to a needs-attention state instead of picking a copy.

The policy returns a plan and performs no filesystem operation. The application workflow re-inspects
storage and re-reads playback activity after the reader confirms, then executes only a freshly
approved plan, so the world cannot change behind an open dialog.

The native adapter derives two canonical narration roots from the application-data directory:
prepared narration lives in `$APPDATA/narration-v3`, and managed narration engines and packs live
in `$APPDATA/narration-engines`. Nothing else is eligible for cleanup: `sonelle.sqlite3`, covers,
imported sources, managed Piper runtime files, and device TTS are structurally outside its
interface. Before deleting, the adapter repeats identity and path-containment verification while
holding the same owner lock used by prepared-audio writes or pack installation, so cleanup can
never interleave with an installer or a cache write. Native code never trusts a renderer-supplied
`verified` flag; a removable pack must match the trusted catalog and pass its install-record
verification. Until #104 lands accepted Android pack artifacts, Android inspection reports an
honest empty pack inventory instead of synthesized readiness.

The reader never sends a filesystem path. Removal requests carry typed identities only, and no
public API surface accepts a path parameter.

## Consequences

- Low-space failure is recoverable before installation commits files.
- Resumed downloads receive credit for bytes already staged without consuming the safety reserve.
- Cleanup adapters do not need to duplicate confirmation, activity, or verified-pack rules.
- A stale removal request cannot destroy a pack the reader just updated; it resolves as not-found
  and the dialog closes without deleting anything.
- Desktop prepared-audio removal stays event-driven through the existing executor, so preparation
  cancellation still precedes file deletion. Voice-pack removal runs directly through the guarded
  native command under the installation lock.
- Partial-install quarantine and deletion remain owned by the installer, not the ready-pack cleanup
  path.
- Android production wiring — real available-bytes at install commit time, accepted pack inventory,
  and installed-pack cleanup — remains deferred to #104 and #110 with device proof.

## Testing

Package tests cover sufficient and insufficient space, staged-byte accounting, confirmation,
active prepared audio, active voice packs, verified-pack boundaries, missing targets, revision
stale-identity rejection, ambiguous inventory, exact narration-only removal plans, and approved
targets that carry no filesystem path.

Reader application tests cover the guarded workflow through fakes: preflight delegation,
needs-attention projection without installation, confirmation open/cancel/confirm, activity races
between request and confirmation, stale revisions while the dialog is open, repository failure
recovery, concurrent double-confirm, book-change dismissal, and honest empty inventories.

Native tests use temporary application-data roots with sentinel files: sibling-book preservation,
protected reader data outside narration roots, exact revision removal preserving other revisions
and packs, traversal/symlink/canonical escape refusal, dangerous identity rejection, idempotent
missing targets, unreadable metadata without broad cleanup, saturating byte accounting, and a
removal payload type that drops any renderer-supplied path field.

Android device integration tests will prove available-space inspection and exact target deletion
when the Android voice-pack and prepared-audio adapters land behind #104 and #110.

## Related Decisions

- [0035: Android-First Mobile Architecture](0035-android-first-mobile-architecture.md)
- [0036: Stable Narration Gateway](0036-narration-gateway.md)
- [0038: Restore Durable Reading State, Not Transient Playback](0038-process-reclamation-recovery.md)
