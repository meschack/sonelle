#[cfg(any(mobile, test))]
mod android_device_voice;
#[cfg(desktop)]
mod audio;
#[cfg(desktop)]
mod background_process;
#[cfg(any(mobile, test))]
mod book_import_source;
mod book_open_request;
mod commands;
mod epub_import;
mod error_log;
#[cfg(desktop)]
mod kokoro_manifest;
#[cfg(desktop)]
pub mod kokoro_narration;
#[cfg(desktop)]
pub mod kokoro_text;
mod library_import;
mod library_migration;
#[cfg(any(mobile, test))]
mod mobile_shell;
#[cfg(desktop)]
pub mod narration_cache;
#[cfg(desktop)]
mod narration_engine_pack;
#[cfg(desktop)]
mod narration_manifest;
#[cfg(desktop)]
pub mod narration_pack;
#[cfg(desktop)]
mod narration_rendered_audio;
#[cfg(desktop)]
mod narration_wav;
mod storage;
#[cfg(desktop)]
mod supertonic_helper;
#[cfg(desktop)]
mod supertonic_narration;
#[cfg(desktop)]
mod system_fonts;
mod text;
#[cfg(desktop)]
mod voice_installation;

use std::io;

use tauri::Manager;

use crate::library_migration::migrate_legacy_library;
use crate::storage::SonelleStore;

#[tauri::command]
fn app_status() -> &'static str {
    "ready"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder =
        tauri::Builder::default().manage(book_open_request::BookOpenRequestInbox::default());
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        book_open_request::enqueue_cli_arguments(app, args.into_iter().skip(1), cwd.as_ref());
        book_open_request::focus_main_window(app);
    }));

    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            error_log::initialize(app.handle()).map_err(io::Error::other)?;
            let store = SonelleStore::open(app.handle()).map_err(|error| {
                error_log::record_native_error("storage.open", &error);
                io::Error::other(error)
            })?;
            let migration_store = store.clone();
            app.manage(store);
            #[cfg(desktop)]
            {
                let current_directory = std::env::current_dir().unwrap_or_default();
                book_open_request::enqueue_cli_arguments(
                    app.handle(),
                    std::env::args().skip(1),
                    &current_directory,
                );
            }
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(error) = migrate_legacy_library(&migration_store) {
                    error_log::record_native_error(
                        "library.repair",
                        &format!("stage=run error={error}"),
                    );
                }
            });
            Ok(())
        });

    #[cfg(mobile)]
    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(android_device_voice::init());

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_status,
        commands::cancel_manifest_narration,
        commands::clear_prepared_audio_cache,
        commands::delete_bookmark,
        commands::export_book_data,
        commands::get_audio_cache_stats,
        commands::get_narration_chapter_cache_stats,
        commands::get_narration_engine_status,
        book_open_request::take_pending_book_open_requests,
        commands::import_epub,
        commands::install_narration_engine,
        commands::list_bookmarks,
        commands::list_books,
        commands::list_system_fonts,
        commands::open_book,
        commands::prepare_manifest_narration,
        commands::prepare_sentence_audio,
        commands::report_app_error,
        commands::play_sentence_audio,
        commands::save_bookmark,
        commands::save_reading_position,
        commands::search_library,
        commands::stop_sentence_audio,
        commands::update_book_metadata,
        commands::get_narration_voice_status,
        commands::install_narration_voice,
    ]);

    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_status,
        commands::cancel_book_import_source_copy,
        commands::copy_book_import_source,
        commands::list_android_device_voices,
        commands::delete_bookmark,
        commands::export_book_data,
        commands::get_audio_cache_stats,
        book_open_request::take_pending_book_open_requests,
        commands::import_epub,
        commands::list_bookmarks,
        commands::list_books,
        commands::list_system_fonts,
        commands::open_book,
        commands::probe_book_import_source,
        commands::report_app_error,
        commands::save_bookmark,
        commands::save_reading_position,
        commands::search_library,
        commands::speak_android_device_sentence,
        commands::stop_android_device_voice,
        commands::update_book_metadata,
    ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(book_open_request::handle_run_event);
}
