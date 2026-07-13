import { describe, expect, it } from "vitest";
import {
  KOKORO_ENGLISH_MODEL,
  KOKORO_REFERENCE_PACKAGES,
  pythonPackageVersionCheckScript,
  resolvePythonCommand,
  resolveVenvPythonPath
} from "./setup-kokoro-reference.mjs";

describe("Kokoro reference environment", () => {
  it("uses the platform's virtual-environment layout", () => {
    expect(resolveVenvPythonPath("/tmp/kokoro", "linux")).toBe("/tmp/kokoro/bin/python");
    expect(resolveVenvPythonPath("C:\\kokoro", "win32")).toBe("C:\\kokoro/Scripts/python.exe");
  });

  it("honors an explicit Python command", () => {
    expect(resolvePythonCommand({ PYTHON: "/opt/python" }, "linux")).toBe("/opt/python");
    expect(resolvePythonCommand({}, "win32")).toBe("python");
  });

  it("checks the installed parser version without downloading it", () => {
    expect(pythonPackageVersionCheckScript("en_core_web_sm", "3.8.0")).toContain(
      'importlib.metadata.version("en_core_web_sm") == "3.8.0"'
    );
  });

  it("pins every reference dependency exactly", () => {
    expect(KOKORO_REFERENCE_PACKAGES).toContain("misaki[en]==0.9.4");
    expect(KOKORO_REFERENCE_PACKAGES.every((dependency) => dependency.includes("=="))).toBe(true);
    expect(KOKORO_ENGLISH_MODEL).toContain("en_core_web_sm-3.8.0");
    expect(KOKORO_ENGLISH_MODEL).toMatch(/#sha256=[a-f0-9]{64}$/u);
  });
});
