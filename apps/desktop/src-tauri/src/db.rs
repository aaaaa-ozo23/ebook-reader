use std::{
    borrow::Cow,
    error::Error,
    fmt, fs,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use anyhow::{bail, Context};
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::{Encoding, BIG5, GB18030, GBK, UTF_8};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const DB_FILE_NAME: &str = "ebook-reader.sqlite3";
const LIBRARY_DIR_NAME: &str = "library";

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "unique_books_file_hash",
        sql: include_str!("../migrations/0002_unique_books_file_hash.sql"),
    },
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppHealth {
    pub database_path: String,
    pub schema_version: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BookFormat {
    Epub,
    Txt,
    Pdf,
}

impl BookFormat {
    fn from_path(path: &Path) -> anyhow::Result<Self> {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        match extension.as_str() {
            "epub" => Ok(Self::Epub),
            "txt" => Ok(Self::Txt),
            "pdf" => Ok(Self::Pdf),
            _ => bail!("unsupported book format; expected epub, txt, or pdf"),
        }
    }

    fn from_database(value: &str) -> rusqlite::Result<Self> {
        match value {
            "epub" => Ok(Self::Epub),
            "txt" => Ok(Self::Txt),
            "pdf" => Ok(Self::Pdf),
            _ => Err(rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                Box::new(InvalidBookFormat(value.to_string())),
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Epub => "epub",
            Self::Txt => "txt",
            Self::Pdf => "pdf",
        }
    }
}

#[derive(Debug)]
struct InvalidBookFormat(String);

impl fmt::Display for InvalidBookFormat {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid book format in database: {}", self.0)
    }
}

impl Error for InvalidBookFormat {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub format: BookFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    pub library_path: String,
    pub file_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportBookStatus {
    Imported,
    Duplicate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBookResult {
    pub status: ImportBookStatus,
    pub book: Book,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TxtChapter {
    pub id: String,
    pub title: String,
    pub start_char: usize,
    pub end_char: usize,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TxtDocument {
    pub book: Book,
    pub encoding: String,
    pub byte_length: u64,
    pub char_count: usize,
    pub line_count: usize,
    pub chapters: Vec<TxtChapter>,
}

#[derive(Debug, Clone)]
struct DecodedText {
    text: String,
    encoding: String,
}

struct AppStoragePaths {
    database_path: PathBuf,
    library_dir: PathBuf,
}

pub fn app_health(app: &AppHandle) -> anyhow::Result<AppHealth> {
    let database_path = init_app_database(app)?;
    let conn = open_database(&database_path)?;

    Ok(AppHealth {
        database_path: database_path.display().to_string(),
        schema_version: schema_version(&conn)?,
    })
}

pub fn list_books(app: &AppHandle) -> anyhow::Result<Vec<Book>> {
    let database_path = init_app_database(app)?;
    list_books_at(&database_path)
}

pub fn import_book<P: AsRef<Path>>(app: &AppHandle, path: P) -> anyhow::Result<ImportBookResult> {
    let storage_paths = init_app_storage(app)?;
    import_book_at(
        &storage_paths.database_path,
        &storage_paths.library_dir,
        path,
    )
}

pub fn mark_book_opened(app: &AppHandle, book_id: &str) -> anyhow::Result<Book> {
    let database_path = init_app_database(app)?;
    mark_book_opened_at(&database_path, book_id)
}

pub fn open_txt_book(app: &AppHandle, book_id: &str) -> anyhow::Result<TxtDocument> {
    let database_path = init_app_database(app)?;
    open_txt_book_at(&database_path, book_id)
}

pub fn init_app_database(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let storage_paths = resolve_app_storage_paths(app)?;

    init_database_at(&storage_paths.database_path)?;

    Ok(storage_paths.database_path)
}

fn init_app_storage(app: &AppHandle) -> anyhow::Result<AppStoragePaths> {
    let storage_paths = resolve_app_storage_paths(app)?;

    init_database_at(&storage_paths.database_path)?;
    fs::create_dir_all(&storage_paths.library_dir).with_context(|| {
        format!(
            "failed to create library directory {}",
            storage_paths.library_dir.display()
        )
    })?;

    Ok(storage_paths)
}

fn resolve_app_storage_paths(app: &AppHandle) -> anyhow::Result<AppStoragePaths> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve application data directory")?;

    Ok(AppStoragePaths {
        database_path: app_data_dir.join(DB_FILE_NAME),
        library_dir: app_data_dir.join(LIBRARY_DIR_NAME),
    })
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

pub fn list_books_at(database_path: &Path) -> anyhow::Result<Vec<Book>> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    select_books(&conn)
}

pub fn import_book_at<P: AsRef<Path>>(
    database_path: &Path,
    library_dir: &Path,
    path: P,
) -> anyhow::Result<ImportBookResult> {
    init_database_at(database_path)?;

    let source_path = canonicalize_import_path(path.as_ref())?;
    let format = BookFormat::from_path(&source_path)?;
    let file_hash = hash_file(&source_path)?;

    let mut conn = open_database(database_path)?;
    if let Some(book) = find_book_by_hash(&conn, &file_hash)? {
        return Ok(ImportBookResult {
            status: ImportBookStatus::Duplicate,
            book,
        });
    }

    fs::create_dir_all(library_dir).with_context(|| {
        format!(
            "failed to create library directory {}",
            library_dir.display()
        )
    })?;
    let library_path = library_dir.join(format!("{}.{}", file_hash, format.as_str()));
    copy_file_to_library(&source_path, &library_path)?;

    let now = current_timestamp(&conn)?;
    let book = Book {
        id: Uuid::new_v4().to_string(),
        title: title_from_path(&source_path),
        author: None,
        format,
        source_path: Some(path_to_string(&source_path)),
        library_path: path_to_string(&library_path),
        file_hash,
        cover_path: None,
        created_at: now.clone(),
        updated_at: now,
        last_opened_at: None,
    };

    insert_book(&mut conn, &book)?;

    Ok(ImportBookResult {
        status: ImportBookStatus::Imported,
        book,
    })
}

pub fn mark_book_opened_at(database_path: &Path, book_id: &str) -> anyhow::Result<Book> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let now = current_timestamp(&conn)?;

    let updated_count = conn.execute(
        "UPDATE books SET updated_at = ?1, last_opened_at = ?1 WHERE id = ?2",
        params![now, book_id],
    )?;

    if updated_count == 0 {
        bail!("book not found: {}", book_id);
    }

    find_book_by_id(&conn, book_id)?
        .with_context(|| format!("book not found after update: {}", book_id))
}

pub fn open_txt_book_at(database_path: &Path, book_id: &str) -> anyhow::Result<TxtDocument> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;

    if book.format != BookFormat::Txt {
        bail!("TXT reader only supports txt books");
    }

    let library_path = PathBuf::from(&book.library_path);
    let bytes = fs::read(&library_path).with_context(|| {
        format!(
            "failed to read TXT library copy at {}",
            library_path.display()
        )
    })?;
    let decoded = decode_txt_bytes(&bytes)?;
    let text = normalize_line_endings(decoded.text);
    let char_count = text.chars().count();
    let line_count = text.lines().count();
    let chapter = TxtChapter {
        id: "full-text".to_string(),
        title: book.title.clone(),
        start_char: 0,
        end_char: char_count,
        text,
    };

    Ok(TxtDocument {
        book,
        encoding: decoded.encoding,
        byte_length: bytes.len() as u64,
        char_count,
        line_count,
        chapters: vec![chapter],
    })
}

fn open_database(database_path: &Path) -> anyhow::Result<Connection> {
    let conn = Connection::open(database_path).with_context(|| {
        format!(
            "failed to open SQLite database at {}",
            database_path.display()
        )
    })?;
    configure_connection(&conn)?;
    Ok(conn)
}

fn configure_connection(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")
}

fn run_migrations(conn: &mut Connection) -> rusqlite::Result<()> {
    let transaction = conn.transaction()?;

    for migration in MIGRATIONS {
        transaction.execute_batch(migration.sql)?;
        transaction.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?1, ?2)",
            params![migration.version, migration.name],
        )?;
    }

    transaction.commit()
}

fn schema_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
}

fn canonicalize_import_path(path: &Path) -> anyhow::Result<PathBuf> {
    let canonical_path = path
        .canonicalize()
        .with_context(|| format!("failed to canonicalize import path {}", path.display()))?;

    if !canonical_path.is_file() {
        bail!("import path is not a file: {}", canonical_path.display());
    }

    Ok(canonical_path)
}

fn hash_file(path: &Path) -> anyhow::Result<String> {
    let mut file = File::open(path)
        .with_context(|| format!("failed to open import file {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read_count = file
            .read(&mut buffer)
            .with_context(|| format!("failed to read import file {}", path.display()))?;
        if read_count == 0 {
            break;
        }
        hasher.update(&buffer[..read_count]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn copy_file_to_library(source_path: &Path, library_path: &Path) -> anyhow::Result<()> {
    if library_path.exists() {
        return Ok(());
    }

    fs::copy(source_path, library_path).with_context(|| {
        format!(
            "failed to copy {} into library at {}",
            source_path.display(),
            library_path.display()
        )
    })?;

    Ok(())
}

fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Untitled")
        .to_string()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn current_timestamp(conn: &Connection) -> rusqlite::Result<String> {
    conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
        row.get(0)
    })
}

fn decode_txt_bytes(bytes: &[u8]) -> anyhow::Result<DecodedText> {
    let mut candidates = Vec::new();
    let mut detector = EncodingDetector::new(Iso2022JpDetection::Deny);
    detector.feed(bytes, true);
    let detected_encoding = detector.guess(None, Utf8Detection::Allow);

    push_encoding_candidate(&mut candidates, detected_encoding);
    push_encoding_candidate(&mut candidates, UTF_8);
    push_encoding_candidate(&mut candidates, GB18030);
    push_encoding_candidate(&mut candidates, GBK);
    push_encoding_candidate(&mut candidates, BIG5);

    for encoding in candidates {
        let (decoded, used_encoding, had_errors) = encoding.decode(bytes);
        if had_errors {
            continue;
        }

        let text = cow_to_string(decoded);
        if is_plausible_text(&text) {
            return Ok(DecodedText {
                text,
                encoding: used_encoding.name().to_string(),
            });
        }
    }

    bail!("failed to decode TXT file; supported encodings are UTF-8, GBK, GB18030, and Big5")
}

fn push_encoding_candidate(candidates: &mut Vec<&'static Encoding>, encoding: &'static Encoding) {
    if supported_txt_encoding(encoding).is_none() {
        return;
    }

    if !candidates
        .iter()
        .any(|candidate| candidate.name().eq_ignore_ascii_case(encoding.name()))
    {
        candidates.push(encoding);
    }
}

fn supported_txt_encoding(encoding: &'static Encoding) -> Option<&'static Encoding> {
    let name = encoding.name();

    if name.eq_ignore_ascii_case("utf-8")
        || name.eq_ignore_ascii_case("gbk")
        || name.eq_ignore_ascii_case("gb18030")
        || name.eq_ignore_ascii_case("big5")
    {
        Some(encoding)
    } else {
        None
    }
}

fn cow_to_string(value: Cow<'_, str>) -> String {
    match value {
        Cow::Borrowed(text) => text.to_string(),
        Cow::Owned(text) => text,
    }
}

fn normalize_line_endings(text: String) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn is_plausible_text(text: &str) -> bool {
    if text.is_empty() {
        return true;
    }

    let total_chars = text.chars().count();
    let suspicious_chars = text
        .chars()
        .filter(|character| {
            *character == '\u{fffd}'
                || (character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
        })
        .count();

    suspicious_chars * 100 <= total_chars * 5
}

fn insert_book(conn: &mut Connection, book: &Book) -> anyhow::Result<()> {
    let transaction = conn.transaction()?;

    transaction.execute(
        "INSERT INTO books (
            id,
            title,
            author,
            format,
            source_path,
            library_path,
            file_hash,
            cover_path,
            created_at,
            updated_at,
            last_opened_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            &book.id,
            &book.title,
            book.author.as_deref(),
            book.format.as_str(),
            book.source_path.as_deref(),
            &book.library_path,
            &book.file_hash,
            book.cover_path.as_deref(),
            &book.created_at,
            &book.updated_at,
            book.last_opened_at.as_deref(),
        ],
    )?;

    transaction.commit()?;

    Ok(())
}

fn select_books(conn: &Connection) -> anyhow::Result<Vec<Book>> {
    let mut statement = conn.prepare(
        "SELECT
            id,
            title,
            author,
            format,
            source_path,
            library_path,
            file_hash,
            cover_path,
            created_at,
            updated_at,
            last_opened_at
        FROM books
        ORDER BY COALESCE(last_opened_at, created_at) DESC, created_at DESC, id ASC",
    )?;

    let books = statement
        .query_map([], row_to_book)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(books)
}

fn find_book_by_hash(conn: &Connection, file_hash: &str) -> rusqlite::Result<Option<Book>> {
    conn.query_row(
        "SELECT
            id,
            title,
            author,
            format,
            source_path,
            library_path,
            file_hash,
            cover_path,
            created_at,
            updated_at,
            last_opened_at
        FROM books
        WHERE file_hash = ?1",
        params![file_hash],
        row_to_book,
    )
    .optional()
}

fn find_book_by_id(conn: &Connection, book_id: &str) -> rusqlite::Result<Option<Book>> {
    conn.query_row(
        "SELECT
            id,
            title,
            author,
            format,
            source_path,
            library_path,
            file_hash,
            cover_path,
            created_at,
            updated_at,
            last_opened_at
        FROM books
        WHERE id = ?1",
        params![book_id],
        row_to_book,
    )
    .optional()
}

fn row_to_book(row: &Row<'_>) -> rusqlite::Result<Book> {
    let format_value: String = row.get(3)?;

    Ok(Book {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        format: BookFormat::from_database(&format_value)?,
        source_path: row.get(4)?,
        library_path: row.get(5)?,
        file_hash: row.get(6)?,
        cover_path: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        last_opened_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf, thread, time::Duration};

    use encoding_rs::{Encoding, BIG5, GB18030, GBK, UTF_8};
    use rusqlite::{params, Connection};
    use tempfile::tempdir;
    use uuid::Uuid;

    use super::{
        import_book_at, init_database_at, list_books_at, mark_book_opened_at, open_txt_book_at,
        schema_version, BookFormat, ImportBookStatus, DB_FILE_NAME,
    };

    #[test]
    fn migration_v2_creates_expected_tables_and_is_idempotent() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        init_database_at(&database_path).expect("first initialize database");
        init_database_at(&database_path).expect("second initialize database");

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
        let migration_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .expect("count migration records");

        assert_eq!(table_count, 6);
        assert_eq!(migration_count, 2);
        assert_eq!(schema_version(&conn).expect("schema version"), 2);
    }

    #[test]
    fn unique_file_hash_index_exists_and_is_enforced() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        init_database_at(&database_path).expect("initialize database");

        let conn = Connection::open(database_path).expect("open database");
        let index_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                WHERE type = 'index' AND name = 'idx_books_file_hash_unique'",
                [],
                |row| row.get(0),
            )
            .expect("count unique hash index");

        assert_eq!(index_count, 1);

        insert_test_book(&conn, "book-1", "same-hash");
        let duplicate_result = conn.execute(
            "INSERT INTO books (
                id,
                title,
                format,
                library_path,
                file_hash,
                created_at,
                updated_at
            ) VALUES (?1, 'Book 2', 'txt', ?2, ?3, ?4, ?4)",
            params![
                "book-2",
                "library/book-2.txt",
                "same-hash",
                "2026-06-19T00:00:01Z"
            ],
        );

        assert!(duplicate_result.is_err());
    }

    #[test]
    fn valid_txt_import_copies_into_library_and_returns_book() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("sample.txt");
        fs::write(&source_path, "hello local library").expect("write source file");

        let result =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt book");

        assert_eq!(result.status, ImportBookStatus::Imported);
        assert_eq!(result.book.title, "sample");
        assert_eq!(result.book.format, BookFormat::Txt);
        assert!(Uuid::parse_str(&result.book.id).is_ok());
        let canonical_source = source_path.canonicalize().expect("canonical source");
        assert_eq!(
            result.book.source_path.as_deref(),
            Some(canonical_source.to_str().unwrap())
        );
        assert!(result
            .book
            .library_path
            .ends_with(&format!("{}.txt", result.book.file_hash)));
        assert!(PathBuf::from(&result.book.library_path).exists());
    }

    #[test]
    fn unsupported_extension_is_rejected() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("notes.md");
        fs::write(&source_path, "# not a book format").expect("write source file");

        let error = import_book_at(&database_path, &library_dir, &source_path)
            .expect_err("reject unsupported extension");

        assert!(error.to_string().contains("unsupported book format"));
    }

    #[test]
    fn duplicate_import_returns_existing_book() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("duplicate.txt");
        fs::write(&source_path, "same content").expect("write source file");

        let first =
            import_book_at(&database_path, &library_dir, &source_path).expect("first import");
        let second =
            import_book_at(&database_path, &library_dir, &source_path).expect("second import");

        let conn = Connection::open(database_path).expect("open database");
        let book_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))
            .expect("count books");

        assert_eq!(first.status, ImportBookStatus::Imported);
        assert_eq!(second.status, ImportBookStatus::Duplicate);
        assert_eq!(first.book.id, second.book.id);
        assert_eq!(book_count, 1);
    }

    #[test]
    fn listing_persists_after_reopen() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("persisted.txt");
        fs::write(&source_path, "persist me").expect("write source file");

        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import book");

        init_database_at(&database_path).expect("reopen database");
        let books = list_books_at(&database_path).expect("list books");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].id, imported.book.id);
        assert_eq!(books[0].library_path, imported.book.library_path);
    }

    #[test]
    fn mark_book_opened_updates_ordering() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let first_path = temp_dir.path().join("first.txt");
        let second_path = temp_dir.path().join("second.txt");
        fs::write(&first_path, "first").expect("write first source file");
        fs::write(&second_path, "second").expect("write second source file");

        let first =
            import_book_at(&database_path, &library_dir, &first_path).expect("import first");
        thread::sleep(Duration::from_millis(10));
        let second =
            import_book_at(&database_path, &library_dir, &second_path).expect("import second");
        let initial_books = list_books_at(&database_path).expect("initial listing");
        assert_eq!(initial_books[0].id, second.book.id);

        thread::sleep(Duration::from_millis(10));
        let opened =
            mark_book_opened_at(&database_path, &first.book.id).expect("mark first opened");
        let reordered_books = list_books_at(&database_path).expect("reordered listing");

        assert_eq!(opened.id, first.book.id);
        assert!(opened.last_opened_at.is_some());
        assert_eq!(reordered_books[0].id, first.book.id);
    }

    #[test]
    fn mark_book_opened_errors_for_missing_book() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        let error = mark_book_opened_at(&database_path, "missing-book")
            .expect_err("missing book should fail");

        assert!(error.to_string().contains("book not found"));
    }

    #[test]
    fn open_txt_book_decodes_supported_encodings() {
        let cases = [
            (UTF_8, "utf8", "第一章 初见\n这是 UTF-8 文本。"),
            (GBK, "gbk", "第一章 初见\n这是 GBK 文本。"),
            (GB18030, "gb18030", "第一章 吉字\n这里包含 𠮷 字。"),
            (BIG5, "big5", "第一章 初見\n這是繁體 Big5 文本。"),
        ];

        for (encoding, label, text) in cases {
            let temp_dir = tempdir().expect("temp dir");
            let database_path = temp_dir.path().join(DB_FILE_NAME);
            let library_dir = temp_dir.path().join("library");
            let source_path = temp_dir.path().join(format!("sample-{label}.txt"));
            fs::write(&source_path, encode_text(encoding, text)).expect("write encoded txt");

            let imported =
                import_book_at(&database_path, &library_dir, &source_path).expect("import txt");
            let document =
                open_txt_book_at(&database_path, &imported.book.id).expect("open txt document");

            assert_eq!(document.book.id, imported.book.id);
            assert!(document.byte_length > 0);
            assert_eq!(document.char_count, text.chars().count());
            assert_eq!(document.chapters.len(), 1);
            assert_eq!(document.chapters[0].id, "full-text");
            assert_eq!(document.chapters[0].text, text);
        }
    }

    #[test]
    fn open_txt_book_rejects_invalid_text_bytes() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("binary.txt");
        fs::write(&source_path, [0_u8, 1, 2, 3, 4, 5, 6, 7]).expect("write invalid txt");

        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt");
        let error = open_txt_book_at(&database_path, &imported.book.id)
            .expect_err("invalid text should fail");

        assert!(error.to_string().contains("failed to decode TXT file"));
    }

    #[test]
    fn open_txt_book_rejects_non_txt_books() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("sample.epub");
        fs::write(&source_path, "epub placeholder").expect("write epub source");

        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import epub");
        let error =
            open_txt_book_at(&database_path, &imported.book.id).expect_err("epub should fail");

        assert!(error.to_string().contains("TXT reader only supports txt"));
    }

    fn insert_test_book(conn: &Connection, id: &str, file_hash: &str) {
        conn.execute(
            "INSERT INTO books (
                id,
                title,
                format,
                library_path,
                file_hash,
                created_at,
                updated_at
            ) VALUES (?1, ?2, 'txt', ?3, ?4, ?5, ?5)",
            params![
                id,
                id,
                format!("library/{id}.txt"),
                file_hash,
                "2026-06-19T00:00:00Z"
            ],
        )
        .expect("insert test book");
    }

    fn encode_text(encoding: &'static Encoding, text: &str) -> Vec<u8> {
        let (encoded, _, had_errors) = encoding.encode(text);
        assert!(!had_errors);
        encoded.into_owned()
    }
}
