use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};

static NARRATION_CACHE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedNarrationManifest {
    pub asset_id: String,
    #[serde(default)]
    pub book_id: String,
    #[serde(default)]
    pub chapter_id: String,
    pub source_url: String,
    pub sample_rate: u32,
    pub sample_count: u64,
    pub sentences: Vec<NarrationSentenceSpan>,
    pub engine_id: String,
    pub model_revision: String,
    pub voice_id: String,
    pub source_text_digest: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NarrationSentenceSpan {
    pub sentence_id: String,
    pub start_sample: u64,
    pub end_sample: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedNarrationAsset {
    pub manifest: PreparedNarrationManifest,
    pub audio_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NarrationCacheStats {
    pub asset_count: usize,
    pub covered_sentence_count: usize,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NarrationChapterCacheStats {
    pub chapter_id: String,
    pub sentence_ids: Vec<String>,
    pub size_bytes: u64,
}

pub struct NarrationAssetCache {
    root: PathBuf,
}

impl NarrationAssetCache {
    pub fn open(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn get(&self, asset_id: &str) -> Result<Option<PreparedNarrationAsset>, String> {
        let directory = self.asset_dir(asset_id)?;
        let manifest_path = directory.join("manifest.json");
        let audio_path = directory.join("audio.wav");
        if !manifest_path.exists() || !audio_path.exists() {
            return Ok(None);
        }

        let manifest = read_manifest(&manifest_path)?;
        validate_manifest(&manifest)?;
        if manifest.asset_id != asset_id {
            return Ok(None);
        }
        if !audio_matches_manifest(&audio_path, &manifest) {
            return Ok(None);
        }
        Ok(Some(PreparedNarrationAsset {
            manifest,
            audio_path,
        }))
    }

    pub fn put(
        &self,
        manifest: &PreparedNarrationManifest,
        audio_bytes: &[u8],
    ) -> Result<PreparedNarrationAsset, String> {
        validate_manifest(manifest)?;
        if audio_bytes.is_empty() {
            return Err("Prepared narration audio cannot be empty.".to_string());
        }

        let _guard = NARRATION_CACHE_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "We couldn't save prepared audio.".to_string())?;
        let destination = self.asset_dir(&manifest.asset_id)?;
        let temporary = destination.with_extension("writing");
        if temporary.exists() {
            fs::remove_dir_all(&temporary)
                .map_err(|_| "We couldn't refresh prepared audio.".to_string())?;
        }
        fs::create_dir_all(&temporary)
            .map_err(|_| "We couldn't save prepared audio.".to_string())?;

        fs::write(temporary.join("audio.wav"), audio_bytes)
            .map_err(|_| "We couldn't save prepared audio.".to_string())?;
        let audio_path = destination.join("audio.wav");
        let mut stored_manifest = manifest.clone();
        stored_manifest.source_url = audio_path.to_string_lossy().into_owned();
        write_manifest(&temporary.join("manifest.json"), &stored_manifest)?;

        if destination.exists() {
            fs::remove_dir_all(&destination)
                .map_err(|_| "We couldn't replace prepared audio.".to_string())?;
        }
        fs::rename(&temporary, &destination)
            .map_err(|_| "We couldn't finish prepared audio.".to_string())?;

        Ok(PreparedNarrationAsset {
            manifest: stored_manifest,
            audio_path,
        })
    }

    pub fn clear(&self) -> Result<NarrationCacheStats, String> {
        let _guard = NARRATION_CACHE_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "We couldn't clear prepared audio.".to_string())?;
        if self.root.exists() {
            fs::remove_dir_all(&self.root)
                .map_err(|_| "We couldn't clear prepared audio.".to_string())?;
        }
        Ok(NarrationCacheStats {
            asset_count: 0,
            covered_sentence_count: 0,
            size_bytes: 0,
        })
    }

    pub fn clear_book(&self, book_id: &str) -> Result<NarrationCacheStats, String> {
        let _guard = NARRATION_CACHE_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "We couldn't clear prepared audio.".to_string())?;
        if !self.root.exists() {
            return Ok(empty_stats());
        }

        for directory in matching_asset_directories(&self.root, book_id)? {
            fs::remove_dir_all(directory)
                .map_err(|_| "We couldn't clear prepared audio.".to_string())?;
        }
        Ok(empty_stats())
    }

    pub fn stats(&self) -> Result<NarrationCacheStats, String> {
        self.stats_for_book(None)
    }

    pub fn book_stats(&self, book_id: &str) -> Result<NarrationCacheStats, String> {
        self.stats_for_book(Some(book_id))
    }

    pub fn chapter_stats(
        &self,
        book_id: &str,
        voice_id: &str,
        model_revision: &str,
    ) -> Result<Vec<NarrationChapterCacheStats>, String> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }

        let mut pending = vec![self.root.clone()];
        let mut chapters: BTreeMap<String, (BTreeSet<String>, u64)> = BTreeMap::new();
        while let Some(directory) = pending.pop() {
            for entry in fs::read_dir(directory)
                .map_err(|_| "We couldn't inspect prepared audio.".to_string())?
                .flatten()
            {
                let path = entry.path();
                if path.is_dir() {
                    pending.push(path);
                    continue;
                }
                if path.file_name().is_none_or(|name| name != "manifest.json") {
                    continue;
                }

                let manifest = read_manifest(&path)?;
                validate_manifest(&manifest)?;
                if manifest.book_id != book_id
                    || manifest.voice_id != voice_id
                    || manifest.model_revision != model_revision
                    || manifest.chapter_id.trim().is_empty()
                {
                    continue;
                }

                let chapter = chapters.entry(manifest.chapter_id).or_default();
                chapter
                    .0
                    .extend(manifest.sentences.into_iter().map(|span| span.sentence_id));
                chapter.1 += fs::metadata(path.with_file_name("audio.wav"))
                    .map_err(|_| "We couldn't inspect prepared audio.".to_string())?
                    .len();
            }
        }

        Ok(chapters
            .into_iter()
            .map(
                |(chapter_id, (sentence_ids, size_bytes))| NarrationChapterCacheStats {
                    chapter_id,
                    sentence_ids: sentence_ids.into_iter().collect(),
                    size_bytes,
                },
            )
            .collect())
    }

    fn stats_for_book(&self, book_id: Option<&str>) -> Result<NarrationCacheStats, String> {
        if !self.root.exists() {
            return Ok(empty_stats());
        }

        let mut pending = vec![self.root.clone()];
        let mut asset_count = 0;
        let mut covered_sentence_count = 0;
        let mut size_bytes = 0;

        while let Some(directory) = pending.pop() {
            for entry in fs::read_dir(directory)
                .map_err(|_| "We couldn't inspect prepared audio.".to_string())?
                .flatten()
            {
                let path = entry.path();
                if path.is_dir() {
                    pending.push(path);
                    continue;
                }
                if path.file_name().is_some_and(|name| name == "manifest.json") {
                    let manifest = read_manifest(&path)?;
                    validate_manifest(&manifest)?;
                    if book_id.is_some_and(|expected| manifest.book_id != expected) {
                        continue;
                    }
                    asset_count += 1;
                    covered_sentence_count += manifest.sentences.len();
                    size_bytes += fs::metadata(path.with_file_name("audio.wav"))
                        .map_err(|_| "We couldn't inspect prepared audio.".to_string())?
                        .len();
                }
            }
        }

        Ok(NarrationCacheStats {
            asset_count,
            covered_sentence_count,
            size_bytes,
        })
    }

    fn asset_dir(&self, asset_id: &str) -> Result<PathBuf, String> {
        if !safe_asset_id(asset_id) {
            return Err("Prepared narration asset metadata is invalid.".to_string());
        }
        Ok(self.root.join(asset_id))
    }
}

fn matching_asset_directories(root: &Path, book_id: &str) -> Result<Vec<PathBuf>, String> {
    let mut pending = vec![root.to_path_buf()];
    let mut matching = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .map_err(|_| "We couldn't inspect prepared audio.".to_string())?
            .flatten()
        {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.file_name().is_some_and(|name| name == "manifest.json") {
                let manifest = read_manifest(&path)?;
                validate_manifest(&manifest)?;
                if manifest.book_id == book_id {
                    if let Some(parent) = path.parent() {
                        matching.push(parent.to_path_buf());
                    }
                }
            }
        }
    }
    Ok(matching)
}

fn empty_stats() -> NarrationCacheStats {
    NarrationCacheStats {
        asset_count: 0,
        covered_sentence_count: 0,
        size_bytes: 0,
    }
}

fn audio_matches_manifest(path: &Path, manifest: &PreparedNarrationManifest) -> bool {
    let Ok(reader) = hound::WavReader::open(path) else {
        return false;
    };
    reader.spec().sample_rate == manifest.sample_rate
        && u64::from(reader.duration()) == manifest.sample_count
}

pub fn validate_manifest(manifest: &PreparedNarrationManifest) -> Result<(), String> {
    if manifest.asset_id.trim().is_empty()
        || manifest.sample_rate == 0
        || manifest.sample_count == 0
        || manifest.sentences.is_empty()
        || manifest.engine_id.trim().is_empty()
        || manifest.model_revision.trim().is_empty()
        || manifest.voice_id.trim().is_empty()
        || manifest.source_text_digest.trim().is_empty()
    {
        return Err("Prepared narration manifest is invalid.".to_string());
    }

    let mut expected_start = 0_u64;
    for span in &manifest.sentences {
        if span.sentence_id.trim().is_empty()
            || span.start_sample != expected_start
            || span.end_sample <= span.start_sample
            || span.end_sample > manifest.sample_count
        {
            return Err("Prepared narration manifest is invalid.".to_string());
        }
        expected_start = span.end_sample;
    }

    if expected_start != manifest.sample_count {
        return Err("Prepared narration manifest is invalid.".to_string());
    }
    Ok(())
}

fn read_manifest(path: &Path) -> Result<PreparedNarrationManifest, String> {
    let contents =
        fs::read(path).map_err(|_| "We couldn't open prepared audio metadata.".to_string())?;
    serde_json::from_slice(&contents)
        .map_err(|_| "Prepared narration manifest is invalid.".to_string())
}

fn write_manifest(path: &Path, manifest: &PreparedNarrationManifest) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(manifest)
        .map_err(|_| "We couldn't save prepared audio metadata.".to_string())?;
    fs::write(path, contents).map_err(|_| "We couldn't save prepared audio metadata.".to_string())
}

fn safe_asset_id(asset_id: &str) -> bool {
    !asset_id.trim().is_empty()
        && asset_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

#[cfg(test)]
mod tests {
    use super::{NarrationAssetCache, NarrationSentenceSpan, PreparedNarrationManifest};
    use crate::narration_wav::float_wav;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn writes_and_reads_valid_assets_atomically() {
        let root = test_root("cache-put");
        let cache = NarrationAssetCache::open(root.clone());
        let audio = valid_audio();
        let asset = cache
            .put(&manifest("asset-a", "model-a"), &audio)
            .expect("asset should write");

        assert!(asset.audio_path.exists());
        assert!(!root.join("asset-a.writing").exists());
        assert_eq!(
            cache
                .get("asset-a")
                .expect("cache should read")
                .expect("asset should exist")
                .manifest
                .asset_id,
            "asset-a"
        );
        assert_eq!(
            asset.manifest.source_url,
            root.join("asset-a/audio.wav").to_string_lossy()
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn treats_corrupted_audio_as_a_cache_miss() {
        let root = test_root("cache-corrupt-audio");
        let cache = NarrationAssetCache::open(root.clone());
        cache
            .put(&manifest("asset-a", "model-a"), &valid_audio())
            .expect("asset should write");
        fs::write(root.join("asset-a/audio.wav"), b"broken").expect("audio should corrupt");

        assert!(cache
            .get("asset-a")
            .expect("cache should inspect")
            .is_none());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_invalid_manifests_and_partial_audio() {
        let root = test_root("cache-invalid");
        let cache = NarrationAssetCache::open(root.clone());
        let mut invalid = manifest("asset-a", "model-a");
        invalid.sentences[0].end_sample = 40;

        assert!(cache.put(&invalid, b"audio").is_err());
        assert!(cache.put(&manifest("asset-b", "model-a"), b"").is_err());
        assert!(!root.join("asset-a").exists());
        assert!(!root.join("asset-b").exists());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn separates_model_revisions_by_asset_identity() {
        let root = test_root("cache-revision");
        let cache = NarrationAssetCache::open(root.clone());

        cache
            .put(&manifest("asset-model-a", "model-a"), b"first")
            .expect("first asset should write");
        cache
            .put(&manifest("asset-model-b", "model-b"), b"second")
            .expect("second asset should write");

        let stats = cache.stats().expect("stats should load");
        assert_eq!(stats.asset_count, 2);
        assert_eq!(stats.covered_sentence_count, 4);
        assert_eq!(stats.size_bytes, 11);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_tampered_manifest_on_read() {
        let root = test_root("cache-tamper");
        let cache = NarrationAssetCache::open(root.clone());
        cache
            .put(&manifest("asset-a", "model-a"), b"audio")
            .expect("asset should write");
        fs::write(root.join("asset-a/manifest.json"), b"{ broken")
            .expect("manifest should be corrupted");

        assert!(cache.get("asset-a").is_err());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn clears_all_cached_assets() {
        let root = test_root("cache-clear");
        let cache = NarrationAssetCache::open(root.clone());
        cache
            .put(&manifest("asset-a", "model-a"), b"audio")
            .expect("asset should write");

        let stats = cache.clear().expect("cache should clear");

        assert_eq!(stats.asset_count, 0);
        assert!(!root.exists());
    }

    #[test]
    fn summarizes_and_clears_only_one_books_assets() {
        let root = test_root("book-cache-maintenance");
        let cache = NarrationAssetCache::open(root.clone());
        let first = manifest("asset-a", "model-a");
        let mut second = manifest("asset-b", "model-a");
        second.book_id = "book-b".to_string();
        cache
            .put(&first, &valid_audio())
            .expect("first asset should write");
        cache
            .put(&second, &valid_audio())
            .expect("second asset should write");

        let stats = cache.book_stats("book-a").expect("book stats should load");
        assert_eq!(stats.asset_count, 1);
        assert_eq!(stats.covered_sentence_count, 2);

        cache.clear_book("book-a").expect("book cache should clear");
        assert!(cache.get("asset-a").expect("cache should load").is_none());
        assert!(cache.get("asset-b").expect("cache should load").is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn summarizes_chapter_readiness_for_the_active_voice_and_model() {
        let root = test_root("chapter-readiness");
        let cache = NarrationAssetCache::open(root.clone());
        let first = manifest("asset-a", "model-a");
        let mut second = manifest("asset-b", "model-a");
        second.chapter_id = "chapter-b".to_string();
        second.sentences[0].sentence_id = "s3".to_string();
        second.sentences[1].sentence_id = "s4".to_string();
        let stale = manifest("asset-c", "model-old");
        cache.put(&first, &valid_audio()).expect("first asset");
        cache.put(&second, &valid_audio()).expect("second asset");
        cache.put(&stale, &valid_audio()).expect("stale asset");

        let chapters = cache
            .chapter_stats("book-a", "voice-a", "model-a")
            .expect("chapter stats should load");

        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].chapter_id, "chapter-a");
        assert_eq!(chapters[0].sentence_ids, vec!["s1", "s2"]);
        assert_eq!(chapters[1].chapter_id, "chapter-b");
        assert_eq!(chapters[1].sentence_ids, vec!["s3", "s4"]);
        let _ = fs::remove_dir_all(root);
    }

    fn manifest(asset_id: &str, model_revision: &str) -> PreparedNarrationManifest {
        PreparedNarrationManifest {
            asset_id: asset_id.to_string(),
            book_id: "book-a".to_string(),
            chapter_id: "chapter-a".to_string(),
            source_url: "pending".to_string(),
            sample_rate: 1_000,
            sample_count: 1_000,
            sentences: vec![
                NarrationSentenceSpan {
                    sentence_id: "s1".to_string(),
                    start_sample: 0,
                    end_sample: 400,
                },
                NarrationSentenceSpan {
                    sentence_id: "s2".to_string(),
                    start_sample: 400,
                    end_sample: 1_000,
                },
            ],
            engine_id: "kokoro".to_string(),
            model_revision: model_revision.to_string(),
            voice_id: "voice-a".to_string(),
            source_text_digest: "digest".to_string(),
        }
    }

    fn valid_audio() -> Vec<u8> {
        float_wav(1_000, &vec![0.0; 1_000]).expect("test audio should encode")
    }

    fn test_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sonelle-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ))
    }
}
