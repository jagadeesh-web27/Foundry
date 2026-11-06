//! Persistent local file index (desktop).
//!
//! Replaces "walk the disk on every question" with a SQLite database kept in the user's local app-data
//! folder:
//! - `files`: one row per file (path, name, type, size, dates) for fast metadata filters;
//! - `files_fts`: an FTS5 full-text index over file names, folder names and extracted text, ranked with
//!   BM25 (name matches weigh most);
//! - `files_terms`: the FTS5 vocabulary, used to resolve misspelled words ("resme", "adhar").
//!
//! Lifecycle: on startup a background crawl brings the index up to date (only new or changed files are
//! re-read), a file-system watcher applies creations, edits, renames and deletions as they happen, and
//! a low-priority worker extracts text from documents. Searches use the index once the first crawl has
//! completed and fall back to the live disk walk before that.
//! Nothing leaves the device; the database lives next to Foundry's other local data.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};

use crate::filesystem::{classify_file_type, should_ignore_entry, DiscoveredFile};

const MAX_DEPTH: usize = 16;
/// Bump when the schema changes: an older index is dropped and rebuilt (a crawl takes seconds).
const SCHEMA_VERSION: &str = "2";
/// A folder containing one of these is a software project; files below it are project files.
const PROJECT_MARKERS: &[&str] = &[".git", "package.json", "Cargo.toml", "pyproject.toml", "go.mod", "pom.xml", "build.gradle", "composer.json"];
/// Text kept per file: documents keep more than code/data files (keeps the index small).
const MAX_DOCUMENT_CHARS: usize = 40_000;
const MAX_CODE_CHARS: usize = 8_000;
/// File types that are personal documents (as opposed to code, data and other files).
const DOCUMENT_TYPES: &[&str] = &["PDF", "Document", "Spreadsheet", "Presentation"];
const BATCH: usize = 2_000;
/// Below this many exact hits, near-miss spellings are tried as well.
const FUZZY_FALLBACK_BELOW: usize = 5;

// content_state values
const CONTENT_PENDING: i64 = 0;
const CONTENT_INDEXED: i64 = 1;
const CONTENT_NONE: i64 = 2;
const CONTENT_FAILED: i64 = 3;

/// Words that carry no search meaning in requests such as "find my documents about React".
const STOP_WORDS: &[&str] = &[
    "a", "an", "the", "my", "me", "mine", "i", "of", "to", "in", "on", "for", "from", "with", "and", "or", "is", "are",
    "find", "show", "give", "get", "list", "search", "open", "file", "files", "document", "documents", "doc", "docs",
    "folder", "folders", "about", "related", "regarding", "concerning", "containing", "mentioning", "that", "which",
    "all", "any", "some", "please", "present", "system", "computer", "laptop", "device", "phone",
];

#[derive(Debug, Default, Clone)]
pub struct SearchParams {
    pub query: Option<String>,
    pub extension: Option<String>,
    pub file_types: Option<Vec<String>>,
    pub created_after_ms: Option<i64>,
    pub created_before_ms: Option<i64>,
    pub modified_after_ms: Option<i64>,
    pub modified_before_ms: Option<i64>,
    pub scope: Option<String>,
    pub limit: usize,
    pub sort_by: Option<String>,
    pub sort_asc: bool,
    /// The person asked about contents ("documents about X", "files mentioning Y"): content matches of
    /// any file type rank alongside name matches. Otherwise names/folders come first and content is only
    /// a labelled fallback limited to documents.
    pub content: bool,
}

#[derive(Debug, Default, Clone)]
pub struct CrawlStats {
    pub files_seen: usize,
    pub files_changed: usize,
    pub files_removed: usize,
}

#[derive(serde::Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    /// starting | crawling | extracting | ready | error | unavailable
    pub state: String,
    /// Searches are served from the index (true once one full crawl has completed).
    pub ready: bool,
    pub files_indexed: u64,
    pub content_indexed: u64,
    pub content_pending: u64,
    pub content_failed: u64,
    pub scanned_this_crawl: u64,
    pub last_crawl_completed: Option<String>,
    pub watching: bool,
    pub roots: Vec<String>,
    pub error: Option<String>,
}

pub struct Index {
    db_path: PathBuf,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn system_time_ms(t: std::io::Result<SystemTime>) -> Option<i64> {
    t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64)
}

fn ms_to_rfc3339(ms: Option<i64>) -> Option<String> {
    ms.and_then(|ms| chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms)).map(|d| d.to_rfc3339())
}

/// "MyResume2026_final.pdf" -> "MyResume2026_final.pdf My Resume 2026 final pdf" so FTS also finds the
/// camel-case and letter/digit parts.
fn name_terms(name: &str) -> String {
    let split: Vec<String> = name
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(split_word)
        .collect();
    format!("{name} {}", split.join(" "))
}

/// Split "OfferLetter2026" into "Offer Letter 2026". Random-looking codes such as "CvTOvKpR" (hashes in
/// generated file names) are left whole, so they do not produce accidental words like "Cv".
fn split_word(token: &str) -> String {
    let chars: Vec<char> = token.chars().collect();
    let case_flips = chars
        .windows(2)
        .filter(|w| w[0].is_alphabetic() && w[1].is_alphabetic() && w[0].is_uppercase() != w[1].is_uppercase())
        .count();
    if chars.len() >= 4 && case_flips * 2 > chars.len() {
        return token.to_string();
    }
    let mut out = String::with_capacity(token.len() + 4);
    for (i, &c) in chars.iter().enumerate() {
        if i > 0 {
            let p = chars[i - 1];
            let boundary = (p.is_lowercase() && c.is_uppercase())
                || (p.is_alphabetic() && c.is_ascii_digit())
                || (p.is_ascii_digit() && c.is_alphabetic());
            if boundary {
                out.push(' ');
            }
        }
        out.push(c);
    }
    out
}

/// Does `word` (from the request) refer to this file name, allowing aliases and near-miss spellings?
fn word_in_name(word: &str, name: &str) -> bool {
    let lname = name.to_lowercase();
    let resume_like = is_resume_word(word) || crate::fuzzy::words_match(word, "resume");
    lname.contains(stem(word))
        || (resume_like && crate::filesystem::looks_like_resume(name))
        || (word.chars().count() >= 4 && crate::fuzzy::matches_any_token(word, name))
}

fn query_words(query: &str) -> Vec<String> {
    query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && !STOP_WORDS.contains(w))
        .map(|w| w.to_string())
        .collect()
}

fn stem(word: &str) -> &str {
    if word.len() > 3 && word.ends_with('s') && !word.ends_with("ss") {
        &word[..word.len() - 1]
    } else {
        word
    }
}

fn is_resume_word(word: &str) -> bool {
    matches!(word, "resume" | "resumes" | "cv" | "cvs" | "curriculum")
}

/// FTS5 expression for one query word (all characters are alphanumeric, so quoting is safe).
fn word_expr(word: &str) -> String {
    word_expr_in(word, None)
}

/// FTS5 expression for one word, optionally limited to the name and folder columns.
fn word_expr_in(word: &str, names_only: Option<()>) -> String {
    let s = stem(word);
    let term = if s.chars().count() >= 3 { format!("\"{s}\"*") } else { format!("\"{s}\"") };
    let base = if names_only.is_some() { format!("({{name path}} : {term})") } else { term };
    if is_resume_word(word) {
        // Résumé files are often named "..._CV.pdf" or "..._Res.pdf".
        format!("({base} OR ({{name}} : (\"cv\" OR \"res\" OR \"curriculum\"*)))")
    } else {
        base
    }
}

fn names_expr(word: &str) -> String {
    word_expr_in(word, Some(()))
}

fn file_type_filter(types: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for t in types {
        let canonical = match t.to_lowercase().as_str() {
            "pdf" => "PDF",
            "document" => "Document",
            "spreadsheet" => "Spreadsheet",
            "presentation" => "Presentation",
            "image" => "Image",
            "video" => "Video",
            "audio" => "Audio",
            "archive" => "Archive",
            "code" => "Code",
            _ => "Other",
        };
        out.push(canonical.to_string());
        if canonical == "Document" {
            out.push("PDF".to_string());
        }
    }
    out.sort();
    out.dedup();
    out
}

/// File names suggesting passwords or credentials: indexed by name only, their text is never copied
/// into the index.
fn looks_sensitive(name: &str) -> bool {
    let n = name.to_lowercase();
    ["password", "passwd", "credential", "secret", "token", "api_key", "apikey", "private_key", "otp", "pin_code", ".env"]
        .iter()
        .any(|w| n.contains(w))
}

fn is_project_root(dir: &Path) -> bool {
    PROJECT_MARKERS.iter().any(|m| dir.join(m).exists())
}

/// Is `path` inside a software project below `root` (some ancestor up to the root holds a marker)?
fn inside_project(path: &Path, root: &Path) -> bool {
    path.ancestors().skip(1).take_while(|a| a.starts_with(root)).any(is_project_root)
}

impl Index {
    pub fn open(db_path: &Path) -> Result<Index, String> {
        if let Some(dir) = db_path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create index folder: {e}"))?;
        }
        let index = Index { db_path: db_path.to_path_buf() };
        let conn = index.connect()?;
        conn.execute_batch("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
            .map_err(|e| format!("Cannot initialise index: {e}"))?;
        if Self::meta_get(&conn, "schema").as_deref() != Some(SCHEMA_VERSION) {
            conn.execute_batch(
                "DROP TABLE IF EXISTS files_terms; DROP TABLE IF EXISTS files_fts; DROP TABLE IF EXISTS files; DELETE FROM meta;",
            )
            .map_err(|e| format!("Cannot reset index: {e}"))?;
            Self::meta_set(&conn, "schema", SCHEMA_VERSION)?;
        }
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS files (
                 id INTEGER PRIMARY KEY,
                 path TEXT NOT NULL UNIQUE,
                 name TEXT NOT NULL,
                 ext TEXT NOT NULL,
                 file_type TEXT NOT NULL,
                 size INTEGER NOT NULL,
                 created_ms INTEGER,
                 modified_ms INTEGER,
                 content_state INTEGER NOT NULL DEFAULT 0,
                 seen_gen INTEGER NOT NULL DEFAULT 0,
                 in_project INTEGER NOT NULL DEFAULT 0
             );
             CREATE INDEX IF NOT EXISTS files_modified ON files(modified_ms);
             CREATE INDEX IF NOT EXISTS files_created ON files(created_ms);
             CREATE INDEX IF NOT EXISTS files_ext ON files(ext);
             CREATE INDEX IF NOT EXISTS files_content_state ON files(content_state);
             CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
                 name, path, content, tokenize = 'unicode61 remove_diacritics 2'
             );
             CREATE VIRTUAL TABLE IF NOT EXISTS files_terms USING fts5vocab(files_fts, 'col');",
        )
        .map_err(|e| format!("Cannot initialise index: {e}"))?;
        Ok(index)
    }

    fn connect(&self) -> Result<Connection, String> {
        let conn = Connection::open(&self.db_path).map_err(|e| format!("Cannot open index: {e}"))?;
        conn.busy_timeout(Duration::from_secs(15)).map_err(|e| e.to_string())?;
        Ok(conn)
    }

    fn meta_get(conn: &Connection, key: &str) -> Option<String> {
        conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional().ok().flatten()
    }

    fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
        conn.execute("INSERT INTO meta(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn current_gen(&self) -> i64 {
        self.connect().ok().and_then(|c| Self::meta_get(&c, "gen")).and_then(|v| v.parse().ok()).unwrap_or(0)
    }

    pub fn has_completed_crawl(&self) -> bool {
        self.connect().ok().and_then(|c| Self::meta_get(&c, "last_crawl_ms")).is_some()
    }

    pub fn last_crawl_ms(&self) -> Option<i64> {
        self.connect().ok().and_then(|c| Self::meta_get(&c, "last_crawl_ms")).and_then(|v| v.parse().ok())
    }

    /// Insert or refresh one file. Returns true when the row is new or its size/date changed.
    fn upsert_file(conn: &Connection, path: &Path, meta: &std::fs::Metadata, gen: i64, in_project: bool) -> Result<bool, String> {
        let path_str = path.to_string_lossy().to_string();
        let size = meta.len() as i64;
        let modified = system_time_ms(meta.modified());
        // Android's shared storage (and some Linux file systems) report no creation time: use the
        // modification time, otherwise every "added today" filter would match nothing there.
        let created = system_time_ms(meta.created()).or(modified);
        let existing: Option<(i64, i64, Option<i64>)> = conn
            .prepare_cached("SELECT id, size, modified_ms FROM files WHERE path = ?1")
            .and_then(|mut s| s.query_row([&path_str], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).optional())
            .map_err(|e| e.to_string())?;

        if let Some((id, old_size, old_modified)) = existing {
            if old_size == size && old_modified == modified {
                conn.prepare_cached("UPDATE files SET seen_gen = ?1, in_project = ?2 WHERE id = ?3")
                    .and_then(|mut s| s.execute(params![gen, in_project, id]))
                    .map_err(|e| e.to_string())?;
                return Ok(false);
            }
        }

        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let file_type = classify_file_type(&ext).to_string();
        let content_state = if crate::extract::is_extractable(&ext) && !crate::access_policy::is_secret_file(path) && !looks_sensitive(&name) {
            CONTENT_PENDING
        } else {
            CONTENT_NONE
        };
        let parent = path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

        match existing {
            Some((id, _, _)) => {
                conn.prepare_cached(
                    "UPDATE files SET name=?1, ext=?2, file_type=?3, size=?4, created_ms=?5, modified_ms=?6,
                     content_state=?7, seen_gen=?8, in_project=?9 WHERE id=?10",
                )
                .and_then(|mut s| s.execute(params![name, ext, file_type, size, created, modified, content_state, gen, in_project, id]))
                .map_err(|e| e.to_string())?;
                conn.prepare_cached("UPDATE files_fts SET name=?1, path=?2, content='' WHERE rowid=?3")
                    .and_then(|mut s| s.execute(params![name_terms(&name), parent, id]))
                    .map_err(|e| e.to_string())?;
            }
            None => {
                conn.prepare_cached(
                    "INSERT INTO files(path, name, ext, file_type, size, created_ms, modified_ms, content_state, seen_gen, in_project)
                     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                )
                .and_then(|mut s| s.execute(params![path_str, name, ext, file_type, size, created, modified, content_state, gen, in_project]))
                .map_err(|e| e.to_string())?;
                let id = conn.last_insert_rowid();
                conn.prepare_cached("INSERT INTO files_fts(rowid, name, path, content) VALUES(?1, ?2, ?3, '')")
                    .and_then(|mut s| s.execute(params![id, name_terms(&name), parent]))
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(true)
    }

    /// Remove a file, or everything below a folder.
    fn remove_path(conn: &Connection, path: &Path) -> Result<usize, String> {
        let p = path.to_string_lossy().to_string();
        let sep = std::path::MAIN_SEPARATOR;
        let prefix = format!("{}{}", p.trim_end_matches(sep), sep);
        let ids: Vec<i64> = conn
            .prepare("SELECT id FROM files WHERE path = ?1 OR substr(path, 1, length(?2)) = ?2")
            .and_then(|mut s| s.query_map(params![p, prefix], |r| r.get(0))?.collect())
            .map_err(|e| e.to_string())?;
        for id in &ids {
            conn.execute("DELETE FROM files_fts WHERE rowid = ?1", [id]).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM files WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        }
        Ok(ids.len())
    }

    /// Walk `roots` and bring the index up to date. Files not seen in this walk are removed.
    pub fn crawl(&self, roots: &[PathBuf], progress: &mut dyn FnMut(usize)) -> Result<CrawlStats, String> {
        let mut conn = self.connect()?;
        let gen = self.current_gen() + 1;
        Self::meta_set(&conn, "gen", &gen.to_string())?;
        let mut stats = CrawlStats::default();

        let mut tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut in_batch = 0;
        let mut stack: Vec<(PathBuf, usize, bool)> = roots.iter().filter(|r| r.is_dir()).map(|r| (r.clone(), 0, false)).collect();
        while let Some((dir, depth, parent_in_project)) = stack.pop() {
            let in_project = parent_in_project || is_project_root(&dir);
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if should_ignore_entry(&name) {
                    continue;
                }
                let Ok(ft) = entry.file_type() else { continue };
                if ft.is_symlink() {
                    continue; // never follow links/junctions (loops, other volumes)
                }
                if ft.is_dir() {
                    if depth < MAX_DEPTH {
                        stack.push((entry.path(), depth + 1, in_project));
                    }
                    continue;
                }
                if !ft.is_file() {
                    continue;
                }
                let Ok(meta) = entry.metadata() else { continue };
                stats.files_seen += 1;
                if Self::upsert_file(&tx, &entry.path(), &meta, gen, in_project)? {
                    stats.files_changed += 1;
                }
                in_batch += 1;
                if in_batch >= BATCH {
                    tx.commit().map_err(|e| e.to_string())?;
                    progress(stats.files_seen);
                    tx = conn.transaction().map_err(|e| e.to_string())?;
                    in_batch = 0;
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())?;

        // Sweep files that no longer exist (or are no longer under an indexed folder).
        let stale: Vec<i64> = conn
            .prepare("SELECT id FROM files WHERE seen_gen < ?1")
            .and_then(|mut s| s.query_map([gen], |r| r.get(0))?.collect())
            .map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for id in &stale {
            tx.execute("DELETE FROM files_fts WHERE rowid = ?1", [id]).map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM files WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        stats.files_removed = stale.len();
        Self::meta_set(&conn, "last_crawl_ms", &now_ms().to_string())?;
        progress(stats.files_seen);
        Ok(stats)
    }

    /// Apply one file-system change reported by the watcher.
    pub fn apply_change(&self, path: &Path, roots: &[PathBuf]) -> Result<(), String> {
        let Some(root) = roots.iter().find(|r| path.starts_with(r)) else { return Ok(()) };
        // Ignore anything inside a skipped folder (node_modules, .git, build output, AppData ...).
        let relative = path.strip_prefix(root).unwrap_or(path);
        if relative.components().any(|c| should_ignore_entry(&c.as_os_str().to_string_lossy())) {
            return Ok(());
        }
        let conn = self.connect()?;
        let gen = self.current_gen();
        match std::fs::symlink_metadata(path) {
            Ok(meta) if meta.file_type().is_symlink() => Ok(()),
            Ok(meta) if meta.is_file() => Self::upsert_file(&conn, path, &meta, gen, inside_project(path, root)).map(|_| ()),
            Ok(meta) if meta.is_dir() => {
                // A folder was created, moved in or renamed: index everything inside it.
                drop(conn);
                self.index_subtree(path, gen, inside_project(path, root))
            }
            Ok(_) => Ok(()),
            Err(_) => Self::remove_path(&conn, path).map(|_| ()),
        }
    }

    fn index_subtree(&self, dir: &Path, gen: i64, parent_in_project: bool) -> Result<(), String> {
        let mut conn = self.connect()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut stack = vec![(dir.to_path_buf(), 0usize, parent_in_project)];
        while let Some((d, depth, above)) = stack.pop() {
            let in_project = above || is_project_root(&d);
            let Ok(entries) = std::fs::read_dir(&d) else { continue };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if should_ignore_entry(&name) {
                    continue;
                }
                let Ok(ft) = entry.file_type() else { continue };
                if ft.is_dir() && !ft.is_symlink() && depth < MAX_DEPTH {
                    stack.push((entry.path(), depth + 1, in_project));
                } else if ft.is_file() {
                    if let Ok(meta) = entry.metadata() {
                        Self::upsert_file(&tx, &entry.path(), &meta, gen, in_project)?;
                    }
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// Extract text for up to `max_files` pending files (most recently modified first).
    /// Returns how many were processed; 0 means nothing is pending.
    pub fn extract_pending(&self, max_files: usize, stop: &AtomicBool) -> Result<usize, String> {
        let conn = self.connect()?;
        let pending: Vec<(i64, String, Option<i64>)> = conn
            .prepare("SELECT id, path, modified_ms FROM files WHERE content_state = ?1 ORDER BY modified_ms DESC LIMIT ?2")
            .and_then(|mut s| s.query_map(params![CONTENT_PENDING, max_files as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect())
            .map_err(|e| e.to_string())?;
        for (id, path, modified) in &pending {
            if stop.load(Ordering::Relaxed) || foreground_busy() {
                break;
            }
            let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            let cap = if DOCUMENT_TYPES.contains(&classify_file_type(&ext)) { MAX_DOCUMENT_CHARS } else { MAX_CODE_CHARS };
            let (state, text) = match crate::extract::extract_text(Path::new(path), cap) {
                Ok(Some(text)) => (CONTENT_INDEXED, text),
                Ok(None) => (CONTENT_NONE, String::new()),
                Err(_) => (CONTENT_FAILED, String::new()),
            };
            // Skip the write if the file changed again while it was being read; the newer version stays pending.
            let still_same: bool = conn
                .query_row("SELECT modified_ms IS ?2 FROM files WHERE id = ?1", params![id, modified], |r| r.get(0))
                .optional()
                .map_err(|e| e.to_string())?
                .unwrap_or(false);
            if !still_same {
                continue;
            }
            conn.execute("UPDATE files_fts SET content = ?1 WHERE rowid = ?2", params![text, id]).map_err(|e| e.to_string())?;
            conn.execute("UPDATE files SET content_state = ?1 WHERE id = ?2", params![state, id]).map_err(|e| e.to_string())?;
        }
        Ok(pending.len())
    }

    pub fn counts(&self) -> Result<(u64, u64, u64, u64), String> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT COUNT(*),
                    COALESCE(SUM(content_state = 1), 0),
                    COALESCE(SUM(content_state = 0), 0),
                    COALESCE(SUM(content_state = 3), 0)
             FROM files",
            [],
            |r| Ok((r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)? as u64, r.get::<_, i64>(2)? as u64, r.get::<_, i64>(3)? as u64)),
        )
        .map_err(|e| e.to_string())
    }

    /// Name terms in the index that are plausible misspellings/variants of `word`.
    fn fuzzy_terms(conn: &Connection, word: &str) -> Result<Vec<String>, String> {
        if word.chars().count() < 4 {
            return Ok(Vec::new());
        }
        // Misspellings almost always keep the first letter; a range on `term` lets SQLite read only
        // that slice of the vocabulary instead of every word in the index.
        let first = word.chars().next().unwrap_or('a');
        let next = char::from_u32(first as u32 + 1).unwrap_or(first);
        let terms: Vec<String> = conn
            .prepare("SELECT term FROM files_terms WHERE term >= ?1 AND term < ?2 AND col = 'name'")
            .and_then(|mut s| s.query_map(params![first.to_string(), next.to_string()], |r| r.get(0))?.collect())
            .map_err(|e| e.to_string())?;
        Ok(terms.into_iter().filter(|t| t != word && crate::fuzzy::words_match(word, t)).take(20).collect())
    }

    pub fn search(&self, params: &SearchParams) -> Result<Vec<DiscoveredFile>, String> {
        let conn = self.connect()?;
        let limit = params.limit.clamp(1, 10_000);
        let words = params.query.as_deref().map(query_words).unwrap_or_default();

        if words.is_empty() {
            return Self::run_query(&conn, None, params, limit, &[], false);
        }

        // 1. Files whose name or folder matches every word.
        let exact_names = words.iter().map(|w| names_expr(w)).collect::<Vec<_>>().join(" AND ");
        let mut results = Self::run_query(&conn, Some(&exact_names), params, limit, &words, false)?;
        let mut seen: HashSet<String> = results.iter().map(|f| f.path.clone()).collect();

        // 2. Few name matches: allow near-miss spellings of the words in file names.
        if results.len() < FUZZY_FALLBACK_BELOW {
            let mut any_variant = false;
            let mut parts = Vec::new();
            for w in &words {
                let variants = Self::fuzzy_terms(&conn, w)?;
                any_variant |= !variants.is_empty();
                let mut alts = vec![names_expr(w)];
                // A misspelled "resume" ("resme") should also find files named ..._CV / ..._Res.
                if !is_resume_word(w) && crate::fuzzy::words_match(w, "resume") {
                    alts.push(names_expr("resume"));
                    any_variant = true;
                }
                alts.extend(variants.iter().map(|t| format!("({{name}} : \"{}\")", t.replace('"', ""))));
                parts.push(format!("({})", alts.join(" OR ")));
            }
            if any_variant {
                let extra = Self::run_query(&conn, Some(&parts.join(" AND ")), params, limit, &words, false)?;
                for f in extra {
                    if seen.insert(f.path.clone()) {
                        results.push(f);
                    }
                }
            }
        }

        // 3. Contents. Asked for explicitly: any file type. Otherwise only as a fallback, and only
        //    documents (a "passport" mention inside source code is not the user's passport).
        if params.content || results.len() < FUZZY_FALLBACK_BELOW {
            let documents_only = !params.content;
            let expr = if params.content || words.len() == 1 {
                words.iter().map(|w| word_expr(w)).collect::<Vec<_>>().join(" AND ")
            } else {
                // "offer letter" as a phrase, so documents where the words are far apart do not count.
                let stems: Vec<&str> = words.iter().map(|w| stem(w)).collect();
                format!("\"{}\"*", stems.join(" "))
            };
            let mut content_hits = Self::run_query(&conn, Some(&expr), params, limit, &words, documents_only)?;
            if content_hits.is_empty() && words.len() > 1 && params.content {
                // Long requests: accept files that contain most of the words.
                let any = words.iter().map(|w| word_expr(w)).collect::<Vec<_>>().join(" OR ");
                let need = (words.len() * 3).div_ceil(5).max(2);
                let candidates = Self::run_query(&conn, Some(&any), params, limit.max(200), &words, documents_only)?;
                let texts: HashMap<String, String> = Self::content_for(&conn, &candidates)?;
                content_hits = candidates
                    .into_iter()
                    .filter(|f| {
                        let hay = format!("{} {} {}", f.name, f.path, texts.get(&f.path).map(String::as_str).unwrap_or("")).to_lowercase();
                        words.iter().filter(|w| hay.contains(stem(w))).count() >= need
                    })
                    .collect();
            }
            for f in content_hits {
                if seen.insert(f.path.clone()) {
                    results.push(f);
                }
            }
        }
        results.truncate(limit);
        Ok(results)
    }

    fn content_for(conn: &Connection, files: &[DiscoveredFile]) -> Result<HashMap<String, String>, String> {
        let mut out = HashMap::new();
        let mut stmt = conn
            .prepare_cached("SELECT fts.content FROM files f JOIN files_fts fts ON fts.rowid = f.id WHERE f.path = ?1")
            .map_err(|e| e.to_string())?;
        for f in files {
            if let Ok(Some(text)) = stmt.query_row([&f.path], |r| r.get::<_, String>(0)).optional() {
                out.insert(f.path.clone(), text.to_lowercase());
            }
        }
        Ok(out)
    }

    fn run_query(
        conn: &Connection,
        fts: Option<&str>,
        p: &SearchParams,
        limit: usize,
        words: &[String],
        documents_only: bool,
    ) -> Result<Vec<DiscoveredFile>, String> {
        let mut sql = String::from(
            "SELECT f.path, f.name, f.ext, f.size, f.created_ms, f.modified_ms, f.file_type, f.content_state, ",
        );
        let mut args: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(expr) = fts {
            // bm25 is negative (lower = more relevant); negate so a higher relevance_score means a better match.
            sql.push_str("snippet(files_fts, 2, '', '', '…', 16), -bm25(files_fts, 10.0, 3.0, 1.0) FROM files_fts JOIN files f ON f.id = files_fts.rowid WHERE files_fts MATCH ?");
            args.push(expr.to_string().into());
        } else {
            sql.push_str("NULL, NULL FROM files f WHERE 1 = 1");
        }
        if let Some(ext) = p.extension.as_deref().filter(|e| !e.is_empty()) {
            sql.push_str(" AND f.ext = ?");
            args.push(ext.trim_start_matches('.').to_lowercase().into());
        }
        if let Some(types) = p.file_types.as_ref().filter(|t| !t.is_empty()) {
            let types = file_type_filter(types);
            sql.push_str(&format!(" AND f.file_type IN ({})", vec!["?"; types.len()].join(",")));
            args.extend(types.into_iter().map(Into::into));
        }
        for (col, op, val) in [
            ("created_ms", ">=", p.created_after_ms),
            ("created_ms", "<=", p.created_before_ms),
            ("modified_ms", ">=", p.modified_after_ms),
            ("modified_ms", "<=", p.modified_before_ms),
        ] {
            if let Some(v) = val {
                sql.push_str(&format!(" AND f.{col} {op} ?"));
                args.push(v.into());
            }
        }
        if documents_only {
            // Personal documents only: not code, and not docs inside software projects.
            sql.push_str(" AND f.in_project = 0");
            sql.push_str(&format!(" AND f.file_type IN ({})", vec!["?"; DOCUMENT_TYPES.len()].join(",")));
            args.extend(DOCUMENT_TYPES.iter().map(|t| t.to_string().into()));
        }
        if let Some(scope) = p.scope.as_deref().filter(|s| !s.trim().is_empty()) {
            sql.push_str(" AND instr(lower(f.path), lower(?)) > 0");
            args.push(scope.trim().to_string().into());
        }
        let dir = if p.sort_asc { "ASC" } else { "DESC" };
        let order = match p.sort_by.as_deref().map(str::to_lowercase).as_deref() {
            Some("size") => format!("f.size {dir}"),
            Some("modified") | Some("modifiedat") | Some("date") => format!("f.modified_ms {dir}"),
            Some("created") | Some("createdat") => format!("f.created_ms {dir}"),
            Some("name") => format!("f.name COLLATE NOCASE {}", if p.sort_by.is_some() && !p.sort_asc { "DESC" } else { "ASC" }),
            // BM25 (negative: lower is better); personal documents and media rank ahead of code/data files.
            _ if fts.is_some() => "bm25(files_fts, 10.0, 3.0, 1.0) * CASE WHEN f.file_type IN ('Code', 'Other', 'Archive') THEN 0.4 ELSE 1.0 END, f.modified_ms DESC".to_string(),
            _ => "f.modified_ms DESC".to_string(),
        };
        sql.push_str(&format!(" ORDER BY {order} LIMIT ?"));
        args.push((limit as i64).into());

        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Index query failed: {e}"))?;
        let rows = stmt
            .query_map(params_from_iter(args.iter()), |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, i64>(7)?,
                    r.get::<_, Option<String>>(8)?,
                    r.get::<_, Option<f64>>(9)?,
                ))
            })
            .map_err(|e| format!("Index query failed: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            let (path, name, ext, size, created, modified, file_type, content_state, snippet, relevance_score) =
                row.map_err(|e| e.to_string())?;
            let lpath = path.to_lowercase();
            let match_in = if words.is_empty() {
                None
            } else if words.iter().all(|w| word_in_name(w, &name)) {
                Some("name".to_string())
            } else if words.iter().all(|w| lpath.contains(stem(w))) {
                Some("folder".to_string())
            } else {
                Some("content".to_string())
            };
            let snippet = if match_in.as_deref() == Some("content") { snippet.filter(|s| !s.trim().is_empty()) } else { None };
            let extraction_status = Some(
                match content_state {
                    CONTENT_INDEXED => "ok",
                    CONTENT_NONE => "unsupported_type",
                    CONTENT_FAILED => "failed",
                    _ => "pending",
                }
                .to_string(),
            );
            out.push(DiscoveredFile {
                path,
                name,
                extension: ext,
                size: size.max(0) as u64,
                created_at: ms_to_rfc3339(created),
                modified_at: ms_to_rfc3339(modified),
                accessed_at: None,
                file_type,
                mime_type: None,
                snippet,
                match_in,
                relevance_score,
                extraction_status,
            });
        }
        Ok(out)
    }
}

// ───────────────────────────── background service ─────────────────────────────

static INDEX: OnceLock<Index> = OnceLock::new();
static STATUS: Mutex<Option<IndexStatus>> = Mutex::new(None);
static STOP: AtomicBool = AtomicBool::new(false);
static RECRAWL: AtomicBool = AtomicBool::new(false);
static WATCHER: Mutex<Option<notify::RecommendedWatcher>> = Mutex::new(None);
/// Number of user-facing operations in progress (AI answers, speech transcription). Background text
/// extraction pauses while it is non-zero, so the AI gets the CPU.
static FOREGROUND_BUSY: AtomicUsize = AtomicUsize::new(0);

/// Marks a user-facing operation; background indexing yields until the guard is dropped.
pub struct ForegroundGuard(());

impl Drop for ForegroundGuard {
    fn drop(&mut self) {
        FOREGROUND_BUSY.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn foreground_work() -> ForegroundGuard {
    FOREGROUND_BUSY.fetch_add(1, Ordering::SeqCst);
    ForegroundGuard(())
}

fn foreground_busy() -> bool {
    FOREGROUND_BUSY.load(Ordering::SeqCst) > 0
}

fn update_status(f: impl FnOnce(&mut IndexStatus)) {
    if let Ok(mut guard) = STATUS.lock() {
        f(guard.get_or_insert_with(IndexStatus::default));
    }
}

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// App data folder for the index (set at startup on Android, where there is no LOCALAPPDATA/HOME).
pub fn set_data_dir(dir: PathBuf) {
    let _ = DATA_DIR.set(dir);
}

pub fn db_path() -> PathBuf {
    if let Some(dir) = DATA_DIR.get() {
        return dir.join("index.sqlite");
    }
    let base = std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("XDG_DATA_HOME"))
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(std::env::temp_dir);
    base.join("Foundry").join("index.sqlite")
}

/// Folders to index: the same user folders and data drives Foundry searches, except the system
/// drive root (its user folders are already included individually).
pub fn index_roots() -> Vec<PathBuf> {
    // Android: the phone's shared storage (Download, Documents, DCIM, Pictures, WhatsApp media under
    // Android/media...). Android/data and Android/obb are unreadable to apps and skipped by the walk.
    if cfg!(target_os = "android") {
        return ["/storage/emulated/0"].iter().map(PathBuf::from).filter(|p| p.is_dir()).collect();
    }
    let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string()).to_lowercase();
    let mut roots: Vec<PathBuf> = crate::filesystem::get_accessible_directories()
        .into_iter()
        .filter(|d| d.exists)
        .map(|d| PathBuf::from(d.path))
        .filter(|p| {
            let s = p.to_string_lossy().to_lowercase();
            !(s.trim_end_matches('\\') == system_drive || s == "/")
        })
        .collect();
    // Drop roots nested inside other roots (e.g. OneDrive\Documents inside OneDrive).
    roots.sort_by_key(|p| p.components().count());
    let mut kept: Vec<PathBuf> = Vec::new();
    for r in roots {
        if !kept.iter().any(|k| r.starts_with(k)) {
            kept.push(r);
        }
    }
    kept
}

/// True once searches can be served from the index.
pub fn is_ready() -> bool {
    STATUS.lock().map(|g| g.as_ref().map(|s| s.ready).unwrap_or(false)).unwrap_or(false)
}

pub fn global() -> Option<&'static Index> {
    INDEX.get()
}

/// Serve a search from the index, or `None` when it is not ready (caller walks the disk instead).
pub fn try_search(params: &SearchParams) -> Option<Vec<DiscoveredFile>> {
    if !is_ready() {
        return None;
    }
    match INDEX.get()?.search(params) {
        Ok(r) => Some(r),
        Err(e) => {
            eprintln!("[Foundry][Index] search failed, falling back to live walk: {e}");
            None
        }
    }
}

fn start_watcher(roots: &[PathBuf]) -> bool {
    use notify::{RecursiveMode, Watcher};
    let (tx, rx) = std::sync::mpsc::channel::<PathBuf>();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if matches!(event.kind, notify::EventKind::Access(_)) {
                return;
            }
            for p in event.paths {
                let _ = tx.send(p);
            }
        }
    });
    let Ok(mut watcher) = watcher else { return false };
    let mut watching = false;
    for r in roots {
        watching |= watcher.watch(r, RecursiveMode::Recursive).is_ok();
    }
    if let Ok(mut guard) = WATCHER.lock() {
        *guard = Some(watcher);
    }
    let roots = roots.to_vec();
    std::thread::spawn(move || {
        // Debounce: collect changes for a moment, then apply each distinct path once.
        while let Ok(first) = rx.recv() {
            let mut batch: HashSet<PathBuf> = HashSet::from([first]);
            let deadline = std::time::Instant::now() + Duration::from_millis(1500);
            while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
                match rx.recv_timeout(left) {
                    Ok(p) => {
                        batch.insert(p);
                    }
                    Err(_) => break,
                }
            }
            if let Some(index) = INDEX.get() {
                for p in batch {
                    if let Err(e) = index.apply_change(&p, &roots) {
                        eprintln!("[Foundry][Index] could not apply change for {}: {e}", p.display());
                    }
                }
            }
        }
    });
    watching
}

fn refresh_counts() {
    if let Some(index) = INDEX.get() {
        if let Ok((files, content, pending, failed)) = index.counts() {
            update_status(|s| {
                s.files_indexed = files;
                s.content_indexed = content;
                s.content_pending = pending;
                s.content_failed = failed;
            });
        }
    }
}

fn run_crawl(index: &Index, roots: &[PathBuf]) {
    update_status(|s| {
        s.state = "crawling".into();
        s.scanned_this_crawl = 0;
        s.error = None;
    });
    let result = index.crawl(roots, &mut |seen| update_status(|s| s.scanned_this_crawl = seen as u64));
    match result {
        Ok(stats) => {
            println!(
                "[Foundry][Index] crawl done: {} files, {} new/changed, {} removed",
                stats.files_seen, stats.files_changed, stats.files_removed
            );
            update_status(|s| {
                s.ready = true;
                s.state = "extracting".into();
                s.last_crawl_completed = ms_to_rfc3339(index.last_crawl_ms());
            });
        }
        Err(e) => update_status(|s| {
            s.state = "error".into();
            s.error = Some(e);
        }),
    }
    refresh_counts();
}

static STARTED: AtomicBool = AtomicBool::new(false);

/// Start the index service once (Android calls this whenever file access is confirmed).
pub fn ensure_started() {
    start_background();
}

/// Start the index service in the background (desktop app startup). Later calls do nothing.
pub fn start_background() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        update_status(|s| s.state = "starting".into());
        let index = match Index::open(&db_path()) {
            Ok(i) => i,
            Err(e) => {
                update_status(|s| {
                    s.state = "unavailable".into();
                    s.error = Some(e);
                });
                return;
            }
        };
        let index = INDEX.get_or_init(|| index);
        let roots = index_roots();
        // An index from a previous run is usable immediately while it is being refreshed.
        let previously_built = index.has_completed_crawl();
        update_status(|s| {
            s.ready = previously_built;
            s.roots = roots.iter().map(|r| r.to_string_lossy().to_string()).collect();
            s.last_crawl_completed = ms_to_rfc3339(index.last_crawl_ms());
        });
        refresh_counts();
        let watching = start_watcher(&roots);
        update_status(|s| s.watching = watching);
        run_crawl(index, &roots);

        // Fallback for new/changed files the watcher misses: common on Android, where shared storage
        // is exposed through FUSE and inotify events over it are unreliable or silently dropped. Without
        // this, a phone's index would only ever update when the app restarts.
        let recrawl_every = if watching { Duration::from_secs(600) } else { Duration::from_secs(60) };
        let mut last_crawl = std::time::Instant::now();

        // Text extraction, low priority; also picks up files changed later (via the watcher).
        loop {
            if STOP.load(Ordering::Relaxed) {
                return;
            }
            if RECRAWL.swap(false, Ordering::Relaxed) || last_crawl.elapsed() >= recrawl_every {
                if !foreground_busy() {
                    run_crawl(index, &roots);
                    last_crawl = std::time::Instant::now();
                }
            }
            if foreground_busy() {
                std::thread::sleep(Duration::from_millis(300));
                continue;
            }
            match index.extract_pending(25, &STOP) {
                Ok(0) => {
                    update_status(|s| {
                        if s.state != "error" {
                            s.state = "ready".into();
                        }
                    });
                    refresh_counts();
                    std::thread::sleep(Duration::from_secs(5));
                }
                Ok(_) => {
                    update_status(|s| s.state = "extracting".into());
                    refresh_counts();
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    eprintln!("[Foundry][Index] extraction error: {e}");
                    std::thread::sleep(Duration::from_secs(10));
                }
            }
        }
    });
}

pub fn stop_background() {
    STOP.store(true, Ordering::Relaxed);
    if let Ok(mut guard) = WATCHER.lock() {
        guard.take();
    }
}

pub fn index_status() -> IndexStatus {
    refresh_counts();
    STATUS.lock().ok().and_then(|g| g.clone()).unwrap_or_else(|| IndexStatus { state: "unavailable".into(), ..Default::default() })
}

pub fn index_rebuild() -> IndexStatus {
    RECRAWL.store(true, Ordering::Relaxed);
    update_status(|s| s.state = "crawling".into());
    STATUS.lock().ok().and_then(|g| g.clone()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        root: PathBuf,
        index: Index,
    }

    impl Fixture {
        fn new(name: &str) -> Fixture {
            let base = std::env::temp_dir().join(format!("foundry_index_{name}_{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&base);
            let root = base.join("files");
            std::fs::create_dir_all(root.join("Work").join("node_modules")).unwrap();
            std::fs::create_dir_all(root.join("Personal")).unwrap();
            std::fs::write(root.join("Work").join("react-notes.md"), "Notes on React hooks: useState and useEffect for state management.").unwrap();
            std::fs::write(root.join("Work").join("budget.csv"), "quarter,revenue\nQ1,100\nQ2,140").unwrap();
            std::fs::write(root.join("Work").join("auth.ts"), "import passport from 'passport'; // login strategy").unwrap();
            std::fs::create_dir_all(root.join("Work").join("api")).unwrap();
            std::fs::write(root.join("Work").join("api").join("package.json"), "{}").unwrap();
            std::fs::write(root.join("Work").join("api").join("README.md"), "Login uses passport-jwt.").unwrap();
            std::fs::write(root.join("Work").join("node_modules").join("ignored.md"), "React internals").unwrap();
            std::fs::write(root.join("Personal").join("Aadhaar_Card_Front.png"), [0u8; 10]).unwrap();
            std::fs::write(root.join("Personal").join("Jagadeesh_Developer_Res.pdf"), b"%PDF-1.4").unwrap();
            crate::extract::tests::write_docx(&root.join("Personal").join("OfferLetter2026.docx"), &["Offer of employment", "Salary and joining date"]);
            let index = Index::open(&base.join("index.sqlite")).unwrap();
            Fixture { root, index }
        }
        fn crawl_and_extract(&self) -> CrawlStats {
            let stats = self.index.crawl(&[self.root.clone()], &mut |_| {}).unwrap();
            while self.index.extract_pending(50, &AtomicBool::new(false)).unwrap() > 0 {}
            stats
        }
        fn find(&self, query: &str) -> Vec<String> {
            self.search(SearchParams { query: Some(query.to_string()), limit: 50, ..Default::default() })
        }
        fn search(&self, p: SearchParams) -> Vec<String> {
            self.index.search(&p).unwrap().into_iter().map(|f| f.name).collect()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.root.parent().unwrap());
        }
    }

    #[test]
    fn crawls_names_and_skips_ignored_folders() {
        let fx = Fixture::new("crawl");
        let stats = fx.crawl_and_extract();
        assert_eq!(stats.files_seen, 8, "node_modules must be skipped");
        assert_eq!(fx.find("aadhaar"), vec!["Aadhaar_Card_Front.png"]);
        assert!(fx.find("ignored").is_empty());
    }

    #[test]
    fn finds_files_by_content_with_snippet() {
        let fx = Fixture::new("content");
        fx.crawl_and_extract();
        let hits = fx.index.search(&SearchParams { query: Some("documents related to state management".into()), limit: 10, content: true, ..Default::default() }).unwrap();
        assert_eq!(hits[0].name, "react-notes.md");
        assert_eq!(hits[0].match_in.as_deref(), Some("content"));
        assert!(hits[0].snippet.as_deref().unwrap_or("").contains("state management"));
        // Word document text is searchable too
        let about = fx.search(SearchParams { query: Some("salary joining".into()), content: true, limit: 10, ..Default::default() });
        assert_eq!(about, vec!["OfferLetter2026.docx"]);
        // camel case / digits in names are split
        assert_eq!(fx.find("offer letter"), vec!["OfferLetter2026.docx"]);
    }

    #[test]
    fn content_matches_carry_a_relevance_score() {
        let fx = Fixture::new("score");
        fx.crawl_and_extract();
        let hits = fx
            .index
            .search(&SearchParams { query: Some("documents related to state management".into()), limit: 10, content: true, ..Default::default() })
            .unwrap();
        assert_eq!(hits[0].name, "react-notes.md");
        assert!(hits[0].relevance_score.is_some(), "a content match must carry a relevance score for citations");
        // A query without any search words (pure browsing) never touches FTS/bm25, so there's no score to give.
        let browsed = fx.index.search(&SearchParams { limit: 10, ..Default::default() }).unwrap();
        assert!(browsed.iter().all(|f| f.relevance_score.is_none()));
    }

    #[test]
    fn extraction_status_reflects_real_outcomes() {
        let fx = Fixture::new("extraction_status");
        std::fs::write(fx.root.join("Personal").join("Fake_Report.docx"), b"not actually a zip").unwrap();
        fx.crawl_and_extract();

        let ok = fx.index.search(&SearchParams { query: Some("react-notes".into()), limit: 5, ..Default::default() }).unwrap();
        assert_eq!(ok[0].extraction_status.as_deref(), Some("ok"), "a plain text file extracts cleanly");

        let unsupported = fx.index.search(&SearchParams { query: Some("aadhaar".into()), limit: 5, ..Default::default() }).unwrap();
        assert_eq!(unsupported[0].extraction_status.as_deref(), Some("unsupported_type"), "an image has no extractor, and must say so honestly");

        let failed = fx.index.search(&SearchParams { query: Some("fake report".into()), limit: 5, ..Default::default() }).unwrap();
        assert_eq!(failed[0].extraction_status.as_deref(), Some("failed"), "a corrupt document must say extraction failed, never silently succeed empty");
    }

    #[test]
    fn resume_aliases_and_typos() {
        let fx = Fixture::new("fuzzy");
        fx.crawl_and_extract();
        assert_eq!(fx.find("resume"), vec!["Jagadeesh_Developer_Res.pdf"]);
        assert_eq!(fx.find("resme"), vec!["Jagadeesh_Developer_Res.pdf"]);
        assert_eq!(fx.find("adhar"), vec!["Aadhaar_Card_Front.png"]);
        // a code file that merely mentions "passport" is not the user's passport ...
        assert!(fx.find("passport").is_empty());
        // ... but it is found when the person asks about contents
        let mut mentions = fx.search(SearchParams { query: Some("passport".into()), content: true, limit: 10, ..Default::default() });
        mentions.sort();
        assert_eq!(mentions, vec!["README.md", "auth.ts"]);
    }

    #[test]
    fn name_matches_rank_before_document_content_fallback() {
        let fx = Fixture::new("ranking");
        std::fs::write(fx.root.join("Work").join("Salary_Slip_Oct.pdf"), b"%PDF-1.4").unwrap();
        fx.crawl_and_extract();
        // "salary" is in a file name and inside the offer letter's text: the named file comes first,
        // the document that mentions it follows as a content match.
        let hits = fx.index.search(&SearchParams { query: Some("salary".into()), limit: 10, ..Default::default() }).unwrap();
        let names: Vec<_> = hits.iter().map(|h| (h.name.as_str(), h.match_in.as_deref().unwrap_or(""))).collect();
        assert_eq!(names, vec![("Salary_Slip_Oct.pdf", "name"), ("OfferLetter2026.docx", "content")]);
    }

    #[test]
    fn filters_by_type_extension_and_date() {
        let fx = Fixture::new("filters");
        fx.crawl_and_extract();
        let pdf_or_docs = fx.search(SearchParams { file_types: Some(vec!["document".into()]), limit: 50, ..Default::default() });
        assert!(pdf_or_docs.contains(&"Jagadeesh_Developer_Res.pdf".to_string()), "Document includes PDF");
        assert!(pdf_or_docs.contains(&"OfferLetter2026.docx".to_string()));
        assert!(!pdf_or_docs.contains(&"budget.csv".to_string()));
        assert_eq!(fx.search(SearchParams { extension: Some(".CSV".into()), limit: 50, ..Default::default() }), vec!["budget.csv"]);
        let today = now_ms() - 60_000;
        assert_eq!(fx.search(SearchParams { modified_after_ms: Some(today), limit: 50, ..Default::default() }).len(), 8);
        assert!(fx.search(SearchParams { modified_before_ms: Some(1), limit: 50, ..Default::default() }).is_empty());
    }

    #[test]
    fn incremental_updates_and_deletions() {
        let fx = Fixture::new("incremental");
        fx.crawl_and_extract();
        // unchanged second crawl touches nothing
        let again = fx.index.crawl(&[fx.root.clone()], &mut |_| {}).unwrap();
        assert_eq!(again.files_changed, 0);

        // watcher-style changes
        let roots = [fx.root.clone()];
        let new_file = fx.root.join("Work").join("kubernetes-guide.txt");
        std::fs::write(&new_file, "Deploying pods with helm charts").unwrap();
        fx.index.apply_change(&new_file, &roots).unwrap();
        while fx.index.extract_pending(50, &AtomicBool::new(false)).unwrap() > 0 {}
        assert_eq!(fx.find("helm"), vec!["kubernetes-guide.txt"]);

        std::fs::write(&new_file, "Now about terraform modules").unwrap();
        fx.index.apply_change(&new_file, &roots).unwrap();
        while fx.index.extract_pending(50, &AtomicBool::new(false)).unwrap() > 0 {}
        assert!(fx.find("helm").is_empty(), "old content must be replaced");
        assert_eq!(fx.find("terraform"), vec!["kubernetes-guide.txt"]);

        std::fs::remove_file(&new_file).unwrap();
        fx.index.apply_change(&new_file, &roots).unwrap();
        assert!(fx.find("terraform").is_empty());

        // folder deleted: everything under it disappears; full crawl sweeps too
        std::fs::remove_dir_all(fx.root.join("Personal")).unwrap();
        fx.index.apply_change(&fx.root.join("Personal"), &roots).unwrap();
        assert!(fx.find("aadhaar").is_empty());
        let sweep = fx.index.crawl(&roots, &mut |_| {}).unwrap();
        assert_eq!(sweep.files_removed, 0);
        assert_eq!(fx.index.counts().unwrap().0, 5);
    }

    #[test]
    fn changes_inside_ignored_folders_are_skipped() {
        let fx = Fixture::new("ignored");
        fx.crawl_and_extract();
        let p = fx.root.join("Work").join("node_modules").join("pkg.md");
        std::fs::write(&p, "dependency").unwrap();
        fx.index.apply_change(&p, &[fx.root.clone()]).unwrap();
        assert!(fx.find("dependency").is_empty());
    }

    #[test]
    fn hostile_query_text_is_safe() {
        let fx = Fixture::new("hostile");
        fx.crawl_and_extract();
        for q in ["\"", "NEAR(", "react OR", "a AND (", "*", "'; DROP TABLE files; --", "{name}: x"] {
            assert!(fx.index.search(&SearchParams { query: Some(q.into()), limit: 5, ..Default::default() }).is_ok(), "{q}");
        }
        assert_eq!(fx.index.counts().unwrap().0, 8);
    }

    /// Real-data diagnostic (run with --ignored --nocapture): indexes this machine's folders into a
    /// throwaway database and reports timings and sample query results.
    #[test]
    #[ignore]
    fn diagnostic_index_real_folders() {
        let db = std::env::temp_dir().join(format!("foundry_index_diag_{}.sqlite", std::process::id()));
        let remove_db = |db: &Path| {
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", db.display()));
            }
        };
        remove_db(&db);
        let index = Index::open(&db).unwrap();
        let roots = index_roots();
        println!("roots: {roots:?}");
        let t = std::time::Instant::now();
        let stats = index.crawl(&roots, &mut |_| {}).unwrap();
        println!("crawl: {} files in {:.1}s", stats.files_seen, t.elapsed().as_secs_f32());
        let t = std::time::Instant::now();
        let again = index.crawl(&roots, &mut |_| {}).unwrap();
        println!("re-crawl (no changes): {} changed in {:.1}s", again.files_changed, t.elapsed().as_secs_f32());
        let t = std::time::Instant::now();
        let stop = AtomicBool::new(false);
        let mut processed = 0;
        while t.elapsed() < Duration::from_secs(90) {
            let n = index.extract_pending(25, &stop).unwrap();
            if n == 0 {
                break;
            }
            processed += n;
        }
        let (files, content, pending, failed) = index.counts().unwrap();
        println!(
            "extraction: {processed} files in {:.1}s -> {content} with text, {pending} pending, {failed} failed (of {files})",
            t.elapsed().as_secs_f32()
        );
        for q in ["resume", "resme", "adhar", "passport", "offer letter", "react", "invoice", "accessibility audit"] {
            let t = std::time::Instant::now();
            let hits = index.search(&SearchParams { query: Some(q.into()), limit: 5, ..Default::default() }).unwrap();
            println!("\n'{q}' -> {} hits in {} ms", hits.len(), t.elapsed().as_millis());
            for h in hits.iter().take(5) {
                let snip: String = h.snippet.clone().unwrap_or_default().chars().take(70).collect();
                println!("   [{}] {} ({})  {}", h.match_in.as_deref().unwrap_or("-"), h.name, h.file_type, snip);
            }
        }
        for q in ["react hooks", "accessibility", "salary"] {
            let hits = index.search(&SearchParams { query: Some(q.into()), limit: 5, content: true, ..Default::default() }).unwrap();
            println!("
about '{q}' (content) -> {} hits", hits.len());
            for h in hits.iter().take(5) {
                let snip: String = h.snippet.clone().unwrap_or_default().chars().take(70).collect();
                println!("   [{}] {} ({})  {}", h.match_in.as_deref().unwrap_or("-"), h.name, h.file_type, snip);
            }
        }
        let today = now_ms() - 24 * 3600 * 1000;
        let recent = index.search(&SearchParams { created_after_ms: Some(today), limit: 5, sort_by: Some("created".into()), ..Default::default() }).unwrap();
        println!("\nadded in last 24h: {:?}", recent.iter().map(|h| &h.name).collect::<Vec<_>>());
        let size = std::fs::metadata(&db).map(|m| m.len()).unwrap_or(0);
        println!("index size: {:.1} MB", size as f64 / 1_048_576.0);
        drop(index);
        remove_db(&db);
    }

    #[test]
    fn credential_files_are_indexed_by_name_only() {
        let fx = Fixture::new("sensitive");
        std::fs::write(fx.root.join("Work").join("GSC_Login_Credentials.txt"), "user: admin password: hunter2").unwrap();
        fx.crawl_and_extract();
        assert_eq!(fx.find("credentials"), vec!["GSC_Login_Credentials.txt"]);
        let content = fx.search(SearchParams { query: Some("hunter2".into()), content: true, limit: 5, ..Default::default() });
        assert!(content.is_empty(), "text of credential files must not be indexed");
    }

    #[test]
    fn name_terms_split_camel_case_and_digits() {
        assert_eq!(name_terms("OfferLetter2026.docx"), "OfferLetter2026.docx Offer Letter 2026 docx");
        // hashes in generated names stay whole (no accidental "Cv" token)
        assert_eq!(name_terms("popup_notification-CvTOvKpR.mp3"), "popup_notification-CvTOvKpR.mp3 popup notification CvTOvKpR mp 3");
    }

    #[test]
    fn fallback_requires_the_phrase_and_labels_typos_as_name_matches() {
        let fx = Fixture::new("phrase");
        std::fs::write(fx.root.join("Work").join("minutes.txt"), "We discussed the offer. Later a letter arrived.").unwrap();
        std::fs::write(fx.root.join("Work").join("popup_notification-CvTOvKpR.mp3"), [0u8; 4]).unwrap();
        fx.crawl_and_extract();
        // words far apart do not make an "offer letter"; the docx whose name is OfferLetter does
        assert_eq!(fx.find("offer letter"), vec!["OfferLetter2026.docx"]);
        // a misspelled request still finds the résumé, labelled as a name match
        let hits = fx.index.search(&SearchParams { query: Some("resme".into()), limit: 5, ..Default::default() }).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "Jagadeesh_Developer_Res.pdf");
        assert_eq!(hits[0].match_in.as_deref(), Some("name"));
        assert_eq!(fx.find("resume"), vec!["Jagadeesh_Developer_Res.pdf"]);
    }
}
