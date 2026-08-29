# Android Narration License and Privacy Review

## Status

Partially complete for issue #132. This review separates the reader-only store profile from the
internal offline-voice candidate profile. It is not legal advice. The candidate still requires the
physical-device and listening acceptance gates before its disclosure can become a public-release
disclosure.

## Current Android release disclosure

The store profile remains reader-only. Its Cargo target graph contains no ONNX Runtime, Supertonic,
or Kokoro integration and it does not bundle or download a narration model. Android device voices
remain an explicitly selected platform fallback rather than a bundled narration runtime.

| Shipped component                  | Source and revision                                                  | License                              | Notice and disposition                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Sonelle Android reader             | repository commit named by `build-metadata.json`                     | MIT                                  | Full MIT text is available under **Tools → Privacy and licenses**                                        |
| Rust target dependencies           | exact versions in `Cargo.lock`, filtered for `aarch64-linux-android` | approved SPDX allowlist              | `pnpm audit:android-release` rejects missing or unapproved expressions, including GPL/LGPL/AGPL families |
| Production JavaScript dependencies | exact versions in `pnpm-lock.yaml`                                   | MIT and/or Apache-2.0 at this review | the same audit rejects unapproved production dependency licenses                                         |

The Rust allowlist is `0BSD`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `CC0-1.0`,
`CDLA-Permissive-2.0`, `ISC`, `MIT`, `MIT-0`, `MPL-2.0`, `Unicode-3.0`, `Unlicense`, and `Zlib`.
MPL-2.0 is permitted for unmodified dependencies because its source obligation is file-scoped; any
future modification to an MPL-covered file requires a new review and source-offer handling. The
audit is a dependency-metadata guard, not a substitute for reading the license files.

## Standard offline voice candidate

These entries are part of the protected internal ARM64 candidate and are **not** part of the
reader-only store profile. The model pack is downloaded after an explicit request rather than
bundled in the APK.

| Candidate component                 | Pinned source                                                                                                                        | License                               | Required release behavior                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supertonic integration code         | [`supertone-inc/supertonic` at `dff55dc`](https://github.com/supertone-inc/supertonic/tree/dff55dc00064c398736080c78195f577527832ae) | MIT                                   | preserve Supertone's copyright and MIT text; the vendored Rust source identifies the revision                                                                                                                                          |
| Supertonic 3 model and voice styles | [`Supertone/supertonic-3` at `3cadd1e`](https://huggingface.co/Supertone/supertonic-3/tree/3cadd1ee6394adea1bd021217a0e650ede09a323) | OpenRAIL-M                            | distribute the full license, preserve notices, convey the use restrictions, and intelligibly identify narration as machine-generated                                                                                                   |
| `ort` / `ort-sys` wrapper           | [`pykeio/ort` v2.0.0-rc.12](https://github.com/pykeio/ort/releases/tag/v2.0.0-rc.12)                                                 | MIT OR Apache-2.0                     | retain the selected license notice                                                                                                                                                                                                     |
| ONNX Runtime 1.24.2 binary          | Microsoft ONNX Runtime, checksum pinned by `ort-sys` for `aarch64-linux-android`                                                     | MIT plus upstream third-party notices | preserve the [MIT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) and the matching [third-party notices](https://github.com/microsoft/onnxruntime/blob/main/ThirdPartyNotices.txt) in the distributed application |

The internal catalog pins both the Supertonic code license and the model's OpenRAIL-M license.
The model pack already treats `assets/LICENSE` as a checksummed artifact, so the installer cannot
commit a “ready” pack without its terms. The accessible model notice and full license text are shown
only when the application's narration capabilities say that the standard offline voice is available;
the reader-only profile reports the capability unavailable and offers no fake download action.

OpenRAIL-M is not a plain permissive software license. Distribution must include its restrictions and
license text, and downstream users must be placed on notice of those restrictions. Its generated-
content clause also makes Sonelle's “machine-generated audio” disclosure a release requirement, not
decorative copy. The pinned license itself remains the authority.

Optional Kokoro is deliberately excluded from this Android disclosure. It enters only after its
separate mobile acceptance work succeeds and receives its own artifact-level review.

## Device-provided voices

Android device voices are enumerated deliberately, clearly labeled as device-provided, and distinguish
embedded voices from voices whose engine reports `isNetworkConnectionRequired()`. Android documents
that distinction in its
[`TextToSpeech.Engine` reference](https://developer.android.com/reference/android/speech/tts/TextToSpeech.Engine).

Sonelle does not distribute or relicense the selected Android speech engine. Its privacy disclosure
must warn that the engine vendor—not Sonelle—controls remote processing and retention when a network
voice is deliberately chosen. A Sonelle offline-voice failure must never silently activate that path.

## Privacy disclosure

The in-app **Privacy and licenses** section now states:

- imported books, progress, bookmarks, and prepared narration stay in local app storage and are not
  uploaded by Sonelle;
- offline model files are downloaded only after an explicit install request and verified before use;
- offline narration is machine-generated audio;
- bounded diagnostics are written locally, never uploaded automatically, and should be reviewed
  before sharing;
- a device-provided voice is used only after explicit selection and discloses reported network
  requirements before sending text to that speech engine.

This disclosure covers Sonelle behavior. It does not promise that a future selected third-party
device voice is private; that would be a very polished lie.

## Verification and remaining release gates

Run:

```bash
pnpm audit:android-release
pnpm audit:android-release -- --profile offline-voice-candidate
```

The command uses Cargo's exact Android-target resolution and pnpm's production license inventory. It
also verifies that the pinned Supertonic model license matches the license artifact inside the voice
pack. CI runs it after the native Android-capable dependency graph has resolved.

Before closing #132:

1. The internal candidate must preserve the matching ONNX Runtime notices and prove the installed
   model license remains accessible after restart.
2. The audit must be rerun against the final signed artifact's exact revision and dependency graph.
3. The final release disclosure must contain only components that artifact actually bundles or makes
   downloadable.
