use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::AppHandle;
use uuid::Uuid;

use crate::db;

const MAX_HEARTBEAT_GAP_SECONDS: i64 = 45;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingHistoryError {
    pub code: String,
    pub message: String,
}

impl ReadingHistoryError {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
        }
    }

    fn unavailable() -> Self {
        Self::new(
            "reading-history-unavailable",
            "Reading history is temporarily unavailable.",
        )
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingHistoryPreferences {
    pub enabled: bool,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleared_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSession {
    pub id: String,
    pub book_id: String,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    pub last_heartbeat_at: String,
    pub active_seconds: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_progress: Option<f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingDailyStatistic {
    pub date: String,
    pub active_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingBookStatistic {
    pub book_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub format: String,
    pub active_seconds: i64,
    pub session_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_read_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingStatistics {
    pub enabled: bool,
    pub active_session: bool,
    pub today_seconds: i64,
    pub last7_days_seconds: i64,
    pub total_seconds: i64,
    pub daily: Vec<ReadingDailyStatistic>,
    pub books: Vec<ReadingBookStatistic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleared_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingHistoryExportResult {
    pub output_path: String,
    pub session_count: usize,
    pub bytes_written: u64,
}

pub fn get_preferences(app: &AppHandle) -> Result<ReadingHistoryPreferences, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    get_preferences_at(&database_path)
}

pub fn save_preferences(
    app: &AppHandle,
    enabled: bool,
) -> Result<ReadingHistoryPreferences, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    save_preferences_at(&database_path, enabled)
}

pub fn start_session(
    app: &AppHandle,
    book_id: &str,
) -> Result<Option<ReadingSession>, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    start_session_at(&database_path, book_id)
}

pub fn heartbeat_session(
    app: &AppHandle,
    session_id: &str,
) -> Result<ReadingSession, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    heartbeat_session_at(&database_path, session_id)
}

pub fn end_session(
    app: &AppHandle,
    session_id: &str,
) -> Result<ReadingSession, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    end_session_at(&database_path, session_id)
}

pub fn get_statistics(app: &AppHandle) -> Result<ReadingStatistics, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    get_statistics_at(&database_path)
}

pub fn clear_history(app: &AppHandle) -> Result<ReadingHistoryPreferences, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    clear_history_at(&database_path)
}

pub fn export_history(
    app: &AppHandle,
    output_path: &Path,
) -> Result<ReadingHistoryExportResult, ReadingHistoryError> {
    let database_path =
        db::init_app_database(app).map_err(|_| ReadingHistoryError::unavailable())?;
    export_history_at(&database_path, output_path)
}

fn open_database(database_path: &Path) -> Result<Connection, ReadingHistoryError> {
    db::init_database_at(database_path).map_err(|_| ReadingHistoryError::unavailable())?;
    let conn = Connection::open(database_path).map_err(|_| ReadingHistoryError::unavailable())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|_| ReadingHistoryError::unavailable())?;
    Ok(conn)
}

fn current_timestamp(conn: &Connection) -> Result<String, ReadingHistoryError> {
    conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
        row.get(0)
    })
    .map_err(|_| ReadingHistoryError::unavailable())
}

pub(crate) fn get_preferences_at(
    database_path: &Path,
) -> Result<ReadingHistoryPreferences, ReadingHistoryError> {
    let conn = open_database(database_path)?;
    query_preferences(&conn)
}

fn query_preferences(conn: &Connection) -> Result<ReadingHistoryPreferences, ReadingHistoryError> {
    conn.query_row(
        "SELECT enabled, updated_at, cleared_at FROM reading_history_preferences WHERE id = 1",
        [],
        |row| {
            Ok(ReadingHistoryPreferences {
                enabled: row.get::<_, i64>(0)? != 0,
                updated_at: row.get(1)?,
                cleared_at: row.get(2)?,
            })
        },
    )
    .map_err(|_| ReadingHistoryError::unavailable())
}

pub(crate) fn save_preferences_at(
    database_path: &Path,
    enabled: bool,
) -> Result<ReadingHistoryPreferences, ReadingHistoryError> {
    let mut conn = open_database(database_path)?;
    let now = current_timestamp(&conn)?;
    let transaction = conn
        .transaction()
        .map_err(|_| ReadingHistoryError::unavailable())?;
    if !enabled {
        close_active_sessions(&transaction, &now)?;
    }
    transaction
        .execute(
            "UPDATE reading_history_preferences SET enabled = ?1, updated_at = ?2 WHERE id = 1",
            params![i64::from(enabled), now],
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    transaction
        .commit()
        .map_err(|_| ReadingHistoryError::unavailable())?;
    get_preferences_at(database_path)
}

pub(crate) fn start_session_at(
    database_path: &Path,
    book_id: &str,
) -> Result<Option<ReadingSession>, ReadingHistoryError> {
    let mut conn = open_database(database_path)?;
    let preferences = query_preferences(&conn)?;
    if !preferences.enabled {
        return Ok(None);
    }
    let book_exists = conn
        .query_row("SELECT 1 FROM books WHERE id = ?1", [book_id], |_| Ok(()))
        .optional()
        .map_err(|_| ReadingHistoryError::unavailable())?
        .is_some();
    if !book_exists {
        return Err(ReadingHistoryError::new(
            "reading-history-book-missing",
            "The book is no longer available in this library.",
        ));
    }
    let now = current_timestamp(&conn)?;
    let session_id = Uuid::new_v4().to_string();
    let transaction = conn
        .transaction()
        .map_err(|_| ReadingHistoryError::unavailable())?;
    transaction
        .execute(
            "UPDATE reading_sessions
             SET ended_at = ?1, updated_at = ?1
             WHERE ended_at IS NULL",
            [&now],
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    transaction
        .execute(
            "INSERT INTO reading_sessions (
               id, book_id, started_at, ended_at, last_heartbeat_at,
               active_seconds, final_progress, updated_at
             ) VALUES (?1, ?2, ?3, NULL, ?3, 0, NULL, ?3)",
            params![session_id, book_id, now],
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    transaction
        .commit()
        .map_err(|_| ReadingHistoryError::unavailable())?;
    query_session_at(database_path, &session_id).map(Some)
}

pub(crate) fn heartbeat_session_at(
    database_path: &Path,
    session_id: &str,
) -> Result<ReadingSession, ReadingHistoryError> {
    let conn = open_database(database_path)?;
    let now = current_timestamp(&conn)?;
    let changed = conn
        .execute(
            "UPDATE reading_sessions
             SET active_seconds = active_seconds + CASE
                   WHEN ((julianday(?2) - julianday(last_heartbeat_at)) * 86400.0)
                        BETWEEN 0.5 AND ?3
                   THEN CAST(ROUND((julianday(?2) - julianday(last_heartbeat_at)) * 86400.0) AS INTEGER)
                   ELSE 0
                 END,
                 last_heartbeat_at = ?2,
                 updated_at = ?2
             WHERE id = ?1 AND ended_at IS NULL",
            params![session_id, now, MAX_HEARTBEAT_GAP_SECONDS],
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    if changed == 0 {
        return Err(ReadingHistoryError::new(
            "reading-session-inactive",
            "This reading session is no longer active.",
        ));
    }
    query_session_at(database_path, session_id)
}

pub(crate) fn end_session_at(
    database_path: &Path,
    session_id: &str,
) -> Result<ReadingSession, ReadingHistoryError> {
    let conn = open_database(database_path)?;
    let now = current_timestamp(&conn)?;
    let changed = conn
        .execute(
            "UPDATE reading_sessions
             SET active_seconds = active_seconds + CASE
                   WHEN ((julianday(?2) - julianday(last_heartbeat_at)) * 86400.0)
                        BETWEEN 0.5 AND ?3
                   THEN CAST(ROUND((julianday(?2) - julianday(last_heartbeat_at)) * 86400.0) AS INTEGER)
                   ELSE 0
                 END,
                 ended_at = ?2,
                 last_heartbeat_at = ?2,
                 final_progress = COALESCE(
                   (SELECT progress FROM reading_progress WHERE book_id = reading_sessions.book_id),
                   final_progress
                 ),
                 updated_at = ?2
             WHERE id = ?1 AND ended_at IS NULL",
            params![session_id, now, MAX_HEARTBEAT_GAP_SECONDS],
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    if changed == 0 && !session_exists(&conn, session_id)? {
        return Err(ReadingHistoryError::new(
            "reading-session-missing",
            "This reading session could not be found.",
        ));
    }
    query_session_at(database_path, session_id)
}

fn close_active_sessions(conn: &Connection, now: &str) -> Result<(), ReadingHistoryError> {
    conn.execute(
        "UPDATE reading_sessions
         SET active_seconds = active_seconds + CASE
               WHEN ((julianday(?1) - julianday(last_heartbeat_at)) * 86400.0)
                    BETWEEN 0.5 AND ?2
               THEN CAST(ROUND((julianday(?1) - julianday(last_heartbeat_at)) * 86400.0) AS INTEGER)
               ELSE 0
             END,
             ended_at = ?1,
             last_heartbeat_at = ?1,
             final_progress = COALESCE(
               (SELECT progress FROM reading_progress WHERE book_id = reading_sessions.book_id),
               final_progress
             ),
             updated_at = ?1
         WHERE ended_at IS NULL",
        params![now, MAX_HEARTBEAT_GAP_SECONDS],
    )
    .map_err(|_| ReadingHistoryError::unavailable())?;
    Ok(())
}

fn session_exists(conn: &Connection, session_id: &str) -> Result<bool, ReadingHistoryError> {
    conn.query_row(
        "SELECT 1 FROM reading_sessions WHERE id = ?1",
        [session_id],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
    .map_err(|_| ReadingHistoryError::unavailable())
}

fn query_session_at(
    database_path: &Path,
    session_id: &str,
) -> Result<ReadingSession, ReadingHistoryError> {
    let conn = open_database(database_path)?;
    conn.query_row(
        "SELECT id, book_id, started_at, ended_at, last_heartbeat_at,
                active_seconds, final_progress, updated_at
         FROM reading_sessions WHERE id = ?1",
        [session_id],
        map_session,
    )
    .map_err(|_| ReadingHistoryError::unavailable())
}

fn map_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReadingSession> {
    Ok(ReadingSession {
        id: row.get(0)?,
        book_id: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        last_heartbeat_at: row.get(4)?,
        active_seconds: row.get(5)?,
        final_progress: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub(crate) fn get_statistics_at(
    database_path: &Path,
) -> Result<ReadingStatistics, ReadingHistoryError> {
    let conn = open_database(database_path)?;
    let preferences = query_preferences(&conn)?;
    let total_seconds = scalar_seconds(
        &conn,
        "SELECT COALESCE(SUM(active_seconds), 0) FROM reading_sessions",
    )?;
    let today_seconds = scalar_seconds(
        &conn,
        "SELECT COALESCE(SUM(active_seconds), 0) FROM reading_sessions
         WHERE date(started_at, 'localtime') = date('now', 'localtime')",
    )?;
    let last7_days_seconds = scalar_seconds(
        &conn,
        "SELECT COALESCE(SUM(active_seconds), 0) FROM reading_sessions
         WHERE date(started_at, 'localtime') >= date('now', 'localtime', '-6 days')",
    )?;
    let active_session = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM reading_sessions WHERE ended_at IS NULL)",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| ReadingHistoryError::unavailable())?
        != 0;

    let mut daily_statement = conn
        .prepare(
            "SELECT date(started_at, 'localtime') AS reading_date,
                    SUM(active_seconds)
             FROM reading_sessions
             WHERE date(started_at, 'localtime') >= date('now', 'localtime', '-6 days')
             GROUP BY reading_date ORDER BY reading_date",
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    let daily = daily_statement
        .query_map([], |row| {
            Ok(ReadingDailyStatistic {
                date: row.get(0)?,
                active_seconds: row.get(1)?,
            })
        })
        .map_err(|_| ReadingHistoryError::unavailable())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|_| ReadingHistoryError::unavailable())?;

    let mut book_statement = conn
        .prepare(
            "SELECT sessions.book_id,
                    COALESCE(metadata.user_title, books.title),
                    COALESCE(metadata.user_author, books.author),
                    books.format,
                    SUM(sessions.active_seconds),
                    COUNT(*),
                    COALESCE(progress.progress, MAX(sessions.final_progress)),
                    MAX(COALESCE(sessions.ended_at, sessions.updated_at))
             FROM reading_sessions sessions
             JOIN books ON books.id = sessions.book_id
             LEFT JOIN book_user_metadata metadata ON metadata.book_id = books.id
             LEFT JOIN reading_progress progress ON progress.book_id = books.id
             GROUP BY sessions.book_id
             ORDER BY SUM(sessions.active_seconds) DESC,
                      MAX(COALESCE(sessions.ended_at, sessions.updated_at)) DESC",
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    let books = book_statement
        .query_map([], |row| {
            Ok(ReadingBookStatistic {
                book_id: row.get(0)?,
                title: row.get(1)?,
                author: row.get(2)?,
                format: row.get(3)?,
                active_seconds: row.get(4)?,
                session_count: row.get(5)?,
                progress: row.get(6)?,
                last_read_at: row.get(7)?,
            })
        })
        .map_err(|_| ReadingHistoryError::unavailable())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|_| ReadingHistoryError::unavailable())?;

    Ok(ReadingStatistics {
        enabled: preferences.enabled,
        active_session,
        today_seconds,
        last7_days_seconds,
        total_seconds,
        daily,
        books,
        cleared_at: preferences.cleared_at,
    })
}

fn scalar_seconds(conn: &Connection, sql: &str) -> Result<i64, ReadingHistoryError> {
    conn.query_row(sql, [], |row| row.get(0))
        .map_err(|_| ReadingHistoryError::unavailable())
}

pub(crate) fn clear_history_at(
    database_path: &Path,
) -> Result<ReadingHistoryPreferences, ReadingHistoryError> {
    let mut conn = open_database(database_path)?;
    let now = current_timestamp(&conn)?;
    let transaction = conn
        .transaction()
        .map_err(|_| ReadingHistoryError::unavailable())?;
    transaction
        .execute("DELETE FROM reading_sessions", [])
        .map_err(|_| ReadingHistoryError::unavailable())?;
    transaction
        .execute(
            "UPDATE reading_history_preferences
             SET cleared_at = ?1, updated_at = ?1 WHERE id = 1",
            [&now],
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    transaction
        .commit()
        .map_err(|_| ReadingHistoryError::unavailable())?;
    get_preferences_at(database_path)
}

pub(crate) fn export_history_at(
    database_path: &Path,
    output_path: &Path,
) -> Result<ReadingHistoryExportResult, ReadingHistoryError> {
    let conn = open_database(database_path)?;
    let mut statement = conn
        .prepare(
            "SELECT sessions.id,
                    COALESCE(metadata.user_title, books.title),
                    COALESCE(metadata.user_author, books.author, ''),
                    books.format,
                    sessions.started_at,
                    COALESCE(sessions.ended_at, ''),
                    sessions.active_seconds,
                    COALESCE(sessions.final_progress, progress.progress)
             FROM reading_sessions sessions
             JOIN books ON books.id = sessions.book_id
             LEFT JOIN book_user_metadata metadata ON metadata.book_id = books.id
             LEFT JOIN reading_progress progress ON progress.book_id = books.id
             ORDER BY sessions.started_at",
        )
        .map_err(|_| ReadingHistoryError::unavailable())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<f64>>(7)?,
            ))
        })
        .map_err(|_| ReadingHistoryError::unavailable())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|_| ReadingHistoryError::unavailable())?;

    let mut csv = String::from(
        "session_id,title,author,format,started_at,ended_at,active_seconds,progress\r\n",
    );
    for row in &rows {
        csv.push_str(
            &[
                csv_cell(&row.0),
                csv_cell(&row.1),
                csv_cell(&row.2),
                csv_cell(&row.3),
                csv_cell(&row.4),
                csv_cell(&row.5),
                row.6.to_string(),
                row.7.map(|value| value.to_string()).unwrap_or_default(),
            ]
            .join(","),
        );
        csv.push_str("\r\n");
    }

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|_| {
            ReadingHistoryError::new(
                "reading-history-export-failed",
                "The CSV destination could not be prepared.",
            )
        })?;
    }
    let temporary_path = temporary_export_path(output_path);
    let write_result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temporary_path)?;
        file.write_all(&[0xEF, 0xBB, 0xBF])?;
        file.write_all(csv.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temporary_path, output_path)?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
        return Err(ReadingHistoryError::new(
            "reading-history-export-failed",
            "Reading history could not be exported to that location.",
        ));
    }
    let bytes_written = fs::metadata(output_path)
        .map(|metadata| metadata.len())
        .unwrap_or((csv.len() + 3) as u64);
    Ok(ReadingHistoryExportResult {
        output_path: output_path.display().to_string(),
        session_count: rows.len(),
        bytes_written,
    })
}

fn csv_cell(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn temporary_export_path(output_path: &Path) -> PathBuf {
    let file_name = output_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("reading-history.csv");
    output_path.with_file_name(format!(".{file_name}.{}.tmp", Uuid::new_v4()))
}

#[cfg(test)]
mod tests {
    use super::{
        clear_history_at, end_session_at, export_history_at, get_preferences_at, get_statistics_at,
        heartbeat_session_at, save_preferences_at, start_session_at,
    };
    use rusqlite::Connection;
    use tempfile::tempdir;

    fn database_with_book() -> (tempfile::TempDir, std::path::PathBuf) {
        let temp = tempdir().expect("tempdir");
        let database = temp.path().join("reader.sqlite3");
        crate::db::init_database_at(&database).expect("migration");
        let conn = Connection::open(&database).expect("open");
        conn.execute(
            "INSERT INTO books (
               id, title, author, format, library_path, file_hash, created_at, updated_at
             ) VALUES ('book-1', 'History book', 'Reader', 'txt', 'book.txt', 'hash', ?1, ?1)",
            ["2026-07-22T10:00:00.000Z"],
        )
        .expect("book");
        (temp, database)
    }

    #[test]
    fn history_is_enabled_by_default_and_can_be_disabled() {
        let (_temp, database) = database_with_book();
        assert!(get_preferences_at(&database).expect("preferences").enabled);
        let session = start_session_at(&database, "book-1")
            .expect("start")
            .expect("enabled session");
        assert!(session.ended_at.is_none());
        assert!(
            !save_preferences_at(&database, false)
                .expect("disable")
                .enabled
        );
        assert!(start_session_at(&database, "book-1")
            .expect("disabled start")
            .is_none());
    }

    #[test]
    fn heartbeat_counts_only_intervals_up_to_45_seconds() {
        let (_temp, database) = database_with_book();
        let first = start_session_at(&database, "book-1")
            .expect("start")
            .expect("session");
        let conn = Connection::open(&database).expect("open");
        conn.execute(
            "UPDATE reading_sessions SET last_heartbeat_at = datetime('now', '-30 seconds') WHERE id = ?1",
            [&first.id],
        )
        .expect("rewind");
        let counted = heartbeat_session_at(&database, &first.id).expect("heartbeat");
        assert!((29..=31).contains(&counted.active_seconds));
        conn.execute(
            "UPDATE reading_sessions SET last_heartbeat_at = datetime('now', '-5 minutes') WHERE id = ?1",
            [&first.id],
        )
        .expect("sleep gap");
        let after_sleep = heartbeat_session_at(&database, &first.id).expect("resume");
        assert_eq!(after_sleep.active_seconds, counted.active_seconds);
    }

    #[test]
    fn statistics_reuse_saved_progress_and_clear_writes_tombstone() {
        let (_temp, database) = database_with_book();
        let session = start_session_at(&database, "book-1")
            .expect("start")
            .expect("session");
        let conn = Connection::open(&database).expect("open");
        conn.execute(
            "INSERT INTO reading_progress(book_id, locator_json, progress, updated_at)
             VALUES ('book-1', '{}', 0.42, datetime('now'))",
            [],
        )
        .expect("progress");
        conn.execute(
            "UPDATE reading_sessions SET last_heartbeat_at = datetime('now', '-30 seconds') WHERE id = ?1",
            [&session.id],
        )
        .expect("rewind");
        end_session_at(&database, &session.id).expect("end");
        let statistics = get_statistics_at(&database).expect("statistics");
        assert!(statistics.total_seconds >= 29);
        assert_eq!(statistics.books[0].progress, Some(0.42));
        let preferences = clear_history_at(&database).expect("clear");
        assert!(preferences.cleared_at.is_some());
        assert_eq!(
            get_statistics_at(&database).expect("empty").total_seconds,
            0
        );
    }

    #[test]
    fn csv_export_is_utf8_and_escapes_multilingual_titles() {
        let (temp, database) = database_with_book();
        let conn = Connection::open(&database).expect("open");
        conn.execute(
            "UPDATE books SET title = '历史, café' WHERE id = 'book-1'",
            [],
        )
        .expect("title");
        let session = start_session_at(&database, "book-1")
            .expect("start")
            .expect("session");
        end_session_at(&database, &session.id).expect("end");
        let output = temp.path().join("history.csv");
        let result = export_history_at(&database, &output).expect("export");
        assert_eq!(result.session_count, 1);
        let bytes = std::fs::read(output).expect("csv");
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        let csv = String::from_utf8(bytes[3..].to_vec()).expect("utf8");
        assert!(csv.contains("\"历史, café\""));
    }

    #[test]
    fn newer_clear_prevents_older_session_reappearance_contract() {
        let (_temp, database) = database_with_book();
        let session = start_session_at(&database, "book-1")
            .expect("start")
            .expect("session");
        end_session_at(&database, &session.id).expect("end");
        let cleared = clear_history_at(&database).expect("clear");
        let conn = Connection::open(&database).expect("open");
        let session_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reading_sessions", [], |row| {
                row.get(0)
            })
            .expect("count");
        assert_eq!(session_count, 0);
        assert!(cleared.cleared_at.is_some());
        let enabled: i64 = conn
            .query_row(
                "SELECT enabled FROM reading_history_preferences WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("enabled");
        assert_eq!(enabled, 1);
    }
}
