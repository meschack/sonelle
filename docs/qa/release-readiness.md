# Release Readiness

Use this checklist before the visual-polish phase and before any packaged build is treated as shareable.

## Local Checks

- `pnpm check`
- `pnpm build`
- `pnpm check:native`
- `cargo fmt --check`
- `cargo check`

## Real-Book QA

Run this when at least two representative EPUBs are available:

```bash
pnpm qa:real-books
```

The real-book QA pass should cover:

- a small or medium EPUB
- a larger EPUB with long chapters
- chapter titles that come from navigation metadata, not only document titles
- reading position save and reopen
- bookmark save/list/delete
- library search
- export

## Product Smoke

- Import a fresh EPUB.
- Re-import the same EPUB and confirm the existing book reopens.
- Play narration at the default speed.
- Change narration voice and confirm playback pauses before the next sentence prepares.
- Change reader tool tab and library filter, reload, and confirm they persist.
- Search a chapter with results and without results.
- Check empty states for bookmarks and saved words.

## Hybrid Narration QA

Run the local Kokoro/Supertonic QA path before treating the hybrid narration route as ready for
hands-on testing:

- [Hybrid Narration Local QA - 2026-07-14](hybrid-narration-local-qa-2026-07-14.md)

## Android Architecture Evidence

After both baseline devices complete the benchmark contract, combine their exact-build results with
the [Android core-flow evidence report](android-core-flow-report.md). Pending checks, mismatched
builds, or failures without focused follow-up issues are not release evidence.

Run `pnpm audit:android-release` and read the
[Android narration license and privacy review](android-license-privacy-review.md) before treating an
Android artifact as shareable. Repeat the audit whenever a runtime, model, voice, or device-voice
adapter enters the actual Android target.
