# Android Store Release

## Current status

The repository can prepare a signed Google Play Android App Bundle, but public distribution is still
blocked by issues #132 and #133 and by Play-track installation and upgrade evidence on both physical
baseline devices. The workflow refuses to build a store candidate while either issue remains open.

## Ownership and interface

`Android Store Candidate` owns reproducible AAB construction from an immutable commit, explicit
version name and monotonically increasing version code, the separate Play upload key, release-scope
audits, signature verification, and artifact retention. `pnpm validate:android-store` owns consistency
between application identity, API target, listing text, Data safety claims, privacy policy, and the
512px store icon. Neither module uploads to Play, promotes a track, publishes publicly, or emits
product domain events.

## One-time Play and repository setup

1. Create the Play application with package `app.sonelle.reader` and enroll it in Play App Signing.
2. Keep the Play-managed app-signing key separate from Sonelle's upload key. Store the upload key in
   the protected `android-store-candidate` GitHub environment as `ANDROID_UPLOAD_KEY_BASE64`,
   `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`, and
   `ANDROID_UPLOAD_STORE_PASSWORD`.
3. Require a reviewer on that environment. Do not reuse the internal-QA keystore.
4. Publish `https://sonelle.vercel.app/privacy.html` and verify it without authentication.
5. Complete the Play Data safety and content-rating forms from the tracked review files. Re-audit the
   exact signed candidate; the tracked answers are not a substitute for checking bundled SDKs.

## Prepare a candidate

Run the `Android Store Candidate` workflow with a full commit SHA already merged into `main`, a
semantic version name, and a version code greater than every code previously uploaded to Play. The
workflow targets API 36, builds a universal signed AAB, verifies its JAR signature and base manifest,
and uploads the AAB plus SHA-256 checksum. It does not call the Play Developer API.

The first AAB upload is manual. Confirm Play reports the expected package, version, supported devices,
permissions, signing certificate, download size, and no unexpected SDK or policy warning.

## Track promotion checklist

- Upload to internal testing and install through Play on the Pixel 8a and Galaxy A16 5G.
- Verify fresh installation, application identity, offline start, book import, and the accepted core
  flow. Record Play-generated split APK identity and the source AAB checksum.
- Upload a higher version code and verify upgrade installation on both devices without losing books,
  bookmarks, reading position, voice packs, or prepared narration.
- Move to closed testing only after Data safety, privacy policy, content rating, store listing, icon,
  feature graphic, phone screenshots, model notices, and tester access are complete.
- If the developer account is subject to Google's personal-account testing rule, satisfy the required
  tester count and continuous test duration shown in Play Console before production access.
- Promote the exact tested AAB. Never rebuild the same version code for a later track.
- Use a staged production rollout. Check install success, Android vitals, policy status, narration
  downloads, offline reading, and support reports before increasing the percentage.

## Rollback and rejection recovery

Google Play cannot serve an older version code as a downgrade. To stop harm, halt the rollout; if any
users already received it, fix forward from the last known-good commit with a new higher version code.
Do not delete local reader data or rotate signing keys as a general rollback tactic.

For a rejected submission, preserve the rejected AAB, Play message, screenshots, and policy state;
open a focused issue; correct code or metadata; rerun the release audit; and upload a new version code
when the binary changes. Metadata-only corrections may reuse the binary only when Play explicitly
allows it. An upload-key compromise uses Play's upload-key reset process; it does not change the
package name or erase the Play-managed app-signing key.

## Remaining evidence for issue #134

- finalized feature graphic and physical-device phone screenshots;
- final signed-candidate privacy, model-license, permissions, and content-rating review;
- Play internal or closed-track fresh installs and upgrades on both baseline devices;
- recorded promotion, post-release verification, rollback rehearsal, and rejection-recovery owner.

## Current platform references

- [Tauri Google Play distribution](https://v2.tauri.app/distribute/google-play/)
- [Android app signing and Play App Signing](https://developer.android.com/studio/publish/app-signing)
- [Upload and test an Android App Bundle](https://developer.android.com/studio/publish/upload-bundle)
- [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB_ALL)
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Content rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en)
- [Store preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Prepare and roll out a release](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en)
