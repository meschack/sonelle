import { describe, expect, it, vi } from "vitest";
import {
  createAndroidDeviceVoiceRepository,
  deviceVoiceId,
  isAndroidDeviceVoiceId
} from "./android-device-voice-repository";

describe("Android device voice repository", () => {
  it("projects native voices without exposing engine jargon", async () => {
    const invoke = vi.fn(async () => [
      {
        name: "en-us-x-tpf-local",
        label: "English (United States)",
        locale: "en-US",
        networkRequired: false
      },
      {
        name: "fr-fr-x-vlf-network",
        label: "français (France)",
        locale: "fr-FR",
        networkRequired: true
      }
    ]);
    const repository = createAndroidDeviceVoiceRepository({ invoke, available: true });

    await expect(repository.list()).resolves.toEqual([
      {
        id: deviceVoiceId("en-us-x-tpf-local"),
        nativeName: "en-us-x-tpf-local",
        label: "English (United States) — device voice",
        locale: "en-US",
        description: "Provided by this device · works offline",
        networkRequired: false
      },
      expect.objectContaining({
        label: "français (France) — device voice",
        description: "Provided by this device · may use a network connection",
        networkRequired: true
      })
    ]);
    expect(invoke).toHaveBeenCalledWith("list_android_device_voices");
  });

  it("speaks only an explicitly selected device voice", async () => {
    const invoke = vi.fn(async () => undefined);
    const repository = createAndroidDeviceVoiceRepository({ invoke, available: true });

    await repository.speak({
      utteranceId: "sentence-1:1",
      text: "A reader chose the device voice.",
      voiceId: deviceVoiceId("en-us-x-tpf-local"),
      locale: "en-US",
      playbackRate: 1.25,
      volume: 0.8
    });

    expect(invoke).toHaveBeenCalledWith("speak_android_device_sentence", {
      request: expect.objectContaining({ voiceName: "en-us-x-tpf-local" })
    });
    await expect(
      repository.speak({
        utteranceId: "sentence-2:1",
        text: "Do not silently cross adapters.",
        voiceId: "supertonic:F1",
        locale: "en-US",
        playbackRate: 1,
        volume: 1
      })
    ).rejects.toThrow("not an Android device voice");
  });

  it("reports no voices outside Android instead of inventing them", async () => {
    const invoke = vi.fn();
    const repository = createAndroidDeviceVoiceRepository({ invoke, available: false });

    await expect(repository.list()).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(isAndroidDeviceVoiceId(deviceVoiceId("reader"))).toBe(true);
    expect(isAndroidDeviceVoiceId("kokoro:af-heart")).toBe(false);
  });
});
