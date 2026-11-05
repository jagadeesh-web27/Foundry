//! Text extraction for search indexing and "read/summarize this file".
//!
//! Plain text and code are read directly. Office formats are ZIP archives of XML (DOCX, XLSX, PPTX,
//! ODT/ODS/ODP), so their text is pulled from the relevant XML parts. PDFs use the `pdf-extract`
//! crate, isolated with `catch_unwind` because malformed PDFs can make it panic.
//! Nothing here ever invents text: an unsupported or unreadable file yields `None`.

use std::io::Read;
use std::path::Path;

/// Files larger than this are not opened for text extraction (metadata is still indexed).
pub const MAX_DOCUMENT_BYTES: u64 = 30 * 1024 * 1024;
/// Plain-text files: only the beginning is read.
const MAX_TEXT_READ_BYTES: usize = 512 * 1024;

const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "rtf", "tex",
    "rs", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "java", "go", "c", "h", "cpp", "hpp", "cs", "kt", "swift", "php",
    "rb", "sh", "ps1", "sql", "css", "scss", "vue", "svelte", "dart", "r", "m", "scala", "lua",
];
const MARKUP_EXTENSIONS: &[&str] = &["html", "htm", "xml", "svg"];

/// True when Foundry knows how to extract text from files with this extension.
pub fn is_extractable(ext: &str) -> bool {
    let ext = ext.to_lowercase();
    TEXT_EXTENSIONS.contains(&ext.as_str())
        || MARKUP_EXTENSIONS.contains(&ext.as_str())
        || matches!(ext.as_str(), "pdf" | "docx" | "xlsx" | "pptx" | "odt" | "ods" | "odp")
}

/// Extract up to `max_chars` characters of text. `Ok(None)` means "no text available" (unsupported,
/// image-only PDF, empty); `Err` means the file could not be read.
pub fn extract_text(path: &Path, max_chars: usize) -> Result<Option<String>, String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !is_extractable(&ext) {
        return Ok(None);
    }
    let size = std::fs::metadata(path).map_err(|e| format!("Cannot read file: {e}"))?.len();
    let text = match ext.as_str() {
        "pdf" | "docx" | "xlsx" | "pptx" | "odt" | "ods" | "odp" => {
            if size > MAX_DOCUMENT_BYTES {
                return Ok(None);
            }
            let bytes = std::fs::read(path).map_err(|e| format!("Cannot read file: {e}"))?;
            match ext.as_str() {
                "pdf" => pdf_text(&bytes)?,
                "docx" => office_text(&bytes, &["word/document.xml"], "w:p")?,
                "pptx" => office_text(&bytes, &["ppt/slides/slide"], "a:p")?,
                "xlsx" => office_text(&bytes, &["xl/sharedStrings.xml"], "si")?,
                _ => office_text(&bytes, &["content.xml"], "text:p")?,
            }
        }
        _ => {
            let mut buf = Vec::with_capacity(size.min(MAX_TEXT_READ_BYTES as u64) as usize);
            std::fs::File::open(path)
                .and_then(|f| f.take(MAX_TEXT_READ_BYTES as u64).read_to_end(&mut buf))
                .map_err(|e| format!("Cannot read file: {e}"))?;
            let text = decode_text(&buf);
            if MARKUP_EXTENSIONS.contains(&ext.as_str()) {
                xml_to_text(&text, "p")
            } else {
                text
            }
        }
    };
    let cleaned = normalize_whitespace(&text);
    if cleaned.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(truncate_chars(&cleaned, max_chars)))
}

/// Longest time one PDF may take. Some malformed PDFs make the parser loop for a very long time; without
/// a limit, one such file would stop all text extraction.
const PDF_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);
/// PDF reads that overran the limit and are still running in the background.
static OVERRUNNING_PDF_READS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

enum ReadState {
    Running,
    Done,
    Abandoned,
}

fn pdf_text(bytes: &[u8]) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    use std::sync::{Arc, Mutex};
    // A thread cannot be killed; cap how many overrunning reads may linger.
    if OVERRUNNING_PDF_READS.load(Ordering::SeqCst) >= 2 {
        return Err("PDF reader is busy with documents that are taking too long".to_string());
    }
    let owned = bytes.to_vec();
    let state = Arc::new(Mutex::new(ReadState::Running));
    let (tx, rx) = std::sync::mpsc::channel();
    let thread_state = Arc::clone(&state);
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(move || pdf_extract::extract_text_from_mem(&owned));
        let mut s = thread_state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*s, ReadState::Abandoned) {
            OVERRUNNING_PDF_READS.fetch_sub(1, Ordering::SeqCst);
        } else {
            *s = ReadState::Done;
            let _ = tx.send(result);
        }
    });
    match rx.recv_timeout(PDF_TIMEOUT) {
        Ok(Ok(Ok(text))) => Ok(text),
        Ok(_) => Ok(String::new()), // parser error or panic: no extractable text
        Err(_) => {
            let mut s = state.lock().unwrap_or_else(|e| e.into_inner());
            if matches!(*s, ReadState::Done) {
                drop(s);
                return match rx.try_recv() {
                    Ok(Ok(Ok(text))) => Ok(text),
                    _ => Ok(String::new()),
                };
            }
            *s = ReadState::Abandoned;
            OVERRUNNING_PDF_READS.fetch_add(1, Ordering::SeqCst);
            Err("PDF took too long to read".to_string())
        }
    }
}

/// Read the XML parts whose names start with any of `prefixes` from an Office/ODF zip and turn them
/// into text, starting a new line at each `paragraph_tag`.
fn office_text(bytes: &[u8], prefixes: &[&str], paragraph_tag: &str) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("Not a valid document: {e}"))?;
    let mut names: Vec<String> = archive
        .file_names()
        .filter_map(|n| n.ok().map(|n| n.to_string()))
        .filter(|n| n.ends_with(".xml") && prefixes.iter().any(|p| n.starts_with(p)))
        .collect();
    // slide2.xml before slide10.xml
    names.sort_by_key(|n| (n.len(), n.clone()));
    let mut out = String::new();
    for name in names {
        let mut xml = String::new();
        if let Ok(mut file) = archive.by_name(&name) {
            let _ = file.by_ref().take(16 * 1024 * 1024).read_to_string(&mut xml);
        }
        out.push_str(&xml_to_text(&xml, paragraph_tag));
        out.push('\n');
    }
    Ok(out)
}

fn decode_text(buf: &[u8]) -> String {
    if buf.starts_with(&[0xFF, 0xFE]) || buf.starts_with(&[0xFE, 0xFF]) {
        let le = buf[0] == 0xFF;
        let units: Vec<u16> = buf[2..]
            .chunks_exact(2)
            .map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) })
            .collect();
        return String::from_utf16_lossy(&units);
    }
    let start = if buf.starts_with(&[0xEF, 0xBB, 0xBF]) { 3 } else { 0 };
    String::from_utf8_lossy(&buf[start..]).to_string()
}

/// Strip XML/HTML tags, decode entities and keep paragraph breaks. Script/style bodies are dropped.
pub fn xml_to_text(xml: &str, paragraph_tag: &str) -> String {
    let mut out = String::with_capacity(xml.len() / 2);
    let lower_xml = xml.to_lowercase();
    let close_para = format!("</{}", paragraph_tag.to_lowercase());
    let mut i = 0;
    let bytes = xml.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let rest = &lower_xml[i..];
            for skip in ["<script", "<style"] {
                if rest.starts_with(skip) {
                    let close = format!("</{}", &skip[1..]);
                    if let Some(end) = rest.find(&close) {
                        i += end;
                    }
                }
            }
            let tag_end = match xml[i..].find('>') {
                Some(e) => i + e + 1,
                None => break,
            };
            let tag = &lower_xml[i..tag_end];
            if tag.starts_with(&close_para) || tag.starts_with("<br") || tag.starts_with("</li") || tag.starts_with("</tr")
                || tag.starts_with("</h") || tag.starts_with("</div")
            {
                out.push('\n');
            } else if tag.starts_with("<w:tab") || tag.starts_with("<text:tab") || tag.starts_with("</td") {
                out.push(' ');
            }
            i = tag_end;
        } else {
            let next = xml[i..].find('<').map(|n| i + n).unwrap_or(bytes.len());
            out.push_str(&decode_entities(&xml[i..next]));
            i = next;
        }
    }
    out
}

fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let tail = &rest[amp..];
        let Some(semi) = tail.find(';').filter(|&p| p <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..semi];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            _ if entity.starts_with("#x") || entity.starts_with("#X") => u32::from_str_radix(&entity[2..], 16).ok().and_then(char::from_u32),
            _ if entity.starts_with('#') => entity[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &tail[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Collapse runs of spaces/tabs, keep at most one blank line, drop control characters.
fn normalize_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_lines = 0;
    for line in text.lines() {
        let collapsed: String = line
            .split(|c: char| c.is_whitespace() || (c.is_control() && c != '\n'))
            .filter(|w| !w.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if collapsed.is_empty() {
            blank_lines += 1;
            if blank_lines == 1 && !out.is_empty() {
                out.push('\n');
            }
            continue;
        }
        blank_lines = 0;
        out.push_str(&collapsed);
        out.push('\n');
    }
    out
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => s[..idx].to_string(),
        None => s.to_string(),
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::io::Write;

    /// Build a minimal .docx (only the parts the extractor reads).
    pub fn write_docx(path: &Path, paragraphs: &[&str]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("word/document.xml", opts).unwrap();
        let body: String = paragraphs
            .iter()
            .map(|p| format!("<w:p><w:r><w:t xml:space=\"preserve\">{p}</w:t></w:r></w:p>"))
            .collect();
        write!(zip, "<?xml version=\"1.0\"?><w:document><w:body>{body}</w:body></w:document>").unwrap();
        zip.finish().unwrap();
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("foundry_extract_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extracts_docx_paragraphs() {
        let dir = temp_dir("docx");
        let p = dir.join("Resume.docx");
        write_docx(&p, &["Jagadeesh Boya", "Accessibility tester &amp; React developer"]);
        let text = extract_text(&p, 10_000).unwrap().unwrap();
        assert!(text.contains("Jagadeesh Boya\n"));
        assert!(text.contains("Accessibility tester & React developer"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn extracts_plain_text_and_html() {
        let dir = temp_dir("text");
        std::fs::write(dir.join("notes.md"), "# Quarterly plan\n\nShip   the  React   hooks guide.").unwrap();
        std::fs::write(dir.join("page.html"), "<html><style>p{}</style><body><p>Hello&nbsp;world</p><p>Second</p></body></html>").unwrap();
        assert_eq!(extract_text(&dir.join("notes.md"), 1000).unwrap().unwrap(), "# Quarterly plan\n\nShip the React hooks guide.\n");
        let html = extract_text(&dir.join("page.html"), 1000).unwrap().unwrap();
        assert!(html.contains("Hello world\nSecond"));
        assert!(!html.contains("p{}"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unsupported_and_broken_files_yield_no_text() {
        let dir = temp_dir("broken");
        std::fs::write(dir.join("photo.jpg"), [0xFF, 0xD8, 0xFF]).unwrap();
        std::fs::write(dir.join("fake.docx"), b"not a zip").unwrap();
        std::fs::write(dir.join("fake.pdf"), b"%PDF-1.4 garbage").unwrap();
        assert_eq!(extract_text(&dir.join("photo.jpg"), 100).unwrap(), None);
        assert!(extract_text(&dir.join("fake.docx"), 100).is_err());
        assert_eq!(extract_text(&dir.join("fake.pdf"), 100).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn truncation_respects_char_boundaries() {
        assert_eq!(truncate_chars("ಕನ್ನಡ text", 3), "ಕನ್");
    }
}
