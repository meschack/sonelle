import { invoke } from "@tauri-apps/api/core";
import type {
  NarrationStorageRemovalTarget,
  NarrationStorageSnapshot
} from "@sonelle/audio/narration";
import { isTauriRuntime } from "../platform/tauri-runtime";

export interface NarrationStorageMaintenanceRepository {
  inspect(): Promise<NarrationStorageSnapshot>;
  remove(target: NarrationStorageRemovalTarget): Promise<NarrationStorageSnapshot>;
}

export function createNarrationStorageMaintenanceRepository(): NarrationStorageMaintenanceRepository {
  return isTauriRuntime() ? nativeNarrationStorageRepository : emptyNarrationStorageRepository;
}

const nativeNarrationStorageRepository: NarrationStorageMaintenanceRepository = {
  inspect() {
    return invoke<NarrationStorageSnapshot>("inspect_narration_storage");
  },

  remove(target) {
    return invoke<NarrationStorageSnapshot>("remove_narration_storage_target", {
      target: typedRemovalTarget(target)
    });
  }
};

const emptySnapshot: NarrationStorageSnapshot = {
  availableBytes: 0,
  preparedAudio: [],
  voicePacks: []
};

const emptyNarrationStorageRepository: NarrationStorageMaintenanceRepository = {
  async inspect() {
    return emptySnapshot;
  },

  async remove(_target) {
    return emptySnapshot;
  }
};

function typedRemovalTarget(target: NarrationStorageRemovalTarget): NarrationStorageRemovalTarget {
  if (target.kind === "prepared-audio") {
    return { kind: "prepared-audio", bookId: target.bookId };
  }
  return { kind: "voice-pack", packId: target.packId, revision: target.revision };
}
