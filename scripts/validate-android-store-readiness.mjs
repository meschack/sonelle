import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const listingPath = "apps/desktop/store/android/listing.en-US.json";
const dataSafetyPath = "apps/desktop/store/android/data-safety.json";
const gradlePath = "apps/desktop/src-tauri/gen/android/app/build.gradle.kts";
const privacyPath = "apps/landing/public/privacy.html";

function pngDimensions(contents) {
  if (contents.length < 24 || contents.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  return { width: contents.readUInt32BE(16), height: contents.readUInt32BE(20) };
}

export function validateAndroidStoreReadiness({ listing, dataSafety, gradle, privacy, icon }) {
  const errors = [];
  if (listing?.applicationId !== "app.sonelle.reader") errors.push("store application ID changed");
  if (!listing?.title || listing.title.length > 30)
    errors.push("store title must be 1-30 characters");
  if (!listing?.shortDescription || listing.shortDescription.length > 80) {
    errors.push("short description must be 1-80 characters");
  }
  if (!listing?.fullDescription || listing.fullDescription.length > 4000) {
    errors.push("full description must be 1-4000 characters");
  }
  if (listing?.category !== "BOOKS_AND_REFERENCE") errors.push("store category is not finalized");
  if (!/^https:\/\//u.test(listing?.privacyPolicy ?? "")) {
    errors.push("privacy policy must use HTTPS");
  }
  if (listing?.privacyPolicy !== dataSafety?.privacyPolicy) {
    errors.push("listing and Data safety privacy URLs differ");
  }
  if (dataSafety?.collectsUserData !== false || dataSafety?.sharesUserData !== false) {
    errors.push("Data safety declaration no longer matches Sonelle's local-only release scope");
  }
  if (!gradle.includes('applicationId = "app.sonelle.reader"')) {
    errors.push("Gradle application ID does not match the store listing");
  }
  if (!gradle.includes("targetSdk = 36")) errors.push("Android store release must target API 36");
  const dimensions = pngDimensions(icon);
  if (dimensions?.width !== 512 || dimensions?.height !== 512) {
    errors.push("Play Store icon must be a 512 by 512 PNG");
  }
  for (const phrase of [
    "Sonelle does not upload your books or reading activity",
    "Offline voice files",
    "Device-provided voices",
    "Delete Sonelle's local data"
  ]) {
    if (!privacy.includes(phrase)) errors.push(`privacy policy is missing: ${phrase}`);
  }
  return errors;
}

function main() {
  const listing = JSON.parse(readFileSync(listingPath, "utf8"));
  const errors = validateAndroidStoreReadiness({
    listing,
    dataSafety: JSON.parse(readFileSync(dataSafetyPath, "utf8")),
    gradle: readFileSync(gradlePath, "utf8"),
    privacy: readFileSync(privacyPath, "utf8"),
    icon: readFileSync(listing.storeIcon)
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(
    "Android store identity, metadata, privacy declaration, and icon are internally consistent."
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
