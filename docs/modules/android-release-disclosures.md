# Android Release Disclosures

## Ownership

`apps/desktop/src/legal/release-disclosure.ts` owns reader-facing privacy statements and full license
notices for narration components exposed by the current capability set. The settings panel provides
the accessible surface through native `details`, links, and scrollable license text.

`scripts/audit-android-release.mjs` owns the machine boundary: approved Android-target dependency
license expressions, the current reader-only narration scope, and the pinned Supertonic code/model
license records. It refuses to interpret model restrictions, decide compatibility by reputation, or
pretend an unshipped adapter was reviewed in a real artifact.

## Interface and events

The UI interface is `ReaderLegalPanel({ standardOfflineVoiceAvailable })`. The audit interface is
`pnpm audit:android-release`. Neither module emits domain events or changes reading, narration,
storage, or network behavior. They project release facts only.

## Testing

Component tests verify that local-processing language is always available, unshipped model notices
stay hidden, and the full OpenRAIL-M text appears when the standard offline voice capability exists.
Audit tests reject missing and GPL-like licenses and verify that the model pack preserves its pinned
license artifact. CI runs the complete target-aware audit.

The human review and remaining blockers are recorded in
[`docs/qa/android-license-privacy-review.md`](../qa/android-license-privacy-review.md).
