use std::{
    borrow::Cow,
    error::Error,
    fmt, fs,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use anyhow::{bail, Context};
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::{Encoding, BIG5, GB18030, GBK, UTF_8};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const DB_FILE_NAME: &str = "ebook-reader.sqlite3";
const LIBRARY_DIR_NAME: &str = "library";
const READER_THEME_SETTING_KEY: &str = "reader_theme";

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
pub struct RemoveBookResult {
    pub book: Book,
    pub removed_library_path: String,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReaderThemeMode {
    Light,
    Dark,
    Sepia,
    Green,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderTheme {
    pub mode: ReaderThemeMode,
    pub font_family: String,
    pub font_size: f64,
    pub line_height: f64,
    pub paragraph_spacing: f64,
    pub page_margin: f64,
    pub background_color: String,
    pub text_color: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxtLocator {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_id: Option<String>,
    pub char_offset: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderProgress {
    pub book_id: String,
    pub locator: TxtLocator,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
struct DecodedText {
    text: String,
    encoding: String,
}

#[derive(Debug)]
struct TextLine {
    start_byte: usize,
    start_char: usize,
    text: String,
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

pub fn remove_book(app: &AppHandle, book_id: &str) -> anyhow::Result<RemoveBookResult> {
    let storage_paths = init_app_storage(app)?;
    remove_book_at(
        &storage_paths.database_path,
        &storage_paths.library_dir,
        book_id,
    )
}

pub fn open_txt_book(app: &AppHandle, book_id: &str) -> anyhow::Result<TxtDocument> {
    let database_path = init_app_database(app)?;
    open_txt_book_at(&database_path, book_id)
}

pub fn get_reader_theme(app: &AppHandle) -> anyhow::Result<ReaderTheme> {
    let database_path = init_app_database(app)?;
    get_reader_theme_at(&database_path)
}

pub fn save_reader_theme(app: &AppHandle, theme: ReaderTheme) -> anyhow::Result<ReaderTheme> {
    let database_path = init_app_database(app)?;
    save_reader_theme_at(&database_path, &theme)
}

pub fn get_reading_progress(
    app: &AppHandle,
    book_id: &str,
) -> anyhow::Result<Option<ReaderProgress>> {
    let database_path = init_app_database(app)?;
    get_reading_progress_at(&database_path, book_id)
}

pub fn save_reading_progress(
    app: &AppHandle,
    book_id: &str,
    locator: TxtLocator,
    progress: Option<f64>,
) -> anyhow::Result<ReaderProgress> {
    let database_path = init_app_database(app)?;
    save_reading_progress_at(&database_path, book_id, locator, progress)
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

pub fn remove_book_at(
    database_path: &Path,
    library_dir: &Path,
    book_id: &str,
) -> anyhow::Result<RemoveBookResult> {
    init_database_at(database_path)?;
    fs::create_dir_all(library_dir).with_context(|| {
        format!(
            "failed to create library directory {}",
            library_dir.display()
        )
    })?;

    let conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;
    let library_path = PathBuf::from(&book.library_path);
    let removed_library_path = path_to_string(&library_path);

    if library_path.exists() {
        assert_library_file_is_within_dir(&library_path, library_dir)?;
        fs::remove_file(&library_path).with_context(|| {
            format!(
                "failed to delete library copy at {}",
                library_path.display()
            )
        })?;
    }

    let deleted_count = conn.execute("DELETE FROM books WHERE id = ?1", params![book_id])?;

    if deleted_count == 0 {
        bail!("book not found: {}", book_id);
    }

    Ok(RemoveBookResult {
        book,
        removed_library_path,
    })
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
    let chapters = detect_txt_chapters(&book.title, &text);

    Ok(TxtDocument {
        book,
        encoding: decoded.encoding,
        byte_length: bytes.len() as u64,
        char_count,
        line_count,
        chapters,
    })
}

pub fn get_reader_theme_at(database_path: &Path) -> anyhow::Result<ReaderTheme> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let value_json = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![READER_THEME_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    match value_json {
        Some(value) => serde_json::from_str(&value).context("failed to parse saved reader theme"),
        None => Ok(default_reader_theme()),
    }
}

pub fn save_reader_theme_at(
    database_path: &Path,
    theme: &ReaderTheme,
) -> anyhow::Result<ReaderTheme> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let theme = normalize_reader_theme(theme.clone());
    let value_json = serde_json::to_string(&theme).context("failed to serialize reader theme")?;
    let now = current_timestamp(&conn)?;

    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at",
        params![READER_THEME_SETTING_KEY, value_json, now],
    )?;

    Ok(theme)
}

pub fn get_reading_progress_at(
    database_path: &Path,
    book_id: &str,
) -> anyhow::Result<Option<ReaderProgress>> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;

    conn.query_row(
        "SELECT book_id, locator_json, progress, updated_at
        FROM reading_progress
        WHERE book_id = ?1",
        params![book_id],
        row_to_reader_progress,
    )
    .optional()
    .map_err(Into::into)
}

pub fn save_reading_progress_at(
    database_path: &Path,
    book_id: &str,
    locator: TxtLocator,
    progress: Option<f64>,
) -> anyhow::Result<ReaderProgress> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    validate_txt_locator(&locator)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;

    if book.format != BookFormat::Txt {
        bail!("TXT progress can only be saved for txt books");
    }

    let normalized_progress = progress.map(|value| value.clamp(0.0, 1.0));
    let locator_json =
        serde_json::to_string(&locator).context("failed to serialize reading locator")?;
    let now = current_timestamp(&conn)?;

    conn.execute(
        "INSERT INTO reading_progress (book_id, locator_json, progress, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(book_id) DO UPDATE SET
            locator_json = excluded.locator_json,
            progress = excluded.progress,
            updated_at = excluded.updated_at",
        params![book_id, locator_json, normalized_progress, now],
    )?;

    Ok(ReaderProgress {
        book_id: book_id.to_string(),
        locator,
        progress: normalized_progress,
        updated_at: now,
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

fn assert_library_file_is_within_dir(
    library_path: &Path,
    library_dir: &Path,
) -> anyhow::Result<()> {
    let canonical_library_path = library_path.canonicalize().with_context(|| {
        format!(
            "failed to canonicalize library copy {}",
            library_path.display()
        )
    })?;
    let canonical_library_dir = library_dir.canonicalize().with_context(|| {
        format!(
            "failed to canonicalize library directory {}",
            library_dir.display()
        )
    })?;

    if !canonical_library_path.starts_with(&canonical_library_dir) {
        bail!(
            "refusing to delete library copy outside application library: {}",
            library_path.display()
        );
    }

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

fn detect_txt_chapters(default_title: &str, text: &str) -> Vec<TxtChapter> {
    let char_count = text.chars().count();
    let lines = collect_text_lines(text);
    let heading_lines = lines
        .iter()
        .filter(|line| is_chapter_heading(&line.text))
        .collect::<Vec<_>>();

    if heading_lines.is_empty() {
        return vec![TxtChapter {
            id: "full-text".to_string(),
            title: fallback_chapter_title(default_title),
            start_char: 0,
            end_char: char_count,
            text: text.to_string(),
        }];
    }

    let mut chapters = Vec::new();

    if let Some(first_heading) = heading_lines.first() {
        let preface = &text[..first_heading.start_byte];
        if !preface.trim().is_empty() {
            chapters.push(TxtChapter {
                id: "preface-0".to_string(),
                title: "卷首".to_string(),
                start_char: 0,
                end_char: first_heading.start_char,
                text: preface.to_string(),
            });
        }
    }

    for (heading_index, heading_line) in heading_lines.iter().enumerate() {
        let next_heading = heading_lines.get(heading_index + 1);
        let end_byte = next_heading
            .map(|line| line.start_byte)
            .unwrap_or_else(|| text.len());
        let end_char = next_heading
            .map(|line| line.start_char)
            .unwrap_or(char_count);
        let chapter_number = chapters.len() + 1;

        chapters.push(TxtChapter {
            id: format!("chapter-{chapter_number}-{}", heading_line.start_char),
            title: heading_line.text.trim().to_string(),
            start_char: heading_line.start_char,
            end_char,
            text: text[heading_line.start_byte..end_byte].to_string(),
        });
    }

    chapters
}

fn collect_text_lines(text: &str) -> Vec<TextLine> {
    let mut lines = Vec::new();
    let mut byte_offset = 0;
    let mut char_offset = 0;

    for segment in text.split_inclusive('\n') {
        let line_text = segment.trim_end_matches('\n');
        lines.push(TextLine {
            start_byte: byte_offset,
            start_char: char_offset,
            text: line_text.to_string(),
        });
        byte_offset += segment.len();
        char_offset += segment.chars().count();
    }

    if text.is_empty() {
        return lines;
    }

    if !text.ends_with('\n') && lines.is_empty() {
        lines.push(TextLine {
            start_byte: 0,
            start_char: 0,
            text: text.to_string(),
        });
    }

    lines
}

fn is_chapter_heading(line: &str) -> bool {
    let trimmed = line.trim();

    if trimmed.is_empty() || trimmed.chars().count() > 80 {
        return false;
    }

    chapter_heading_regex().is_match(trimmed)
}

fn chapter_heading_regex() -> &'static Regex {
    static CHAPTER_HEADING_REGEX: OnceLock<Regex> = OnceLock::new();

    CHAPTER_HEADING_REGEX.get_or_init(|| {
        Regex::new(
            r"(?iu)^(?:第\s*[0-9０-９一二两三四五六七八九十百千万零〇壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[章节回卷部篇][^\r\n]{0,60}|chapter\s+[0-9ivxlcdm]+[^\r\n]{0,60})$",
        )
        .expect("valid chapter heading regex")
    })
}

fn fallback_chapter_title(default_title: &str) -> String {
    let trimmed = default_title.trim();

    if trimmed.is_empty() {
        "全文".to_string()
    } else {
        trimmed.to_string()
    }
}

fn default_reader_theme() -> ReaderTheme {
    ReaderTheme {
        mode: ReaderThemeMode::Sepia,
        font_family: "\"Noto Serif SC\", \"Songti SC\", \"Microsoft YaHei\", Georgia, serif"
            .to_string(),
        font_size: 18.0,
        line_height: 1.75,
        paragraph_spacing: 12.0,
        page_margin: 32.0,
        background_color: "#f7f1e3".to_string(),
        text_color: "#25211d".to_string(),
    }
}

fn normalize_reader_theme(mut theme: ReaderTheme) -> ReaderTheme {
    theme.font_size = theme.font_size.clamp(14.0, 30.0);
    theme.line_height = theme.line_height.clamp(1.35, 2.4);
    theme.paragraph_spacing = theme.paragraph_spacing.clamp(0.0, 36.0);
    theme.page_margin = theme.page_margin.clamp(12.0, 96.0);
    theme
}

fn validate_txt_locator(locator: &TxtLocator) -> anyhow::Result<()> {
    if locator.kind != "txt" {
        bail!("reading progress locator must have kind txt");
    }

    Ok(())
}

fn row_to_reader_progress(row: &Row<'_>) -> rusqlite::Result<ReaderProgress> {
    let locator_json: String = row.get(1)?;
    let locator = serde_json::from_str(&locator_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(error))
    })?;

    Ok(ReaderProgress {
        book_id: row.get(0)?,
        locator,
        progress: row.get(2)?,
        updated_at: row.get(3)?,
    })
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
        get_reader_theme_at, get_reading_progress_at, import_book_at, init_database_at,
        list_books_at, mark_book_opened_at, open_txt_book_at, remove_book_at, save_reader_theme_at,
        save_reading_progress_at, schema_version, BookFormat, ImportBookStatus, ReaderTheme,
        ReaderThemeMode, TxtLocator, DB_FILE_NAME,
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
    fn remove_book_deletes_shelf_record_progress_and_library_copy_only() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("remove-me.txt");
        fs::write(&source_path, "第一章 初见\n正文").expect("write source file");

        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import book");
        let library_path = PathBuf::from(&imported.book.library_path);
        save_reading_progress_at(
            &database_path,
            &imported.book.id,
            TxtLocator {
                kind: "txt".to_string(),
                chapter_id: None,
                char_offset: 3,
            },
            Some(0.5),
        )
        .expect("save progress");

        assert!(source_path.exists());
        assert!(library_path.exists());

        let removed =
            remove_book_at(&database_path, &library_dir, &imported.book.id).expect("remove book");
        let books = list_books_at(&database_path).expect("list books after removal");
        let restored_progress = get_reading_progress_at(&database_path, &imported.book.id)
            .expect("query progress after removal");

        assert_eq!(removed.book.id, imported.book.id);
        assert_eq!(removed.removed_library_path, imported.book.library_path);
        assert!(source_path.exists());
        assert!(!library_path.exists());
        assert!(books.is_empty());
        assert!(restored_progress.is_none());
    }

    #[test]
    fn remove_book_errors_for_missing_book() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");

        let error = remove_book_at(&database_path, &library_dir, "missing-book")
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
            assert_eq!(
                document
                    .chapters
                    .iter()
                    .map(|chapter| chapter.text.as_str())
                    .collect::<String>(),
                text
            );
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

    #[test]
    fn open_txt_book_detects_chinese_chapters() {
        let text = "楔子\n旧城下雨。\n\n第 1 章 初见\n她推开门。\n\n第二回 风起\n灯火亮了。\n";
        let document = import_and_open_txt(text);

        assert_eq!(document.chapters.len(), 3);
        assert_eq!(document.chapters[0].id, "preface-0");
        assert_eq!(document.chapters[0].title, "卷首");
        assert!(document.chapters[0].text.contains("楔子"));
        assert_eq!(document.chapters[1].title, "第 1 章 初见");
        assert_eq!(
            document.chapters[1].start_char,
            char_offset_of(text, "第 1 章 初见")
        );
        assert_eq!(document.chapters[2].title, "第二回 风起");
        assert!(document.chapters[2].text.contains("灯火亮了。"));
    }

    #[test]
    fn open_txt_book_detects_english_chapters() {
        let text = "Chapter 1 Arrival\nThe train stopped.\n\nChapter II The Gate\nThe door opened.";
        let document = import_and_open_txt(text);

        assert_eq!(document.chapters.len(), 2);
        assert_eq!(document.chapters[0].title, "Chapter 1 Arrival");
        assert_eq!(document.chapters[1].title, "Chapter II The Gate");
        assert!(document.chapters[1].id.starts_with("chapter-2-"));
    }

    #[test]
    fn open_txt_book_falls_back_to_full_text_without_chapters() {
        let text = "这里没有章节标题。\n只有连续正文。\n";
        let document = import_and_open_txt(text);

        assert_eq!(document.chapters.len(), 1);
        assert_eq!(document.chapters[0].id, "full-text");
        assert_eq!(document.chapters[0].title, "sample");
        assert_eq!(document.chapters[0].start_char, 0);
        assert_eq!(document.chapters[0].end_char, text.chars().count());
        assert_eq!(document.chapters[0].text, text);
    }

    #[test]
    fn reader_theme_defaults_without_saved_setting() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        let theme = get_reader_theme_at(&database_path).expect("get default reader theme");

        assert_eq!(theme.mode, ReaderThemeMode::Sepia);
        assert_eq!(theme.font_size, 18.0);
        assert_eq!(theme.line_height, 1.75);
        assert!(theme.font_family.contains("Noto Serif SC"));
    }

    #[test]
    fn reader_theme_persists_after_reopen() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let theme = ReaderTheme {
            mode: ReaderThemeMode::Dark,
            font_family: "system-ui".to_string(),
            font_size: 42.0,
            line_height: 1.5,
            paragraph_spacing: 10.0,
            page_margin: 20.0,
            background_color: "#121212".to_string(),
            text_color: "#f6f1e8".to_string(),
        };

        let saved = save_reader_theme_at(&database_path, &theme).expect("save reader theme");
        init_database_at(&database_path).expect("reopen database");
        let restored = get_reader_theme_at(&database_path).expect("restore reader theme");

        assert_eq!(saved.font_size, 30.0);
        assert_eq!(restored, saved);
        assert_eq!(restored.mode, ReaderThemeMode::Dark);
    }

    #[test]
    fn reading_progress_persists_for_txt_books() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("progress.txt");
        fs::write(&source_path, "第一章 初见\n正文").expect("write source");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt");
        let locator = TxtLocator {
            kind: "txt".to_string(),
            chapter_id: Some("chapter-1-0".to_string()),
            char_offset: 6,
        };

        let saved = save_reading_progress_at(
            &database_path,
            &imported.book.id,
            locator.clone(),
            Some(1.4),
        )
        .expect("save progress");
        init_database_at(&database_path).expect("reopen database");
        let restored = get_reading_progress_at(&database_path, &imported.book.id)
            .expect("get progress")
            .expect("progress exists");

        assert_eq!(saved.book_id, imported.book.id);
        assert_eq!(saved.progress, Some(1.0));
        assert_eq!(restored.locator, locator);
        assert_eq!(restored.progress, Some(1.0));
    }

    #[test]
    fn reading_progress_rejects_non_txt_books_and_invalid_locator_kind() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let epub_path = temp_dir.path().join("book.epub");
        fs::write(&epub_path, "epub placeholder").expect("write epub");
        let imported =
            import_book_at(&database_path, &library_dir, &epub_path).expect("import epub");
        let valid_locator = TxtLocator {
            kind: "txt".to_string(),
            chapter_id: None,
            char_offset: 0,
        };
        let invalid_locator = TxtLocator {
            kind: "epub".to_string(),
            chapter_id: None,
            char_offset: 0,
        };

        let non_txt_error =
            save_reading_progress_at(&database_path, &imported.book.id, valid_locator, Some(0.2))
                .expect_err("epub progress should fail");
        let invalid_kind_error =
            save_reading_progress_at(&database_path, "missing", invalid_locator, None)
                .expect_err("invalid locator should fail");

        assert!(non_txt_error
            .to_string()
            .contains("TXT progress can only be saved"));
        assert!(invalid_kind_error.to_string().contains("kind txt"));
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

    fn import_and_open_txt(text: &str) -> super::TxtDocument {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("sample.txt");
        fs::write(&source_path, text).expect("write txt source");

        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt");

        open_txt_book_at(&database_path, &imported.book.id).expect("open txt")
    }

    fn char_offset_of(text: &str, needle: &str) -> usize {
        let byte_index = text.find(needle).expect("needle exists");
        text[..byte_index].chars().count()
    }
}
