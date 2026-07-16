import { describe, expect, it } from "vitest";
import {
  NARRATION_PROVIDER_SMOKE_TESTS,
  narrationProviderSmokeEnvironment
} from "./run-narration-provider-smoke.mjs";

describe("real narration provider smoke", () => {
  it("covers direct and installed-pack inference for both production providers", () => {
    expect(NARRATION_PROVIDER_SMOKE_TESTS).toEqual(
      expect.arrayContaining([
        expect.stringContaining("renders_real_kokoro_manifest"),
        expect.stringContaining("renders_real_supertonic_audio"),
        expect.stringContaining("installs_local_kokoro_catalog"),
        expect.stringContaining("installs_local_supertonic_catalog")
      ])
    );
    expect(NARRATION_PROVIDER_SMOKE_TESTS).not.toEqual(
      expect.arrayContaining([expect.stringContaining("local_fixture")])
    );
  });

  it("forces bounded provider thread counts", () => {
    const environment = narrationProviderSmokeEnvironment({});

    expect(environment.SONELLE_KOKORO_ONNX_THREADS).toBe("1");
    expect(environment.SONELLE_SUPERTONIC_ONNX_THREADS).toBe("1");
    expect(environment.SONELLE_KOKORO_FIXTURE_ROOT).toMatch(/sources\/kokoro$/u);
  });
});
