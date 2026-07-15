use chrono::Utc;
use rusqlite::{params, Connection};

const ALLOWED_RENDERER_EVENTS: &[&str] = &[
    "BookImportRequested",
    "BookImportCancelled",
    "BookImportFailed",
    "NarrationPlaybackRequested",
    "NarrationPreparationStarted",
    "PassageNarrationReady",
    "PassageNarrationPlaybackEnded",
    "NarrationSentenceEntered",
    "NarrationPlaybackPaused",
    "NarrationPlaybackEnded",
    "NarrationPlaybackFailed",
    "NarrationResetRequested",
    "UpcomingNarrationPreparationRequested",
    "UpcomingNarrationPreparationReady",
    "UpcomingNarrationPreparationFailed",
    "WordInspected",
    "WordLookupStarted",
    "WordLookupCompleted",
    "WordSaved",
    "WordForgotten",
    "VoiceInstallationRequested",
    "VoiceInstallationReady",
    "VoiceInstallationFailed",
    "OfflineNarrationFilesInstallationRequested",
    "OfflineNarrationFilesInstallationReady",
    "OfflineNarrationFilesInstallationFailed",
    "PreparedNarrationClearingRequested",
    "PreparedNarrationCleared",
    "PreparedNarrationClearingFailed",
    "BookExportRequested",
    "BookExported",
    "BookExportFailed",
    "ParagraphImageRequested",
    "ParagraphImageCreated",
    "ParagraphImageFailed",
    "ReaderOpened",
    "ReaderClosed",
    "ReaderTypographyChanged",
];

pub(super) fn insert_event(
    connection: &Connection,
    name: &str,
    payload: serde_json::Value,
) -> Result<(), String> {
    let occurred_at = Utc::now().to_rfc3339();
    let id = format!("{name}-{occurred_at}");

    connection
        .execute(
            "INSERT INTO domain_events (id, name, occurred_at, payload_json)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, name, occurred_at, payload.to_string()],
        )
        .map(|_| ())
        .map_err(|_| "We couldn't save the library update.".to_string())
}

pub(super) fn insert_renderer_event(
    connection: &Connection,
    id: &str,
    name: &str,
    occurred_at: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    if !ALLOWED_RENDERER_EVENTS.contains(&name) || id.len() > 128 || occurred_at.len() > 64 {
        return Err("That reader update was not recognized.".to_string());
    }

    let payload_json = payload.to_string();
    if payload_json.len() > 16_384 {
        return Err("That reader update was too large.".to_string());
    }

    connection
        .execute(
            "INSERT INTO domain_events (id, name, occurred_at, payload_json)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, name, occurred_at, payload_json],
        )
        .map(|_| ())
        .map_err(|_| "We couldn't save the reader update.".to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;

    use super::{insert_renderer_event, ALLOWED_RENDERER_EVENTS};

    #[test]
    fn renderer_events_are_allowlisted_and_persisted() {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .execute_batch(
                "CREATE TABLE domain_events (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );",
            )
            .expect("event table should exist");

        for (index, name) in ALLOWED_RENDERER_EVENTS.iter().enumerate() {
            insert_renderer_event(
                &connection,
                &format!("event-{index}"),
                name,
                "2026-07-10T00:00:00.000Z",
                &json!({}),
            )
            .expect("known renderer event should persist");
        }

        let count = connection
            .query_row("SELECT COUNT(*) FROM domain_events", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("event count should read");
        assert_eq!(count, ALLOWED_RENDERER_EVENTS.len() as i64);
        assert!(insert_renderer_event(
            &connection,
            "event-unknown",
            "ArbitraryRendererEvent",
            "2026-07-10T00:00:00.000Z",
            &json!({})
        )
        .is_err());
    }
}
