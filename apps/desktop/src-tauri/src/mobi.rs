// Stage 14.2 keeps this prototype behind an internal boundary until the 14.3
// import service wires it into production commands.
#![allow(dead_code)]

use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};

use anyhow::{bail, Context};
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::{CompressionMethod, ZipArchive};

pub const CONVERTER_ID: &str = "libmobi";
pub const CONVERTER_VERSION: &str = "0.12";
const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_EPUB_ENTRIES: usize = 20_000;
const MAX_EPUB_ENTRY_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_EPUB_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 200;
const MAX_XML_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PROCESS_LOG_BYTES: u64 = 256 * 1024;
const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(25);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MobiSourceFormat {
    Mobi,
    Azw3,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MobiSourceInspection {
    pub format: MobiSourceFormat,
    pub bytes: u64,
    pub record_count: u16,
    pub encryption_type: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobiConversionArtifact {
    pub source_format: MobiSourceFormat,
    pub staging_dir: PathBuf,
    pub epub_path: PathBuf,
    pub epub_hash: String,
    pub epub_bytes: u64,
    pub converter_id: &'static str,
    pub converter_version: &'static str,
    pub elapsed_ms: u128,
}

impl MobiConversionArtifact {
    pub fn cleanup(self) -> anyhow::Result<()> {
        if self.staging_dir.exists() {
            fs::remove_dir_all(&self.staging_dir).with_context(|| {
                format!(
                    "[mobi-cleanup-failed] failed to remove {}",
                    self.staging_dir.display()
                )
            })?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct MobiConversionService {
    converter_path: PathBuf,
    timeout: Duration,
}

impl MobiConversionService {
    pub fn new(converter_path: impl Into<PathBuf>, timeout: Duration) -> Self {
        Self {
            converter_path: converter_path.into(),
            timeout,
        }
    }

    pub fn convert(
        &self,
        source_path: &Path,
        staging_root: &Path,
        operation_id: &str,
        canceled: &AtomicBool,
    ) -> anyhow::Result<MobiConversionArtifact> {
        let started = Instant::now();
        if canceled.load(Ordering::Acquire) {
            bail!("[mobi-conversion-canceled] conversion canceled before preflight");
        }
        let source_path = source_path.canonicalize().with_context(|| {
            format!(
                "[mobi-source-missing] source file is unavailable: {}",
                source_path.display()
            )
        })?;
        let inspection = inspect_mobi_source(&source_path)?;
        if !self.converter_path.is_file() {
            bail!(
                "[mobi-converter-missing] bundled converter is unavailable: {}",
                self.converter_path.display()
            );
        }

        fs::create_dir_all(staging_root).with_context(|| {
            format!(
                "[mobi-staging-failed] could not create staging root {}",
                staging_root.display()
            )
        })?;
        let staging_dir = staging_root.join(format!(
            "mobi-{}-{}",
            safe_operation_fragment(operation_id),
            Uuid::new_v4()
        ));
        let output_dir = staging_dir.join("output");
        fs::create_dir_all(&output_dir).with_context(|| {
            format!(
                "[mobi-staging-failed] could not create {}",
                output_dir.display()
            )
        })?;

        let result = (|| {
            if canceled.load(Ordering::Acquire) {
                bail!("[mobi-conversion-canceled] conversion canceled before launch");
            }
            let stdout_path = staging_dir.join("mobitool.stdout.log");
            let stderr_path = staging_dir.join("mobitool.stderr.log");
            let args = vec![
                "-e".to_string(),
                "-o".to_string(),
                process_path_arg(&output_dir),
                process_path_arg(&source_path),
            ];
            let status = run_process(
                &self.converter_path,
                &args,
                &stdout_path,
                &stderr_path,
                canceled,
                self.timeout,
            )?;
            if !status.success() {
                let stderr = read_log(&stderr_path);
                let stdout = read_log(&stdout_path);
                bail!(
                    "[mobi-conversion-failed] mobitool exited with {}: {}{}",
                    status,
                    stderr,
                    stdout
                );
            }
            if canceled.load(Ordering::Acquire) {
                bail!("[mobi-conversion-canceled] conversion canceled after process exit");
            }

            let epub_path = find_single_epub(&output_dir)?;
            let validated = validate_epub(&epub_path)?;
            Ok(MobiConversionArtifact {
                source_format: inspection.format,
                staging_dir: staging_dir.clone(),
                epub_path,
                epub_hash: validated.sha256,
                epub_bytes: validated.bytes,
                converter_id: CONVERTER_ID,
                converter_version: CONVERTER_VERSION,
                elapsed_ms: started.elapsed().as_millis(),
            })
        })();

        if result.is_err() && staging_dir.exists() {
            let _ = fs::remove_dir_all(&staging_dir);
        }
        result
    }
}

pub fn inspect_mobi_source(path: &Path) -> anyhow::Result<MobiSourceInspection> {
    let format = match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mobi") => MobiSourceFormat::Mobi,
        Some("azw3") => MobiSourceFormat::Azw3,
        _ => bail!("[mobi-source-invalid] only .mobi and .azw3 are supported"),
    };
    let metadata = fs::metadata(path)
        .with_context(|| format!("[mobi-source-missing] could not read {}", path.display()))?;
    if !metadata.is_file() || metadata.len() < 94 || metadata.len() > MAX_SOURCE_BYTES {
        bail!("[mobi-source-invalid] source must be between 94 bytes and {MAX_SOURCE_BYTES} bytes");
    }

    let mut file = File::open(path)
        .with_context(|| format!("[mobi-source-missing] could not open {}", path.display()))?;
    let mut palm_header = [0_u8; 82];
    file.read_exact(&mut palm_header)
        .context("[mobi-source-invalid] PalmDB header is truncated")?;
    let type_and_creator = &palm_header[60..68];
    if type_and_creator != b"BOOKMOBI" && type_and_creator != b"TEXtREAd" {
        bail!("[mobi-source-invalid] PalmDB type/creator is not a supported MOBI signature");
    }
    let record_count = u16::from_be_bytes([palm_header[76], palm_header[77]]);
    if record_count == 0 {
        bail!("[mobi-source-invalid] PalmDB contains no records");
    }
    let first_record = u32::from_be_bytes([
        palm_header[78],
        palm_header[79],
        palm_header[80],
        palm_header[81],
    ]) as u64;
    if first_record < 82 || first_record.saturating_add(16) > metadata.len() {
        bail!("[mobi-source-invalid] PalmDOC record 0 offset is invalid");
    }
    file.seek(SeekFrom::Start(first_record))?;
    let mut palmdoc_header = [0_u8; 16];
    file.read_exact(&mut palmdoc_header)
        .context("[mobi-source-invalid] PalmDOC header is truncated")?;
    let encryption_type = u16::from_be_bytes([palmdoc_header[12], palmdoc_header[13]]);
    if encryption_type != 0 {
        bail!(
            "[mobi-drm-unsupported] this ebook is DRM-protected; Ebook Reader will not remove DRM"
        );
    }
    Ok(MobiSourceInspection {
        format,
        bytes: metadata.len(),
        record_count,
        encryption_type,
    })
}

fn process_path_arg(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc}");
        }
        if let Some(drive_path) = value.strip_prefix(r"\\?\") {
            return drive_path.to_string();
        }
    }
    value.into_owned()
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ValidatedEpub {
    bytes: u64,
    sha256: String,
}

fn validate_epub(path: &Path) -> anyhow::Result<ValidatedEpub> {
    let metadata = fs::metadata(path).context("[mobi-output-invalid] EPUB output is missing")?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_EPUB_ENTRY_BYTES {
        bail!("[mobi-output-invalid] EPUB output size is unsafe");
    }
    let file = File::open(path).context("[mobi-output-invalid] could not open EPUB output")?;
    let mut archive = ZipArchive::new(file)
        .context("[mobi-output-invalid] converter output is not a readable EPUB ZIP")?;
    if archive.is_empty() || archive.len() > MAX_EPUB_ENTRIES {
        bail!("[mobi-output-invalid] EPUB entry count is unsafe");
    }

    let mut names = HashSet::new();
    let mut total_uncompressed = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .context("[mobi-output-invalid] could not inspect EPUB entry")?;
        let name = entry.name().to_string();
        validate_archive_name(&name)?;
        if !names.insert(name.clone()) {
            bail!("[mobi-output-invalid] EPUB contains duplicate entry {name}");
        }
        if entry.size() > MAX_EPUB_ENTRY_BYTES {
            bail!("[mobi-output-invalid] EPUB entry {name} is too large");
        }
        total_uncompressed = total_uncompressed
            .checked_add(entry.size())
            .context("[mobi-output-invalid] EPUB size overflow")?;
        if total_uncompressed > MAX_EPUB_TOTAL_BYTES {
            bail!("[mobi-output-invalid] EPUB uncompressed size is too large");
        }
        if entry.size() > 0
            && (entry.compressed_size() == 0
                || entry.size() / entry.compressed_size().max(1) > MAX_COMPRESSION_RATIO)
        {
            bail!("[mobi-output-invalid] EPUB entry {name} has an unsafe compression ratio");
        }
    }

    {
        let first = archive
            .by_index(0)
            .context("[mobi-output-invalid] EPUB has no first entry")?;
        if first.name() != "mimetype" || first.compression() != CompressionMethod::Stored {
            bail!("[mobi-output-invalid] EPUB mimetype must be the first uncompressed entry");
        }
    }
    let mimetype = read_zip_entry(&mut archive, "mimetype", 128)?;
    if mimetype != b"application/epub+zip" {
        bail!("[mobi-output-invalid] EPUB mimetype is invalid");
    }
    let container = read_zip_entry(&mut archive, "META-INF/container.xml", MAX_XML_BYTES)?;
    let container = std::str::from_utf8(&container)
        .context("[mobi-output-invalid] container.xml is not UTF-8")?;
    let rootfile = Regex::new(r#"(?i)full-path\s*=\s*[\"']([^\"']+)[\"']"#)
        .expect("rootfile regex")
        .captures(container)
        .and_then(|captures| captures.get(1))
        .map(|capture| capture.as_str())
        .context("[mobi-output-invalid] container.xml has no rootfile")?;
    validate_archive_name(rootfile)?;
    if !names.contains(rootfile) {
        bail!("[mobi-output-invalid] EPUB rootfile is missing: {rootfile}");
    }
    let opf = read_zip_entry(&mut archive, rootfile, MAX_XML_BYTES)?;
    let opf = std::str::from_utf8(&opf).context("[mobi-output-invalid] OPF is not UTF-8")?;
    if !opf.contains("<package") || !opf.contains("<manifest") || !opf.contains("<spine") {
        bail!("[mobi-output-invalid] OPF package structure is incomplete");
    }
    if !names.iter().any(|name| {
        let lower = name.to_ascii_lowercase();
        lower.ends_with(".xhtml") || lower.ends_with(".html")
    }) {
        bail!("[mobi-output-invalid] EPUB contains no readable content document");
    }

    Ok(ValidatedEpub {
        bytes: metadata.len(),
        sha256: hash_file(path)?,
    })
}

fn find_single_epub(output_dir: &Path) -> anyhow::Result<PathBuf> {
    let mut candidates = fs::read_dir(output_dir)
        .context("[mobi-output-invalid] converter output directory is unreadable")?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("epub"))
        })
        .collect::<Vec<_>>();
    candidates.sort();
    if candidates.len() != 1 {
        bail!(
            "[mobi-output-invalid] converter produced {} EPUB files; expected exactly one",
            candidates.len()
        );
    }
    Ok(candidates.remove(0))
}

fn run_process(
    executable: &Path,
    args: &[String],
    stdout_path: &Path,
    stderr_path: &Path,
    canceled: &AtomicBool,
    timeout: Duration,
) -> anyhow::Result<ExitStatus> {
    let stdout =
        File::create(stdout_path).context("[mobi-conversion-failed] stdout unavailable")?;
    let stderr =
        File::create(stderr_path).context("[mobi-conversion-failed] stderr unavailable")?;
    let mut child = Command::new(executable)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .with_context(|| {
            format!(
                "[mobi-converter-missing] could not launch {}",
                executable.display()
            )
        })?;
    let started = Instant::now();
    loop {
        if canceled.load(Ordering::Acquire) {
            let _ = child.kill();
            let _ = child.wait();
            bail!("[mobi-conversion-canceled] conversion canceled");
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            bail!("[mobi-conversion-timeout] conversion exceeded {timeout:?}");
        }
        if let Some(status) = child
            .try_wait()
            .context("[mobi-conversion-failed] could not poll converter")?
        {
            return Ok(status);
        }
        thread::sleep(PROCESS_POLL_INTERVAL);
    }
}

fn read_zip_entry(
    archive: &mut ZipArchive<File>,
    name: &str,
    limit: u64,
) -> anyhow::Result<Vec<u8>> {
    let entry = archive
        .by_name(name)
        .with_context(|| format!("[mobi-output-invalid] missing EPUB entry {name}"))?;
    if entry.size() > limit {
        bail!("[mobi-output-invalid] EPUB entry {name} exceeds its read limit");
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .with_context(|| format!("[mobi-output-invalid] could not read EPUB entry {name}"))?;
    if bytes.len() as u64 > limit {
        bail!("[mobi-output-invalid] EPUB entry {name} exceeds its read limit");
    }
    Ok(bytes)
}

fn validate_archive_name(name: &str) -> anyhow::Result<()> {
    if name.is_empty() || name.contains('\\') || name.contains('\0') {
        bail!("[mobi-output-invalid] EPUB contains an unsafe entry name");
    }
    let path = Path::new(name);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || name.split('/').any(|component| component == "..")
        || name
            .split('/')
            .next()
            .is_some_and(|component| component.contains(':'))
    {
        bail!("[mobi-output-invalid] EPUB entry path is unsafe: {name}");
    }
    Ok(())
}

fn hash_file(path: &Path) -> anyhow::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn read_log(path: &Path) -> String {
    let Ok(file) = File::open(path) else {
        return String::new();
    };
    let mut bytes = Vec::new();
    let _ = file.take(MAX_PROCESS_LOG_BYTES).read_to_end(&mut bytes);
    let text = String::from_utf8_lossy(&bytes).trim().to_string();
    if text.is_empty() {
        String::new()
    } else {
        format!("{text}; ")
    }
}

fn safe_operation_fragment(operation_id: &str) -> String {
    let fragment = operation_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .take(32)
        .collect::<String>();
    if fragment.is_empty() {
        "operation".to_string()
    } else {
        fragment
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/libmobi")
            .join(name)
    }

    fn converter() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/mobitool-x86_64-pc-windows-msvc.exe")
    }

    fn replace_ascii_with_utf8_fixture(source: &Path, destination: &Path) {
        let mut bytes = fs::read(source).expect("read fixture");
        let needle = b"This is a sample for testing libmobi project";
        let mut replacement = "中文测试".as_bytes().to_vec();
        replacement.resize(needle.len(), b' ');
        let mut replacements = 0;
        for offset in 0..=bytes.len().saturating_sub(needle.len()) {
            if &bytes[offset..offset + needle.len()] == needle {
                bytes[offset..offset + needle.len()].copy_from_slice(&replacement);
                replacements += 1;
            }
        }
        assert!(
            replacements >= 2,
            "hybrid fixture must contain both renditions"
        );
        fs::write(destination, bytes).expect("write UTF-8 fixture");
    }

    #[test]
    fn preflight_accepts_drm_free_mobi_and_azw3_extensions() {
        let inspection = inspect_mobi_source(&fixture("sample-ncx.mobi")).expect("mobi");
        assert_eq!(inspection.format, MobiSourceFormat::Mobi);
        assert_eq!(inspection.encryption_type, 0);
        let dir = tempdir().expect("dir");
        let azw3 = dir.path().join("sample.azw3");
        fs::copy(fixture("sample-ncx.mobi"), &azw3).expect("copy");
        let inspection = inspect_mobi_source(&azw3).expect("azw3");
        assert_eq!(inspection.format, MobiSourceFormat::Azw3);
        let artifact = MobiConversionService::new(converter(), Duration::from_secs(30))
            .convert(&azw3, dir.path(), "azw3-kf8", &AtomicBool::new(false))
            .expect("convert azw3");
        assert_eq!(artifact.source_format, MobiSourceFormat::Azw3);
        artifact.cleanup().expect("cleanup");
    }

    #[test]
    fn preflight_rejects_drm_before_conversion() {
        let error = inspect_mobi_source(&fixture("sample-drm-v1.mobi"))
            .expect_err("DRM must be rejected")
            .to_string();
        assert!(error.contains("[mobi-drm-unsupported]"));
    }

    #[test]
    fn converts_hybrid_kf8_and_validates_metadata_and_toc() {
        let dir = tempdir().expect("dir");
        let artifact = MobiConversionService::new(converter(), Duration::from_secs(30))
            .convert(
                &fixture("sample-ncx.mobi"),
                dir.path(),
                "hybrid-kf8",
                &AtomicBool::new(false),
            )
            .expect("convert");
        assert_eq!(artifact.source_format, MobiSourceFormat::Mobi);
        assert!(artifact.epub_bytes > 0);
        assert_eq!(artifact.epub_hash.len(), 64);
        let mut archive =
            ZipArchive::new(File::open(&artifact.epub_path).expect("epub")).expect("archive");
        let opf = String::from_utf8(
            read_zip_entry(&mut archive, "OEBPS/content.opf", MAX_XML_BYTES).expect("opf"),
        )
        .expect("utf8");
        assert!(opf.contains("libmobi ncx test"));
        assert!((0..archive.len()).any(|index| archive
            .by_index(index)
            .is_ok_and(|entry| entry.name().to_ascii_lowercase().ends_with(".ncx"))));
        artifact.cleanup().expect("cleanup");
    }

    #[test]
    fn converts_multimedia_and_unicode_without_losing_resources_or_utf8() {
        for name in ["sample-multimedia.mobi", "sample-unicode-uncompressed.mobi"] {
            let dir = tempdir().expect("dir");
            let source = if name.contains("unicode") {
                let source = dir.path().join("sample-chinese.mobi");
                replace_ascii_with_utf8_fixture(&fixture(name), &source);
                source
            } else {
                fixture(name)
            };
            let artifact = MobiConversionService::new(converter(), Duration::from_secs(30))
                .convert(&source, dir.path(), name, &AtomicBool::new(false))
                .expect("convert");
            let mut archive =
                ZipArchive::new(File::open(&artifact.epub_path).expect("epub")).expect("archive");
            let mut has_chinese_text = false;
            let mut has_image = false;
            for index in 0..archive.len() {
                let mut entry = archive.by_index(index).expect("entry");
                let lower = entry.name().to_ascii_lowercase();
                if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") {
                    has_image = true;
                }
                if lower.ends_with(".xhtml") || lower.ends_with(".html") {
                    let mut text = String::new();
                    if entry.read_to_string(&mut text).is_ok() && text.contains("中文测试") {
                        has_chinese_text = true;
                    }
                }
            }
            if name.contains("multimedia") {
                assert!(has_image, "multimedia fixture must retain an image");
            } else {
                assert!(
                    has_chinese_text,
                    "UTF-8 fixture must retain injected Chinese text"
                );
            }
            artifact.cleanup().expect("cleanup");
        }
    }

    #[test]
    fn invalid_source_and_missing_converter_leave_no_staging_residue() {
        let dir = tempdir().expect("dir");
        let source = dir.path().join("broken.mobi");
        fs::write(&source, b"not a mobi").expect("source");
        let staging = dir.path().join("staging");
        let error = MobiConversionService::new(converter(), Duration::from_secs(1))
            .convert(&source, &staging, "broken", &AtomicBool::new(false))
            .expect_err("invalid source")
            .to_string();
        assert!(error.contains("[mobi-source-invalid]"));
        assert!(!staging.exists());

        let error =
            MobiConversionService::new(dir.path().join("missing.exe"), Duration::from_secs(1))
                .convert(
                    &fixture("sample-ncx.mobi"),
                    &staging,
                    "missing",
                    &AtomicBool::new(false),
                )
                .expect_err("missing converter")
                .to_string();
        assert!(error.contains("[mobi-converter-missing]"));
        assert!(!staging.exists());

        let error = MobiConversionService::new(failing_converter(), Duration::from_secs(5))
            .convert(
                &fixture("sample-ncx.mobi"),
                &staging,
                "converter-crash",
                &AtomicBool::new(false),
            )
            .expect_err("non-zero converter")
            .to_string();
        assert!(error.contains("[mobi-conversion-failed]"));
        assert!(
            !staging.exists()
                || fs::read_dir(&staging)
                    .expect("staging root")
                    .next()
                    .is_none(),
            "failed conversion must leave no operation directory"
        );
    }

    #[test]
    fn process_timeout_and_cancellation_kill_the_child() {
        let dir = tempdir().expect("dir");
        let (executable, args) = long_running_command();
        let timeout_error = run_process(
            &executable,
            &args,
            &dir.path().join("timeout.out"),
            &dir.path().join("timeout.err"),
            &AtomicBool::new(false),
            Duration::from_millis(75),
        )
        .expect_err("timeout")
        .to_string();
        assert!(timeout_error.contains("[mobi-conversion-timeout]"));

        let canceled = Arc::new(AtomicBool::new(false));
        let cancel_from_thread = Arc::clone(&canceled);
        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(75));
            cancel_from_thread.store(true, Ordering::Release);
        });
        let cancel_error = run_process(
            &executable,
            &args,
            &dir.path().join("cancel.out"),
            &dir.path().join("cancel.err"),
            &canceled,
            Duration::from_secs(5),
        )
        .expect_err("cancel")
        .to_string();
        handle.join().expect("cancel thread");
        assert!(cancel_error.contains("[mobi-conversion-canceled]"));
    }

    #[test]
    fn epub_validation_rejects_traversal_and_incomplete_packages() {
        assert!(validate_archive_name("../outside.xhtml").is_err());
        assert!(validate_archive_name("C:/outside.xhtml").is_err());
        assert!(validate_archive_name("OEBPS\\outside.xhtml").is_err());

        let dir = tempdir().expect("dir");
        let path = dir.path().join("incomplete.epub");
        let mut writer = ZipWriter::new(File::create(&path).expect("file"));
        writer
            .start_file(
                "mimetype",
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
            )
            .expect("mimetype");
        std::io::Write::write_all(&mut writer, b"application/epub+zip").expect("write");
        writer.finish().expect("finish");
        let error = validate_epub(&path).expect_err("incomplete").to_string();
        assert!(error.contains("[mobi-output-invalid]"));
    }

    #[test]
    fn epub_validation_rejects_duplicate_entries_and_compression_bombs() {
        let dir = tempdir().expect("dir");
        let duplicate = dir.path().join("duplicate.epub");
        let mut writer = ZipWriter::new(File::create(&duplicate).expect("file"));
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        writer.start_file("mimetype", stored).expect("mimetype");
        std::io::Write::write_all(&mut writer, b"application/epub+zip").expect("write");
        writer.start_file("mimetypf", stored).expect("second entry");
        std::io::Write::write_all(&mut writer, b"application/epub+zip").expect("write");
        writer.finish().expect("finish");
        let mut bytes = fs::read(&duplicate).expect("duplicate bytes");
        for offset in 0..=bytes.len().saturating_sub(8) {
            if &bytes[offset..offset + 8] == b"mimetypf" {
                bytes[offset..offset + 8].copy_from_slice(b"mimetype");
            }
        }
        fs::write(&duplicate, bytes).expect("patch duplicate names");
        let error = validate_epub(&duplicate).expect_err("duplicate");
        assert!(error.to_string().contains("[mobi-output-invalid]"));

        let bomb = dir.path().join("bomb.epub");
        let mut writer = ZipWriter::new(File::create(&bomb).expect("file"));
        writer.start_file("mimetype", stored).expect("mimetype");
        std::io::Write::write_all(&mut writer, b"application/epub+zip").expect("write");
        writer
            .start_file(
                "OEBPS/bomb.xhtml",
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
            )
            .expect("bomb");
        std::io::Write::write_all(&mut writer, &vec![0_u8; 1024 * 1024]).expect("write");
        writer.finish().expect("finish");
        let error = validate_epub(&bomb)
            .expect_err("compression bomb")
            .to_string();
        assert!(error.contains("unsafe compression ratio"));
    }

    #[cfg(windows)]
    fn long_running_command() -> (PathBuf, Vec<String>) {
        (
            PathBuf::from("cmd.exe"),
            vec!["/C".into(), "ping 127.0.0.1 -n 6 > nul".into()],
        )
    }

    #[cfg(not(windows))]
    fn long_running_command() -> (PathBuf, Vec<String>) {
        (PathBuf::from("sh"), vec!["-c".into(), "sleep 5".into()])
    }

    #[cfg(windows)]
    fn failing_converter() -> PathBuf {
        Path::new(&std::env::var("WINDIR").expect("WINDIR"))
            .join("System32/WindowsPowerShell/v1.0/powershell.exe")
    }

    #[cfg(not(windows))]
    fn failing_converter() -> PathBuf {
        PathBuf::from("/bin/false")
    }
}
