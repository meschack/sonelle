# Android Narration License and Privacy Review

## Status

Partially complete for issue #132. This review describes the Android artifact that exists now and
separately records the obligations for the proposed standard offline voice. It is not legal advice.
The issue remains blocked on the final implementations of the downloadable voice (#104) and optional
device voice (#114); their eventual artifacts and behavior must be reviewed again before release.

## Current Android release disclosure

The current signed Android build is a reader-only proof. Its Cargo target graph contains no ONNX
Runtime, Supertonic integration, Kokoro integration, or Android device-voice adapter. It does not
bundle or download a narration model. Claiming the model review is “done” for that artifact would be
technically easy and spectacularly useless.

| Shipped component                  | Source and revision                                                  | License                              | Notice and disposition                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Sonelle Android reader             | repository commit named by `build-metadata.json`                     | MIT                                  | Full MIT text is available under **Tools → Privacy and licenses**                                        |
| Rust target dependencies           | exact versions in `Cargo.lock`, filtered for `aarch64-linux-android` | approved SPDX allowlist              | `pnpm audit:android-release` rejects missing or unapproved expressions, including GPL/LGPL/AGPL families |
| Production JavaScript dependencies | exact versions in `pnpm-lock.yaml`                                   | MIT and/or Apache-2.0 at this review | the same audit rejects unapproved production dependency licenses                                         |

The Rust allowlist is `0BSD`, `Apache-2.0`, `BSD-3-Clause`, `CC0-1.0`, `MIT`, `MIT-0`, `MPL-2.0`,
`Unicode-3.0`, `Unlicense`, and `Zlib`. MPL-2.0 is permitted for unmodified dependencies because its
source obligation is file-scoped; any future modification to an MPL-covered file requires a new
review and source-offer handling. The audit is a dependency-metadata guard, not a substitute for
reading the license files.

## Standard offline voice candidate

These entries are **not** part of the current Android release disclosure. They are the conditions
that #104 must satisfy before the candidate can ship.

| Candidate component                 | Pinned source                                                                                                                        | License                               | Required release behavior                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supertonic integration code         | [`supertone-inc/supertonic` at `dff55dc`](https://github.com/supertone-inc/supertonic/tree/dff55dc00064c398736080c78195f577527832ae) | MIT                                   | preserve Supertone's copyright and MIT text; the vendored Rust source identifies the revision                                                                                                                                          |
| Supertonic 3 model and voice styles | [`Supertone/supertonic-3` at `3cadd1e`](https://huggingface.co/Supertone/supertonic-3/tree/3cadd1ee6394adea1bd021217a0e650ede09a323) | OpenRAIL-M                            | distribute the full license, preserve notices, convey the use restrictions, and intelligibly identify narration as machine-generated                                                                                                   |
| `ort` / `ort-sys` wrapper           | [`pykeio/ort` v2.0.0-rc.12](https://github.com/pykeio/ort/releases/tag/v2.0.0-rc.12)                                                 | MIT OR Apache-2.0                     | retain the selected license notice                                                                                                                                                                                                     |
| ONNX Runtime 1.24.2 binary          | Microsoft ONNX Runtime, checksum pinned by `ort-sys` for `aarch64-linux-android`                                                     | MIT plus upstream third-party notices | preserve the [MIT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) and the matching [third-party notices](https://github.com/microsoft/onnxruntime/blob/main/ThirdPartyNotices.txt) in the distributed application |

The narration catalog now pins both the Supertonic code license and the model's OpenRAIL-M license.
The model pack already treats `assets/LICENSE` as a checksummed artifact, so the installer cannot
commit a “ready” pack without its terms. The accessible model notice and full license text are shown
only when the application's narration capabilities say that the standard offline voice is available;
the current reader-only Android build does not advertise an unshipped model.

OpenRAIL-M is not a plain permissive software license. Distribution must include its restrictions and
license text, and downstream users must be placed on notice of those restrictions. Its generated-
content clause also makes Sonelle's “machine-generated audio” disclosure a release requirement, not
decorative copy. The pinned license itself remains the authority.

Optional Kokoro is deliberately excluded from this Android disclosure. It enters only after its
separate mobile acceptance work succeeds and receives its own artifact-level review.

## Device-provided voices

The current Android build does not offer a device voice. When #114 adds the deliberate fallback,
Sonelle must enumerate Android `Voice` capabilities, clearly label the voice as device-provided, and
distinguish embedded voices from voices whose engine reports `isNetworkConnectionRequired()`. Android
documents that distinction in its
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
- the current build does not activate a device-provided voice, and any later adapter must disclose
  network requirements before sending text to a speech engine.

This disclosure covers Sonelle behavior. It does not promise that a future selected third-party
device voice is private; that would be a very polished lie.

## Verification and remaining release gates

Run:

```bash
pnpm audit:android-release
```

The command uses Cargo's exact Android-target resolution and pnpm's production license inventory. It
also verifies that the pinned Supertonic model license matches the license artifact inside the voice
pack. CI runs it after the native Android-capable dependency graph has resolved.

Before closing #132:

1. #104 must move the reviewed runtime/model components into the actual Android target, preserve the
   matching ONNX Runtime notices, and prove the installed license remains accessible after restart.
2. #114 must identify the selected device engine and its network requirement in the UI and privacy
   disclosure.
3. The audit must be rerun against the final signed artifact's exact revision and dependency graph.
4. The final release disclosure must contain only components that artifact actually bundles or makes
   downloadable.
