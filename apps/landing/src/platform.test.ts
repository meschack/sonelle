import { describe, expect, it } from "vitest";

import { detectDesktopPlatform } from "./platform";

describe("detectDesktopPlatform", () => {
  it("prefers the browser platform hint for macOS", () => {
    expect(detectDesktopPlatform("Mozilla/5.0", "MacIntel")).toBe("macos");
  });

  it("recognizes Windows user agents", () => {
    expect(detectDesktopPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "")).toBe("windows");
  });

  it("defaults desktop visitors to Linux", () => {
    expect(detectDesktopPlatform("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64")).toBe("linux");
  });
});
