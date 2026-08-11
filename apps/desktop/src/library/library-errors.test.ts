import { describe, expect, it } from "vitest";
import { toFriendlyLibraryError } from "./library-errors";

describe("library errors", () => {
  it("keeps insufficient-space feedback actionable", () => {
    expect(
      toFriendlyLibraryError(
        new Error("There isn't enough space to add that book. Free some storage and try again.")
      )
    ).toBe("There isn't enough space to add that book. Free some storage and try again.");
  });
});
