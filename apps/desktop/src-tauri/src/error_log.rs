use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const ERROR_LOG_VERSION: u8 = 1;
const MAX_SCOPE_CHARS: usize = 120;
const MAX_MESSAGE_CHARS: usize = 4_000;
const MAX_STACK_CHARS: usize = 16_000;
const MAX_DETAILS_CHARS: usize = 8_000;

static ERROR_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static ERROR_LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorReport {
    pub scope: String,
    pub message: String,
    pub stack: Option<String>,
    pub details: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct ErrorLogDocument {
    version: u8,
    errors: Vec<ErrorLogEntry>,
}

impl Default for ErrorLogDocument {
    fn default() -> Self {
        Self {
            version: ERROR_LOG_VERSION,
            errors: Vec::new(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorLogEntry {
    timestamp: String,
    source: String,
    scope: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    stack: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
    app_version: String,
    build: String,
    platform: String,
    process_id: u32,
}

pub fn initialize(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("Could not resolve the diagnostics directory: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the diagnostics directory: {error}"))?;
    let path = directory.join("error.json");
    initialize_document(&path)?;
    let _ = ERROR_LOG_PATH.set(path.clone());
    install_panic_reporter();
    eprintln!("[sonelle][diagnostics] error_log={}", path.display());
    Ok(path)
}

pub fn path() -> Result<PathBuf, String> {
    ERROR_LOG_PATH
        .get()
        .cloned()
        .ok_or_else(|| "The diagnostics log is not ready yet.".to_string())
}

pub fn record_webview_error(report: AppErrorReport) -> Result<(), String> {
    let entry = ErrorLogEntry::new(
        "webview",
        &report.scope,
        &report.message,
        report.stack.as_deref(),
        report.details.as_deref(),
    );
    eprintln!("[sonelle][webview][{}] {}", entry.scope, entry.message);
    record(entry)
}

pub fn record_native_error(scope: &str, message: &str) {
    let scope = sanitize(scope, MAX_SCOPE_CHARS);
    let message = sanitize(message, MAX_MESSAGE_CHARS);
    eprintln!("[sonelle][native][{scope}] {message}");
    if let Err(error) = record(ErrorLogEntry::new("native", &scope, &message, None, None)) {
        eprintln!("[sonelle][diagnostics] failed_to_record_error={error}");
    }
}

fn record(entry: ErrorLogEntry) -> Result<(), String> {
    let path = path()?;
    append_entry_at(&path, entry)
}

impl ErrorLogEntry {
    fn new(
        source: &str,
        scope: &str,
        message: &str,
        stack: Option<&str>,
        details: Option<&str>,
    ) -> Self {
        Self {
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            source: sanitize(source, 32),
            scope: non_empty(sanitize(scope, MAX_SCOPE_CHARS), "app"),
            message: non_empty(sanitize(message, MAX_MESSAGE_CHARS), "Unknown error"),
            stack: optional_sanitized(stack, MAX_STACK_CHARS),
            details: optional_sanitized(details, MAX_DETAILS_CHARS),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            build: if cfg!(debug_assertions) {
                "development".to_string()
            } else {
                "production".to_string()
            },
            platform: std::env::consts::OS.to_string(),
            process_id: std::process::id(),
        }
    }
}

fn initialize_document(path: &Path) -> Result<(), String> {
    if path.is_file()
        && fs::metadata(path)
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false)
    {
        return Ok(());
    }
    write_document(path, &ErrorLogDocument::default())
}

fn append_entry_at(path: &Path, entry: ErrorLogEntry) -> Result<(), String> {
    let _guard = ERROR_LOG_WRITE_LOCK
        .lock()
        .map_err(|_| "The diagnostics log lock was poisoned.".to_string())?;
    let mut document = read_document(path);
    document.errors.push(entry);
    write_document(path, &document)
}

fn read_document(path: &Path) -> ErrorLogDocument {
    let Ok(contents) = fs::read_to_string(path) else {
        return ErrorLogDocument::default();
    };
    if contents.trim().is_empty() {
        return ErrorLogDocument::default();
    }
    serde_json::from_str(&contents).unwrap_or_else(|error| ErrorLogDocument {
        version: ERROR_LOG_VERSION,
        errors: vec![ErrorLogEntry::new(
            "native",
            "diagnostics.recovery",
            "The previous diagnostics file was invalid and has been replaced.",
            None,
            Some(&error.to_string()),
        )],
    })
}

fn write_document(path: &Path, document: &ErrorLogDocument) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(document)
        .map_err(|error| format!("Could not serialize the diagnostics log: {error}"))?;
    fs::write(path, json).map_err(|error| format!("Could not write {}: {error}", path.display()))
}

fn install_panic_reporter() {
    static PANIC_REPORTER_INSTALLED: OnceLock<()> = OnceLock::new();
    if PANIC_REPORTER_INSTALLED.set(()).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic| {
        let location = panic
            .location()
            .map(|location| {
                format!(
                    "{}:{}:{}",
                    location.file(),
                    location.line(),
                    location.column()
                )
            })
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = panic
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| panic.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("Unknown native panic");
        record_native_error("panic", &format!("{payload} at {location}"));
        previous(panic);
    }));
}

fn optional_sanitized(value: Option<&str>, max_chars: usize) -> Option<String> {
    value
        .map(|value| sanitize(value, max_chars))
        .filter(|value| !value.is_empty())
}

fn non_empty(value: String, fallback: &str) -> String {
    if value.is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn sanitize(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() && character != '\n' && character != '\t' {
                ' '
            } else {
                character
            }
        })
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{append_entry_at, ErrorLogDocument, ErrorLogEntry, ERROR_LOG_VERSION};

    #[test]
    fn appends_errors_as_valid_json() {
        let root = std::env::temp_dir().join(format!(
            "sonelle-error-log-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create test directory");
        let path = root.join("error.json");

        append_entry_at(
            &path,
            ErrorLogEntry::new("webview", "audio.playback", "Playback failed", None, None),
        )
        .expect("append first error");
        append_entry_at(
            &path,
            ErrorLogEntry::new("native", "manifest.render", "Render failed", None, None),
        )
        .expect("append second error");

        let document: ErrorLogDocument =
            serde_json::from_slice(&fs::read(&path).expect("read log")).expect("valid json");
        assert_eq!(document.version, ERROR_LOG_VERSION);
        assert_eq!(document.errors.len(), 2);
        assert_eq!(document.errors[0].scope, "audio.playback");
        assert_eq!(document.errors[1].source, "native");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recovers_an_invalid_existing_document() {
        let root =
            std::env::temp_dir().join(format!("sonelle-error-log-recovery-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create test directory");
        let path = root.join("error.json");
        fs::write(&path, b"not-json").expect("write invalid log");

        append_entry_at(
            &path,
            ErrorLogEntry::new("native", "storage", "Database failed", None, None),
        )
        .expect("recover log");

        let document: ErrorLogDocument =
            serde_json::from_slice(&fs::read(&path).expect("read log")).expect("valid json");
        assert_eq!(document.errors.len(), 2);
        assert_eq!(document.errors[0].scope, "diagnostics.recovery");
        assert_eq!(document.errors[1].scope, "storage");

        let _ = fs::remove_dir_all(root);
    }
}
