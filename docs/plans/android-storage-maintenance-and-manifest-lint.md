# Android Storage Maintenance and Manifest/Lint Cleanup

## Purpose

This is the execution plan for the next two Sonelle workstreams:

1. implement the remaining portion of [#128](https://github.com/meschack/sonelle/issues/128)
   that can be proved without an Android phone or emulator;
2. remove the five observed Android lint errors and make the fix resistant to regeneration.

The plan is intentionally explicit. Follow it in order, keep the two workstreams in separate commits,
and do not claim device behavior that was only exercised through a fake.

## Current baseline

At the time this plan was written:

- the branch is `main`, aligned with `origin/main`, at `d1be9f8`;
- the worktree is clean;
- #128 is open and formally blocked by #104 and #110;
- `packages/audio/src/narration-storage-maintenance.ts` already contains the pure policy for free-space
  preflight and guarded removal;
- `packages/audio/src/narration-storage-maintenance.test.ts` already proves the policy cases;
- ADR 0039 records that policy and explicitly defers native integration;
- Android currently reports five lint errors:
  - `MissingTvBanner`;
  - `ImpliedTouchscreenHardware`;
  - `AppLinkUrlError`: missing host;
  - `AppLinkUrlError`: missing scheme;
  - `NewApi`: the notification builder assumes API 26 despite a minimum API of 24;
- Android device and emulator testing are deliberately unavailable for this batch.

Read these before changing code:

- `AGENTS.md`;
- `.codex/skills/readex-steward/SKILL.md`;
- `docs/decisions/0035-android-first-mobile-architecture.md`;
- `docs/decisions/0039-narration-storage-maintenance.md`;
- `docs/modules/narration.md`;
- issue #128, issue #104, and issue #110.

## Non-negotiable boundaries

- Do not close #128 in this batch. Its Android installation-commit check and real installed-pack cleanup
  depend on #104/#110 and still require device proof.
- Do not turn a host-compatible model candidate into an accepted Android offline voice pack.
- Do not use a renderer-supplied filesystem path for deletion. The renderer may send typed identities
  only: a book ID, or a verified pack identity.
- Do not give narration cleanup access to the application-data root.
- Do not delete books, SQLite data, covers, imported EPUB sources, bookmarks, settings, or positions.
- Do not automatically stop narration and then delete active prepared audio. The policy deliberately
  requires the reader to stop listening first.
- Do not expose implementation vocabulary such as cache, queue, chunk, worker, or cache key in UI copy.
- Do not suppress the five lint errors. Correct the manifest and notification semantics that caused them.
- Do not pretend Sonelle supports Android TV. It currently has neither TV navigation nor a TV-specific UI.
- Do not hand-edit Tauri-generated file-association content without also changing its source configuration.
- Do not add Android device voices to storage maintenance. They belong to the operating system and are
  neither Sonelle voice packs nor removable Sonelle files.

## Definition of done for this batch

This batch is done when all of the following are true:

- low-space preflight is used by a testable application workflow before a Sonelle-managed voice-pack
  installation is requested;
- a low-space result becomes a recoverable `needs-attention` presentation and does not call install;
- prepared-audio removal requires a visible confirmation and refuses an active listening session;
- the existing desktop prepared-audio executor is still functional behind the guarded workflow;
- inactive verified-pack removal is fully covered at the policy/application boundary with a fake repository,
  but production UI is hidden or disabled when the repository cannot supply an accepted verified pack;
- native path-containment helpers are tested against traversal, symlink escape, wrong roots, ambiguous pack
  identities, and protected sibling data;
- the issue/PR explicitly lists the Android production wiring and device proof still deferred to #104/#110;
- the Android source manifest no longer advertises Leanback/TV support;
- Android generation does not advertise EPUB opening or sharing before Sonelle owns the corresponding intent
  intake;
- `lintUniversalDebug` reports zero errors;
- a debug Android package builds without a phone or emulator;
- normal TypeScript, frontend, Rust, formatting, and clippy checks pass.

---

## Workstream A: remaining testable portion of #128

### A0. Establish a clean, reproducible branch

1. Fetch and fast-forward `main`.
2. Confirm `git status --short --branch` is clean.
3. Create `feat/android-storage-maintenance` from current `main`.
4. Capture the pre-change focused baselines:

   ```sh
   pnpm vitest run packages/audio/src/narration-storage-maintenance.test.ts
   pnpm vitest run apps/desktop/src/reader/reader-offline-narration-application.test.ts
   cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml narration_storage
   ```

   The last command may initially select zero tests because the native module does not exist yet. Record that
   fact; it is not a failure.

5. Inspect #104 and #110 again. If either has landed since this plan was written, use its real pack/cache root
   and verification interfaces. Do not create competing roots.

### A1. Write the executable acceptance matrix before implementation

Add a test checklist to the PR description or a temporary issue comment with four columns:

| Acceptance statement                 | Proved in this batch                       | Proof                                           | Still deferred                                    |
| ------------------------------------ | ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------- |
| Check space before pack installation | Application preflight                      | unit/integration test                           | native Android commit-time recheck in #104        |
| Recover from insufficient space      | yes                                        | projected `needs-attention`; install not called | physical low-storage device QA                    |
| Remove prepared narration            | desktop executor plus guarded UI           | application/integration/native desktop tests    | Android prepared-audio executor from #110         |
| Remove inactive voice pack           | policy/application contract                | fake repository tests                           | accepted Android pack inventory/removal from #104 |
| Protect reader data                  | typed targets and native containment tests | temp-root sentinel tests                        | destructive device QA                             |

This matrix prevents “unit test exists” from mutating into “Android feature shipped” through sheer optimism.

### A2. Harden voice-pack identity in the pure policy

The current policy identifies a voice pack only by `packId`. Installed packs also have revisions, and deletion
must not resolve a stale request to a newly installed revision.

In `packages/audio/src/narration-storage-maintenance.ts`:

1. Extend `VoicePackStorageEntry` with `revision: string`.
2. Extend the voice-pack removal request with `revision: string`.
3. Extend the approved voice-pack target with `revision: string`.
4. Match both `packId` and `revision` when planning removal.
5. Treat a missing or mismatched revision as `not-found`; do not silently select another revision.
6. Keep `verified` explicit. A directory or self-authored install record is not enough to set it to `true`.
7. Preserve the existing rule that the selected/active pack cannot be removed.
8. Preserve non-negative, finite byte normalization.

In `packages/audio/src/narration-storage-maintenance.test.ts`, add or update cases for:

- exact pack ID and revision is approved after confirmation;
- matching ID with a stale revision is not found;
- matching revision under a different ID is not found;
- duplicate or ambiguous inventory cannot approve a target;
- an unverified exact identity cannot be removed;
- the active exact identity cannot be removed;
- confirmation remains mandatory;
- the approved target contains no filesystem path.

If duplicate identity behavior is not already deterministic, fail closed with `needs-attention`, not “first
array element wins.” Add the corresponding union result and humane message if needed.

### A3. Add one deep storage-maintenance repository seam

Create `apps/desktop/src/audio/narration-storage-maintenance-repository.ts` with a small interface. It should
hide Tauri command names and platform differences from reader code.

Use this conceptual shape, adapting names to established conventions:

```ts
interface NarrationStorageMaintenanceRepository {
  inspect(): Promise<NarrationStorageSnapshot>;
  remove(target: NarrationStorageRemovalTarget): Promise<NarrationStorageSnapshot>;
}
```

Requirements:

- `inspect` returns available bytes plus only Sonelle-owned prepared-audio and accepted voice-pack entries;
- `remove` accepts a typed approved target, never a path;
- the native implementation invokes narrow Tauri commands;
- the browser implementation returns an empty inventory and must not claim a pack is verified;
- tests assert the exact invoke command and payload for both target kinds;
- tests assert that no arbitrary `path` property can flow through the public API;
- if production Android lacks real inventories, return empty collections rather than synthesizing readiness.

Do not merge this interface into `AudioCacheRepository`. That repository answers prepared-audio statistics;
storage inspection/removal also owns available capacity and verified pack identity.

### A4. Create the reader application workflow

Create `apps/desktop/src/reader/reader-narration-storage-application.ts` rather than stuffing more state into
the inspector component.

The application module owns:

- refreshing the snapshot;
- mapping current playback/book/selected-pack state into `NarrationStorageActivity`;
- calling `preflightVoicePackInstallation`;
- calling `planNarrationStorageRemoval`;
- holding a pending confirmation as a typed request, not a path;
- re-inspecting storage and re-running policy after confirmation;
- invoking repository removal only for a newly approved target;
- projecting notice, pending confirmation, and busy state to the reader view;
- dispatching domain events around successful/failed removal if the existing event architecture needs other
  projections to react.

It refuses to own:

- filesystem traversal;
- pack verification;
- Android free-space APIs;
- playback execution;
- book deletion or library persistence;
- modal markup.

Use this sequence for installation preflight:

1. Obtain the current installation descriptor, including total download bytes and already staged bytes.
2. Inspect storage immediately before requesting installation.
3. Run `preflightVoicePackInstallation` with the 32 MiB reserve from the policy unless the installer exposes a
   larger documented requirement.
4. If ready, dispatch/call the existing installation workflow.
5. If `needs-attention`, project the policy message, keep the install control retryable, and do not call the
   repository installer.
6. Do not mark the pack failed; insufficient capacity is a recoverable attention state.

Use this sequence for removal:

1. Inspect current storage.
2. Read current activity at request time.
3. Run the policy with `confirmed: false`.
4. For `needs-confirmation`, project the typed pending request and its message.
5. For `needs-attention`, show the message and do nothing else.
6. On confirmation, inspect and read activity again. The world may have changed while the modal was open.
7. Run the policy with `confirmed: true`.
8. Invoke `remove` only for a fresh `approved` plan.
9. Refresh the snapshot and prepared-audio readiness after success.
10. Clear pending confirmation on success, cancellation, reader close, or book change.
11. Convert repository errors to existing friendly notices and keep the action retryable.

Critically, remove the current behavior in
`apps/desktop/src/reader/reader-offline-narration-application.ts` that calls `narration.stop()` automatically
inside `handleClearRequested`. The new workflow must refuse active playback and ask the reader to stop first.
Only dispatch `PreparedNarrationClearingRequested` after confirmation and policy approval, so preparation is
still cancelled through the existing event reaction before files are removed.

### A5. Add application tests before UI wiring

Create `apps/desktop/src/reader/reader-narration-storage-application.test.ts`. Use fakes for the repository,
activity provider, installer request, projections, and event dispatcher.

Required tests:

1. sufficient space delegates to installation exactly once;
2. insufficient space projects a humane needs-attention message and never calls installation;
3. staged bytes reduce required capacity but never consume the retained reserve;
4. request to remove prepared audio opens confirmation and does not remove yet;
5. cancel closes confirmation and removes nothing;
6. confirm re-inspects and removes the exact approved book target;
7. playback becoming active between request and confirmation blocks removal;
8. paused playback for the active book blocks removal;
9. idle playback allows confirmed removal;
10. inactive verified pack can be removed after confirmation;
11. selected pack cannot be removed;
12. pack revision changing while confirmation is open prevents stale removal;
13. unverified pack is never passed to `remove`;
14. repository failure projects a retryable notice and clears busy state;
15. book change clears a pending prepared-audio confirmation;
16. concurrent double-confirm performs at most one removal;
17. successful prepared-audio removal refreshes readiness and emits the existing cleared fact;
18. browser/unsupported inventory never displays a fictional removable pack.

Update `reader-offline-narration-application.test.ts` to prove it no longer silently stops narration before a
clear. Preserve coverage for the existing `PreparedNarrationCleared` and failure projections.

### A6. Wire a humane confirmation surface

In `apps/desktop/src/reader/reader-inspector.tsx` and the nearest reader composition in
`apps/desktop/src/reader/reader-experience.tsx`:

1. Rename `Clear audio` to `Remove prepared audio`.
2. Make the button request removal; it must not delete immediately.
3. Render a focused, accessible confirmation dialog owned by view state from the application module.
4. Use `role="dialog"`, `aria-modal="true"`, an accessible title, initial focus, Escape-to-cancel, focus
   containment, and focus restoration. Reuse the existing dialog/focus patterns instead of inventing a second
   accessibility system.
5. Show what is removed and what is protected:
   - title: `Remove prepared audio?`;
   - body: `This removes listening files for this book. The book, bookmarks, and reading position stay safe.`;
   - actions: `Keep audio` and `Remove audio`.
6. When active playback blocks removal, show: `Stop listening before removing this book’s prepared audio.`
7. For a verified inactive pack, use:
   - title: `Remove offline voice?`;
   - body: `You can download this voice again later. Your books and reading progress stay safe.`;
   - actions: `Keep voice` and `Remove voice`.
8. Do not render a remove-pack button for device voices, unverified files, or an empty/unsupported pack
   inventory.
9. Disable duplicate submission while removal is running.
10. Announce the terminal notice through the existing polite live region.

Add component/integration tests for opening, cancelling, confirming, keyboard dismissal, blocked active
playback, stale pack identity, busy state, success notice, and preservation copy.

### A7. Add native safety machinery without inventing Android pack readiness

Create a common Rust module such as `apps/desktop/src-tauri/src/narration_storage.rs`, compiled under
`#[cfg(any(desktop, mobile, test))]`. Keep audio decoding and ONNX dependencies out of it.

Its narrow responsibilities are:

- derive narration-owned roots from an injected application-data root;
- validate typed identifiers before joining paths;
- confirm that a resolved target is a descendant of exactly one narration-owned root;
- reject symlinks and canonicalized escapes;
- calculate directory size using checked/saturating arithmetic;
- remove one already-authorized narration target;
- return a typed result with reclaimed bytes or a safe error.

Use canonical root constructors in one place. If #104/#110 have established roots, import them. Otherwise,
establish and document the existing namespaces only:

- prepared narration: `$APPDATA/narration-v3`;
- managed narration engines/packs: `$APPDATA/narration-engines`.

Do not include `$APPDATA` itself, `sonelle.sqlite3`, `covers`, `import-sources`, `voices/piper`, or device TTS.
If Android does not yet write the two narration roots, that is fine: production inspection returns no entries.

Native code must not trust `verified: true` from JavaScript. A removable pack identity must be produced by a
trusted catalog/install-record verifier. If #104 has not landed that verifier, keep production voice-pack
inventory empty and exercise the executor with injected verified descriptors in Rust tests.

Before deletion, repeat the native identity/path verification while holding the same owner lock used by pack
installation or narration preparation. If those locks are not yet shared, expose a tiny closure-based helper
from the owning module. Do not create an unrelated lock that allows installer and cleanup to race politely in
parallel.

Required Rust tests use a temporary application-data directory and sentinel files:

- remove one prepared-audio book directory and preserve a sibling book;
- preserve `sonelle.sqlite3`, covers, imported sources, and arbitrary sibling sentinels;
- remove one exact verified pack revision and preserve other revisions/packs;
- reject `..`, separators, absolute paths, empty IDs, Unicode separator tricks, and invalid revisions;
- reject a symlink inside a narration root that points outside it;
- reject a target whose canonical parent is not the expected root;
- reject an unverified/unknown/ambiguous pack identity;
- make a missing target idempotent or return a typed not-found result, consistently with the TS policy;
- survive unreadable metadata as a safe error without broad cleanup;
- report reclaimed bytes without integer overflow;
- prove no API accepts an arbitrary renderer path.

Register native inspection/removal commands only where they are truthful. Desktop prepared-audio removal may
delegate to the existing cache/manifest owners. Android pack and prepared-audio commands must remain empty or
unsupported until #104/#110 supply accepted artifacts. Never return fake verified inventory to make the UI
look finished.

### A8. Update documentation and issue state honestly

Update `docs/decisions/0039-narration-storage-maintenance.md` only for decisions that actually changed, such
as revision-qualified targets, canonical narration roots, and the double-check before deletion.

Update `docs/modules/narration.md` with:

- what the new repository/application module owns and refuses to own;
- its public interface;
- any new domain events;
- the test layers;
- the explicit production gaps remaining behind #104/#110.

On #128, post a progress comment containing:

- the commit/PR link;
- the acceptance matrix;
- exact tests run;
- explicit statement that the issue remains open;
- remaining device proofs: actual available bytes, failed install on a nearly full device, resumed install,
  deletion of real prepared narration, deletion of a real inactive accepted pack, playback race, and protected
  library state.

---

## Workstream B: fix Android manifest/lint errors

Keep this as a separate commit after Workstream A is green. It is independently reviewable and does not need
a phone or emulator.

### B0. Reproduce and archive the baseline

From `apps/desktop/src-tauri/gen/android` run:

```sh
./gradlew lintUniversalDebug
```

Confirm the report at
`apps/desktop/src-tauri/gen/android/app/build/reports/lint-results-universalDebug.xml` contains the five
observed errors: two app-link errors, two accidental TV-capability errors, and the pre-API-26 notification
builder error. Do not commit the generated report.

### B1. Remove accidental Android TV claims

Edit `apps/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml`:

1. remove the optional `android.software.leanback` `<uses-feature>`;
2. remove `android.intent.category.LEANBACK_LAUNCHER` from `MainActivity`;
3. remove the now-misleading Android TV comments;
4. keep the ordinary `MAIN` + `LAUNCHER` filter unchanged.

Why: `MissingTvBanner` and `ImpliedTouchscreenHardware` are consequences of advertising TV availability.
Adding a fake banner and declaring touch optional would silence lint while publishing a TV capability Sonelle
does not provide. Removing the false capability is the correct product fix.

Expected result:

- `MissingTvBanner` disappears;
- `ImpliedTouchscreenHardware` disappears;
- phone/tablet launcher behavior remains unchanged.

### B2. Keep unsupported EPUB intents out of Android

Add `apps/desktop/src-tauri/tauri.android.conf.json` with an empty Android `bundle.fileAssociations` array.
Keep the desktop EPUB association in the shared configuration.

Rationale:

- Sonelle’s implemented mobile import path uses the picker/content URI workflow;
- there is no Android `MainActivity` or plugin intake that consumes external `ACTION_VIEW`, `ACTION_SEND`, or
  `ACTION_SEND_MULTIPLE` launches;
- Tauri 2.9.3 always adds `BROWSABLE` to generated MIME associations, even when only share actions are chosen;
- Android lint therefore reports two `AppLinkUrlError` failures after `VIEW` is removed;
- advertising a share target without consuming its URI would be a dead button in the Android share sheet;
- the implemented Android import path is the system document picker, so the honest manifest advertises no
  EPUB intent intake yet.

Do not add a nonsense web host, arbitrary scheme, or inert share target merely to pacify lint. If external
EPUB opening or sharing becomes a requirement, implement initial-intent and `onNewIntent` delivery first,
then add an owned filter with tests. That is a feature, not lint janitorial work.

Regenerate through the normal Tauri Android build path. Confirm the resolved Android configuration has an
empty `fileAssociations` array and the checked manifest contains no Tauri association block.

### B3. Add a regeneration-resistant manifest contract

Create `scripts/verify-android-manifest.mjs` and add a root package script named
`check:android-manifest`.

The verifier should read the checked Android manifest and fail with specific messages if:

- `android.software.leanback` appears;
- `LEANBACK_LAUNCHER` appears;
- the ordinary phone launcher filter is missing;
- the narration playback service or import provider is missing;
- a generated or owned EPUB intent filter appears before intake is implemented;
- a `VIEW` + `BROWSABLE` filter has MIME/path data but no valid scheme configuration.

Keep the verifier focused on Sonelle-owned invariants. Do not build a homemade XML parser or fail on unrelated
Tauri formatting.

Add script tests if the repository’s script-testing conventions support them. At minimum, extract a pure
verification function and test good and bad fixture strings:

- current intended phone manifest passes;
- Leanback feature fails;
- Leanback launcher fails;
- generated EPUB association regression fails;
- missing launcher, service, or provider fails;
- a future explicitly valid owned URI filter can pass once its intake contract exists.

Run this verifier after Android generation/build in Android workflows so a future Tauri update cannot silently
reintroduce the bad block after the static source check.

### B4. Make Android CI enforce lint

Update both Android workflows:

- `.github/workflows/android-internal.yml`;
- `.github/workflows/android-store-candidate.yml`.

After the Android build has generated the final manifest:

1. run `pnpm check:android-manifest`;
2. run the lint task for the exact built variant;
3. upload the HTML/XML lint report when the job fails, if convenient within current artifact policy.

Before editing the workflow, list available tasks with:

```sh
cd apps/desktop/src-tauri/gen/android
./gradlew :app:tasks --all | rg 'lint.*(Debug|Release)'
```

Use `lintUniversalDebug` for the known local debug proof. The internal ARM64 APK workflow uses
`lintArm64Release`; the universal store bundle uses `lintUniversalRelease`.

Existing dependency/version warnings are not part of this fix. Record them, but do not balloon this PR into a
Gradle upgrade unless an error blocks the build.

### B5. Verify the manifest fix without a device

Run, in order:

```sh
pnpm check:android-manifest
pnpm --filter @sonelle/desktop tauri android build --debug
pnpm check:android-manifest
cd apps/desktop/src-tauri/gen/android
./gradlew lintUniversalDebug
```

Inspect the final report and require:

- zero lint errors;
- no `MissingTvBanner`;
- no `ImpliedTouchscreenHardware`;
- no `AppLinkUrlError`;
- no increase caused by Sonelle-owned manifest changes.

Then inspect the merged manifest or packaged APK with Android tooling if available. Confirm:

- `MAIN` + `LAUNCHER` still exists;
- no Leanback category/feature exists;
- no unsupported EPUB intent filter exists;
- foreground playback service declarations remain unchanged;
- import provider and required permissions remain unchanged.

No phone/emulator is required for this workstream. Later device QA should still verify importing an EPUB from
the picker. Sharing or opening an EPUB from another app remains intentionally out of scope until Sonelle owns
an Android intent-intake adapter.

---

## Full verification ladder

Run focused tests while iterating, then the full ladder once both commits are complete:

```sh
pnpm vitest run packages/audio/src/narration-storage-maintenance.test.ts
pnpm vitest run apps/desktop/src/audio/narration-storage-maintenance-repository.test.ts
pnpm vitest run apps/desktop/src/reader/reader-narration-storage-application.test.ts
pnpm vitest run apps/desktop/src/reader/reader-offline-narration-application.test.ts
pnpm vitest run apps/desktop/src/reader/reader-experience.integration.test.tsx
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml narration_storage
pnpm typecheck
pnpm test
pnpm build
pnpm format
cargo fmt --check
cargo check --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm check:android-manifest
pnpm --filter @sonelle/desktop tauri android build --debug
pnpm check:android-manifest
cd apps/desktop/src-tauri/gen/android
./gradlew lintUniversalDebug
```

If a named new test file differs after refactoring, run its actual path. Do not omit the equivalent layer.

## Commit and PR structure

Prefer two commits on one branch:

1. `feat(android): guard narration storage maintenance`
2. `fix(android): correct manifest capabilities and lint`

The PR description should include:

- `Closes` only for an issue that is truly complete; do **not** write `Closes #128`;
- `Progresses #128; production Android pack/cache wiring remains blocked by #104 and #110`;
- the acceptance matrix from A1;
- exact lint before/after counts;
- exact verification commands and results;
- the explicit note that no emulator or physical device was used;
- the later device-QA checklist.

Do not merge with failing required CI. If review exposes a real issue, fix it and rerun the affected focused
checks plus the full relevant gate. Do not paper over a storage-safety failure with a lint allowlist or a test
that asserts the bug.

## Stop conditions

Stop and report instead of improvising if any of these occurs:

- #104/#110 define a different canonical storage root or verified-pack identity than this plan assumed;
- the only way to enumerate a voice pack is trusting renderer data or a self-declared directory;
- deletion cannot share the owner lock with installation/preparation;
- Tauri regeneration restores `VIEW` despite the source configuration;
- Android lint still reports app-link errors after `VIEW` is removed;
- implementation requires deleting or migrating existing reader/library data;
- a test requires a physical device to make a claim in the PR.

In those cases, preserve the safe completed work, document the precise blocker, and leave #128 open.
