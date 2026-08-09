import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../platform/tauri-runtime";

export interface AudioCacheStatsDto {
  sentenceCount: number;
  sizeBytes: number;
}

export interface ChapterAudioCacheStatsDto {
  chapterId: string;
  sentenceIds: string[];
  sizeBytes: number;
}

export interface AudioCacheRepository {
  getStats(bookId: string): Promise<AudioCacheStatsDto>;
  getChapterStats(
    bookId: string,
    voiceId: string,
    modelRevision: string
  ): Promise<ChapterAudioCacheStatsDto[]>;
  clear(bookId: string): Promise<AudioCacheStatsDto>;
}

export function createAudioCacheRepository(): AudioCacheRepository {
  return isTauriRuntime() ? nativeAudioCacheRepository : browserAudioCacheRepository;
}

const emptyStats: AudioCacheStatsDto = {
  sentenceCount: 0,
  sizeBytes: 0
};

const nativeAudioCacheRepository: AudioCacheRepository = {
  getStats(bookId) {
    return invoke<AudioCacheStatsDto>("get_audio_cache_stats", { bookId });
  },

  getChapterStats(bookId, voiceId, modelRevision) {
    return invoke<ChapterAudioCacheStatsDto[]>("get_narration_chapter_cache_stats", {
      bookId,
      voiceId,
      modelRevision
    });
  },

  clear(bookId) {
    return invoke<AudioCacheStatsDto>("clear_prepared_audio_cache", { bookId });
  }
};

const browserAudioCacheRepository: AudioCacheRepository = {
  async getStats(_bookId) {
    return emptyStats;
  },

  async getChapterStats(_bookId, _voiceId, _modelRevision) {
    return [];
  },

  async clear(_bookId) {
    return emptyStats;
  }
};
