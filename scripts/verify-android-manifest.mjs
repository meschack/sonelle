import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const defaultManifestPath = "apps/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml";

export function verifyAndroidManifest(manifest) {
  const errors = [];

  if (manifest.includes("android.software.leanback")) {
    errors.push("Android manifest must not advertise Leanback support");
  }
  if (manifest.includes("android.intent.category.LEANBACK_LAUNCHER")) {
    errors.push("Android manifest must not advertise a Leanback launcher");
  }
  const filters = [...manifest.matchAll(/<intent-filter\b[^>]*>([\s\S]*?)<\/intent-filter>/gu)].map(
    (match) => match[1] ?? ""
  );
  if (!filters.some((filter) => hasAction(filter, "MAIN") && hasCategory(filter, "LAUNCHER"))) {
    errors.push("Android manifest must keep MAIN and LAUNCHER in one phone launcher intent");
  }
  if (!manifest.includes('android:name=".NarrationPlaybackService"')) {
    errors.push("Android manifest is missing the narration playback service");
  }
  if (!manifest.includes("androidx.core.content.FileProvider")) {
    errors.push("Android manifest is missing the import file provider");
  }

  if (
    manifest.includes("tauri-file-associations") ||
    filters.some((filter) => filter.includes('android:mimeType="application/epub+zip"'))
  ) {
    errors.push("Android manifest must not advertise EPUB intent intake before it is implemented");
  }

  for (const body of filters) {
    const malformedView =
      hasAction(body, "VIEW") &&
      hasCategory(body, "BROWSABLE") &&
      /android:(?:mimeType|path|pathPattern|pathPrefix)=/u.test(body) &&
      !/android:scheme="(?:content|file)"/u.test(body);
    if (malformedView) {
      errors.push(
        "Browsable VIEW filters with MIME or path data require an owned content/file URI scheme"
      );
    }
  }

  return [...new Set(errors)];
}

function hasAction(manifest, action) {
  return manifest.includes(`android:name="android.intent.action.${action}"`);
}

function hasCategory(manifest, category) {
  return manifest.includes(`android:name="android.intent.category.${category}"`);
}

function main() {
  const manifestPath = process.argv[2] ?? defaultManifestPath;
  const errors = verifyAndroidManifest(readFileSync(manifestPath, "utf8"));
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log("Android manifest matches Sonelle's implemented phone capabilities.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
