use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "ebook-reader.sqlite3";
const INITIAL_MIGRATION: &str = include_str!("../migrations/0001_initial.sql");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppHealth {
    database_path: String,
    schema_version: i64,
}

pub fn app_health(app: &AppHandle) -> anyhow::Result<AppHealth> {
    let database_path = init_app_database(app)?;
    let conn = Connection::open(&database_path).with_context(|| {
        format!(
            "failed to open SQLite database at {}",
            database_path.display()
        )
    })?;

    Ok(AppHealth {
        database_path: database_path.display().to_string(),
        schema_version: schema_version(&conn)?,
    })
}

pub fn init_app_database(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve application data directory")?;
    let database_path = app_data_dir.join(DB_FILE_NAME);

    init_database_at(&database_path)?;

    Ok(database_path)
}

pub fn init_database_at(database_path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create database directory {}", parent.display()))?;
    }

    let mut conn = Connection::open(database_path).with_context(|| {
        format!(
            "failed to open SQLite database at {}",
            database_path.display()
        )
    })?;
    configure_connection(&conn)?;
    run_migrations(&mut conn)?;

    Ok(())
}

fn configure_connection(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")
}

fn run_migrations(conn: &mut Connection) -> rusqlite::Result<()> {
    let transaction = conn.transaction()?;
    transaction.execute_batch(INITIAL_MIGRATION)?;
    transaction.commit()
}

fn schema_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::{init_database_at, schema_version, DB_FILE_NAME};

    #[test]
    fn initial_migration_creates_expected_tables() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        init_database_at(&database_path).expect("initialize database");

        let conn = Connection::open(database_path).expect("open database");
        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
                    'schema_migrations',
                    'books',
                    'reading_progress',
                    'bookmarks',
                    'annotations',
                    'app_settings'
                )",
                [],
                |row| row.get(0),
            )
            .expect("count tables");

        assert_eq!(table_count, 6);
        assert_eq!(schema_version(&conn).expect("schema version"), 1);
    }

    #[test]
    fn initial_migration_is_idempotent() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        init_database_at(&database_path).expect("first initialize database");
        init_database_at(&database_path).expect("second initialize database");

        let conn = Connection::open(database_path).expect("open database");
        let migration_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
                [],
                |row| row.get(0),
            )
            .expect("count migration records");

        assert_eq!(migration_count, 1);
        assert_eq!(schema_version(&conn).expect("schema version"), 1);
    }
}
