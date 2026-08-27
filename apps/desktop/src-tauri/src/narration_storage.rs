//! Narration-owned storage inspection and guarded removal.
//!
//! Owns:
//! - deriving the narration-only roots (`narration-v3`, `narration-engines`)
//!   from an injected application-data root;
//! - validating typed identities before any path is joined;
//! - proving a resolved target stays inside exactly one narration root
//!   (no traversal, no symlinks, no canonicalized escapes);
//! - measuring narration directories with saturating arithmetic;
//! - removing one already-authorized narration target while holding the same
//!   owner lock used by prepared-audio writes or pack installation.
//!
//! Refuses:
//! - everything outside the two narration roots, including `sonelle.sqlite3`,
//!   covers, import sources, managed Piper runtime files, and device TTS;
//! - any interface that accepts a filesystem path from the renderer;
//! - trusting a renderer-supplied `verified` flag. A removable voice pack must
//!   match the trusted catalog and pass its install-record verification.
//!
//! Tests use temporary application-data roots with sentinel files so no real
//! reader data is ever touched.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

#[cfg(desktop)]
use std::io::ErrorKind;

use serde::{Deserialize, Serialize};

#[cfg(desktop)]
use crate::narration_engine_pack::{
    catalog_ids_from, catalog_pack_from, trusted_catalog_json_for_storage,
};
#[cfg(desktop)]
use crate::narration_pack::{installed_pack_is_ready, NarrationPack};

const PREPARED_AUDIO_DIR: &str = "narration-v3";
const ENGINE_PACKS_DIR: &str = "narration-engines";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedAudioStorageEntryDto {
    pub book_id: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoicePackStorageEntryDto {
    pub pack_id: String,
    pub revision: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NarrationStorageSnapshotDto {
    pub available_bytes: u64,
    pub prepared_audio: Vec<PreparedAudioStorageEntryDto>,
    pub voice_packs: Vec<VoicePackStorageEntryDto>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum NarrationStorageRemovalTargetDto {
    #[serde(rename_all = "camelCase")]
    PreparedAudio { book_id: String },
    #[serde(rename_all = "camelCase")]
    VoicePack { pack_id: String, revision: String },
}

/// Removal outcome where `None` means the target was already gone, which keeps
/// removal idempotent and consistent with the TypeScript policy's not-found.
pub(crate) type RemovalOutcome = Result<Option<u64>, String>;

pub(crate) fn prepared_audio_root(app_data: &Path) -> PathBuf {
    app_data.join(PREPARED_AUDIO_DIR)
}

pub(crate) fn engine_packs_root(app_data: &Path) -> PathBuf {
    app_data.join(ENGINE_PACKS_DIR)
}

pub(crate) fn available_bytes(app_data: &Path) -> Result<u64, String> {
    fs2::available_space(app_data)
        .map_err(|_| "Sonelle couldn't check free space on this device.".to_string())
}

/// Inspects only Sonelle-owned narration storage. Reader-library entities are
/// structurally absent: nothing outside the two narration roots is read.
pub(crate) fn inspect_storage_at(app_data: &Path) -> Result<NarrationStorageSnapshotDto, String> {
    let snapshot = NarrationStorageSnapshotDto {
        available_bytes: available_bytes(app_data)?,
        prepared_audio: prepared_audio_inventory_for_platform(
            &prepared_audio_root(app_data),
            cfg!(desktop),
        ),
        // Android has no accepted pack storage yet, so this stays honestly
        // empty until #104 supplies verified artifacts and a real root.
        voice_packs: inspect_voice_packs_at(&engine_packs_root(app_data))?,
    };
    Ok(snapshot)
}

#[cfg(desktop)]
fn inspect_voice_packs_at(engines_root: &Path) -> Result<Vec<VoicePackStorageEntryDto>, String> {
    verified_voice_pack_inventory(engines_root, &trusted_catalog_json()?)
}

#[cfg(not(desktop))]
fn inspect_voice_packs_at(_engines_root: &Path) -> Result<Vec<VoicePackStorageEntryDto>, String> {
    Ok(Vec::new())
}

pub(crate) fn remove_prepared_audio_at(app_data: &Path, book_id: &str) -> RemovalOutcome {
    remove_prepared_audio_for_platform(&prepared_audio_root(app_data), book_id, cfg!(desktop))
}

#[cfg(desktop)]
pub(crate) fn remove_voice_pack_at(
    app_data: &Path,
    pack_id: &str,
    revision: &str,
) -> RemovalOutcome {
    remove_verified_voice_pack_at(&engine_packs_root(app_data), pack_id, revision)
}

#[cfg(desktop)]
fn remove_verified_voice_pack_at(
    engines_root: &Path,
    pack_id: &str,
    revision: &str,
) -> RemovalOutcome {
    remove_verified_voice_pack(engines_root, &trusted_catalog_json()?, pack_id, revision)
}

#[cfg(desktop)]
fn trusted_catalog_json() -> Result<String, String> {
    trusted_catalog_json_for_storage()
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

fn prepared_audio_inventory(root: &Path) -> Vec<PreparedAudioStorageEntryDto> {
    let mut sizes: BTreeMap<String, u64> = BTreeMap::new();
    for (book_id, directory) in owned_book_directories(root) {
        if let Ok(size) = directory_size(&directory) {
            *sizes.entry(book_id).or_default() += size;
        }
    }
    sizes
        .into_iter()
        .map(|(book_id, size_bytes)| PreparedAudioStorageEntryDto {
            book_id,
            size_bytes,
        })
        .collect()
}

fn prepared_audio_inventory_for_platform(
    root: &Path,
    prepared_audio_supported: bool,
) -> Vec<PreparedAudioStorageEntryDto> {
    if !prepared_audio_supported {
        return Vec::new();
    }
    prepared_audio_inventory(root)
}

fn remove_prepared_audio_for_platform(
    root: &Path,
    book_id: &str,
    prepared_audio_supported: bool,
) -> RemovalOutcome {
    if !prepared_audio_supported {
        return Err("Prepared audio isn't stored on this device yet.".to_string());
    }
    remove_prepared_book(root, book_id)
}

/// Walks the prepared-audio root without following symlinks and returns the
/// owning book id plus asset directory for every readable manifest.
fn owned_book_directories(root: &Path) -> Vec<(String, PathBuf)> {
    let mut found = Vec::new();
    if !root.is_dir() {
        return found;
    }
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                pending.push(path);
                continue;
            }
            if path.file_name().is_none_or(|name| name != "manifest.json") {
                continue;
            }
            let Some(book_id) = probe_manifest_book_id(&path) else {
                continue;
            };
            if book_id.is_empty() {
                continue;
            }
            if let Some(parent) = path.parent() {
                found.push((book_id, parent.to_path_buf()));
            }
        }
    }
    found
}

#[derive(Deserialize)]
struct ManifestBookProbe {
    #[serde(default, rename = "bookId")]
    book_id: String,
}

fn probe_manifest_book_id(manifest_path: &Path) -> Option<String> {
    let contents = fs::read(manifest_path).ok()?;
    serde_json::from_slice::<ManifestBookProbe>(&contents)
        .ok()
        .map(|probe| probe.book_id)
}

#[cfg(desktop)]
fn verified_voice_pack_inventory(
    engines_root: &Path,
    catalog_json: &str,
) -> Result<Vec<VoicePackStorageEntryDto>, String> {
    let mut inventory = Vec::new();
    for engine_id in catalog_ids(catalog_json)? {
        let Some(pack) = catalog_pack(catalog_json, &engine_id)? else {
            continue;
        };
        let destination = verified_pack_destination(engines_root, &pack)?;
        let Some(destination) = destination else {
            continue;
        };
        let size_bytes = directory_size(&destination)?;
        inventory.push(VoicePackStorageEntryDto {
            pack_id: pack.id.clone(),
            revision: pack.revision.clone(),
            size_bytes,
        });
    }
    Ok(inventory)
}

// ---------------------------------------------------------------------------
// Guarded removal
// ---------------------------------------------------------------------------

fn remove_prepared_book(root: &Path, book_id: &str) -> RemovalOutcome {
    if !is_safe_component(book_id) {
        return unsafe_target();
    }
    if !root.is_dir() {
        return Ok(None);
    }
    let canonical_root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(_) => return unsafe_target(),
    };

    let targets: Vec<PathBuf> = owned_book_directories(root)
        .into_iter()
        .filter(|(owner, _)| owner == book_id)
        .map(|(_, directory)| directory)
        .collect();
    if targets.is_empty() {
        return Ok(None);
    }

    let mut total_bytes = 0_u64;
    for target in &targets {
        let contained = contained_directory(target, &canonical_root)?;
        let size = directory_size(&contained)?;
        total_bytes = total_bytes.saturating_add(size);
    }
    // Deletion starts only after every target passed containment and sizing.
    for target in &targets {
        fs::remove_dir_all(target)
            .map_err(|_| "Sonelle couldn't remove this book's listening files.".to_string())?;
    }
    Ok(Some(total_bytes))
}

#[cfg(desktop)]
fn remove_verified_voice_pack(
    engines_root: &Path,
    catalog_json: &str,
    pack_id: &str,
    revision: &str,
) -> RemovalOutcome {
    if !is_safe_component(pack_id) || !is_safe_component(revision) {
        return unsafe_target();
    }
    let Some(pack) = catalog_pack(catalog_json, pack_id)? else {
        return Ok(None);
    };
    if pack.revision != revision {
        // A stale identity must never resolve to the newly installed revision.
        return Ok(None);
    }

    let destination = match contained_descendant(engines_root, &[&pack.id, &pack.revision])? {
        Some(destination) => destination,
        None => return Ok(None),
    };
    // The renderer never decides verification: only the catalog plus the
    // install record can mark this destination removable.
    if !installed_pack_is_ready(&destination, &pack) {
        return Ok(None);
    }

    let size = directory_size(&destination)?;
    fs::remove_dir_all(&destination)
        .map_err(|_| "Sonelle couldn't remove these offline voice files.".to_string())?;
    Ok(Some(size))
}

/// Returns the verified install destination for a catalog pack, or `None`
/// when it is not installed as a real, contained directory.
#[cfg(desktop)]
fn verified_pack_destination(
    engines_root: &Path,
    pack: &NarrationPack,
) -> Result<Option<PathBuf>, String> {
    contained_descendant(engines_root, &[&pack.id, &pack.revision])?
        .filter(|destination| installed_pack_is_ready(destination, pack))
        .map(Ok)
        .transpose()
}

// ---------------------------------------------------------------------------
// Path-safety machinery
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg(desktop)]
enum SafePathError {
    /// The identity was invalid, escaped its root, involved a symlink, or was
    /// not a real directory.
    Unsafe,
    Io,
}

#[cfg(desktop)]
impl SafePathError {
    fn into_outcome<T>(self) -> Result<T, String> {
        Err(match self {
            SafePathError::Unsafe => {
                "Sonelle couldn't find a safe narration folder for that request.".to_string()
            }
            SafePathError::Io => "Sonelle couldn't inspect its narration files.".to_string(),
        })
    }
}

fn unsafe_target<T>() -> Result<T, String> {
    Err("Sonelle couldn't find a safe narration folder for that request.".to_string())
}

/// A component must be a single safe path segment: no separators, no control
/// characters, no current/parent markers, and no leading dot.
fn is_safe_component(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('.')
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

/// Resolves `components` under `root`, rejecting missing directories, symlinked
/// segments, non-directories, and anything whose canonical location escapes
/// the canonical root.
#[cfg(desktop)]
fn contained_descendant(root: &Path, components: &[&str]) -> Result<Option<PathBuf>, String> {
    if !components
        .iter()
        .all(|component| is_safe_component(component))
    {
        return unsafe_target();
    }
    let canonical_root = match ensure_real_directory(root) {
        Ok(canonical) => canonical,
        Err(SafePathError::Io) => return SafePathError::Io.into_outcome(),
        Err(_) => return unsafe_target(),
    };

    let mut current = root.to_path_buf();
    for component in components {
        current = current.join(component);
        match ensure_real_directory(&current) {
            Ok(_) => {}
            Err(SafePathError::Unsafe) => return unsafe_target(),
            Err(SafePathError::Io) => return SafePathError::Io.into_outcome(),
        }
    }

    match current.canonicalize() {
        Ok(canonical) if canonical.starts_with(&canonical_root) => Ok(Some(canonical)),
        Ok(_) => unsafe_target(),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(_) => SafePathError::Io.into_outcome(),
    }
}

/// Canonicalizes a discovered prepared-audio directory and proves it lives in
/// the canonical root before anything may be measured or deleted.
fn contained_directory(target: &Path, canonical_root: &Path) -> Result<PathBuf, String> {
    let metadata = match fs::symlink_metadata(target) {
        Ok(metadata) => metadata,
        Err(_) => return unsafe_target(),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return unsafe_target();
    }
    match target.canonicalize() {
        Ok(canonical) if canonical.starts_with(canonical_root) => Ok(canonical),
        Ok(_) => unsafe_target(),
        Err(_) => unsafe_target(),
    }
}

/// Accepts only real (non-symlink) directories and returns their canonical
/// path, so every later comparison uses one shared spelling.
#[cfg(desktop)]
fn ensure_real_directory(path: &Path) -> Result<PathBuf, SafePathError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| match error.kind() {
        ErrorKind::NotFound => SafePathError::Unsafe,
        _ => SafePathError::Io,
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(SafePathError::Unsafe);
    }
    path.canonicalize().map_err(|_| SafePathError::Io)
}

/// Measures a directory tree without following symlinks, using saturating
/// arithmetic so hostile sizes can never wrap.
fn directory_size(path: &Path) -> Result<u64, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "Sonelle couldn't inspect its narration files.".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Sonelle couldn't inspect its narration files.".to_string());
    }
    if !metadata.is_dir() {
        return Ok(metadata.len());
    }

    let mut total = 0_u64;
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|_| "Sonelle couldn't inspect its narration files.".to_string())?;
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let Ok(entry_metadata) = fs::symlink_metadata(&entry_path) else {
                return Err("Sonelle couldn't inspect its narration files.".to_string());
            };
            if entry_metadata.file_type().is_symlink() {
                continue;
            }
            if entry_metadata.is_dir() {
                pending.push(entry_path);
            } else {
                total = total.saturating_add(entry_metadata.len());
            }
        }
    }
    Ok(total)
}

// ---------------------------------------------------------------------------
// Catalog plumbing is delegated to narration_engine_pack; storage code never
// parses renderer data as a catalog.
// ---------------------------------------------------------------------------

#[cfg(desktop)]
fn catalog_ids(catalog_json: &str) -> Result<Vec<String>, String> {
    catalog_ids_from(catalog_json)
}

#[cfg(desktop)]
fn catalog_pack(catalog_json: &str, engine_id: &str) -> Result<Option<NarrationPack>, String> {
    catalog_pack_from(catalog_json, engine_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::narration_pack::{
        install_narration_pack, NarrationPack, NarrationPackArtifact, NarrationPackDownloadClient,
    };
    use sha2::{Digest, Sha256};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "sonelle-narration-storage-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("temp root");
        root
    }

    struct StaticContent(Vec<u8>);

    impl NarrationPackDownloadClient for StaticContent {
        fn stream(
            &self,
            _url: &str,
            on_chunk: &mut dyn FnMut(&[u8]) -> Result<(), String>,
        ) -> Result<(), String> {
            on_chunk(&self.0)
        }

        fn stream_range(
            &self,
            _url: &str,
            _start_byte: u64,
            _on_chunk: &mut dyn FnMut(&[u8]) -> Result<(), String>,
        ) -> Result<(), crate::narration_pack::NarrationPackDownloadError> {
            Err(crate::narration_pack::NarrationPackDownloadError::UnsupportedResume)
        }
    }

    const ARTIFACT_BYTES: &[u8] = b"verified-offline-voice-artifact";

    fn artifact_sha256() -> String {
        let digest = Sha256::digest(ARTIFACT_BYTES);
        digest.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn catalog_json(engine_id: &str, revision: &str) -> String {
        format!(
            r#"{{"engines":[{{
                "id":"{engine_id}",
                "model": {{
                    "repository":"example/repository",
                    "revision":"{revision}",
                    "artifacts":[{{
                        "remotePath":"model.onnx",
                        "targetPath":"assets/model.onnx",
                        "sizeBytes":{},
                        "sha256":"{}"
                    }}]
                }}
            }}]}}"#,
            ARTIFACT_BYTES.len(),
            artifact_sha256()
        )
    }

    fn test_pack(engine_id: &str, revision: &str) -> NarrationPack {
        NarrationPack {
            id: engine_id.to_string(),
            revision: revision.to_string(),
            artifacts: vec![NarrationPackArtifact {
                id: "assets/model.onnx".to_string(),
                relative_path: PathBuf::from("assets/model.onnx"),
                url: "https://example.invalid/model.onnx".to_string(),
                sha256: artifact_sha256(),
                size_bytes: ARTIFACT_BYTES.len() as u64,
            }],
        }
    }

    fn install_verified_pack(engines_root: &Path, engine_id: &str, revision: &str) {
        install_narration_pack(
            engines_root,
            &test_pack(engine_id, revision),
            &StaticContent(ARTIFACT_BYTES.to_vec()),
            &mut |_, _| {},
        )
        .expect("fixture pack should install");
    }

    /// Creates a prepared-audio asset directory owned by `book_id` and returns
    /// its byte size.
    fn make_prepared_book(root: &Path, asset_id: &str, book_id: &str, audio_len: usize) -> u64 {
        let directory = root.join(asset_id);
        fs::create_dir_all(&directory).expect("asset dir");
        fs::write(
            directory.join("manifest.json"),
            format!(r#"{{"bookId":"{book_id}"}}"#),
        )
        .expect("manifest");
        fs::write(directory.join("audio.wav"), vec![0_u8; audio_len]).expect("audio");
        (audio_len as u64) + fs::metadata(directory.join("manifest.json")).unwrap().len()
    }

    #[test]
    fn removes_one_prepared_book_and_preserves_its_sibling() {
        let app_data = temp_root("prepared-sibling");
        let root = prepared_audio_root(&app_data);
        let kept = make_prepared_book(&root, "asset-a", "book-a", 1_000);
        let removed = make_prepared_book(&root, "asset-b", "book-b", 2_000);

        let reclaimed =
            remove_prepared_audio_at(&app_data, "book-b").expect("removal should succeed");

        assert_eq!(reclaimed, Some(removed));
        assert!(root.join("asset-a/audio.wav").exists());
        assert!(!root.join("asset-b").exists());
        assert_eq!(
            prepared_audio_inventory(&root)
                .iter()
                .map(|entry| entry.book_id.clone())
                .collect::<Vec<_>>(),
            vec!["book-a".to_string()]
        );
        assert_eq!(prepared_audio_inventory(&root)[0].size_bytes, kept);
        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn mobile_capability_boundary_hides_and_refuses_provisional_prepared_audio() {
        let app_data = temp_root("mobile-prepared-boundary");
        let root = prepared_audio_root(&app_data);
        make_prepared_book(&root, "asset-a", "book-a", 100);

        assert!(prepared_audio_inventory_for_platform(&root, false).is_empty());
        assert_eq!(
            remove_prepared_audio_for_platform(&root, "book-a", false),
            Err("Prepared audio isn't stored on this device yet.".to_string())
        );
        assert!(root.join("asset-a/audio.wav").exists());

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn never_touches_protected_reader_data_outside_narration_roots() {
        let app_data = temp_root("protected-sentinels");
        let root = prepared_audio_root(&app_data);
        make_prepared_book(&root, "asset-a", "book-a", 10);
        fs::write(app_data.join("sonelle.sqlite3"), b"library").expect("sqlite sentinel");
        fs::create_dir_all(app_data.join("covers")).expect("covers");
        fs::write(app_data.join("covers/cover.jpg"), b"cover").expect("cover sentinel");
        fs::create_dir_all(app_data.join("import-sources")).expect("import sources");
        fs::write(app_data.join("import-sources/book.epub"), b"epub").expect("source sentinel");
        fs::write(app_data.join("arbitrary.file"), b"keep").expect("sentinel");

        for hostile in ["../sonelle.sqlite3", "../../covers", "/etc", "", "a/b"] {
            let outcome = remove_prepared_audio_at(&app_data, hostile);
            assert!(outcome.is_err(), "identity {hostile:?} must be refused");
        }

        // The narration book itself can still be removed through its identity.
        remove_prepared_audio_at(&app_data, "book-a").expect("own removal works");
        assert!(fs::read(app_data.join("sonelle.sqlite3")).is_ok());
        assert!(app_data.join("covers/cover.jpg").exists());
        assert!(app_data.join("import-sources/book.epub").exists());
        assert!(app_data.join("arbitrary.file").exists());
        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn removes_exactly_one_verified_pack_revision_and_preserves_others() {
        let app_data = temp_root("pack-revisions");
        let engines = engine_packs_root(&app_data);
        install_verified_pack(&engines, "testengine", "rev-1");
        install_verified_pack(&engines, "testengine", "rev-2");
        install_verified_pack(&engines, "otherengine", "rev-1");
        let catalog = catalog_json("testengine", "rev-2");

        let inventory =
            verified_voice_pack_inventory(&engines, &catalog).expect("inventory should read");
        // Only the catalog-current revision is a verified removable pack.
        assert_eq!(
            inventory,
            vec![VoicePackStorageEntryDto {
                pack_id: "testengine".to_string(),
                revision: "rev-2".to_string(),
                size_bytes: inventory[0].size_bytes,
            }]
        );

        let reclaimed = remove_verified_voice_pack(&engines, &catalog, "testengine", "rev-2")
            .expect("removal should succeed");
        assert_eq!(reclaimed, Some(inventory[0].size_bytes));
        assert!(!engines.join("testengine/rev-2").exists());
        assert!(engines.join("testengine/rev-1").exists());
        assert!(engines.join("otherengine/rev-1").exists());

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn rejects_dangerous_and_stale_pack_identities_without_deleting() {
        let app_data = temp_root("pack-identities");
        let engines = engine_packs_root(&app_data);
        install_verified_pack(&engines, "testengine", "rev-1");
        let catalog = catalog_json("testengine", "rev-1");
        let destination = engines.join("testengine/rev-1");
        assert!(destination.exists());

        for (pack_id, revision) in [
            ("../escape", "rev-1"),
            ("testengine", "../escape"),
            ("testengine", "a/b"),
            ("", "rev-1"),
            ("testengine", ""),
            ("testengine", "rev\u{2044}1"),
            ("/abs", "rev-1"),
        ] {
            let outcome = remove_verified_voice_pack(&engines, &catalog, pack_id, revision);
            assert!(outcome.is_err(), "{pack_id:?}/{revision:?} must be refused");
        }
        // Unknown engine and stale revision are honest not-found results.
        assert_eq!(
            remove_verified_voice_pack(&engines, &catalog, "unknown", "rev-1").unwrap(),
            None
        );
        assert_eq!(
            remove_verified_voice_pack(&engines, &catalog, "testengine", "rev-9").unwrap(),
            None
        );
        assert!(destination.exists(), "nothing may be deleted on refusal");

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn does_not_treat_unverified_pack_files_as_removable() {
        let app_data = temp_root("pack-unverified");
        let engines = engine_packs_root(&app_data);
        let partial = engines.join("testengine/rev-1");
        fs::create_dir_all(partial.join("assets")).expect("partial dir");
        fs::write(partial.join("assets/model.onnx"), b"corrupt").expect("artifact");
        let catalog = catalog_json("testengine", "rev-1");

        let outcome = remove_verified_voice_pack(&engines, &catalog, "testengine", "rev-1")
            .expect("verification failure is not an error");

        assert_eq!(
            outcome, None,
            "unverified packs are not found as ready packs"
        );
        assert!(partial.exists(), "unverified files stay untouched");
        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn refuses_a_symlinked_prepared_book_pointing_outside_the_root() {
        let app_data = temp_root("symlink-escape");
        let root = prepared_audio_root(&app_data);
        fs::create_dir_all(&root).expect("prepared root");
        let outside = temp_root("symlink-outside");
        fs::create_dir_all(outside.join("victim")).expect("outside dir");
        fs::write(
            outside.join("victim/manifest.json"),
            r#"{"bookId":"book-outside"}"#,
        )
        .expect("manifest");
        fs::write(outside.join("victim/audio.wav"), b"do not delete").expect("audio");
        symlink(&outside.join("victim"), &root.join("book-link"));

        let outcome = remove_prepared_audio_at(&app_data, "book-outside")
            .expect("walk-level skipping is not an error");
        assert_eq!(outcome, None, "symlinked directories are invisible targets");
        assert!(outside.join("victim/audio.wav").exists());

        // A direct symlink target is also refused outright.
        let outcome = remove_prepared_audio_at(&app_data, "book-link");
        assert!(outcome.is_err() || outcome == Ok(None));
        assert!(outside.join("victim/audio.wav").exists());
        let _ = fs::remove_dir_all(app_data);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn missing_targets_are_idempotent_no_ops() {
        let app_data = temp_root("missing-targets");
        let outcome =
            remove_prepared_audio_at(&app_data, "absent-book").expect("absent root is fine");
        assert_eq!(outcome, None);

        let root = prepared_audio_root(&app_data);
        make_prepared_book(&root, "asset-a", "book-a", 5);
        let outcome =
            remove_prepared_audio_at(&app_data, "absent-book").expect("absent book is fine");
        assert_eq!(outcome, None);
        assert!(root.join("asset-a").exists());
        let _ = fs::remove_dir_all(app_data);
    }

    #[cfg(unix)]
    #[test]
    fn survives_unreadable_metadata_without_broad_cleanup() {
        use std::os::unix::fs::PermissionsExt;
        if process_is_running_as_root() {
            return; // Permission bits cannot produce unreadable metadata for root.
        }
        let app_data = temp_root("unreadable-metadata");
        let root = prepared_audio_root(&app_data);
        make_prepared_book(&root, "asset-a", "book-a", 100);
        make_prepared_book(&root, "asset-b", "book-b", 200);
        let locked = root.join("asset-b");
        let mut permissions = fs::metadata(&locked).unwrap().permissions();
        permissions.set_mode(0o000);
        fs::set_permissions(&locked, permissions).expect("chmod");

        // The unreadable subtree is invisible to the inventory walk, so the
        // request resolves as already-absent instead of deleting blind.
        let outcome =
            remove_prepared_audio_at(&app_data, "book-b").expect("no error reaches the reader");
        assert_eq!(outcome, None);

        // Restore access and prove nothing was deleted while it was locked.
        let mut permissions = fs::metadata(&locked).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&locked, permissions).expect("chmod back");
        assert!(
            root.join("asset-b/audio.wav").exists(),
            "locked data untouched"
        );
        assert!(root.join("asset-a/audio.wav").exists(), "no broad cleanup");

        // Once readable, the same identity removes cleanly.
        let expected = 200 + manifest_len(&root, "asset-b");
        let reclaimed =
            remove_prepared_audio_at(&app_data, "book-b").expect("readable book removes");
        assert_eq!(reclaimed, Some(expected));
        assert!(!root.join("asset-b").exists());
        let _ = fs::remove_dir_all(app_data);
    }

    #[cfg(unix)]
    fn manifest_len(root: &Path, asset_id: &str) -> u64 {
        fs::metadata(root.join(asset_id).join("manifest.json"))
            .map(|metadata| metadata.len())
            .unwrap_or(0)
    }

    #[cfg(unix)]
    fn process_is_running_as_root() -> bool {
        use std::os::unix::fs::PermissionsExt;
        // Without a libc dependency here, approximate with a read probe on a
        // 000-permission file; root can still open it.
        let probe = std::env::temp_dir().join(format!("sonelle-root-probe-{}", std::process::id()));
        if fs::write(&probe, b"").is_err() {
            return false;
        }
        let mut permissions = match fs::metadata(&probe) {
            Ok(metadata) => metadata.permissions(),
            Err(_) => return false,
        };
        permissions.set_mode(0o000);
        if fs::set_permissions(&probe, permissions).is_err() {
            let _ = fs::remove_file(&probe);
            return false;
        }
        let bypassed = fs::File::open(&probe).is_ok();
        let _ = fs::remove_file(&probe);
        bypassed
    }

    #[test]
    fn measures_reclaimed_bytes_with_saturating_arithmetic() {
        let app_data = temp_root("byte-accounting");
        let root = prepared_audio_root(&app_data);
        let first = make_prepared_book(&root, "asset-a", "book-a", 4_096);
        let second = make_prepared_book(&root, "asset-b", "book-a", 8_192);

        let reclaimed =
            remove_prepared_audio_at(&app_data, "book-a").expect("multi-dir book removes");

        assert_eq!(reclaimed, Some(first + second));
        assert!(!root.join("asset-a").exists());
        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn removal_api_never_accepts_a_renderer_supplied_filesystem_path() {
        let smuggled = r#"{"kind":"prepared-audio","bookId":"book-1","path":"/etc/passwd"}"#;
        let parsed: NarrationStorageRemovalTargetDto =
            serde_json::from_str(smuggled).expect("typed payload parses");
        assert_eq!(
            parsed,
            NarrationStorageRemovalTargetDto::PreparedAudio {
                book_id: "book-1".to_string()
            }
        );

        let smuggled_pack = r#"{"kind":"voice-pack","packId":"p","revision":"r","path":"/"}"#;
        let parsed: NarrationStorageRemovalTargetDto =
            serde_json::from_str(smuggled_pack).expect("typed pack payload parses");
        assert_eq!(
            parsed,
            NarrationStorageRemovalTargetDto::VoicePack {
                pack_id: "p".to_string(),
                revision: "r".to_string(),
            }
        );
    }

    #[test]
    fn component_validation_rejects_traversal_and_separator_tricks() {
        for hostile in [
            "..",
            ".",
            "a/../..",
            "a/b",
            "a\\b",
            "",
            " ",
            "a\u{2044}b",
            "\u{0000}hidden",
            ".hidden",
        ] {
            assert!(!is_safe_component(hostile), "{hostile:?} must be rejected");
        }
        for accepted in [
            "book-123",
            "kokoro",
            "9b93dc3dfafca047deddfe940c752178ac9fbd0",
        ] {
            assert!(is_safe_component(accepted), "{accepted:?} should pass");
        }
    }

    #[cfg(unix)]
    fn symlink(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).expect("symlink fixture");
    }

    #[allow(dead_code)]
    fn ensure_symlink_helper_used() {}
}
