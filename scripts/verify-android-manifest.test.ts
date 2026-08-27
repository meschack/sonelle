import { describe, expect, it } from "vitest";
import { verifyAndroidManifest } from "./verify-android-manifest.mjs";

function intendedManifest(extra = "") {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    ${extra}
    <application>
      <activity>
        <intent-filter>
          <action android:name="android.intent.action.MAIN" />
          <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
      </activity>
      <provider android:name="androidx.core.content.FileProvider" />
      <service android:name=".NarrationPlaybackService" />
    </application>
  </manifest>`;
}

describe("Android manifest contract", () => {
  it("accepts the intended phone-only capabilities", () => {
    expect(verifyAndroidManifest(intendedManifest())).toEqual([]);
  });

  it("rejects accidental Android TV capabilities", () => {
    const manifest = intendedManifest(
      `<uses-feature android:name="android.software.leanback" android:required="false" />
       <category android:name="android.intent.category.LEANBACK_LAUNCHER" />`
    );

    expect(verifyAndroidManifest(manifest)).toEqual(
      expect.arrayContaining([
        "Android manifest must not advertise Leanback support",
        "Android manifest must not advertise a Leanback launcher"
      ])
    );
  });

  it("rejects generated or owned EPUB intake before an Android handler exists", () => {
    const association = `<!-- tauri-file-associations. AUTO-GENERATED. DO NOT REMOVE. -->
      <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="application/epub+zip" />
      </intent-filter>`;

    expect(verifyAndroidManifest(intendedManifest(association))).toContain(
      "Android manifest must not advertise EPUB intent intake before it is implemented"
    );
  });

  it("rejects MAIN and LAUNCHER split across unrelated intent filters", () => {
    const splitLauncher = intendedManifest().replace(
      '<action android:name="android.intent.action.MAIN" />\n          <category android:name="android.intent.category.LAUNCHER" />',
      '<action android:name="android.intent.action.MAIN" />\n        </intent-filter>\n        <intent-filter>\n          <category android:name="android.intent.category.LAUNCHER" />'
    );

    expect(verifyAndroidManifest(splitLauncher)).toContain(
      "Android manifest must keep MAIN and LAUNCHER in one phone launcher intent"
    );
  });

  it("rejects malformed browsable VIEW filters but permits an owned content URI filter", () => {
    const malformed = `<intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:mimeType="text/plain" android:pathPattern=".*\\.txt" />
    </intent-filter>`;
    expect(verifyAndroidManifest(intendedManifest(malformed))).toContain(
      "Browsable VIEW filters with MIME or path data require an owned content/file URI scheme"
    );

    const owned = malformed.replace(
      'android:mimeType="text/plain"',
      'android:scheme="content" android:mimeType="text/plain"'
    );
    expect(verifyAndroidManifest(intendedManifest(owned))).toEqual([]);
  });

  it.each([
    ["launcher", "android.intent.action.MAIN", "android.intent.action.EDIT"],
    ["playback service", ".NarrationPlaybackService", ".MissingService"],
    ["file provider", "androidx.core.content.FileProvider", "example.MissingProvider"]
  ])("rejects a missing %s contract", (_name, current, replacement) => {
    expect(verifyAndroidManifest(intendedManifest().replace(current, replacement))).not.toEqual([]);
  });
});
