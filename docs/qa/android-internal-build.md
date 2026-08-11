# Android Internal Build

The `Android Internal Build` GitHub workflow produces a signed, release-like ARM64 APK for device
QA. It is an internal artifact, not a Play Store release and not a substitute for the device matrix.

## One-time repository setup

Create the `internal-android` GitHub environment and add these encrypted secrets:

- `ANDROID_KEY_BASE64`: the dedicated QA keystore encoded as one base64 string;
- `ANDROID_KEY_ALIAS`: the key alias;
- `ANDROID_KEY_PASSWORD`: the keystore and key password.

Generate a dedicated internal key with `keytool`; do not reuse a personal debug key or a future Play
upload key. The keystore, decoded key, passwords, and generated `keystore.properties` file must never
be committed. The tracked Android ignore rules cover the common keystore filenames, and the workflow
removes its temporary signing material even when the build fails.

## Produce an artifact

Open GitHub Actions, choose `Android Internal Build`, select **Run workflow**, and enter an immutable
commit SHA in `revision`. A branch name is accepted for convenience, but a SHA makes the artifact
reproducible and should be used for recorded QA. The workflow rejects revisions that are not already
ancestors of `main`; protected signing material is never exposed to arbitrary branch code.

The workflow:

1. checks out the requested revision, verifies that it is merged into `main`, and installs the
   pinned Node, Rust, Android, Java, and NDK toolchain;
2. derives the next internal version from the existing release tags;
3. reconstructs signing files only inside the runner;
4. builds the production frontend and Android/Rust release profiles for ARM64;
5. rejects an unsigned APK with Android Build Tools' `apksigner`;
6. uploads the signed APK and `build-metadata.json` for 14 days;
7. removes the temporary keystore and signing properties.

`build-metadata.json` records application ID, version, exact commit, release build type, ABI, APK
size and SHA-256, narration-catalog SHA-256, and each pinned model revision. The same commit and
catalog identity are compiled into local error diagnostics. This lets device reports identify the
binary without exposing signing material or reader data.

## Device QA

Download both files from the workflow artifact. Verify the APK again before installation:

```bash
apksigner verify --verbose sonelle-internal-arm64.apk
sha256sum sonelle-internal-arm64.apk
```

Compare the hash with `build-metadata.json`, then run the physical-device procedure in
[`android-device-profiling.md`](android-device-profiling.md). Record installation and launch results
for both baseline devices. Until those runs exist, the workflow proves packaging—not device
compatibility or background narration.

## Local equivalent

The existing release-like Android build command remains available for local work:

```bash
pnpm --filter @sonelle/desktop tauri android build --target aarch64 --apk --ci
```

Local signing may use `apksigner` as documented in
[`android-device-profiling.md`](android-device-profiling.md). Never copy CI secrets into repository
files.
