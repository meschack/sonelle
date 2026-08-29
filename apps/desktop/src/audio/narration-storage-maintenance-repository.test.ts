// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type {
  NarrationStorageRemovalTarget,
  NarrationStorageSnapshot
} from "@sonelle/audio/narration";
import { createNarrationStorageMaintenanceRepository } from "./narration-storage-maintenance-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

describe("narration storage maintenance repository", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("inspects narration-owned storage through one narrow command in the app runtime", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000,
      preparedAudio: [],
      voicePacks: []
    };
    mockedInvoke.mockResolvedValue(snapshot);
    const repository = createNarrationStorageMaintenanceRepository();

    await expect(repository.inspect()).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledExactlyOnceWith("inspect_narration_storage");
  });

  it("removes an approved prepared-audio book through its typed identity only", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000,
      preparedAudio: [],
      voicePacks: []
    };
    mockedInvoke.mockResolvedValue(snapshot);
    const repository = createNarrationStorageMaintenanceRepository();

    await expect(repository.remove({ kind: "prepared-audio", bookId: "book-1" })).resolves.toEqual(
      snapshot
    );
    expect(mockedInvoke).toHaveBeenCalledExactlyOnceWith("remove_narration_storage_target", {
      target: { kind: "prepared-audio", bookId: "book-1" }
    });
  });

  it("removes an approved voice pack through its exact identity and revision", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 1_000,
      preparedAudio: [],
      voicePacks: []
    };
    mockedInvoke.mockResolvedValue(snapshot);
    const repository = createNarrationStorageMaintenanceRepository();

    await expect(
      repository.remove({
        kind: "voice-pack",
        packId: "supertonic:standard",
        revision: "rev-7"
      })
    ).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledExactlyOnceWith("remove_narration_storage_target", {
      target: {
        kind: "voice-pack",
        packId: "supertonic:standard",
        revision: "rev-7"
      }
    });
  });

  it("never forwards a filesystem path supplied through the public API", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const snapshot: NarrationStorageSnapshot = {
      availableBytes: 0,
      preparedAudio: [],
      voicePacks: []
    };
    mockedInvoke.mockResolvedValue(snapshot);
    const repository = createNarrationStorageMaintenanceRepository();

    const smuggled = {
      kind: "prepared-audio",
      bookId: "book-1",
      path: "/etc/passwd"
    } as NarrationStorageRemovalTarget & { path: string };

    await repository.remove(smuggled);

    expect(mockedInvoke).toHaveBeenLastCalledWith("remove_narration_storage_target", {
      target: { kind: "prepared-audio", bookId: "book-1" }
    });
    expect(JSON.stringify(mockedInvoke.mock.lastCall)).not.toContain("/etc/passwd");
  });

  it("reports an honest empty inventory outside the app runtime", async () => {
    const repository = createNarrationStorageMaintenanceRepository();

    await expect(repository.inspect()).resolves.toEqual({
      availableBytes: 0,
      preparedAudio: [],
      voicePacks: []
    });
    await expect(repository.remove({ kind: "prepared-audio", bookId: "book-1" })).resolves.toEqual({
      availableBytes: 0,
      preparedAudio: [],
      voicePacks: []
    });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});
