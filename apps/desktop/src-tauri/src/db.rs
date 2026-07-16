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
const COVER_DIR_NAME: &str = "covers";
const MAX_COVER_BYTES: usize = 2 * 1024 * 1024;
const MAX_READER_CACHE_BYTES: usize = 4 * 1024 * 1024;
const READER_LAYOUT_SETTING_KEY: &str = "reader_layout";
const READER_EXPERIENCE_SETTING_KEY: &str = "reader_experience";
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
    Migration {
        version: 3,
        name: "reader_experience",
        sql: include_str!("../migrations/0003_reader_experience.sql"),
    },
    Migration {
        version: 4,
        name: "backup_portability",
        sql: include_str!("../migrations/0004_backup_portability.sql"),
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BookCoverStatus {
    Pending,
    Ready,
    Fallback,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BookAvailability {
    Available,
    Missing,
}

impl BookCoverStatus {
    fn from_database(value: &str) -> rusqlite::Result<Self> {
        match value {
            "pending" => Ok(Self::Pending),
            "ready" => Ok(Self::Ready),
            "fallback" => Ok(Self::Fallback),
            _ => Err(rusqlite::Error::FromSqlConversionFailure(
                11,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("invalid book cover status: {value}"),
                )),
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Ready => "ready",
            Self::Fallback => "fallback",
        }
    }
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
    pub cover_status: BookCoverStatus,
    pub availability: BookAvailability,
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
    Repaired,
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
pub struct ReaderLayoutPreferences {
    pub sidebar_width: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PageTransitionMode {
    None,
    Slide,
    Cover,
    PageCurl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EpubViewMode {
    Paginated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TxtViewMode {
    Scroll,
    Paginated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TxtPaginatedViewMode {
    Single,
    Double,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfViewMode {
    Single,
    Double,
    Continuous,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfPaginatedViewMode {
    Single,
    Double,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubExperiencePreferences {
    pub view_mode: EpubViewMode,
    pub transition: PageTransitionMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxtExperiencePreferences {
    pub view_mode: TxtViewMode,
    #[serde(default = "default_txt_paginated_view_mode")]
    pub paginated_view_mode: TxtPaginatedViewMode,
    pub transition: PageTransitionMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExperiencePreferences {
    pub view_mode: PdfViewMode,
    #[serde(default = "default_pdf_paginated_view_mode")]
    pub paginated_view_mode: PdfPaginatedViewMode,
    pub transition: PageTransitionMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReaderExperiencePreferences {
    pub epub: EpubExperiencePreferences,
    pub txt: TxtExperiencePreferences,
    pub pdf: PdfExperiencePreferences,
}

#[derive(Serialize)]
struct ReaderExperienceSetting<'a> {
    version: u8,
    preferences: &'a ReaderExperiencePreferences,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxtLocator {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_id: Option<String>,
    pub char_offset: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_char_offset: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubLocator {
    pub href: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cfi: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progression: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PdfZoomMode {
    FitWidth,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfLocator {
    pub page: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_offset_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_mode: Option<PdfZoomMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rects: Option<Vec<PdfRect>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Locator {
    Txt(TxtLocator),
    Epub(EpubLocator),
    Pdf(PdfLocator),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderProgress {
    pub book_id: String,
    pub locator: Locator,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: String,
    pub book_id: String,
    pub locator: Locator,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnnotationKind {
    Highlight,
    Note,
}

impl AnnotationKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Highlight => "highlight",
            Self::Note => "note",
        }
    }

    fn from_database(value: &str) -> rusqlite::Result<Self> {
        match value {
            "highlight" => Ok(Self::Highlight),
            "note" => Ok(Self::Note),
            _ => Err(rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(InvalidAnnotationKind(value.to_string())),
            )),
        }
    }
}

#[derive(Debug)]
struct InvalidAnnotationKind(String);

impl fmt::Display for InvalidAnnotationKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid annotation type in database: {}", self.0)
    }
}

impl Error for InvalidAnnotationKind {}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub book_id: String,
    #[serde(rename = "type")]
    pub annotation_type: AnnotationKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub locator: Locator,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
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

pub(crate) struct AppStoragePaths {
    pub(crate) database_path: PathBuf,
    pub(crate) library_dir: PathBuf,
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

pub fn save_book_cover(
    app: &AppHandle,
    book_id: &str,
    image_bytes: Vec<u8>,
    image_format: &str,
) -> anyhow::Result<Book> {
    let storage_paths = init_app_storage(app)?;
    save_book_cover_at(
        &storage_paths.database_path,
        &storage_paths.library_dir,
        book_id,
        &image_bytes,
        image_format,
    )
}

pub fn mark_book_cover_fallback(app: &AppHandle, book_id: &str) -> anyhow::Result<Book> {
    let storage_paths = init_app_storage(app)?;
    mark_book_cover_fallback_at(
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

pub fn get_reader_layout_preferences(app: &AppHandle) -> anyhow::Result<ReaderLayoutPreferences> {
    let database_path = init_app_database(app)?;
    get_reader_layout_preferences_at(&database_path)
}

pub fn save_reader_layout_preferences(
    app: &AppHandle,
    preferences: ReaderLayoutPreferences,
) -> anyhow::Result<ReaderLayoutPreferences> {
    let database_path = init_app_database(app)?;
    save_reader_layout_preferences_at(&database_path, &preferences)
}

pub fn get_reader_experience_preferences(
    app: &AppHandle,
) -> anyhow::Result<ReaderExperiencePreferences> {
    let database_path = init_app_database(app)?;
    get_reader_experience_preferences_at(&database_path)
}

pub fn save_reader_experience_preferences(
    app: &AppHandle,
    preferences: ReaderExperiencePreferences,
) -> anyhow::Result<ReaderExperiencePreferences> {
    let database_path = init_app_database(app)?;
    save_reader_experience_preferences_at(&database_path, &preferences)
}

pub fn get_reader_cache(
    app: &AppHandle,
    book_id: &str,
    cache_key: &str,
) -> anyhow::Result<Option<String>> {
    let database_path = init_app_database(app)?;
    get_reader_cache_at(&database_path, book_id, cache_key)
}

pub fn save_reader_cache(
    app: &AppHandle,
    book_id: &str,
    cache_key: &str,
    value_json: &str,
) -> anyhow::Result<()> {
    let database_path = init_app_database(app)?;
    save_reader_cache_at(&database_path, book_id, cache_key, value_json)
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
    locator: Locator,
    progress: Option<f64>,
) -> anyhow::Result<ReaderProgress> {
    let database_path = init_app_database(app)?;
    save_reading_progress_at(&database_path, book_id, locator, progress)
}

pub fn list_bookmarks(app: &AppHandle, book_id: &str) -> anyhow::Result<Vec<Bookmark>> {
    let database_path = init_app_database(app)?;
    list_bookmarks_at(&database_path, book_id)
}

pub fn create_bookmark(
    app: &AppHandle,
    book_id: &str,
    locator: Locator,
    label: Option<String>,
) -> anyhow::Result<Bookmark> {
    let database_path = init_app_database(app)?;
    create_bookmark_at(&database_path, book_id, locator, label)
}

pub fn delete_bookmark(app: &AppHandle, bookmark_id: &str) -> anyhow::Result<()> {
    let database_path = init_app_database(app)?;
    delete_bookmark_at(&database_path, bookmark_id)
}

pub fn list_annotations(app: &AppHandle, book_id: &str) -> anyhow::Result<Vec<Annotation>> {
    let database_path = init_app_database(app)?;
    list_annotations_at(&database_path, book_id)
}

pub fn create_annotation(
    app: &AppHandle,
    book_id: &str,
    annotation_type: AnnotationKind,
    locator: Locator,
    color: Option<String>,
    selected_text: Option<String>,
    note: Option<String>,
) -> anyhow::Result<Annotation> {
    let database_path = init_app_database(app)?;
    create_annotation_at(
        &database_path,
        book_id,
        annotation_type,
        locator,
        color,
        selected_text,
        note,
    )
}

pub fn update_annotation(
    app: &AppHandle,
    annotation_id: &str,
    color: Option<String>,
    note: Option<String>,
) -> anyhow::Result<Annotation> {
    let database_path = init_app_database(app)?;
    update_annotation_at(&database_path, annotation_id, color, note)
}

pub fn delete_annotation(app: &AppHandle, annotation_id: &str) -> anyhow::Result<()> {
    let database_path = init_app_database(app)?;
    delete_annotation_at(&database_path, annotation_id)
}

pub fn init_app_database(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let storage_paths = resolve_app_storage_paths(app)?;

    init_database_at(&storage_paths.database_path)?;

    Ok(storage_paths.database_path)
}

pub(crate) fn init_app_storage(app: &AppHandle) -> anyhow::Result<AppStoragePaths> {
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
        if Path::new(&book.library_path).is_file() {
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
        let repaired_library_path = library_dir.join(format!("{}.{}", file_hash, format.as_str()));
        copy_file_to_library(&source_path, &repaired_library_path)?;
        let now = current_timestamp(&conn)?;
        conn.execute(
            "UPDATE books
             SET source_path = ?1, library_path = ?2, updated_at = ?3
             WHERE id = ?4",
            params![
                path_to_string(&source_path),
                path_to_string(&repaired_library_path),
                now,
                book.id
            ],
        )?;
        let repaired_book = find_book_by_id(&conn, &book.id)?
            .with_context(|| format!("book not found after repair: {}", book.id))?;

        return Ok(ImportBookResult {
            status: ImportBookStatus::Repaired,
            book: repaired_book,
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
    let cover_status = if format == BookFormat::Txt {
        BookCoverStatus::Fallback
    } else {
        BookCoverStatus::Pending
    };
    let book = Book {
        id: Uuid::new_v4().to_string(),
        title: title_from_path(&source_path),
        author: None,
        format,
        source_path: Some(path_to_string(&source_path)),
        library_path: path_to_string(&library_path),
        file_hash,
        cover_path: None,
        cover_status,
        availability: BookAvailability::Available,
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
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;

    if !Path::new(&book.library_path).is_file() {
        bail!("library copy is missing; re-import the original file to repair this book");
    }

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

    if let Some(cover_path) = book.cover_path.as_deref().map(PathBuf::from) {
        if cover_path.exists() {
            assert_library_file_is_within_dir(&cover_path, library_dir)?;
            fs::remove_file(&cover_path).with_context(|| {
                format!("failed to delete cached cover at {}", cover_path.display())
            })?;
        }
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

pub fn get_reader_layout_preferences_at(
    database_path: &Path,
) -> anyhow::Result<ReaderLayoutPreferences> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let value_json = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![READER_LAYOUT_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    match value_json {
        Some(value) => serde_json::from_str::<ReaderLayoutPreferences>(&value)
            .map(normalize_reader_layout_preferences)
            .context("failed to parse saved reader layout preferences"),
        None => Ok(default_reader_layout_preferences()),
    }
}

pub fn save_reader_layout_preferences_at(
    database_path: &Path,
    preferences: &ReaderLayoutPreferences,
) -> anyhow::Result<ReaderLayoutPreferences> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let preferences = normalize_reader_layout_preferences(preferences.clone());
    let value_json = serde_json::to_string(&preferences)
        .context("failed to serialize reader layout preferences")?;
    let now = current_timestamp(&conn)?;

    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![READER_LAYOUT_SETTING_KEY, value_json, now],
    )?;

    Ok(preferences)
}

pub fn get_reader_experience_preferences_at(
    database_path: &Path,
) -> anyhow::Result<ReaderExperiencePreferences> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let value_json = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![READER_EXPERIENCE_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    let Some(value_json) = value_json else {
        return Ok(default_reader_experience_preferences());
    };

    let Ok(value) = serde_json::from_str::<serde_json::Value>(&value_json) else {
        return Ok(default_reader_experience_preferences());
    };

    Ok(normalize_reader_experience_setting(&value))
}

pub fn save_reader_experience_preferences_at(
    database_path: &Path,
    preferences: &ReaderExperiencePreferences,
) -> anyhow::Result<ReaderExperiencePreferences> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let preferences = preferences.clone();
    let value_json = serde_json::to_string(&ReaderExperienceSetting {
        version: 1,
        preferences: &preferences,
    })
    .context("failed to serialize reader experience preferences")?;
    let now = current_timestamp(&conn)?;

    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![READER_EXPERIENCE_SETTING_KEY, value_json, now],
    )?;

    Ok(preferences)
}

pub fn get_reader_cache_at(
    database_path: &Path,
    book_id: &str,
    cache_key: &str,
) -> anyhow::Result<Option<String>> {
    init_database_at(database_path)?;
    validate_reader_cache_key(cache_key)?;
    let conn = open_database(database_path)?;
    conn.query_row(
        "SELECT reader_cache.value_json
         FROM reader_cache
         INNER JOIN books ON books.id = reader_cache.book_id
         WHERE reader_cache.book_id = ?1
           AND reader_cache.cache_key = ?2
           AND reader_cache.source_hash = books.file_hash",
        params![book_id, cache_key],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

pub fn save_reader_cache_at(
    database_path: &Path,
    book_id: &str,
    cache_key: &str,
    value_json: &str,
) -> anyhow::Result<()> {
    init_database_at(database_path)?;
    validate_reader_cache_key(cache_key)?;

    if value_json.is_empty() || value_json.len() > MAX_READER_CACHE_BYTES {
        bail!("reader cache must be between 1 byte and {MAX_READER_CACHE_BYTES} bytes");
    }

    serde_json::from_str::<serde_json::Value>(value_json)
        .context("reader cache must contain valid JSON")?;

    let conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;
    let now = current_timestamp(&conn)?;
    conn.execute(
        "INSERT INTO reader_cache (book_id, cache_key, source_hash, value_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(book_id, cache_key) DO UPDATE SET
           source_hash = excluded.source_hash,
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
        params![book_id, cache_key, book.file_hash, value_json, now],
    )?;
    Ok(())
}

fn validate_reader_cache_key(cache_key: &str) -> anyhow::Result<()> {
    if cache_key.is_empty()
        || cache_key.len() > 64
        || !cache_key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        bail!("reader cache key is invalid");
    }

    Ok(())
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
    mut locator: Locator,
    progress: Option<f64>,
) -> anyhow::Result<ReaderProgress> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;
    normalize_locator_for_book(book.format, &mut locator)?;

    let normalized_progress = normalize_progress(progress);
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

pub fn list_bookmarks_at(database_path: &Path, book_id: &str) -> anyhow::Result<Vec<Bookmark>> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;

    let mut statement = conn.prepare(
        "SELECT id, book_id, locator_json, label, created_at, updated_at
        FROM bookmarks
        WHERE book_id = ?1
        ORDER BY created_at DESC, id ASC",
    )?;

    let bookmarks = statement
        .query_map(params![book_id], row_to_bookmark)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(bookmarks)
}

pub fn create_bookmark_at(
    database_path: &Path,
    book_id: &str,
    mut locator: Locator,
    label: Option<String>,
) -> anyhow::Result<Bookmark> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;
    normalize_locator_for_book(book.format, &mut locator)?;

    let now = current_timestamp(&conn)?;
    let bookmark = Bookmark {
        id: Uuid::new_v4().to_string(),
        book_id: book_id.to_string(),
        locator,
        label: normalize_bookmark_label(label),
        created_at: now.clone(),
        updated_at: now,
    };
    let locator_json =
        serde_json::to_string(&bookmark.locator).context("failed to serialize bookmark locator")?;

    conn.execute(
        "INSERT INTO bookmarks (id, book_id, locator_json, label, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            &bookmark.id,
            &bookmark.book_id,
            locator_json,
            bookmark.label.as_deref(),
            &bookmark.created_at,
            &bookmark.updated_at,
        ],
    )?;

    Ok(bookmark)
}

pub fn delete_bookmark_at(database_path: &Path, bookmark_id: &str) -> anyhow::Result<()> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let deleted_count =
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![bookmark_id])?;

    if deleted_count == 0 {
        bail!("bookmark not found: {}", bookmark_id);
    }

    Ok(())
}

pub fn list_annotations_at(database_path: &Path, book_id: &str) -> anyhow::Result<Vec<Annotation>> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;

    let mut statement = conn.prepare(
        "SELECT id, book_id, type, color, selected_text, note, locator_json, created_at, updated_at, deleted_at
        FROM annotations
        WHERE book_id = ?1 AND deleted_at IS NULL
        ORDER BY created_at DESC, id ASC",
    )?;

    let annotations = statement
        .query_map(params![book_id], row_to_annotation)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(annotations)
}

pub fn create_annotation_at(
    database_path: &Path,
    book_id: &str,
    annotation_type: AnnotationKind,
    mut locator: Locator,
    color: Option<String>,
    selected_text: Option<String>,
    note: Option<String>,
) -> anyhow::Result<Annotation> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;
    normalize_locator_for_book(book.format, &mut locator)?;

    let now = current_timestamp(&conn)?;
    let annotation = Annotation {
        id: Uuid::new_v4().to_string(),
        book_id: book_id.to_string(),
        annotation_type,
        color: normalize_optional_text(color),
        selected_text: normalize_optional_text(selected_text),
        note: normalize_optional_text(note),
        locator,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    };
    let locator_json = serde_json::to_string(&annotation.locator)
        .context("failed to serialize annotation locator")?;

    conn.execute(
        "INSERT INTO annotations (
            id,
            book_id,
            type,
            color,
            selected_text,
            note,
            locator_json,
            created_at,
            updated_at,
            deleted_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)",
        params![
            &annotation.id,
            &annotation.book_id,
            annotation.annotation_type.as_str(),
            annotation.color.as_deref(),
            annotation.selected_text.as_deref(),
            annotation.note.as_deref(),
            locator_json,
            &annotation.created_at,
            &annotation.updated_at,
        ],
    )?;

    Ok(annotation)
}

pub fn update_annotation_at(
    database_path: &Path,
    annotation_id: &str,
    color: Option<String>,
    note: Option<String>,
) -> anyhow::Result<Annotation> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let now = current_timestamp(&conn)?;
    let normalized_color = normalize_optional_text(color);
    let normalized_note = normalize_optional_text(note);
    let updated_count = conn.execute(
        "UPDATE annotations
        SET color = COALESCE(?1, color),
            note = ?2,
            updated_at = ?3
        WHERE id = ?4 AND deleted_at IS NULL",
        params![
            normalized_color.as_deref(),
            normalized_note.as_deref(),
            now,
            annotation_id,
        ],
    )?;

    if updated_count == 0 {
        bail!("annotation not found: {}", annotation_id);
    }

    find_annotation_by_id(&conn, annotation_id)?
        .with_context(|| format!("annotation not found after update: {annotation_id}"))
}

pub fn delete_annotation_at(database_path: &Path, annotation_id: &str) -> anyhow::Result<()> {
    init_database_at(database_path)?;
    let conn = open_database(database_path)?;
    let now = current_timestamp(&conn)?;
    let updated_count = conn.execute(
        "UPDATE annotations
        SET deleted_at = ?1,
            updated_at = ?1
        WHERE id = ?2 AND deleted_at IS NULL",
        params![now, annotation_id],
    )?;

    if updated_count == 0 {
        bail!("annotation not found: {}", annotation_id);
    }

    Ok(())
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
    transaction.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    for migration in MIGRATIONS {
        let already_applied = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            params![migration.version],
            |row| row.get::<_, bool>(0),
        )?;
        if already_applied {
            continue;
        }
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

fn default_reader_layout_preferences() -> ReaderLayoutPreferences {
    ReaderLayoutPreferences { sidebar_width: 292 }
}

fn default_reader_experience_preferences() -> ReaderExperiencePreferences {
    ReaderExperiencePreferences {
        epub: EpubExperiencePreferences {
            view_mode: EpubViewMode::Paginated,
            transition: PageTransitionMode::None,
        },
        txt: TxtExperiencePreferences {
            view_mode: TxtViewMode::Scroll,
            paginated_view_mode: TxtPaginatedViewMode::Single,
            transition: PageTransitionMode::Slide,
        },
        pdf: PdfExperiencePreferences {
            view_mode: PdfViewMode::Single,
            paginated_view_mode: PdfPaginatedViewMode::Single,
            transition: PageTransitionMode::Slide,
        },
    }
}

fn normalize_reader_experience_setting(value: &serde_json::Value) -> ReaderExperiencePreferences {
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(1) {
        return default_reader_experience_preferences();
    }

    let preferences = value
        .get("preferences")
        .and_then(serde_json::Value::as_object);
    let defaults = default_reader_experience_preferences();

    ReaderExperiencePreferences {
        epub: EpubExperiencePreferences {
            view_mode: EpubViewMode::Paginated,
            transition: read_page_transition(preferences, "epub")
                .unwrap_or(defaults.epub.transition),
        },
        txt: TxtExperiencePreferences {
            view_mode: read_format_value(preferences, "txt", "viewMode")
                .and_then(|value| match value {
                    "scroll" => Some(TxtViewMode::Scroll),
                    "paginated" => Some(TxtViewMode::Paginated),
                    _ => None,
                })
                .unwrap_or(defaults.txt.view_mode),
            paginated_view_mode: read_format_value(preferences, "txt", "paginatedViewMode")
                .and_then(|value| match value {
                    "single" => Some(TxtPaginatedViewMode::Single),
                    "double" => Some(TxtPaginatedViewMode::Double),
                    _ => None,
                })
                .unwrap_or(defaults.txt.paginated_view_mode),
            transition: read_page_transition(preferences, "txt").unwrap_or(defaults.txt.transition),
        },
        pdf: PdfExperiencePreferences {
            view_mode: read_format_value(preferences, "pdf", "viewMode")
                .and_then(|value| match value {
                    "single" => Some(PdfViewMode::Single),
                    "double" => Some(PdfViewMode::Double),
                    "continuous" => Some(PdfViewMode::Continuous),
                    _ => None,
                })
                .unwrap_or(defaults.pdf.view_mode),
            paginated_view_mode: read_format_value(preferences, "pdf", "paginatedViewMode")
                .and_then(|value| match value {
                    "single" => Some(PdfPaginatedViewMode::Single),
                    "double" => Some(PdfPaginatedViewMode::Double),
                    _ => None,
                })
                .or_else(|| {
                    read_format_value(preferences, "pdf", "viewMode").and_then(
                        |value| match value {
                            "single" => Some(PdfPaginatedViewMode::Single),
                            "double" => Some(PdfPaginatedViewMode::Double),
                            _ => None,
                        },
                    )
                })
                .unwrap_or(defaults.pdf.paginated_view_mode),
            transition: read_page_transition(preferences, "pdf").unwrap_or(defaults.pdf.transition),
        },
    }
}

fn default_pdf_paginated_view_mode() -> PdfPaginatedViewMode {
    PdfPaginatedViewMode::Single
}

fn default_txt_paginated_view_mode() -> TxtPaginatedViewMode {
    TxtPaginatedViewMode::Single
}

fn read_page_transition(
    preferences: Option<&serde_json::Map<String, serde_json::Value>>,
    format: &str,
) -> Option<PageTransitionMode> {
    read_format_value(preferences, format, "transition").and_then(|value| match value {
        "none" => Some(PageTransitionMode::None),
        "slide" => Some(PageTransitionMode::Slide),
        "cover" => Some(PageTransitionMode::Cover),
        "page-curl" => Some(PageTransitionMode::PageCurl),
        _ => None,
    })
}

fn read_format_value<'a>(
    preferences: Option<&'a serde_json::Map<String, serde_json::Value>>,
    format: &str,
    field: &str,
) -> Option<&'a str> {
    preferences?.get(format)?.as_object()?.get(field)?.as_str()
}

fn normalize_reader_layout_preferences(
    mut preferences: ReaderLayoutPreferences,
) -> ReaderLayoutPreferences {
    preferences.sidebar_width = preferences.sidebar_width.clamp(240, 480);
    preferences
}

fn normalize_reader_theme(mut theme: ReaderTheme) -> ReaderTheme {
    theme.font_size = theme.font_size.clamp(14.0, 30.0);
    theme.line_height = theme.line_height.clamp(1.35, 2.4);
    theme.paragraph_spacing = theme.paragraph_spacing.clamp(0.0, 36.0);
    theme.page_margin = theme.page_margin.clamp(12.0, 96.0);
    theme
}

fn normalize_locator_for_book(format: BookFormat, locator: &mut Locator) -> anyhow::Result<()> {
    match (format, locator) {
        (BookFormat::Txt, Locator::Txt(txt_locator)) => {
            normalize_txt_locator(txt_locator);
            Ok(())
        }
        (BookFormat::Txt, _) => bail!("TXT books can only use txt locators"),
        (BookFormat::Epub, Locator::Epub(epub_locator)) => {
            let has_cfi = epub_locator
                .cfi
                .as_deref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);

            if epub_locator.href.trim().is_empty() && !has_cfi {
                bail!("EPUB locator requires an href or cfi");
            }

            epub_locator.progression = epub_locator
                .progression
                .filter(|value| value.is_finite())
                .map(|value| value.clamp(0.0, 1.0));
            Ok(())
        }
        (BookFormat::Epub, _) => bail!("EPUB books can only use epub locators"),
        (BookFormat::Pdf, Locator::Pdf(pdf_locator)) => {
            pdf_locator.page = pdf_locator.page.max(1);
            pdf_locator.page_offset_ratio = normalize_progress(pdf_locator.page_offset_ratio);
            pdf_locator.scale = normalize_pdf_scale(pdf_locator.scale);

            if let Some(rects) = &mut pdf_locator.rects {
                rects.retain(is_valid_pdf_rect);

                if rects.is_empty() {
                    pdf_locator.rects = None;
                }
            }

            Ok(())
        }
        (BookFormat::Pdf, _) => bail!("PDF books can only use pdf locators"),
    }
}

fn normalize_txt_locator(locator: &mut TxtLocator) {
    locator.end_char_offset = locator
        .end_char_offset
        .filter(|end_char_offset| *end_char_offset > locator.char_offset);
}

fn normalize_bookmark_label(label: Option<String>) -> Option<String> {
    label
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn normalize_progress(progress: Option<f64>) -> Option<f64> {
    progress
        .filter(|value| value.is_finite())
        .map(|value| value.clamp(0.0, 1.0))
}

fn normalize_pdf_scale(scale: Option<f64>) -> Option<f64> {
    scale
        .filter(|value| value.is_finite())
        .map(|value| value.clamp(0.5, 3.0))
}

fn is_valid_pdf_rect(rect: &PdfRect) -> bool {
    rect.x.is_finite()
        && rect.y.is_finite()
        && rect.width.is_finite()
        && rect.height.is_finite()
        && rect.width >= 0.0
        && rect.height >= 0.0
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

fn row_to_bookmark(row: &Row<'_>) -> rusqlite::Result<Bookmark> {
    let locator_json: String = row.get(2)?;
    let locator = serde_json::from_str(&locator_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(error))
    })?;

    Ok(Bookmark {
        id: row.get(0)?,
        book_id: row.get(1)?,
        locator,
        label: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn row_to_annotation(row: &Row<'_>) -> rusqlite::Result<Annotation> {
    let annotation_type_value: String = row.get(2)?;
    let locator_json: String = row.get(6)?;
    let locator = serde_json::from_str(&locator_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(6, rusqlite::types::Type::Text, Box::new(error))
    })?;

    Ok(Annotation {
        id: row.get(0)?,
        book_id: row.get(1)?,
        annotation_type: AnnotationKind::from_database(&annotation_type_value)?,
        color: row.get(3)?,
        selected_text: row.get(4)?,
        note: row.get(5)?,
        locator,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        deleted_at: row.get(9)?,
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

    transaction.execute(
        "INSERT INTO book_cover_state (book_id, status, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(book_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
        params![
            &book.id,
            book.cover_status.as_str(),
            &book.updated_at,
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
            last_opened_at,
            COALESCE(
                (SELECT status FROM book_cover_state WHERE book_id = books.id),
                CASE WHEN cover_path IS NOT NULL THEN 'ready' WHEN format = 'txt' THEN 'fallback' ELSE 'pending' END
            )
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
            last_opened_at,
            COALESCE(
                (SELECT status FROM book_cover_state WHERE book_id = books.id),
                CASE WHEN cover_path IS NOT NULL THEN 'ready' WHEN format = 'txt' THEN 'fallback' ELSE 'pending' END
            )
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
            last_opened_at,
            COALESCE(
                (SELECT status FROM book_cover_state WHERE book_id = books.id),
                CASE WHEN cover_path IS NOT NULL THEN 'ready' WHEN format = 'txt' THEN 'fallback' ELSE 'pending' END
            )
        FROM books
        WHERE id = ?1",
        params![book_id],
        row_to_book,
    )
    .optional()
}

fn find_annotation_by_id(
    conn: &Connection,
    annotation_id: &str,
) -> rusqlite::Result<Option<Annotation>> {
    conn.query_row(
        "SELECT id, book_id, type, color, selected_text, note, locator_json, created_at, updated_at, deleted_at
        FROM annotations
        WHERE id = ?1",
        params![annotation_id],
        row_to_annotation,
    )
    .optional()
}

fn row_to_book(row: &Row<'_>) -> rusqlite::Result<Book> {
    let format_value: String = row.get(3)?;
    let library_path: String = row.get(5)?;

    Ok(Book {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        format: BookFormat::from_database(&format_value)?,
        source_path: row.get(4)?,
        availability: if Path::new(&library_path).is_file() {
            BookAvailability::Available
        } else {
            BookAvailability::Missing
        },
        library_path,
        file_hash: row.get(6)?,
        cover_path: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        last_opened_at: row.get(10)?,
        cover_status: BookCoverStatus::from_database(&row.get::<_, String>(11)?)?,
    })
}

fn validate_cover_image(image_bytes: &[u8], image_format: &str) -> anyhow::Result<&'static str> {
    match image_format.trim().to_ascii_lowercase().as_str() {
        "webp"
            if image_bytes.len() >= 12
                && &image_bytes[0..4] == b"RIFF"
                && &image_bytes[8..12] == b"WEBP" =>
        {
            Ok("webp")
        }
        "png" if image_bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) => {
            Ok("png")
        }
        "jpg" | "jpeg"
            if image_bytes.len() >= 3
                && image_bytes[0] == 0xff
                && image_bytes[1] == 0xd8
                && image_bytes[2] == 0xff =>
        {
            Ok("jpg")
        }
        _ => bail!("cover image format or signature is invalid"),
    }
}

pub fn save_book_cover_at(
    database_path: &Path,
    library_dir: &Path,
    book_id: &str,
    image_bytes: &[u8],
    image_format: &str,
) -> anyhow::Result<Book> {
    init_database_at(database_path)?;

    if image_bytes.is_empty() || image_bytes.len() > MAX_COVER_BYTES {
        bail!("cover image must be between 1 byte and {MAX_COVER_BYTES} bytes");
    }

    let extension = validate_cover_image(image_bytes, image_format)?;
    fs::create_dir_all(library_dir)?;
    let cover_dir = library_dir.join(COVER_DIR_NAME);
    fs::create_dir_all(&cover_dir)
        .with_context(|| format!("failed to create cover directory {}", cover_dir.display()))?;

    let mut conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;
    let cover_path = cover_dir.join(format!("{}.{}", book.file_hash, extension));
    let temporary_path = cover_dir.join(format!("{}.{}.tmp", book.file_hash, extension));

    fs::write(&temporary_path, image_bytes).with_context(|| {
        format!(
            "failed to write temporary cover {}",
            temporary_path.display()
        )
    })?;
    if cover_path.exists() {
        fs::remove_file(&cover_path)?;
    }
    fs::rename(&temporary_path, &cover_path)
        .with_context(|| format!("failed to finalize cover {}", cover_path.display()))?;

    if let Some(previous_cover_path) = book.cover_path.as_deref().map(PathBuf::from) {
        if previous_cover_path != cover_path && previous_cover_path.exists() {
            assert_library_file_is_within_dir(&previous_cover_path, library_dir)?;
            fs::remove_file(previous_cover_path)?;
        }
    }

    let now = current_timestamp(&conn)?;
    let transaction = conn.transaction()?;
    transaction.execute(
        "UPDATE books SET cover_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![path_to_string(&cover_path), now, book_id],
    )?;
    transaction.execute(
        "INSERT INTO book_cover_state (book_id, status, updated_at)
         VALUES (?1, 'ready', ?2)
         ON CONFLICT(book_id) DO UPDATE SET status = 'ready', updated_at = excluded.updated_at",
        params![book_id, now],
    )?;
    transaction.commit()?;

    find_book_by_id(&conn, book_id)?
        .with_context(|| format!("book not found after cover save: {book_id}"))
}

pub fn mark_book_cover_fallback_at(
    database_path: &Path,
    library_dir: &Path,
    book_id: &str,
) -> anyhow::Result<Book> {
    init_database_at(database_path)?;
    fs::create_dir_all(library_dir)?;
    let mut conn = open_database(database_path)?;
    let book =
        find_book_by_id(&conn, book_id)?.with_context(|| format!("book not found: {book_id}"))?;

    if let Some(cover_path) = book.cover_path.as_deref().map(PathBuf::from) {
        if cover_path.exists() {
            assert_library_file_is_within_dir(&cover_path, library_dir)?;
            fs::remove_file(cover_path)?;
        }
    }

    let now = current_timestamp(&conn)?;
    let transaction = conn.transaction()?;
    transaction.execute(
        "UPDATE books SET cover_path = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, book_id],
    )?;
    transaction.execute(
        "INSERT INTO book_cover_state (book_id, status, updated_at)
         VALUES (?1, 'fallback', ?2)
         ON CONFLICT(book_id) DO UPDATE SET status = 'fallback', updated_at = excluded.updated_at",
        params![book_id, now],
    )?;
    transaction.commit()?;

    find_book_by_id(&conn, book_id)?
        .with_context(|| format!("book not found after cover fallback: {book_id}"))
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf, thread, time::Duration};

    use encoding_rs::{Encoding, BIG5, GB18030, GBK, UTF_8};
    use rusqlite::{params, Connection};
    use tempfile::tempdir;
    use uuid::Uuid;

    use super::{
        create_annotation_at, create_bookmark_at, delete_annotation_at, delete_bookmark_at,
        get_reader_cache_at, get_reader_experience_preferences_at,
        get_reader_layout_preferences_at, get_reader_theme_at, get_reading_progress_at,
        import_book_at, init_database_at, list_annotations_at, list_bookmarks_at, list_books_at,
        mark_book_cover_fallback_at, mark_book_opened_at, open_txt_book_at, remove_book_at,
        save_book_cover_at, save_reader_cache_at, save_reader_experience_preferences_at,
        save_reader_layout_preferences_at, save_reader_theme_at, save_reading_progress_at,
        schema_version, update_annotation_at, AnnotationKind, BookCoverStatus, BookFormat,
        EpubExperiencePreferences, EpubLocator, EpubViewMode, ImportBookStatus, Locator,
        PageTransitionMode, PdfExperiencePreferences, PdfLocator, PdfPaginatedViewMode, PdfRect,
        PdfViewMode, PdfZoomMode, ReaderExperiencePreferences, ReaderLayoutPreferences,
        ReaderTheme, ReaderThemeMode, TxtExperiencePreferences, TxtLocator, TxtPaginatedViewMode,
        TxtViewMode, DB_FILE_NAME,
    };

    #[test]
    fn migration_v4_creates_expected_tables_and_is_idempotent() {
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
                    'app_settings',
                    'book_cover_state',
                    'reader_cache'
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

        assert_eq!(table_count, 8);
        let bookmark_updated_at_columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('bookmarks') WHERE name = 'updated_at'",
                [],
                |row| row.get(0),
            )
            .expect("count bookmark updated_at columns");

        assert_eq!(migration_count, 4);
        assert_eq!(schema_version(&conn).expect("schema version"), 4);
        assert_eq!(bookmark_updated_at_columns, 1);
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
        assert_eq!(result.book.cover_status, BookCoverStatus::Fallback);
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
    fn duplicate_import_repairs_a_missing_library_copy() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("repair.txt");
        fs::write(&source_path, "repairable content").expect("write source file");

        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("first import");
        fs::remove_file(&imported.book.library_path).expect("remove library copy");

        let repaired =
            import_book_at(&database_path, &library_dir, &source_path).expect("repair import");

        assert_eq!(repaired.status, ImportBookStatus::Repaired);
        assert_eq!(repaired.book.id, imported.book.id);
        assert!(PathBuf::from(repaired.book.library_path).is_file());
    }

    #[test]
    fn covers_are_validated_persisted_fallbacked_and_removed() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("covered.txt");
        fs::write(&source_path, "covered content").expect("write source file");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import book");
        let webp = b"RIFF\x04\x00\x00\x00WEBPVP8 ";

        let invalid = save_book_cover_at(
            &database_path,
            &library_dir,
            &imported.book.id,
            b"not an image",
            "webp",
        )
        .expect_err("reject invalid cover signature");
        assert!(invalid.to_string().contains("signature"));

        let oversized = vec![0_u8; 2 * 1024 * 1024 + 1];
        let oversized_error = save_book_cover_at(
            &database_path,
            &library_dir,
            &imported.book.id,
            &oversized,
            "webp",
        )
        .expect_err("reject oversized cover");
        assert!(oversized_error.to_string().contains("between 1 byte"));

        let covered = save_book_cover_at(
            &database_path,
            &library_dir,
            &imported.book.id,
            webp,
            "webp",
        )
        .expect("save cover");
        let cover_path = PathBuf::from(covered.cover_path.as_deref().expect("cover path"));
        assert_eq!(covered.cover_status, BookCoverStatus::Ready);
        assert!(cover_path.is_file());

        let fallback = mark_book_cover_fallback_at(&database_path, &library_dir, &imported.book.id)
            .expect("fallback cover");
        assert_eq!(fallback.cover_status, BookCoverStatus::Fallback);
        assert!(fallback.cover_path.is_none());
        assert!(!cover_path.exists());

        let covered_again = save_book_cover_at(
            &database_path,
            &library_dir,
            &imported.book.id,
            webp,
            "webp",
        )
        .expect("save cover again");
        let second_cover_path = PathBuf::from(
            covered_again
                .cover_path
                .as_deref()
                .expect("second cover path"),
        );
        remove_book_at(&database_path, &library_dir, &imported.book.id).expect("remove book");
        assert!(!second_cover_path.exists());
    }

    #[test]
    fn reader_cache_hits_invalidates_with_hash_and_cascades_on_delete() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("cache.epub");
        fs::write(&source_path, "epub cache source").expect("write source file");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import book");

        save_reader_cache_at(
            &database_path,
            &imported.book.id,
            "epub_toc_v1",
            r#"[{"id":"one","title":"One"}]"#,
        )
        .expect("save cache");
        assert!(
            get_reader_cache_at(&database_path, &imported.book.id, "epub_toc_v1")
                .expect("get cache")
                .is_some()
        );

        let conn = Connection::open(&database_path).expect("open database");
        conn.execute(
            "UPDATE books SET file_hash = 'changed-source-hash' WHERE id = ?1",
            params![imported.book.id],
        )
        .expect("change source hash");
        assert!(
            get_reader_cache_at(&database_path, &imported.book.id, "epub_toc_v1")
                .expect("get invalidated cache")
                .is_none()
        );

        save_reader_cache_at(
            &database_path,
            &imported.book.id,
            "epub_toc_v1",
            r#"[{"id":"two","title":"Two"}]"#,
        )
        .expect("refresh cache");
        remove_book_at(&database_path, &library_dir, &imported.book.id).expect("remove book");

        let cache_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reader_cache", [], |row| row.get(0))
            .expect("count cache rows");
        assert_eq!(cache_count, 0);
    }

    #[test]
    fn reader_cache_rejects_invalid_keys_and_json() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        let key_error = get_reader_cache_at(&database_path, "missing", "invalid key")
            .expect_err("reject invalid key");
        assert!(key_error.to_string().contains("key is invalid"));

        let json_error = save_reader_cache_at(&database_path, "missing", "epub_toc_v1", "not-json")
            .expect_err("reject invalid json before missing book");
        assert!(json_error.to_string().contains("valid JSON"));
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
            Locator::Txt(TxtLocator {
                chapter_id: None,
                char_offset: 3,
                end_char_offset: None,
            }),
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
    fn bookmarks_can_be_created_listed_and_deleted_for_a_book() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("bookmark.txt");
        fs::write(&source_path, "第一章 初见\n正文").expect("write source");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt");
        let locator = Locator::Txt(TxtLocator {
            chapter_id: Some("chapter-1-0".to_string()),
            char_offset: 3,
            end_char_offset: Some(8),
        });

        let created = create_bookmark_at(
            &database_path,
            &imported.book.id,
            locator.clone(),
            Some("  第一章  ".to_string()),
        )
        .expect("create bookmark");
        let bookmarks =
            list_bookmarks_at(&database_path, &imported.book.id).expect("list bookmarks");

        assert_eq!(created.book_id, imported.book.id);
        assert_eq!(created.locator, locator);
        assert_eq!(created.label.as_deref(), Some("第一章"));
        assert_eq!(bookmarks, vec![created.clone()]);

        delete_bookmark_at(&database_path, &created.id).expect("delete bookmark");
        let bookmarks_after_delete =
            list_bookmarks_at(&database_path, &imported.book.id).expect("list after delete");

        assert!(bookmarks_after_delete.is_empty());
    }

    #[test]
    fn bookmarks_reject_format_mismatched_locators() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("bookmark-mismatch.txt");
        fs::write(&source_path, "第一章 初见\n正文").expect("write source");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt");

        let error = create_bookmark_at(
            &database_path,
            &imported.book.id,
            Locator::Epub(EpubLocator {
                href: "OPS/chapter-one.xhtml".to_string(),
                cfi: None,
                progression: None,
            }),
            None,
        )
        .expect_err("txt book should reject epub bookmark locator");

        assert!(error
            .to_string()
            .contains("TXT books can only use txt locators"));
    }

    #[test]
    fn annotations_can_be_created_listed_updated_and_soft_deleted() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("annotation.txt");
        fs::write(&source_path, "第一章 初见\n她推开门。").expect("write source");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt");
        let locator = Locator::Txt(TxtLocator {
            chapter_id: Some("chapter-1-0".to_string()),
            char_offset: 6,
            end_char_offset: Some(10),
        });

        let created = create_annotation_at(
            &database_path,
            &imported.book.id,
            AnnotationKind::Highlight,
            locator.clone(),
            Some("  #f3bc55  ".to_string()),
            Some("  她推开门  ".to_string()),
            None,
        )
        .expect("create annotation");
        let annotations =
            list_annotations_at(&database_path, &imported.book.id).expect("list annotations");

        assert_eq!(created.book_id, imported.book.id);
        assert_eq!(created.annotation_type, AnnotationKind::Highlight);
        assert_eq!(created.locator, locator);
        assert_eq!(created.color.as_deref(), Some("#f3bc55"));
        assert_eq!(created.selected_text.as_deref(), Some("她推开门"));
        assert_eq!(annotations, vec![created.clone()]);

        let updated = update_annotation_at(
            &database_path,
            &created.id,
            Some("#7dbb78".to_string()),
            Some("important moment".to_string()),
        )
        .expect("update annotation");

        assert_eq!(updated.color.as_deref(), Some("#7dbb78"));
        assert_eq!(updated.note.as_deref(), Some("important moment"));
        assert!(updated.updated_at >= created.updated_at);

        delete_annotation_at(&database_path, &created.id).expect("soft delete annotation");
        let annotations_after_delete =
            list_annotations_at(&database_path, &imported.book.id).expect("list after delete");
        let conn = Connection::open(&database_path).expect("open database");
        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM annotations WHERE id = ?1",
                params![created.id],
                |row| row.get(0),
            )
            .expect("query deleted annotation");

        assert!(annotations_after_delete.is_empty());
        assert!(deleted_at.is_some());
    }

    #[test]
    fn annotations_reject_format_mismatched_locators() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("annotation-mismatch.pdf");
        fs::write(&source_path, "%PDF-1.4\n% placeholder").expect("write source");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import pdf");

        let error = create_annotation_at(
            &database_path,
            &imported.book.id,
            AnnotationKind::Highlight,
            Locator::Txt(TxtLocator {
                chapter_id: None,
                char_offset: 0,
                end_char_offset: Some(4),
            }),
            Some("#f3bc55".to_string()),
            Some("text".to_string()),
            None,
        )
        .expect_err("pdf book should reject txt annotation locator");

        assert!(error
            .to_string()
            .contains("PDF books can only use pdf locators"));
    }

    #[test]
    fn removing_book_cascades_bookmarks_and_annotations() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let source_path = temp_dir.path().join("cascade.txt");
        fs::write(&source_path, "第一章 初见\n正文").expect("write source");
        let imported =
            import_book_at(&database_path, &library_dir, &source_path).expect("import txt");
        let locator = Locator::Txt(TxtLocator {
            chapter_id: Some("chapter-1-0".to_string()),
            char_offset: 3,
            end_char_offset: Some(5),
        });

        create_bookmark_at(
            &database_path,
            &imported.book.id,
            locator.clone(),
            Some("mark".to_string()),
        )
        .expect("create bookmark");
        create_annotation_at(
            &database_path,
            &imported.book.id,
            AnnotationKind::Highlight,
            locator,
            Some("#f3bc55".to_string()),
            Some("正文".to_string()),
            None,
        )
        .expect("create annotation");

        remove_book_at(&database_path, &library_dir, &imported.book.id).expect("remove book");

        let conn = Connection::open(&database_path).expect("open database");
        let bookmark_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM bookmarks", [], |row| row.get(0))
            .expect("count bookmarks");
        let annotation_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM annotations", [], |row| row.get(0))
            .expect("count annotations");

        assert_eq!(bookmark_count, 0);
        assert_eq!(annotation_count, 0);
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
    fn reader_layout_preferences_are_clamped_and_persisted() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        let defaults =
            get_reader_layout_preferences_at(&database_path).expect("get default layout");
        assert_eq!(defaults.sidebar_width, 292);

        let saved = save_reader_layout_preferences_at(
            &database_path,
            &ReaderLayoutPreferences { sidebar_width: 401 },
        )
        .expect("save layout");
        init_database_at(&database_path).expect("reopen database");
        let restored = get_reader_layout_preferences_at(&database_path).expect("restore layout");

        assert_eq!(saved.sidebar_width, 401);
        assert_eq!(restored, saved);

        let clamped_low = save_reader_layout_preferences_at(
            &database_path,
            &ReaderLayoutPreferences { sidebar_width: 120 },
        )
        .expect("clamp low layout");
        let clamped_high = save_reader_layout_preferences_at(
            &database_path,
            &ReaderLayoutPreferences { sidebar_width: 720 },
        )
        .expect("clamp high layout");

        assert_eq!(clamped_low.sidebar_width, 240);
        assert_eq!(clamped_high.sidebar_width, 480);
    }

    #[test]
    fn reader_experience_defaults_and_persists_in_a_v1_envelope() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);

        let defaults = get_reader_experience_preferences_at(&database_path)
            .expect("get default reader experience");
        assert_eq!(defaults.epub.view_mode, EpubViewMode::Paginated);
        assert_eq!(defaults.txt.view_mode, TxtViewMode::Scroll);
        assert_eq!(defaults.pdf.view_mode, PdfViewMode::Single);
        assert_eq!(defaults.epub.transition, PageTransitionMode::None);

        let preferences = ReaderExperiencePreferences {
            epub: EpubExperiencePreferences {
                view_mode: EpubViewMode::Paginated,
                transition: PageTransitionMode::Cover,
            },
            txt: TxtExperiencePreferences {
                view_mode: TxtViewMode::Paginated,
                paginated_view_mode: TxtPaginatedViewMode::Double,
                transition: PageTransitionMode::None,
            },
            pdf: PdfExperiencePreferences {
                view_mode: PdfViewMode::Continuous,
                paginated_view_mode: PdfPaginatedViewMode::Double,
                transition: PageTransitionMode::Slide,
            },
        };
        let saved = save_reader_experience_preferences_at(&database_path, &preferences)
            .expect("save reader experience");
        let restored = get_reader_experience_preferences_at(&database_path)
            .expect("restore reader experience");
        let conn = Connection::open(&database_path).expect("open database");
        let value_json: String = conn
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'reader_experience'",
                [],
                |row| row.get(0),
            )
            .expect("read stored reader experience");
        let stored: serde_json::Value =
            serde_json::from_str(&value_json).expect("parse stored reader experience");

        assert_eq!(saved, preferences);
        assert_eq!(restored, preferences);
        assert_eq!(stored["version"], 1);
        assert_eq!(stored["preferences"]["epub"]["transition"], "cover");
        assert_eq!(stored["preferences"]["txt"]["paginatedViewMode"], "double");
        assert_eq!(stored["preferences"]["pdf"]["paginatedViewMode"], "double");
    }

    #[test]
    fn reader_experience_normalizes_invalid_fields_and_preserves_unknown_versions() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        init_database_at(&database_path).expect("initialize database");
        let conn = Connection::open(&database_path).expect("open database");
        let invalid_value = serde_json::json!({
            "version": 1,
            "preferences": {
                "epub": { "viewMode": "scrolled", "transition": "fade" },
                "txt": { "viewMode": "paginated", "transition": "page-curl", "future": true },
                "pdf": { "viewMode": "spread", "transition": "none" },
                "future": true
            }
        })
        .to_string();
        conn.execute(
            "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
            params![
                "reader_experience",
                invalid_value,
                "2026-07-06T00:00:00.000Z"
            ],
        )
        .expect("insert invalid preferences");
        drop(conn);

        let normalized = get_reader_experience_preferences_at(&database_path)
            .expect("normalize reader experience");
        assert_eq!(normalized.epub.transition, PageTransitionMode::None);
        assert_eq!(normalized.txt.view_mode, TxtViewMode::Paginated);
        assert_eq!(normalized.txt.transition, PageTransitionMode::PageCurl);
        assert_eq!(normalized.pdf.view_mode, PdfViewMode::Single);
        assert_eq!(normalized.pdf.transition, PageTransitionMode::None);

        let future_value = serde_json::json!({
            "version": 2,
            "preferences": { "txt": { "viewMode": "paginated" } }
        })
        .to_string();
        let conn = Connection::open(&database_path).expect("reopen database");
        conn.execute(
            "UPDATE app_settings SET value_json = ?1 WHERE key = ?2",
            params![future_value, "reader_experience"],
        )
        .expect("store future preferences");
        drop(conn);

        let future_defaults =
            get_reader_experience_preferences_at(&database_path).expect("read future preferences");
        let conn = Connection::open(&database_path).expect("verify future storage");
        let preserved: String = conn
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'reader_experience'",
                [],
                |row| row.get(0),
            )
            .expect("read future storage");

        assert_eq!(future_defaults.txt.view_mode, TxtViewMode::Scroll);
        assert_eq!(preserved, future_value);
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
        let locator = Locator::Txt(TxtLocator {
            chapter_id: Some("chapter-1-0".to_string()),
            char_offset: 6,
            end_char_offset: None,
        });

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
    fn reading_progress_persists_for_epub_books() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let epub_path = temp_dir.path().join("book.epub");
        fs::write(&epub_path, "epub placeholder").expect("write epub");
        let imported =
            import_book_at(&database_path, &library_dir, &epub_path).expect("import epub");
        let locator = Locator::Epub(EpubLocator {
            href: "OPS/chapter-one.xhtml".to_string(),
            cfi: Some("epubcfi(/6/2[chapter-one]!/4/1:12)".to_string()),
            progression: Some(1.4),
        });

        let saved = save_reading_progress_at(
            &database_path,
            &imported.book.id,
            locator.clone(),
            Some(-0.25),
        )
        .expect("save epub progress");
        let restored = get_reading_progress_at(&database_path, &imported.book.id)
            .expect("get epub progress")
            .expect("progress exists");

        assert_eq!(saved.book_id, imported.book.id);
        assert_eq!(saved.progress, Some(0.0));
        assert_eq!(restored.progress, Some(0.0));
        assert_eq!(
            restored.locator,
            Locator::Epub(EpubLocator {
                href: "OPS/chapter-one.xhtml".to_string(),
                cfi: Some("epubcfi(/6/2[chapter-one]!/4/1:12)".to_string()),
                progression: Some(1.0),
            })
        );
    }

    #[test]
    fn reading_progress_persists_for_pdf_books() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let pdf_path = temp_dir.path().join("book.pdf");
        fs::write(&pdf_path, "%PDF-1.4\n% placeholder").expect("write pdf");
        let imported = import_book_at(&database_path, &library_dir, &pdf_path).expect("import pdf");
        let locator = Locator::Pdf(PdfLocator {
            page: 0,
            page_offset_ratio: Some(1.4),
            zoom_mode: Some(PdfZoomMode::FitWidth),
            rects: Some(vec![
                PdfRect {
                    x: 10.0,
                    y: 12.0,
                    width: 100.0,
                    height: 28.0,
                },
                PdfRect {
                    x: f64::NAN,
                    y: 0.0,
                    width: 10.0,
                    height: 10.0,
                },
            ]),
            scale: Some(6.0),
        });

        let saved = save_reading_progress_at(
            &database_path,
            &imported.book.id,
            locator,
            Some(f64::INFINITY),
        )
        .expect("save pdf progress");
        init_database_at(&database_path).expect("reopen database");
        let restored = get_reading_progress_at(&database_path, &imported.book.id)
            .expect("get pdf progress")
            .expect("progress exists");

        let expected_locator = Locator::Pdf(PdfLocator {
            page: 1,
            page_offset_ratio: Some(1.0),
            zoom_mode: Some(PdfZoomMode::FitWidth),
            rects: Some(vec![PdfRect {
                x: 10.0,
                y: 12.0,
                width: 100.0,
                height: 28.0,
            }]),
            scale: Some(3.0),
        });

        assert_eq!(saved.book_id, imported.book.id);
        assert_eq!(saved.progress, None);
        assert_eq!(saved.locator, expected_locator);
        assert_eq!(restored.locator, expected_locator);
        assert_eq!(restored.progress, None);
    }

    #[test]
    fn reading_progress_rejects_format_mismatched_locators() {
        let temp_dir = tempdir().expect("temp dir");
        let database_path = temp_dir.path().join(DB_FILE_NAME);
        let library_dir = temp_dir.path().join("library");
        let txt_path = temp_dir.path().join("book.txt");
        let epub_path = temp_dir.path().join("book.epub");
        let pdf_path = temp_dir.path().join("book.pdf");
        fs::write(&txt_path, "第一章 初见\n正文").expect("write txt");
        fs::write(&epub_path, "epub placeholder").expect("write epub");
        fs::write(&pdf_path, "%PDF-1.4\n% placeholder").expect("write pdf");
        let imported_txt =
            import_book_at(&database_path, &library_dir, &txt_path).expect("import txt");
        let imported_epub =
            import_book_at(&database_path, &library_dir, &epub_path).expect("import epub");
        let imported_pdf =
            import_book_at(&database_path, &library_dir, &pdf_path).expect("import pdf");

        let txt_book_error = save_reading_progress_at(
            &database_path,
            &imported_txt.book.id,
            Locator::Epub(EpubLocator {
                href: "OPS/chapter-one.xhtml".to_string(),
                cfi: None,
                progression: None,
            }),
            Some(0.2),
        )
        .expect_err("txt book should reject epub locator");
        let epub_book_error = save_reading_progress_at(
            &database_path,
            &imported_epub.book.id,
            Locator::Txt(TxtLocator {
                chapter_id: None,
                char_offset: 0,
                end_char_offset: None,
            }),
            Some(0.2),
        )
        .expect_err("epub book should reject txt locator");
        let invalid_epub_error = save_reading_progress_at(
            &database_path,
            &imported_epub.book.id,
            Locator::Epub(EpubLocator {
                href: "   ".to_string(),
                cfi: None,
                progression: None,
            }),
            None,
        )
        .expect_err("empty epub locator should fail");
        let pdf_book_error = save_reading_progress_at(
            &database_path,
            &imported_pdf.book.id,
            Locator::Txt(TxtLocator {
                chapter_id: None,
                char_offset: 0,
                end_char_offset: None,
            }),
            Some(0.2),
        )
        .expect_err("pdf book should reject txt locator");

        assert!(txt_book_error
            .to_string()
            .contains("TXT books can only use txt locators"));
        assert!(epub_book_error
            .to_string()
            .contains("EPUB books can only use epub locators"));
        assert!(invalid_epub_error
            .to_string()
            .contains("EPUB locator requires an href or cfi"));
        assert!(pdf_book_error
            .to_string()
            .contains("PDF books can only use pdf locators"));
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
