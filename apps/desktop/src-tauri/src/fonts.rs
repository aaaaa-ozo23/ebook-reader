use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{bail, Context};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::db;

const MAX_FONT_BYTES: u64 = 20 * 1024 * 1024;
const DEFAULT_FONT_FAMILY: &str =
    "\"Noto Serif SC\", \"Songti SC\", \"Microsoft YaHei\", Georgia, serif";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFont {
    pub id: String,
    pub family_name: String,
    pub style_name: String,
    pub file_name: String,
    pub file_path: String,
    pub file_hash: String,
    pub file_size: u64,
    pub family_alias: String,
    pub enabled: bool,
    pub imported_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FontImportStatus {
    Imported,
    Duplicate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCustomFontResult {
    pub status: FontImportStatus,
    pub font: CustomFont,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFontPreview {
    pub family_name: String,
    pub style_name: String,
    pub file_name: String,
    pub file_size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duplicate_font: Option<CustomFont>,
}

#[derive(Debug)]
struct ParsedFont {
    family_name: String,
    style_name: String,
    extension: &'static str,
}

pub fn list_custom_fonts(app: &AppHandle) -> anyhow::Result<Vec<CustomFont>> {
    let database_path = db::init_app_database(app)?;
    list_custom_fonts_at(&database_path)
}

pub fn import_custom_font(
    app: &AppHandle,
    source_path: &Path,
) -> anyhow::Result<ImportCustomFontResult> {
    let database_path = db::init_app_database(app)?;
    let font_dir = app
        .path()
        .app_data_dir()
        .context("[font-storage-unavailable] failed to resolve app data directory")?
        .join("fonts");
    import_custom_font_at(&database_path, &font_dir, source_path)
}

pub fn inspect_custom_font(
    app: &AppHandle,
    source_path: &Path,
) -> anyhow::Result<CustomFontPreview> {
    let database_path = db::init_app_database(app)?;
    inspect_custom_font_at(&database_path, source_path)
}

pub fn set_custom_font_enabled(
    app: &AppHandle,
    font_id: &str,
    enabled: bool,
) -> anyhow::Result<CustomFont> {
    let database_path = db::init_app_database(app)?;
    set_custom_font_enabled_at(&database_path, font_id, enabled)
}

pub fn remove_custom_font(app: &AppHandle, font_id: &str) -> anyhow::Result<()> {
    let database_path = db::init_app_database(app)?;
    remove_custom_font_at(&database_path, font_id)
}

pub(crate) fn list_custom_fonts_at(database_path: &Path) -> anyhow::Result<Vec<CustomFont>> {
    db::get_reader_theme_at(database_path)?;
    let conn = Connection::open(database_path)?;
    let mut statement = conn.prepare(
        "SELECT id, family_name, style_name, file_name, file_path, file_hash, file_size,
                family_alias, enabled, imported_at, updated_at
         FROM custom_fonts
         ORDER BY family_name COLLATE NOCASE, style_name COLLATE NOCASE, id",
    )?;
    let fonts = statement
        .query_map([], custom_font_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(fonts)
}

pub(crate) fn import_custom_font_at(
    database_path: &Path,
    font_dir: &Path,
    source_path: &Path,
) -> anyhow::Result<ImportCustomFontResult> {
    if !source_path.is_file() {
        bail!("[font-file-missing] choose an existing TTF or OTF file");
    }
    let metadata = fs::metadata(source_path)?;
    if metadata.len() == 0 || metadata.len() > MAX_FONT_BYTES {
        bail!("[font-file-too-large] font files must be between 1 byte and 20 MiB");
    }
    let bytes = fs::read(source_path).context("[font-read-failed] failed to read font file")?;
    let parsed = parse_static_font(source_path, &bytes)?;
    let file_hash = hex::encode(Sha256::digest(&bytes));
    let id = format!("font-{}", &file_hash[..32]);
    let family_alias = format!("EbookReaderFont_{}", &file_hash[..16]);

    db::get_reader_theme_at(database_path)?;
    let conn = Connection::open(database_path)?;
    if let Some(existing) = find_font_by_hash(&conn, &file_hash)? {
        return Ok(ImportCustomFontResult {
            status: FontImportStatus::Duplicate,
            font: existing,
        });
    }

    fs::create_dir_all(font_dir)
        .context("[font-storage-failed] failed to create private font directory")?;
    let destination = font_dir.join(format!("{file_hash}.{}", parsed.extension));
    let temporary = font_dir.join(format!(".{file_hash}.{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temporary, &bytes).context("[font-write-failed] failed to stage font file")?;
    if destination.exists() {
        let existing_hash = hex::encode(Sha256::digest(fs::read(&destination)?));
        if existing_hash != file_hash {
            let _ = fs::remove_file(&temporary);
            bail!("[font-content-conflict] managed font path contains different data");
        }
        let _ = fs::remove_file(&temporary);
    } else if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = fs::remove_file(&temporary);
        return Err(error).context("[font-commit-failed] failed to commit font file");
    }

    let file_name = source_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| format!("{}.{}", parsed.family_name, parsed.extension));
    let now: String =
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })?;
    if let Err(error) = conn.execute(
        "INSERT INTO custom_fonts (
            id, family_name, style_name, file_name, file_path, file_hash, file_size,
            family_alias, enabled, imported_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9)",
        params![
            &id,
            &parsed.family_name,
            &parsed.style_name,
            &file_name,
            destination.display().to_string(),
            &file_hash,
            metadata.len() as i64,
            &family_alias,
            &now,
        ],
    ) {
        let _ = fs::remove_file(&destination);
        return Err(error).context("[font-database-failed] failed to register custom font");
    }
    let font = find_font_by_hash(&conn, &file_hash)?
        .context("[font-database-failed] imported font record is missing")?;
    Ok(ImportCustomFontResult {
        status: FontImportStatus::Imported,
        font,
    })
}

pub(crate) fn inspect_custom_font_at(
    database_path: &Path,
    source_path: &Path,
) -> anyhow::Result<CustomFontPreview> {
    if !source_path.is_file() {
        bail!("[font-file-missing] choose an existing TTF or OTF file");
    }
    let metadata = fs::metadata(source_path)?;
    if metadata.len() == 0 || metadata.len() > MAX_FONT_BYTES {
        bail!("[font-file-too-large] font files must be between 1 byte and 20 MiB");
    }
    let bytes = fs::read(source_path).context("[font-read-failed] failed to read font file")?;
    let parsed = parse_static_font(source_path, &bytes)?;
    let file_hash = hex::encode(Sha256::digest(&bytes));
    db::get_reader_theme_at(database_path)?;
    let conn = Connection::open(database_path)?;
    Ok(CustomFontPreview {
        family_name: parsed.family_name,
        style_name: parsed.style_name,
        file_name: source_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Custom font".to_string()),
        file_size: metadata.len(),
        duplicate_font: find_font_by_hash(&conn, &file_hash)?,
    })
}

pub(crate) fn set_custom_font_enabled_at(
    database_path: &Path,
    font_id: &str,
    enabled: bool,
) -> anyhow::Result<CustomFont> {
    db::get_reader_theme_at(database_path)?;
    let mut conn = Connection::open(database_path)?;
    let transaction = conn.transaction()?;
    let changed = transaction.execute(
        "UPDATE custom_fonts SET enabled = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
        params![enabled, font_id],
    )?;
    if changed == 0 {
        bail!("[font-not-found] custom font was not found");
    }
    if !enabled {
        clear_selected_font(&transaction, font_id)?;
    }
    transaction.commit()?;
    find_font_by_id(&conn, font_id)?.context("[font-not-found] custom font was not found")
}

pub(crate) fn remove_custom_font_at(database_path: &Path, font_id: &str) -> anyhow::Result<()> {
    db::get_reader_theme_at(database_path)?;
    let mut conn = Connection::open(database_path)?;
    let font =
        find_font_by_id(&conn, font_id)?.context("[font-not-found] custom font was not found")?;
    let font_path = PathBuf::from(&font.file_path);
    let tombstone = font_path.with_extension(format!("removed-{}", uuid::Uuid::new_v4()));
    if font_path.exists() {
        fs::rename(&font_path, &tombstone)
            .context("[font-remove-failed] failed to stage font removal")?;
    }
    let transaction = conn.transaction()?;
    let result = (|| -> anyhow::Result<()> {
        clear_selected_font(&transaction, font_id)?;
        transaction.execute("DELETE FROM custom_fonts WHERE id = ?1", [font_id])?;
        transaction.commit()?;
        Ok(())
    })();
    if let Err(error) = result {
        if tombstone.exists() {
            let _ = fs::rename(&tombstone, &font_path);
        }
        return Err(error);
    }
    if tombstone.exists() {
        fs::remove_file(tombstone).context("[font-remove-failed] failed to remove font file")?;
    }
    Ok(())
}

fn clear_selected_font(transaction: &Transaction<'_>, font_id: &str) -> anyhow::Result<()> {
    let saved: Option<(String, String)> = transaction
        .query_row(
            "SELECT value_json, updated_at FROM app_settings WHERE key = 'reader_theme'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((value_json, _)) = saved else {
        return Ok(());
    };
    let mut value: Value = serde_json::from_str(&value_json)?;
    if value.get("fontId").and_then(Value::as_str) != Some(font_id) {
        return Ok(());
    }
    if let Some(object) = value.as_object_mut() {
        object.remove("fontId");
        object.insert(
            "fontFamily".to_string(),
            Value::String(DEFAULT_FONT_FAMILY.to_string()),
        );
    }
    transaction.execute(
        "UPDATE app_settings SET value_json = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key = 'reader_theme'",
        [serde_json::to_string(&value)?],
    )?;
    Ok(())
}

fn find_font_by_hash(conn: &Connection, file_hash: &str) -> anyhow::Result<Option<CustomFont>> {
    Ok(conn
        .query_row(
            "SELECT id, family_name, style_name, file_name, file_path, file_hash, file_size,
                    family_alias, enabled, imported_at, updated_at
             FROM custom_fonts WHERE file_hash = ?1",
            [file_hash],
            custom_font_from_row,
        )
        .optional()?)
}

fn find_font_by_id(conn: &Connection, font_id: &str) -> anyhow::Result<Option<CustomFont>> {
    Ok(conn
        .query_row(
            "SELECT id, family_name, style_name, file_name, file_path, file_hash, file_size,
                    family_alias, enabled, imported_at, updated_at
             FROM custom_fonts WHERE id = ?1",
            [font_id],
            custom_font_from_row,
        )
        .optional()?)
}

fn custom_font_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CustomFont> {
    Ok(CustomFont {
        id: row.get(0)?,
        family_name: row.get(1)?,
        style_name: row.get(2)?,
        file_name: row.get(3)?,
        file_path: row.get(4)?,
        file_hash: row.get(5)?,
        file_size: row.get::<_, i64>(6)? as u64,
        family_alias: row.get(7)?,
        enabled: row.get(8)?,
        imported_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn parse_static_font(path: &Path, bytes: &[u8]) -> anyhow::Result<ParsedFont> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| anyhow::anyhow!("[font-format-unsupported] choose a TTF or OTF file"))?;
    if !matches!(extension.as_str(), "ttf" | "otf") {
        bail!("[font-format-unsupported] v0.3 accepts static TTF and OTF files only");
    }
    if bytes.len() < 12 {
        bail!("[font-invalid] font container is truncated");
    }
    let signature = &bytes[..4];
    if signature != [0, 1, 0, 0] && signature != b"OTTO" {
        bail!("[font-invalid] file is not a static TrueType or OpenType font");
    }
    let num_tables = read_u16(bytes, 4)? as usize;
    if num_tables == 0 || 12 + num_tables * 16 > bytes.len() {
        bail!("[font-invalid] font table directory is invalid");
    }
    let mut tables = HashMap::<[u8; 4], (usize, usize)>::new();
    for index in 0..num_tables {
        let base = 12 + index * 16;
        let tag: [u8; 4] = bytes[base..base + 4].try_into().expect("four-byte tag");
        let offset = read_u32(bytes, base + 8)? as usize;
        let length = read_u32(bytes, base + 12)? as usize;
        if length == 0
            || offset
                .checked_add(length)
                .is_none_or(|end| end > bytes.len())
        {
            bail!("[font-invalid] font table points outside the file");
        }
        if tables.insert(tag, (offset, length)).is_some() {
            bail!("[font-invalid] font contains duplicate tables");
        }
    }
    for required in [*b"name", *b"cmap", *b"head"] {
        if !tables.contains_key(&required) {
            bail!("[font-invalid] required font table is missing");
        }
    }
    if !tables.contains_key(b"glyf")
        && !tables.contains_key(b"CFF ")
        && !tables.contains_key(b"CFF2")
    {
        bail!("[font-invalid] font has no supported static outline table");
    }
    let (name_offset, name_length) = tables[b"name"];
    let (family_name, style_name) =
        parse_name_table(&bytes[name_offset..name_offset + name_length])?;
    Ok(ParsedFont {
        family_name,
        style_name,
        extension: if signature == b"OTTO" { "otf" } else { "ttf" },
    })
}

fn parse_name_table(table: &[u8]) -> anyhow::Result<(String, String)> {
    if table.len() < 6 {
        bail!("[font-invalid] name table is truncated");
    }
    let count = read_u16(table, 2)? as usize;
    let storage_offset = read_u16(table, 4)? as usize;
    if 6 + count * 12 > table.len() || storage_offset > table.len() {
        bail!("[font-invalid] name table records are invalid");
    }
    let mut family: Option<(u8, String)> = None;
    let mut style: Option<(u8, String)> = None;
    for index in 0..count {
        let base = 6 + index * 12;
        let platform = read_u16(table, base)?;
        let language = read_u16(table, base + 4)?;
        let name_id = read_u16(table, base + 6)?;
        if !matches!(name_id, 1 | 2 | 16 | 17) {
            continue;
        }
        let length = read_u16(table, base + 8)? as usize;
        let offset = storage_offset + read_u16(table, base + 10)? as usize;
        if offset
            .checked_add(length)
            .is_none_or(|end| end > table.len())
        {
            bail!("[font-invalid] name string points outside the table");
        }
        let Some(decoded) = decode_name(platform, &table[offset..offset + length]) else {
            continue;
        };
        let cleaned: String = decoded
            .chars()
            .filter(|character| !character.is_control())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if cleaned.is_empty() || cleaned.chars().count() > 128 {
            continue;
        }
        let score =
            u8::from(matches!(name_id, 16 | 17)) * 2 + u8::from(matches!(language, 0 | 0x0409));
        let slot = if matches!(name_id, 1 | 16) {
            &mut family
        } else {
            &mut style
        };
        if slot.as_ref().is_none_or(|(current, _)| score > *current) {
            *slot = Some((score, cleaned));
        }
    }
    let family = family
        .map(|(_, value)| value)
        .context("[font-invalid] font family name is missing")?;
    let style = style
        .map(|(_, value)| value)
        .unwrap_or_else(|| "Regular".to_string());
    Ok((family, style))
}

fn decode_name(platform: u16, bytes: &[u8]) -> Option<String> {
    if matches!(platform, 0 | 3) {
        if bytes.len() % 2 != 0 {
            return None;
        }
        let units = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]));
        return String::from_utf16(&units.collect::<Vec<_>>()).ok();
    }
    Some(bytes.iter().map(|byte| char::from(*byte)).collect())
}

fn read_u16(bytes: &[u8], offset: usize) -> anyhow::Result<u16> {
    let value = bytes
        .get(offset..offset + 2)
        .context("[font-invalid] font structure is truncated")?;
    Ok(u16::from_be_bytes([value[0], value[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> anyhow::Result<u32> {
    let value = bytes
        .get(offset..offset + 4)
        .context("[font-invalid] font structure is truncated")?;
    Ok(u32::from_be_bytes([value[0], value[1], value[2], value[3]]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, ReaderThemeMode};
    use tempfile::tempdir;

    #[test]
    fn imports_lists_and_deduplicates_a_static_font() {
        let directory = tempdir().expect("temp dir");
        let database_path = directory.path().join("reader.db");
        let font_dir = directory.path().join("fonts");
        let source = directory.path().join("Quiet Serif.ttf");
        fs::write(&source, test_font("Quiet Serif", "Regular")).expect("font fixture");

        let imported =
            import_custom_font_at(&database_path, &font_dir, &source).expect("import static font");
        assert_eq!(imported.status, FontImportStatus::Imported);
        assert_eq!(imported.font.family_name, "Quiet Serif");
        assert!(Path::new(&imported.font.file_path).is_file());

        let duplicate =
            import_custom_font_at(&database_path, &font_dir, &source).expect("deduplicate font");
        assert_eq!(duplicate.status, FontImportStatus::Duplicate);
        assert_eq!(duplicate.font.id, imported.font.id);
        assert_eq!(list_custom_fonts_at(&database_path).expect("list").len(), 1);

        let preview = inspect_custom_font_at(&database_path, &source).expect("preview");
        assert_eq!(
            preview.duplicate_font.map(|font| font.id),
            Some(imported.font.id)
        );
    }

    #[test]
    fn rejects_unsupported_and_malformed_font_files() {
        let directory = tempdir().expect("temp dir");
        let database_path = directory.path().join("reader.db");
        let font_dir = directory.path().join("fonts");
        let unsupported = directory.path().join("font.woff2");
        fs::write(&unsupported, test_font("Quiet Serif", "Regular")).expect("fixture");
        let invalid = directory.path().join("font.ttf");
        fs::write(&invalid, b"not a font").expect("invalid fixture");

        let unsupported_error = import_custom_font_at(&database_path, &font_dir, &unsupported)
            .expect_err("woff2 rejected")
            .to_string();
        assert!(unsupported_error.contains("font-format-unsupported"));
        let invalid_error = import_custom_font_at(&database_path, &font_dir, &invalid)
            .expect_err("invalid rejected")
            .to_string();
        assert!(invalid_error.contains("font-invalid"));
        assert!(!font_dir.exists());
    }

    #[test]
    fn disabling_and_removing_the_selected_font_restores_the_default() {
        let directory = tempdir().expect("temp dir");
        let database_path = directory.path().join("reader.db");
        let font_dir = directory.path().join("fonts");
        let source = directory.path().join("Quiet Serif.ttf");
        fs::write(&source, test_font("Quiet Serif", "Regular")).expect("fixture");
        let imported = import_custom_font_at(&database_path, &font_dir, &source)
            .expect("import")
            .font;
        let mut theme = db::get_reader_theme_at(&database_path).expect("theme");
        theme.mode = ReaderThemeMode::Sepia;
        theme.font_id = Some(imported.id.clone());
        theme.font_family = format!("\"{}\"", imported.family_alias);
        db::save_reader_theme_at(&database_path, &theme).expect("select font");

        let disabled =
            set_custom_font_enabled_at(&database_path, &imported.id, false).expect("disable");
        assert!(!disabled.enabled);
        let fallback = db::get_reader_theme_at(&database_path).expect("fallback");
        assert_eq!(fallback.font_id, None);
        assert_eq!(fallback.font_family, DEFAULT_FONT_FAMILY);

        set_custom_font_enabled_at(&database_path, &imported.id, true).expect("enable");
        remove_custom_font_at(&database_path, &imported.id).expect("remove");
        assert!(list_custom_fonts_at(&database_path)
            .expect("list")
            .is_empty());
        assert!(!Path::new(&imported.file_path).exists());
    }

    fn test_font(family: &str, style: &str) -> Vec<u8> {
        let family_bytes = utf16_be(family);
        let style_bytes = utf16_be(style);
        let mut name = Vec::new();
        name.extend_from_slice(&0_u16.to_be_bytes());
        name.extend_from_slice(&2_u16.to_be_bytes());
        name.extend_from_slice(&30_u16.to_be_bytes());
        for (name_id, length, offset) in [
            (1_u16, family_bytes.len() as u16, 0_u16),
            (2_u16, style_bytes.len() as u16, family_bytes.len() as u16),
        ] {
            name.extend_from_slice(&3_u16.to_be_bytes());
            name.extend_from_slice(&1_u16.to_be_bytes());
            name.extend_from_slice(&0x0409_u16.to_be_bytes());
            name.extend_from_slice(&name_id.to_be_bytes());
            name.extend_from_slice(&length.to_be_bytes());
            name.extend_from_slice(&offset.to_be_bytes());
        }
        name.extend_from_slice(&family_bytes);
        name.extend_from_slice(&style_bytes);

        let tables: [([u8; 4], Vec<u8>); 4] = [
            (*b"name", name),
            (*b"cmap", vec![0, 0, 0, 0]),
            (*b"head", vec![0, 0, 0, 0]),
            (*b"glyf", vec![0, 0, 0, 0]),
        ];
        let directory_len = 12 + tables.len() * 16;
        let mut output = vec![0_u8; directory_len];
        output[..4].copy_from_slice(&[0, 1, 0, 0]);
        output[4..6].copy_from_slice(&(tables.len() as u16).to_be_bytes());
        let mut offset = directory_len;
        for (index, (tag, bytes)) in tables.into_iter().enumerate() {
            let base = 12 + index * 16;
            output[base..base + 4].copy_from_slice(&tag);
            output[base + 8..base + 12].copy_from_slice(&(offset as u32).to_be_bytes());
            output[base + 12..base + 16].copy_from_slice(&(bytes.len() as u32).to_be_bytes());
            output.extend_from_slice(&bytes);
            offset += bytes.len();
        }
        output
    }

    fn utf16_be(value: &str) -> Vec<u8> {
        value.encode_utf16().flat_map(u16::to_be_bytes).collect()
    }
}
