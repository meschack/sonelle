import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Capability {
  identifier: string;
  platforms?: string[];
  permissions: Array<string | { identifier: string }>;
}

function readCapability(name: string): Capability {
  return JSON.parse(
    readFileSync(`apps/desktop/src-tauri/capabilities/${name}.json`, "utf8")
  ) as Capability;
}

function permissionIdentifiers(capability: Capability): string[] {
  return capability.permissions.map((permission) =>
    typeof permission === "string" ? permission : permission.identifier
  );
}

describe("Android capability boundary", () => {
  it("grants only the system document picker beyond the Android core", () => {
    const android = readCapability("android");

    expect(android.identifier).toBe("android-reader");
    expect(android.platforms).toEqual(["android"]);
    expect(permissionIdentifiers(android)).toEqual(["core:default", "dialog:allow-open"]);
  });

  it("keeps the desktop profile and its plugin permissions off Android", () => {
    const desktop = readCapability("default");
    const permissions = permissionIdentifiers(desktop);

    expect(desktop.platforms).toEqual(["linux", "macOS", "windows"]);
    expect(desktop.platforms).not.toContain("android");
    expect(permissions).toContain("dialog:default");
    expect(permissions.some((permission) => permission.startsWith("opener:"))).toBe(true);

    const androidPermissions = permissionIdentifiers(readCapability("android"));
    for (const forbiddenPrefix of ["fs:", "opener:", "process:", "shell:"]) {
      expect(androidPermissions.some((permission) => permission.startsWith(forbiddenPrefix))).toBe(
        false
      );
    }
  });
});
