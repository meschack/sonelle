use tauri::AppHandle;

use crate::audio::{
    audio_cache_summary, clear_audio_cache, prepare_narration, speak_prepared_narration,
    stop_narration, AudioCacheStats, PreparedSentenceAudio, SentenceAudioRequest,
};
use crate::epub_import::import_epub_file;
use crate::storage::{
    BookExportView, BookmarkView, LibraryBookView, LibrarySearchRequest, LibrarySearchResultView,
    ReaderDocumentView, ReadexStore, SaveBookmarkRequest, SaveReadingPositionRequest,
};

#[tauri::command]
pub fn import_epub(app: AppHandle, path: String) -> Result<ReaderDocumentView, String> {
    let imported = import_epub_file(path.as_ref()).map_err(|error| error.to_string())?;
    ReadexStore::open(&app)?.save_imported_book(imported)
}

#[tauri::command]
pub fn list_books(app: AppHandle) -> Result<Vec<LibraryBookView>, String> {
    ReadexStore::open(&app)?.list_books()
}

#[tauri::command]
pub fn open_book(
    app: AppHandle,
    book_id: String,
    chapter_id: Option<String>,
) -> Result<ReaderDocumentView, String> {
    ReadexStore::open(&app)?.open_book(&book_id, chapter_id.as_deref())
}

#[tauri::command]
pub fn prepare_sentence_audio(
    app: AppHandle,
    request: SentenceAudioRequest,
) -> Result<PreparedSentenceAudio, String> {
    prepare_narration(&app, request)
}

#[tauri::command]
pub fn play_sentence_audio(app: AppHandle, request: SentenceAudioRequest) -> Result<(), String> {
    speak_prepared_narration(&app, request)
}

#[tauri::command]
pub fn stop_sentence_audio() -> Result<(), String> {
    stop_narration()
}

#[tauri::command]
pub fn get_audio_cache_stats(app: AppHandle) -> Result<AudioCacheStats, String> {
    audio_cache_summary(&app)
}

#[tauri::command]
pub fn clear_prepared_audio_cache(app: AppHandle) -> Result<AudioCacheStats, String> {
    clear_audio_cache(&app)
}

#[tauri::command]
pub fn save_reading_position(
    app: AppHandle,
    position: SaveReadingPositionRequest,
) -> Result<(), String> {
    ReadexStore::open(&app)?.save_reading_position(position)
}

#[tauri::command]
pub fn list_bookmarks(
    app: AppHandle,
    book_id: Option<String>,
) -> Result<Vec<BookmarkView>, String> {
    ReadexStore::open(&app)?.list_bookmarks(book_id.as_deref())
}

#[tauri::command]
pub fn save_bookmark(
    app: AppHandle,
    bookmark: SaveBookmarkRequest,
) -> Result<BookmarkView, String> {
    ReadexStore::open(&app)?.save_bookmark(bookmark)
}

#[tauri::command]
pub fn delete_bookmark(app: AppHandle, bookmark_id: String) -> Result<(), String> {
    ReadexStore::open(&app)?.delete_bookmark(&bookmark_id)
}

#[tauri::command]
pub fn search_library(
    app: AppHandle,
    request: LibrarySearchRequest,
) -> Result<Vec<LibrarySearchResultView>, String> {
    ReadexStore::open(&app)?.search_library(request)
}

#[tauri::command]
pub fn export_book_data(app: AppHandle, book_id: String) -> Result<BookExportView, String> {
    ReadexStore::open(&app)?.export_book_data(&book_id)
}
