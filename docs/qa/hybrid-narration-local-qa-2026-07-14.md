# Hybrid Narration Local QA - 2026-07-14

## Purpose

This pass verifies that the Kokoro/Supertonic migration is ready for hands-on desktop testing through
the real hybrid narration route. It uses a local Kokoro catalog because hosted Kokoro runtime
artifacts are not available yet.

## Environment

- Branch: `featt/hybrid-narration-local-qa`
- Base: `dev` at `6136aa8`
- Rust/Cargo: workspace locked toolchain
- Node/pnpm: workspace package manager
- Local catalog: `.sonelle/narration-spike/local-engine-catalog.json`

## Setup Commands

```bash
pnpm spike:narration:setup -- --engine=kokoro
pnpm spike:narration:models -- --engine=kokoro
pnpm spike:narration:kokoro-export
pnpm spike:narration:kokoro-local-catalog
```

The generated catalog points Kokoro artifacts at local `file://` URLs while preserving artifact
sizes, SHA-256 verification, and the installed-pack layout used by the hosted engine installer.

## Verified Evidence

```bash
cargo test --workspace --locked installs_local_kokoro_catalog_and_renders_from_the_installed_pack -- --ignored --nocapture
```

Result: pass.

This proves the local catalog can install the Kokoro runtime pack through the real pack installer,
verify the installed files, and render a native Kokoro manifest from the installed pack.

```bash
cargo test --workspace --locked renders_real_supertonic_audio_from_local_assets -- --ignored --nocapture
```

Result: pass.

This proves the Supertonic native renderer can synthesize real audio from the local spike assets.

```bash
SONELLE_NARRATION_ENGINE_CATALOG=.sonelle/narration-spike/local-engine-catalog.json \
VITE_SONELLE_NARRATION_SESSION=hybrid-v1 \
pnpm dev
```

Result: pass.

The desktop app launched with the hybrid narration route enabled. Vite served the renderer, Tauri
compiled and started the desktop binary, and no delayed startup errors appeared during the watch
window. The process was stopped manually with `Ctrl+C` after startup verification.

## Manual QA Checklist

Use the same launch command above, then verify:

- a clean app profile can open the Library without narration setup errors;
- the English narration engine installs from the local catalog and reports ready;
- an English book prepares and plays narration through Kokoro;
- highlighting advances sentence by sentence while Kokoro audio plays;
- a French or non-English book prepares and plays narration through Supertonic;
- switching between English and non-English books picks the expected narration engine;
- restarting the app reuses installed engine files and prepared narration when available;
- clearing local app data returns the app to a clean not-installed narration state.

## Release Blockers

- Production builds still need hosted, pinned Kokoro runtime artifacts in the default catalog.
- License and redistribution notices must be completed for Kokoro, Misaki/G2P assets, Supertonic,
  ONNX Runtime, and any platform runtime dependencies.
- Manual audio quality and alignment QA still needs human listening on Linux, Windows, and macOS.
