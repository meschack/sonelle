use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

#[cfg(mobile)]
use serde::Deserialize;
use serde::Serialize;
use sha2::{Digest, Sha256};

const COPY_BUFFER_SIZE: usize = 64 * 1024;
const COPY_CANCELLED: &str = "Book import was cancelled.";
static CANCELLED_COPIES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[cfg(mobile)]
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyBookImportSourceRequest {
    pub request_id: String,
    pub source: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookImportCopyProgress {
    pub request_id: String,
    pub completed_bytes: u64,
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedBookImportSource {
    pub source: String,
    pub reused_existing: bool,
}

pub fn cancel_copy(request_id: String) {
    if let Ok(mut cancelled) = cancellations().lock() {
        cancelled.insert(request_id);
    }
}

pub fn copy_reader_to_managed_source(
    reader: &mut impl Read,
    root: &Path,
    request_id: &str,
    total_bytes: Option<u64>,
    mut on_progress: impl FnMut(BookImportCopyProgress),
) -> Result<PreparedBookImportSource, String> {
    validate_request_id(request_id)?;
    fs::create_dir_all(root).map_err(|error| copy_error(&error))?;

    let temporary_path = root.join(format!("{request_id}.partial"));
    let mut staged = StagedSource::new(temporary_path)?;
    let request_id_for_progress = request_id.to_owned();
    let (completed_bytes, digest) = copy_stream(
        reader,
        staged.file_mut(),
        || is_cancelled(request_id),
        |completed_bytes| {
            on_progress(BookImportCopyProgress {
                request_id: request_id_for_progress.clone(),
                completed_bytes,
                total_bytes,
            });
        },
    )?;
    staged.finish_write()?;
    if is_cancelled(request_id) {
        return Err(COPY_CANCELLED.to_owned());
    }

    let destination = root.join(format!("{}.epub", digest_hex(&digest)));
    let reused_existing = destination.exists();
    if reused_existing {
        staged.discard()?;
    } else {
        staged.promote(&destination)?;
    }
    on_progress(BookImportCopyProgress {
        request_id: request_id.to_owned(),
        completed_bytes,
        total_bytes: total_bytes.or(Some(completed_bytes)),
    });

    Ok(PreparedBookImportSource {
        source: destination.to_string_lossy().into_owned(),
        reused_existing,
    })
}

pub fn copy_stream(
    reader: &mut impl Read,
    writer: &mut impl Write,
    mut cancelled: impl FnMut() -> bool,
    mut on_progress: impl FnMut(u64),
) -> Result<(u64, [u8; 32]), String> {
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    let mut completed_bytes = 0_u64;
    let mut hasher = Sha256::new();

    loop {
        if cancelled() {
            return Err(COPY_CANCELLED.to_owned());
        }
        let read = reader
            .read(&mut buffer)
            .map_err(|error| source_error(&error))?;
        if read == 0 {
            break;
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|error| copy_error(&error))?;
        hasher.update(&buffer[..read]);
        completed_bytes += read as u64;
        on_progress(completed_bytes);
    }

    if completed_bytes == 0 {
        return Err("We couldn't add that empty book. Please choose another EPUB.".to_owned());
    }
    Ok((completed_bytes, hasher.finalize().into()))
}

pub fn finish_copy(request_id: &str) {
    if let Ok(mut cancelled) = cancellations().lock() {
        cancelled.remove(request_id);
    }
}

fn cancellations() -> &'static Mutex<HashSet<String>> {
    CANCELLED_COPIES.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_cancelled(request_id: &str) -> bool {
    cancellations()
        .lock()
        .map(|cancelled| cancelled.contains(request_id))
        .unwrap_or(true)
}

fn validate_request_id(request_id: &str) -> Result<(), String> {
    if request_id.is_empty()
        || request_id.len() > 64
        || !request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Sonelle couldn't start adding that book.".to_owned());
    }
    Ok(())
}

fn source_error(_error: &io::Error) -> String {
    "We couldn't keep reading that book. Please choose it again.".to_owned()
}

fn copy_error(error: &io::Error) -> String {
    if error.kind() == io::ErrorKind::StorageFull || error.raw_os_error() == Some(28) {
        "There isn't enough space to add that book. Free some storage and try again.".to_owned()
    } else {
        "We couldn't finish adding that book. Please try again.".to_owned()
    }
}

fn digest_hex(digest: &[u8; 32]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

struct StagedSource {
    path: PathBuf,
    file: Option<File>,
    durable: bool,
}

impl StagedSource {
    fn new(path: PathBuf) -> Result<Self, String> {
        let file = File::create(&path).map_err(|error| copy_error(&error))?;
        Ok(Self {
            path,
            file: Some(file),
            durable: false,
        })
    }

    fn file_mut(&mut self) -> &mut File {
        self.file.as_mut().expect("staged source should be open")
    }

    fn finish_write(&mut self) -> Result<(), String> {
        let file = self.file_mut();
        file.flush().map_err(|error| copy_error(&error))?;
        file.sync_all().map_err(|error| copy_error(&error))?;
        self.file.take();
        Ok(())
    }

    fn discard(&mut self) -> Result<(), String> {
        self.file.take();
        fs::remove_file(&self.path).map_err(|error| copy_error(&error))?;
        self.durable = true;
        Ok(())
    }

    fn promote(&mut self, destination: &Path) -> Result<(), String> {
        fs::rename(&self.path, destination).map_err(|error| copy_error(&error))?;
        self.durable = true;
        Ok(())
    }
}

impl Drop for StagedSource {
    fn drop(&mut self) {
        if !self.durable {
            self.file.take();
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn copies_to_a_content_addressed_durable_source_and_reuses_duplicates() {
        let root = temp_source_dir("duplicate");
        fs::create_dir_all(&root).unwrap();
        let content = b"PK\x03\x04an epub";

        let first = copy_reader_to_managed_source(
            &mut Cursor::new(content),
            &root,
            "request-1",
            Some(content.len() as u64),
            |_| {},
        )
        .unwrap();
        let second = copy_reader_to_managed_source(
            &mut Cursor::new(content),
            &root,
            "request-2",
            Some(content.len() as u64),
            |_| {},
        )
        .unwrap();

        assert!(!first.reused_existing);
        assert!(second.reused_existing);
        assert_eq!(first.source, second.source);
        assert_eq!(fs::read(&first.source).unwrap(), content);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn interruption_removes_the_partial_source() {
        let root = temp_source_dir("interrupted");
        fs::create_dir_all(&root).unwrap();
        let content = vec![7_u8; COPY_BUFFER_SIZE + 1];
        let result = copy_reader_to_managed_source(
            &mut Cursor::new(content),
            &root,
            "interrupted-request",
            None,
            |_| cancel_copy("interrupted-request".to_owned()),
        );
        finish_copy("interrupted-request");

        assert_eq!(result.unwrap_err(), COPY_CANCELLED);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn insufficient_space_has_humane_feedback() {
        struct FullStorage;
        impl Write for FullStorage {
            fn write(&mut self, _buffer: &[u8]) -> io::Result<usize> {
                Err(io::Error::from(io::ErrorKind::StorageFull))
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }

        let result = copy_stream(
            &mut Cursor::new(b"PK\x03\x04book"),
            &mut FullStorage,
            || false,
            |_| {},
        );

        assert_eq!(
            result.unwrap_err(),
            "There isn't enough space to add that book. Free some storage and try again."
        );
    }

    fn temp_source_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sonelle-book-source-{label}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }
}
