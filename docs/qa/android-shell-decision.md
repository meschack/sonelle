# Android Shell Decision

## Purpose

Issue #133 records whether Sonelle continues with the Tauri Android shell or authorizes the native
Kotlin reader fallback. The decision is downstream of the complete two-device evidence from issue
#131; it is not a vibes-based framework referendum.

`scripts/record-android-shell-decision.mjs` owns the evidence-to-decision rules and ADR rendering. It
refuses pending or structurally invalid device reports, different signed builds, unmatched failures,
unknown owning boundaries, and a native fallback that is not justified by an exhausted WebView reader
remediation. It does not collect device evidence or diagnose a failed trace.

Its interface is `pnpm decide:android-shell` with the two private device manifests, one local decision
manifest, and a Markdown output path. It emits an accepted ADR only after validation succeeds. The
module emits no product domain events; architecture evidence is an offline QA artifact, not reader
state.

## Decision input

Create a local JSON file beside the private device manifests:

```json
{
  "schemaVersion": 1,
  "decision": "continue-tauri",
  "evidenceReport": "https://github.com/meschack/sonelle/issues/131#issuecomment-…",
  "rustDomainBoundary": "shared-book-domain",
  "failureAttributions": [],
  "acceptedLimitations": [],
  "requiredRemediation": [],
  "iosPlanning": "ready"
}
```

For a failed result, add one `failureAttributions` item with its `deviceRole`, exact `resultPath`,
owning boundary, bounded-remediation state, and evidence-backed finding. Allowed owners are
`webview-reader`, `import-adapter`, `storage-adapter`, `narration-adapter`, `playback-adapter`, and
`lifecycle-adapter`.

Native fallback requires at least one measured `webview-reader` failure whose bounded remediation is
`exhausted`. Adapter failures do not authorize a UI rewrite. A passing report selects
`continue-tauri` and marks Android evidence `ready` for iOS planning; native fallback keeps iOS
`deferred` until the remediated Android core flow passes.

## Render the accepted ADR

```bash
pnpm decide:android-shell -- \
  --midrange artifacts/android-core-flow/pixel-8a.json \
  --lower-cost artifacts/android-core-flow/galaxy-a16-5g.json \
  --decision artifacts/android-core-flow/architecture-decision.json \
  --output docs/decisions/0041-android-shell-continuation.md
```

Review the rendered ADR against the linked raw report before committing it. Device manifests remain
private because they contain tester and device identifiers.

## Verification

Unit tests prove that pending evidence cannot make a decision, passing evidence continues Tauri,
passing evidence cannot authorize fallback, every failure needs boundary attribution, and native
fallback requires exhausted WebView remediation while preserving the shared Rust domain.
