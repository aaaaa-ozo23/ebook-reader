use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use anyhow::{bail, Context};
use regex::Regex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
use zip::ZipArchive;

use crate::{backup::DataOperationRegistry, db};

const SEARCH_RESULT_LIMIT: usize = 100;
const SEARCH_CHUNK_CHARS: usize = 4_000;
const SEARCH_CHUNK_OVERLAP: usize = 200;
const MAX_QUERY_CHARS: usize = 256;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchStatus {
    pub state: LibrarySearchOverallState,
    pub total_books: usize,
    pub indexed_books: usize,
    pub pending_books: usize,
    pub failed_books: usize,
    pub no_text_books: usize,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LibrarySearchOverallState {
    Empty,
    Ready,
    NeedsIndex,
    Indexing,
    Partial,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResult {
    pub query: String,
    pub hits: Vec<LibrarySearchHit>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchHit {
    pub id: String,
    pub book_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub format: db::BookFormat,
    pub reader_format: db::ReaderFormat,
    pub availability: db::BookAvailability,
    pub excerpt: String,
    pub excerpt_match_start: usize,
    pub excerpt_match_end: usize,
    pub location_label: String,
    pub target: LibrarySearchTarget,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum LibrarySearchTarget {
    Metadata,
    Txt {
        #[serde(rename = "charOffset")]
        char_offset: usize,
    },
    Epub {
        href: String,
        #[serde(default, rename = "charOffset")]
        char_offset: usize,
        #[serde(default, rename = "matchIndex")]
        match_index: usize,
    },
    Pdf {
        page: usize,
        #[serde(default, rename = "charOffset")]
        char_offset: usize,
        #[serde(default, rename = "matchIndex")]
        match_index: usize,
    },
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RebuildStatus {
    Completed,
    Canceled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchRebuildResult {
    pub operation_id: String,
    pub status: RebuildStatus,
    pub indexed_books: usize,
    pub failed_books: usize,
    pub no_text_books: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchProgress<'a> {
    operation_id: &'a str,
    kind: &'static str,
    phase: &'static str,
    completed: usize,
    total: usize,
    message: &'a str,
}

#[derive(Debug)]
struct SearchChunk {
    text: String,
    location_label: String,
    target: LibrarySearchTarget,
}

struct OperationGuard<'a> {
    registry: &'a DataOperationRegistry,
    operation_id: String,
}

impl Drop for OperationGuard<'_> {
    fn drop(&mut self) {
        self.registry.finish(&self.operation_id);
    }
}

pub fn get_status(app: &AppHandle) -> anyhow::Result<LibrarySearchStatus> {
    let database_path = db::init_app_database(app)?;
    get_status_at(&database_path)
}

pub fn search(app: &AppHandle, query: &str) -> anyhow::Result<LibrarySearchResult> {
    let database_path = db::init_app_database(app)?;
    search_at(&database_path, query)
}

pub fn rebuild(
    app: &AppHandle,
    registry: &DataOperationRegistry,
    operation_id: &str,
) -> anyhow::Result<LibrarySearchRebuildResult> {
    let canceled = registry.register(operation_id)?;
    let _guard = OperationGuard {
        registry,
        operation_id: operation_id.to_string(),
    };
    let database_path = db::init_app_database(app)?;
    let books = db::list_books_at(&database_path)?;
    rebuild_at(
        &database_path,
        &books,
        &canceled,
        |phase, completed, total, message| {
            let _ = app.emit(
                "data-operation-progress",
                SearchProgress {
                    operation_id,
                    kind: "library-search-index",
                    phase,
                    completed,
                    total,
                    message,
                },
            );
        },
        operation_id,
    )
}

fn get_status_at(database_path: &Path) -> anyhow::Result<LibrarySearchStatus> {
    db::init_database_at(database_path)?;
    let conn = Connection::open(database_path)?;
    let total_books =
        conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get::<_, i64>(0))? as usize;
    let indexed_books = count_search_books(&conn, "ready")?;
    let pending_books = count_search_books(&conn, "pending")?;
    let indexing_books = count_search_books(&conn, "indexing")?;
    let failed_books = count_search_books(&conn, "failed")?;
    let no_text_books = count_search_books(&conn, "no-text")?;
    let state = if total_books == 0 {
        LibrarySearchOverallState::Empty
    } else if indexing_books > 0 {
        LibrarySearchOverallState::Indexing
    } else if pending_books > 0 {
        LibrarySearchOverallState::NeedsIndex
    } else if failed_books > 0 {
        LibrarySearchOverallState::Partial
    } else {
        LibrarySearchOverallState::Ready
    };

    Ok(LibrarySearchStatus {
        state,
        total_books,
        indexed_books,
        pending_books,
        failed_books,
        no_text_books,
    })
}

fn count_search_books(conn: &Connection, state: &str) -> anyhow::Result<usize> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM library_search_books WHERE state = ?1",
        [state],
        |row| row.get::<_, i64>(0),
    )? as usize)
}

fn rebuild_at<F>(
    database_path: &Path,
    books: &[db::Book],
    canceled: &AtomicBool,
    mut on_progress: F,
    operation_id: &str,
) -> anyhow::Result<LibrarySearchRebuildResult>
where
    F: FnMut(&'static str, usize, usize, &str),
{
    db::init_database_at(database_path)?;
    let mut indexed_books = 0;
    let mut failed_books = 0;
    let mut no_text_books = 0;
    let total = books.len();

    for (index, book) in books.iter().enumerate() {
        if canceled.load(Ordering::Acquire) {
            on_progress("canceled", index, total, "Search indexing canceled");
            return Ok(LibrarySearchRebuildResult {
                operation_id: operation_id.to_string(),
                status: RebuildStatus::Canceled,
                indexed_books,
                failed_books,
                no_text_books,
            });
        }

        on_progress("reading", index, total, &format!("Indexing {}", book.title));
        match index_book_at(database_path, book, canceled) {
            Ok(IndexBookOutcome::Ready) => indexed_books += 1,
            Ok(IndexBookOutcome::NoText) => no_text_books += 1,
            Err(error) => {
                if canceled.load(Ordering::Acquire) {
                    mark_book_pending(database_path, book)?;
                    on_progress("canceled", index, total, "Search indexing canceled");
                    return Ok(LibrarySearchRebuildResult {
                        operation_id: operation_id.to_string(),
                        status: RebuildStatus::Canceled,
                        indexed_books,
                        failed_books,
                        no_text_books,
                    });
                }
                failed_books += 1;
                mark_book_failed(database_path, book, classify_index_error(&error))?;
            }
        }
        on_progress(
            "writing",
            index + 1,
            total,
            &format!("Indexed {}", book.title),
        );
    }

    on_progress("complete", total, total, "Library search index ready");
    Ok(LibrarySearchRebuildResult {
        operation_id: operation_id.to_string(),
        status: RebuildStatus::Completed,
        indexed_books,
        failed_books,
        no_text_books,
    })
}

enum IndexBookOutcome {
    Ready,
    NoText,
}

fn index_book_at(
    database_path: &Path,
    book: &db::Book,
    canceled: &AtomicBool,
) -> anyhow::Result<IndexBookOutcome> {
    if book.availability == db::BookAvailability::Missing || !Path::new(&book.reader_path).is_file()
    {
        bail!("[search-file-missing] reader file is unavailable");
    }

    {
        let conn = Connection::open(database_path)?;
        conn.execute(
            "UPDATE library_search_books SET state='indexing', error_code=NULL, updated_at=CURRENT_TIMESTAMP WHERE book_id=?1",
            [&book.id],
        )?;
    }

    let chunks = match book.reader_format {
        db::ReaderFormat::Txt => extract_txt_chunks(Path::new(&book.reader_path))?,
        db::ReaderFormat::Epub => extract_epub_chunks(Path::new(&book.reader_path))?,
        db::ReaderFormat::Pdf => extract_pdf_chunks(Path::new(&book.reader_path))?,
    };

    if canceled.load(Ordering::Acquire) {
        bail!("[search-index-canceled] search indexing canceled");
    }

    let mut conn = Connection::open(database_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let transaction = conn.transaction()?;
    transaction.execute(
        "DELETE FROM library_search_chunks WHERE book_id=?1",
        [&book.id],
    )?;

    for (index, chunk) in chunks.iter().enumerate() {
        if canceled.load(Ordering::Acquire) {
            bail!("[search-index-canceled] search indexing canceled");
        }
        transaction.execute(
            "INSERT INTO library_search_chunks(book_id, reader_hash, chunk_index, location_json, location_label, text, normalized_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                book.id,
                book.reader_hash,
                index as i64,
                serde_json::to_string(&chunk.target)?,
                chunk.location_label,
                chunk.text,
                normalize_search_text(&chunk.text),
            ],
        )?;
    }

    let state = if chunks.is_empty() {
        "no-text"
    } else {
        "ready"
    };
    transaction.execute(
        "INSERT INTO library_search_books(book_id, reader_hash, state, chunk_count, error_code, indexed_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(book_id) DO UPDATE SET reader_hash=excluded.reader_hash, state=excluded.state,
           chunk_count=excluded.chunk_count, error_code=NULL, indexed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP",
        params![book.id, book.reader_hash, state, chunks.len() as i64],
    )?;
    transaction.commit()?;

    Ok(if chunks.is_empty() {
        IndexBookOutcome::NoText
    } else {
        IndexBookOutcome::Ready
    })
}

fn mark_book_failed(database_path: &Path, book: &db::Book, code: &str) -> anyhow::Result<()> {
    let conn = Connection::open(database_path)?;
    conn.execute(
        "INSERT INTO library_search_books(book_id, reader_hash, state, chunk_count, error_code, indexed_at, updated_at)
         VALUES (?1, ?2, 'failed', 0, ?3, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT(book_id) DO UPDATE SET reader_hash=excluded.reader_hash, state='failed',
           chunk_count=0, error_code=excluded.error_code, indexed_at=NULL, updated_at=CURRENT_TIMESTAMP",
        params![book.id, book.reader_hash, code],
    )?;
    Ok(())
}

fn mark_book_pending(database_path: &Path, book: &db::Book) -> anyhow::Result<()> {
    let conn = Connection::open(database_path)?;
    conn.execute(
        "INSERT INTO library_search_books(book_id, reader_hash, state, chunk_count, error_code, indexed_at, updated_at)
         VALUES (?1, ?2, 'pending', 0, NULL, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT(book_id) DO UPDATE SET reader_hash=excluded.reader_hash, state='pending',
           chunk_count=0, error_code=NULL, indexed_at=NULL, updated_at=CURRENT_TIMESTAMP",
        params![book.id, book.reader_hash],
    )?;
    Ok(())
}

fn classify_index_error(error: &anyhow::Error) -> &'static str {
    let message = error.to_string();
    if message.contains("search-file-missing") {
        "search-file-missing"
    } else if message.contains("pdf") {
        "search-pdf-extraction-failed"
    } else if message.contains("EPUB") || message.contains("epub") {
        "search-epub-extraction-failed"
    } else {
        "search-index-failed"
    }
}

fn search_at(database_path: &Path, query: &str) -> anyhow::Result<LibrarySearchResult> {
    db::init_database_at(database_path)?;
    let query = query.trim();
    if query.is_empty() {
        return Ok(LibrarySearchResult {
            query: String::new(),
            hits: Vec::new(),
            truncated: false,
        });
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        bail!("[library-search-query-too-long] search query exceeds {MAX_QUERY_CHARS} characters");
    }

    let normalized_query = normalize_search_text(query);
    if normalized_query.trim().is_empty() {
        return Ok(LibrarySearchResult {
            query: query.to_string(),
            hits: Vec::new(),
            truncated: false,
        });
    }
    let books = db::list_books_at(database_path)?;
    let conn = Connection::open(database_path)?;
    let mut hits = search_metadata(&books, &normalized_query);
    let remaining = SEARCH_RESULT_LIMIT.saturating_sub(hits.len()) + 1;
    let mut body_hits = search_body(&conn, &normalized_query, remaining)?;
    hits.append(&mut body_hits);
    let truncated = hits.len() > SEARCH_RESULT_LIMIT;
    hits.truncate(SEARCH_RESULT_LIMIT);

    Ok(LibrarySearchResult {
        query: query.to_string(),
        hits,
        truncated,
    })
}

fn search_metadata(books: &[db::Book], normalized_query: &str) -> Vec<LibrarySearchHit> {
    let mut hits = Vec::new();
    for book in books {
        let metadata = format!(
            "{} {}",
            book.title,
            book.author.as_deref().unwrap_or_default()
        );
        let Some(found) = find_original_match(&metadata, normalized_query) else {
            continue;
        };
        let excerpt = build_excerpt(&metadata, found.start, found.end, 28, 48);
        hits.push(LibrarySearchHit {
            id: format!("library-metadata-{}", book.id),
            book_id: book.id.clone(),
            title: book.title.clone(),
            author: book.author.clone(),
            format: book.format,
            reader_format: book.reader_format,
            availability: book.availability,
            excerpt: excerpt.text,
            excerpt_match_start: excerpt.match_start,
            excerpt_match_end: excerpt.match_end,
            location_label: "Title or author".to_string(),
            target: LibrarySearchTarget::Metadata,
        });
        if hits.len() >= SEARCH_RESULT_LIMIT {
            break;
        }
    }
    hits
}

fn search_body(
    conn: &Connection,
    normalized_query: &str,
    limit: usize,
) -> anyhow::Result<Vec<LibrarySearchHit>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let use_fts = normalized_query.chars().count() >= 3;
    let sql = if use_fts {
        "SELECT c.id, c.book_id, c.text, c.location_json, c.location_label,
                COALESCE(m.user_title, b.title), COALESCE(m.user_author, b.author),
                b.format, b.file_hash, b.library_path, d.path, d.file_hash
         FROM library_search_fts f
         JOIN library_search_chunks c ON c.id=f.rowid
         JOIN books b ON b.id=c.book_id
         LEFT JOIN book_user_metadata m ON m.book_id=b.id
         LEFT JOIN book_derivatives d ON d.book_id=b.id
         WHERE library_search_fts MATCH ?1
         ORDER BY bm25(library_search_fts), c.book_id, c.chunk_index
         LIMIT ?2"
    } else {
        "SELECT c.id, c.book_id, c.text, c.location_json, c.location_label,
                COALESCE(m.user_title, b.title), COALESCE(m.user_author, b.author),
                b.format, b.file_hash, b.library_path, d.path, d.file_hash
         FROM library_search_chunks c
         JOIN books b ON b.id=c.book_id
         LEFT JOIN book_user_metadata m ON m.book_id=b.id
         LEFT JOIN book_derivatives d ON d.book_id=b.id
         WHERE instr(c.normalized_text, ?1) > 0
         ORDER BY c.book_id, c.chunk_index
         LIMIT ?2"
    };
    let parameter = if use_fts {
        format!("\"{}\"", normalized_query.replace('"', "\"\""))
    } else {
        normalized_query.to_string()
    };
    // Search extra chunks because one chunk can contain multiple matches while
    // overlapping chunks may describe the same original occurrence.
    let row_limit = limit.saturating_mul(8).saturating_add(16).min(1_024);
    let mut statement = conn.prepare(sql)?;
    let rows = statement.query_map(params![parameter, row_limit as i64], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, Option<String>>(10)?,
            row.get::<_, Option<String>>(11)?,
        ))
    })?;
    let mut hits = Vec::new();
    let mut seen_targets = HashSet::new();

    for row in rows {
        let (
            chunk_id,
            book_id,
            text,
            target_json,
            location_label,
            title,
            author,
            format,
            file_hash,
            library_path,
            derivative_path,
            derivative_hash,
        ) = row?;
        let book_format = parse_book_format(&format)?;
        let (reader_format, reader_path, _reader_hash) = match book_format {
            db::BookFormat::Mobi | db::BookFormat::Azw3 => (
                db::ReaderFormat::Epub,
                derivative_path.unwrap_or_default(),
                derivative_hash.unwrap_or_default(),
            ),
            db::BookFormat::Epub => (db::ReaderFormat::Epub, library_path, file_hash),
            db::BookFormat::Txt => (db::ReaderFormat::Txt, library_path, file_hash),
            db::BookFormat::Pdf => (db::ReaderFormat::Pdf, library_path, file_hash),
        };
        let availability = if Path::new(&reader_path).is_file() {
            db::BookAvailability::Available
        } else {
            db::BookAvailability::Missing
        };
        let base_target: LibrarySearchTarget = serde_json::from_str(&target_json)?;
        for found in find_original_matches(&text, normalized_query) {
            let local_char_offset = text[..found.start].chars().count();
            let mut target = base_target.clone();
            match &mut target {
                LibrarySearchTarget::Txt { char_offset }
                | LibrarySearchTarget::Epub { char_offset, .. }
                | LibrarySearchTarget::Pdf { char_offset, .. } => {
                    *char_offset += local_char_offset;
                }
                LibrarySearchTarget::Metadata => {}
            }
            let target_key = format!("{book_id}:{}", serde_json::to_string(&target)?);
            if !seen_targets.insert(target_key) {
                continue;
            }
            let excerpt = build_excerpt(&text, found.start, found.end, 48, 72);
            hits.push(LibrarySearchHit {
                id: format!("library-content-{chunk_id}-{}", found.start),
                book_id: book_id.clone(),
                title: title.clone(),
                author: author.clone(),
                format: book_format,
                reader_format,
                availability,
                excerpt: excerpt.text,
                excerpt_match_start: excerpt.match_start,
                excerpt_match_end: excerpt.match_end,
                location_label: location_label.clone(),
                target,
            });
            if hits.len() >= limit {
                break;
            }
        }
        if hits.len() >= limit {
            break;
        }
    }

    assign_match_indices(&mut hits);
    Ok(hits)
}

fn assign_match_indices(hits: &mut [LibrarySearchHit]) {
    let mut groups: HashMap<String, Vec<(usize, usize)>> = HashMap::new();
    for (index, hit) in hits.iter().enumerate() {
        match &hit.target {
            LibrarySearchTarget::Epub {
                href, char_offset, ..
            } => groups
                .entry(format!("{}:epub:{href}", hit.book_id))
                .or_default()
                .push((index, *char_offset)),
            LibrarySearchTarget::Pdf {
                page, char_offset, ..
            } => groups
                .entry(format!("{}:pdf:{page}", hit.book_id))
                .or_default()
                .push((index, *char_offset)),
            _ => {}
        }
    }
    for group in groups.values_mut() {
        group.sort_by_key(|(_, char_offset)| *char_offset);
        for (match_index, (hit_index, _)) in group.iter().enumerate() {
            match &mut hits[*hit_index].target {
                LibrarySearchTarget::Epub {
                    match_index: value, ..
                }
                | LibrarySearchTarget::Pdf {
                    match_index: value, ..
                } => {
                    *value = match_index;
                }
                _ => {}
            }
        }
    }
}

fn parse_book_format(value: &str) -> anyhow::Result<db::BookFormat> {
    match value {
        "epub" => Ok(db::BookFormat::Epub),
        "txt" => Ok(db::BookFormat::Txt),
        "pdf" => Ok(db::BookFormat::Pdf),
        "mobi" => Ok(db::BookFormat::Mobi),
        "azw3" => Ok(db::BookFormat::Azw3),
        _ => bail!("[library-search-invalid-format] invalid indexed format"),
    }
}

fn extract_txt_chunks(path: &Path) -> anyhow::Result<Vec<SearchChunk>> {
    let text = db::read_txt_text_at(path)?;
    Ok(chunk_text(
        &text,
        |char_offset| LibrarySearchTarget::Txt { char_offset },
        |_| "Text".to_string(),
    ))
}

fn extract_pdf_chunks(path: &Path) -> anyhow::Result<Vec<SearchChunk>> {
    let pages = pdf_extract::extract_text_by_pages(path)
        .with_context(|| format!("failed to extract PDF text from {}", path.display()))?;
    let mut chunks = Vec::new();
    for (index, text) in pages.into_iter().enumerate() {
        let page = index + 1;
        chunks.extend(chunk_text(
            &text,
            |char_offset| LibrarySearchTarget::Pdf {
                page,
                char_offset,
                match_index: 0,
            },
            |_| format!("Page {page}"),
        ));
    }
    Ok(chunks)
}

fn extract_epub_chunks(path: &Path) -> anyhow::Result<Vec<SearchChunk>> {
    let file = File::open(path)
        .with_context(|| format!("failed to open EPUB for indexing at {}", path.display()))?;
    let mut archive = ZipArchive::new(file).context("invalid EPUB ZIP")?;
    let container = read_epub_entry(&mut archive, "META-INF/container.xml")?;
    let rootfile = capture_first(&container, r#"(?i)full-path\s*=\s*["']([^"']+)["']"#)
        .context("EPUB container has no OPF rootfile")?;
    let opf = read_epub_entry(&mut archive, &rootfile)?;
    let base = Path::new(&rootfile)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let manifest = parse_epub_manifest(&opf);
    let spine = parse_epub_spine(&opf);
    let mut chunks = Vec::new();

    for idref in spine {
        let Some(href) = manifest.get(&idref) else {
            continue;
        };
        let entry_path = resolve_epub_entry(base, href)?;
        let html = read_epub_entry(&mut archive, &entry_path)?;
        let text = html_to_search_text(&html);
        let title = capture_first(&html, r"(?is)<title[^>]*>(.*?)</title>")
            .map(|value| html_to_search_text(&value))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| href.clone());
        chunks.extend(chunk_text(
            &text,
            |char_offset| LibrarySearchTarget::Epub {
                href: href.clone(),
                char_offset,
                match_index: 0,
            },
            |_| title.clone(),
        ));
    }
    Ok(chunks)
}

fn chunk_text<T, L>(text: &str, mut target: T, mut label: L) -> Vec<SearchChunk>
where
    T: FnMut(usize) -> LibrarySearchTarget,
    L: FnMut(usize) -> String,
{
    let char_boundaries: Vec<usize> = text
        .char_indices()
        .map(|(index, _)| index)
        .chain(std::iter::once(text.len()))
        .collect();
    let total_chars = char_boundaries.len().saturating_sub(1);
    let mut chunks = Vec::new();
    let mut start_char = 0;

    while start_char < total_chars {
        let end_char = (start_char + SEARCH_CHUNK_CHARS).min(total_chars);
        let value = &text[char_boundaries[start_char]..char_boundaries[end_char]];
        if !value.trim().is_empty() {
            chunks.push(SearchChunk {
                text: value.to_string(),
                location_label: label(start_char),
                target: target(start_char),
            });
        }
        if end_char == total_chars {
            break;
        }
        start_char = end_char.saturating_sub(SEARCH_CHUNK_OVERLAP);
    }

    chunks
}

fn read_epub_entry(archive: &mut ZipArchive<File>, name: &str) -> anyhow::Result<String> {
    let mut entry = archive
        .by_name(name)
        .with_context(|| format!("EPUB entry is missing: {name}"))?;
    if entry.enclosed_name().is_none() {
        bail!("unsafe EPUB entry path");
    }
    if entry.size() > 32 * 1024 * 1024 {
        bail!("EPUB text entry exceeds indexing limit");
    }
    let mut value = String::new();
    entry.read_to_string(&mut value)?;
    Ok(value)
}

fn parse_epub_manifest(opf: &str) -> HashMap<String, String> {
    let item_re = Regex::new(r"(?is)<item\b([^>]*)>").expect("item regex");
    let attr_re =
        Regex::new(r#"([A-Za-z_:][\w:.-]*)\s*=\s*["']([^"']*)["']"#).expect("attribute regex");
    let mut manifest = HashMap::new();
    for item in item_re.captures_iter(opf) {
        let attrs: HashMap<String, String> = attr_re
            .captures_iter(item.get(1).map(|value| value.as_str()).unwrap_or_default())
            .filter_map(|capture| {
                Some((
                    capture.get(1)?.as_str().to_ascii_lowercase(),
                    capture.get(2)?.as_str().to_string(),
                ))
            })
            .collect();
        if let (Some(id), Some(href)) = (attrs.get("id"), attrs.get("href")) {
            let media_type = attrs
                .get("media-type")
                .map(String::as_str)
                .unwrap_or_default();
            if media_type.contains("html") || href.ends_with(".xhtml") || href.ends_with(".html") {
                manifest.insert(id.clone(), href.clone());
            }
        }
    }
    manifest
}

fn parse_epub_spine(opf: &str) -> Vec<String> {
    let itemref_re = Regex::new(r"(?is)<itemref\b([^>]*)>").expect("itemref regex");
    let idref_re = Regex::new(r#"(?i)idref\s*=\s*["']([^"']+)["']"#).expect("idref regex");
    itemref_re
        .captures_iter(opf)
        .filter_map(|capture| {
            idref_re
                .captures(capture.get(1)?.as_str())?
                .get(1)
                .map(|value| value.as_str().to_string())
        })
        .collect()
}

fn resolve_epub_entry(base: &Path, href: &str) -> anyhow::Result<String> {
    let href = href.split(['#', '?']).next().unwrap_or_default();
    let decoded = percent_decode(href)?;
    let joined = base.join(decoded);
    let mut normalized = PathBuf::new();
    for component in joined.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    bail!("unsafe EPUB manifest path");
                }
            }
            _ => bail!("unsafe EPUB manifest path"),
        }
    }
    Ok(normalized.to_string_lossy().replace('\\', "/"))
}

fn percent_decode(value: &str) -> anyhow::Result<String> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                bail!("invalid percent encoding in EPUB path");
            }
            let pair = std::str::from_utf8(&bytes[index + 1..index + 3])?;
            output.push(u8::from_str_radix(pair, 16)?);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    Ok(String::from_utf8(output)?)
}

fn html_to_search_text(html: &str) -> String {
    let hidden_re = Regex::new(
        r"(?is)(?:<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<noscript\b[^>]*>.*?</noscript\s*>)",
    )
    .expect("hidden HTML regex");
    let without_hidden = hidden_re.replace_all(html, " ");
    let with_boundaries = Regex::new(r"(?i)</?(?:p|div|section|article|li|h[1-6]|tr|br)\b[^>]*>")
        .expect("block HTML regex")
        .replace_all(&without_hidden, "\n");
    let no_tags = Regex::new(r"(?s)<[^>]+>")
        .expect("HTML tag regex")
        .replace_all(&with_boundaries, "");
    decode_html_entities(&no_tags)
}

fn decode_html_entities(value: &str) -> String {
    let common = value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'");
    let numeric = Regex::new(r"&#(x[0-9A-Fa-f]+|[0-9]+);").expect("entity regex");
    numeric
        .replace_all(&common, |captures: &regex::Captures<'_>| {
            let raw = captures
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let parsed = raw
                .strip_prefix('x')
                .map(|hex| u32::from_str_radix(hex, 16))
                .unwrap_or_else(|| raw.parse::<u32>());
            parsed
                .ok()
                .and_then(char::from_u32)
                .map(|value| value.to_string())
                .unwrap_or_else(|| captures[0].to_string())
        })
        .into_owned()
}

fn capture_first(value: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()?
        .captures(value)?
        .get(1)
        .map(|capture| capture.as_str().to_string())
}

#[derive(Debug)]
struct OriginalMatch {
    start: usize,
    end: usize,
}

struct NormalizedWithMap {
    text: String,
    source_starts: Vec<usize>,
    source_ends: Vec<usize>,
}

fn normalize_search_text(value: &str) -> String {
    normalize_with_map(value).text
}

fn find_original_match(value: &str, normalized_query: &str) -> Option<OriginalMatch> {
    find_original_matches(value, normalized_query)
        .into_iter()
        .next()
}

fn find_original_matches(value: &str, normalized_query: &str) -> Vec<OriginalMatch> {
    if normalized_query.is_empty() {
        return Vec::new();
    }
    let normalized = normalize_with_map(value);
    let mut matches = Vec::new();
    let mut search_start = 0;
    while search_start < normalized.text.len() {
        let Some(relative_index) = normalized.text[search_start..].find(normalized_query) else {
            break;
        };
        let index = search_start + relative_index;
        let last = index + normalized_query.len() - 1;
        let (Some(start), Some(end)) = (
            normalized.source_starts.get(index),
            normalized.source_ends.get(last),
        ) else {
            break;
        };
        matches.push(OriginalMatch {
            start: *start,
            end: *end,
        });
        search_start = index + normalized_query.len();
    }
    matches
}

fn normalize_with_map(value: &str) -> NormalizedWithMap {
    let mut text = String::new();
    let mut source_starts = Vec::new();
    let mut source_ends = Vec::new();
    let mut segments: Vec<(usize, usize, String)> = Vec::new();

    for (start, character) in value.char_indices() {
        let end = start + character.len_utf8();
        if is_combining_mark(character) {
            if let Some(segment) = segments.last_mut() {
                segment.1 = end;
                segment.2.push(character);
                continue;
            }
        }
        segments.push((start, end, character.to_string()));
    }

    for (start, end, segment) in segments {
        let folded: String = segment
            .nfkc()
            .flat_map(char::to_uppercase)
            .flat_map(char::to_lowercase)
            .nfkc()
            .collect();
        if folded.chars().all(char::is_whitespace) {
            if text.ends_with(' ') {
                if let Some(last_end) = source_ends.last_mut() {
                    *last_end = end;
                }
                continue;
            }
            text.push(' ');
            source_starts.push(start);
            source_ends.push(end);
            continue;
        }
        text.push_str(&folded);
        for _ in 0..folded.len() {
            source_starts.push(start);
            source_ends.push(end);
        }
    }

    NormalizedWithMap {
        text,
        source_starts,
        source_ends,
    }
}

struct SearchExcerpt {
    text: String,
    match_start: usize,
    match_end: usize,
}

fn build_excerpt(
    value: &str,
    match_start: usize,
    match_end: usize,
    before: usize,
    after: usize,
) -> SearchExcerpt {
    let start = previous_char_boundary(value, match_start, before);
    let end = next_char_boundary(value, match_end, after);
    let prefix = if start > 0 { "..." } else { "" };
    let suffix = if end < value.len() { "..." } else { "" };
    let body = &value[start..end];
    SearchExcerpt {
        text: format!("{prefix}{body}{suffix}"),
        match_start: prefix.len() + match_start - start,
        match_end: prefix.len() + match_end - start,
    }
}

fn previous_char_boundary(value: &str, byte: usize, count: usize) -> usize {
    value[..byte]
        .char_indices()
        .rev()
        .nth(count.saturating_sub(1))
        .map(|(index, _)| index)
        .unwrap_or(0)
}

fn next_char_boundary(value: &str, byte: usize, count: usize) -> usize {
    value[byte..]
        .char_indices()
        .nth(count)
        .map(|(index, _)| byte + index)
        .unwrap_or(value.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write};

    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    #[test]
    fn unicode_normalization_maps_to_original_bytes() {
        for (value, query, expected) in [
            ("历史是人民写的", "历史是人民写的", "历史是人民写的"),
            (
                "Un café déjà vu",
                "CAFE\u{301} DE\u{301}JA\u{300}",
                "café déjà",
            ),
            ("Straße", "STRASSE", "Straße"),
            ("الكتاب في المكتبة", "الكتاب", "الكتاب"),
        ] {
            let query = normalize_search_text(query);
            let found = find_original_match(value, &query).expect("match");
            assert_eq!(&value[found.start..found.end], expected);
        }
    }

    #[test]
    fn repeated_matches_keep_distinct_original_offsets() {
        let value = "历史由人民书写；人民也保存记忆。";
        let matches = find_original_matches(value, &normalize_search_text("人民"));
        assert_eq!(matches.len(), 2);
        assert_ne!(matches[0].start, matches[1].start);
        assert!(matches
            .iter()
            .all(|found| &value[found.start..found.end] == "人民"));
    }

    #[test]
    fn html_extraction_keeps_multilingual_text_and_hides_scripts() {
        let text = html_to_search_text(
            "<p>历史是<em>人民</em>写的。</p><script>hidden phrase</script><p>Un café.</p>",
        );
        assert!(text.contains("历史是人民写的。"));
        assert!(text.contains("Un café."));
        assert!(!text.contains("hidden phrase"));
    }

    #[test]
    fn chunks_overlap_without_splitting_utf8() {
        let text = "人".repeat(8_500);
        let chunks = chunk_text(
            &text,
            |offset| LibrarySearchTarget::Txt {
                char_offset: offset,
            },
            |_| "Text".to_string(),
        );
        assert_eq!(chunks.len(), 3);
        assert!(chunks
            .iter()
            .all(|chunk| chunk.text.is_char_boundary(chunk.text.len())));
    }

    #[test]
    fn txt_index_round_trip_handles_short_cjk_accents_and_case_folding() {
        let temp = tempdir().expect("temp dir");
        let database_path = temp.path().join("reader.sqlite3");
        let library_dir = temp.path().join("library");
        let source = temp.path().join("fixture.txt");
        fs::write(
            &source,
            "序章里说，历史是人民写的。\nUn café déjà vu.\nDie Straße bleibt.",
        )
        .expect("write txt");
        let imported =
            db::import_book_at(&database_path, &library_dir, &source).expect("import txt");
        let status = get_status_at(&database_path).expect("pending status");
        assert_eq!(status.pending_books, 1);

        let result = rebuild_at(
            &database_path,
            &[imported.book],
            &AtomicBool::new(false),
            |_, _, _, _| {},
            "search-test",
        )
        .expect("rebuild");
        assert_eq!(result.status, RebuildStatus::Completed);

        for query in ["人民", "CAFE\u{301} DE\u{301}JA\u{300}", "STRASSE"] {
            let result = search_at(&database_path, query).expect("search");
            assert_eq!(result.hits.len(), 1, "query {query}");
            assert!(matches!(
                result.hits[0].target,
                LibrarySearchTarget::Txt { .. }
            ));
        }
        let ready = get_status_at(&database_path).expect("ready status");
        assert_eq!(ready.indexed_books, 1);
        assert_eq!(ready.pending_books, 0);
    }

    #[test]
    fn canceled_rebuild_returns_the_active_book_to_pending() {
        let temp = tempdir().expect("temp dir");
        let database_path = temp.path().join("reader.sqlite3");
        let library_dir = temp.path().join("library");
        let source = temp.path().join("fixture.txt");
        fs::write(&source, "A searchable local document.").expect("write txt");
        let imported =
            db::import_book_at(&database_path, &library_dir, &source).expect("import txt");
        let canceled = AtomicBool::new(false);

        let result = rebuild_at(
            &database_path,
            &[imported.book],
            &canceled,
            |phase, _, _, _| {
                if phase == "reading" {
                    canceled.store(true, Ordering::Release);
                }
            },
            "search-cancel-test",
        )
        .expect("canceled rebuild");

        assert_eq!(result.status, RebuildStatus::Canceled);
        let status = get_status_at(&database_path).expect("pending status");
        assert_eq!(status.pending_books, 1);
        assert_eq!(status.failed_books, 0);
    }

    #[test]
    fn epub_spine_extraction_keeps_inline_text_together() {
        let temp = tempdir().expect("temp dir");
        let path = temp.path().join("fixture.epub");
        let file = File::create(&path).expect("create epub");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        zip.start_file("META-INF/container.xml", options)
            .expect("container entry");
        zip.write_all(
            br#"<container><rootfiles><rootfile full-path="OPS/package.opf" /></rootfiles></container>"#,
        )
        .expect("container");
        zip.start_file("OPS/package.opf", options)
            .expect("opf entry");
        zip.write_all(
            br#"<package><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" /></manifest><spine><itemref idref="chapter" /></spine></package>"#,
        )
        .expect("opf");
        zip.start_file("OPS/chapter.xhtml", options)
            .expect("chapter entry");
        zip.write_all(
            "<html><head><title>序章</title></head><body><p>历史是<em>人民</em>写的。</p><p>Un café déjà vu.</p></body></html>"
                .as_bytes(),
        )
        .expect("chapter");
        zip.finish().expect("finish epub");

        let chunks = extract_epub_chunks(&path).expect("extract epub");
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.contains("历史是人民写的。"));
        assert!(chunks[0].text.contains("Un café déjà vu."));
        assert!(matches!(
            &chunks[0].target,
            LibrarySearchTarget::Epub { href, .. } if href == "chapter.xhtml"
        ));
    }
}
