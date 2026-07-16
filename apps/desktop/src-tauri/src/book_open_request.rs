use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::error_log::record_native_error;

pub const BOOK_OPEN_REQUESTED_EVENT: &str = "book-open-requested";

#[derive(Default)]
pub struct BookOpenRequestInbox {
    paths: Mutex<VecDeque<String>>,
}

impl BookOpenRequestInbox {
    fn push(&self, paths: impl IntoIterator<Item = PathBuf>) -> Result<bool, String> {
        let mut pending = self
            .paths
            .lock()
            .map_err(|_| "Sonelle couldn't receive the book open request.".to_string())?;
        let initial_length = pending.len();
        pending.extend(
            paths
                .into_iter()
                .map(|path| path.to_string_lossy().into_owned()),
        );
        Ok(pending.len() > initial_length)
    }

    fn take(&self) -> Result<Vec<String>, String> {
        let mut pending = self
            .paths
            .lock()
            .map_err(|_| "Sonelle couldn't receive the book open request.".to_string())?;
        Ok(pending.drain(..).collect())
    }
}

#[tauri::command]
pub fn take_pending_book_open_requests(
    inbox: State<'_, BookOpenRequestInbox>,
) -> Result<Vec<String>, String> {
    inbox.take().inspect_err(|error| {
        record_native_error("book-open-request.take", error);
    })
}

pub fn enqueue_cli_arguments<R: Runtime>(
    app: &AppHandle<R>,
    arguments: impl IntoIterator<Item = String>,
    current_directory: &Path,
) {
    enqueue_paths(
        app,
        arguments
            .into_iter()
            .filter_map(|argument| resolve_epub_argument(&argument, current_directory)),
    );
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
pub fn enqueue_opened_urls<R: Runtime>(app: &AppHandle<R>, urls: Vec<tauri::Url>) {
    enqueue_paths(
        app,
        urls.into_iter()
            .filter_map(|url| url.to_file_path().ok())
            .filter(|path| has_epub_extension(path)),
    );
}

fn enqueue_paths<R: Runtime>(app: &AppHandle<R>, paths: impl IntoIterator<Item = PathBuf>) {
    let queued = app
        .state::<BookOpenRequestInbox>()
        .push(paths)
        .inspect_err(|error| record_native_error("book-open-request.enqueue", error));
    if !matches!(queued, Ok(true)) {
        return;
    }
    if let Err(error) = app.emit(BOOK_OPEN_REQUESTED_EVENT, ()) {
        record_native_error("book-open-request.notify", &error.to_string());
    }
}

pub fn handle_run_event<R: Runtime>(app: &AppHandle<R>, event: tauri::RunEvent) {
    #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
    if let tauri::RunEvent::Opened { urls } = event {
        enqueue_opened_urls(app, urls);
        focus_main_window(app);
    }

    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
    let _ = (app, event);
}

pub fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    for (operation, result) in [
        ("show", window.show()),
        ("unminimize", window.unminimize()),
        ("focus", window.set_focus()),
    ] {
        if let Err(error) = result {
            record_native_error(
                "book-open-request.focus",
                &format!("operation={operation} error={error}"),
            );
        }
    }
}

fn resolve_epub_argument(argument: &str, current_directory: &Path) -> Option<PathBuf> {
    let argument = argument.trim();
    if argument.is_empty() || argument.starts_with('-') {
        return None;
    }

    let mut path = if argument.starts_with("file://") {
        tauri::Url::parse(argument).ok()?.to_file_path().ok()?
    } else {
        PathBuf::from(argument)
    };
    if path.extension().is_none() {
        path.set_extension("epub");
    }
    if !has_epub_extension(&path) {
        return None;
    }
    if path.is_relative() {
        path = current_directory.join(path);
    }
    Some(path.canonicalize().unwrap_or(path))
}

fn has_epub_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("epub"))
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{resolve_epub_argument, BookOpenRequestInbox};

    #[test]
    fn resolves_relative_epub_arguments_from_the_launch_directory() {
        assert_eq!(
            resolve_epub_argument("books/the-reader.epub", Path::new("/home/reader")),
            Some(PathBuf::from("/home/reader/books/the-reader.epub"))
        );
    }

    #[test]
    fn adds_the_only_supported_extension_when_it_is_omitted() {
        assert_eq!(
            resolve_epub_argument("12-rules-of-life", Path::new("/home/reader")),
            Some(PathBuf::from("/home/reader/12-rules-of-life.epub"))
        );
    }

    #[test]
    fn accepts_epub_extensions_case_insensitively() {
        assert_eq!(
            resolve_epub_argument("BOOK.EPUB", Path::new("/home/reader")),
            Some(PathBuf::from("/home/reader/BOOK.EPUB"))
        );
    }

    #[test]
    fn resolves_file_urls_from_operating_system_open_requests() {
        assert_eq!(
            resolve_epub_argument("file:///home/reader/books/book.epub", Path::new("/tmp")),
            Some(PathBuf::from("/home/reader/books/book.epub"))
        );
    }

    #[test]
    fn ignores_flags_and_unsupported_file_types() {
        assert_eq!(resolve_epub_argument("--verbose", Path::new("/tmp")), None);
        assert_eq!(resolve_epub_argument("notes.pdf", Path::new("/tmp")), None);
    }

    #[test]
    fn drains_cold_start_requests_exactly_once() {
        let inbox = BookOpenRequestInbox::default();
        inbox
            .push([PathBuf::from("/books/cold-start.epub")])
            .expect("request should be queued");

        assert_eq!(
            inbox.take().expect("request should be available"),
            vec!["/books/cold-start.epub"]
        );
        assert!(inbox
            .take()
            .expect("drained inbox should remain available")
            .is_empty());
    }

    #[test]
    fn linux_desktop_entry_passes_selected_epubs_to_sonelle() {
        let desktop_entry = include_str!("../linux/Sonelle.desktop");

        assert!(desktop_entry.contains("Exec={{exec}} %F"));
        assert!(desktop_entry.contains("MimeType=application/epub+zip;"));
    }
}
