import { describe, expect, it } from "vitest";
import { validateAndroidStoreReadiness } from "./validate-android-store-readiness.mjs";

const png = Buffer.alloc(24);
png.write("89504e470d0a1a0a", 0, "hex");
png.writeUInt32BE(512, 16);
png.writeUInt32BE(512, 20);

function fixture() {
  return {
    listing: {
      applicationId: "app.sonelle.reader",
      category: "BOOKS_AND_REFERENCE",
      title: "Sonelle",
      shortDescription: "Read and listen locally.",
      fullDescription: "A local-first reader.",
      privacyPolicy: "https://sonelle.vercel.app/privacy.html"
    },
    dataSafety: {
      collectsUserData: false,
      sharesUserData: false,
      privacyPolicy: "https://sonelle.vercel.app/privacy.html"
    },
    gradle: 'applicationId = "app.sonelle.reader"\ntargetSdk = 36',
    privacy:
      "Sonelle does not upload your books or reading activity. Offline voice files. Device-provided voices. Delete Sonelle's local data.",
    icon: png
  };
}

describe("Android store readiness", () => {
  it("accepts the pinned identity, current Play target, metadata, and privacy contract", () => {
    expect(validateAndroidStoreReadiness(fixture())).toEqual([]);
  });

  it("rejects drift between the application, listing, and Data safety declaration", () => {
    const input = fixture();
    input.listing.applicationId = "example.invalid";
    input.dataSafety.collectsUserData = true;
    input.gradle = "targetSdk = 35";
    expect(validateAndroidStoreReadiness(input)).toEqual(
      expect.arrayContaining([
        "store application ID changed",
        "Data safety declaration no longer matches Sonelle's local-only release scope",
        "Gradle application ID does not match the store listing",
        "Android store release must target API 36"
      ])
    );
  });

  it("rejects invalid Play text limits, icon dimensions, and incomplete privacy copy", () => {
    const input = fixture();
    input.listing.shortDescription = "x".repeat(81);
    input.icon = Buffer.alloc(24);
    input.privacy = "Nothing useful";
    expect(validateAndroidStoreReadiness(input)).toEqual(
      expect.arrayContaining([
        "short description must be 1-80 characters",
        "Play Store icon must be a 512 by 512 PNG",
        "privacy policy is missing: Offline voice files"
      ])
    );
  });
});
