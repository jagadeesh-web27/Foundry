use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use chrono::{DateTime, Utc};

#[cfg(target_os = "android")]
use crate::android_files;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DiscoveredFile {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub accessed_at: Option<String>,
    pub file_type: String,
    #[serde(default)]
    pub mime_type: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DiscoveredFolder {
    pub path: String,
    pub name: String,
    pub parent_path: Option<String>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub accessed_at: Option<String>,
    pub item_count: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct UserDirectory {
    pub name: String,
    pub path: String,
    pub exists: bool,
}

pub fn classify_file_type(ext: &str) -> &'static str {
    match ext {
        "pdf" => "PDF",
        "doc" | "docx" | "txt" | "md" | "rtf" | "odt" => "Document",
        "xls" | "xlsx" | "csv" | "tsv" => "Spreadsheet",
        "ppt" | "pptx" => "Presentation",
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "svg" | "ico" | "heic" | "tiff" | "tif" | "raw" => "Image",
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "wmv" | "flv" | "m4v" | "mpeg" | "mpg" | "3gp" | "vob" | "ogv" => "Video",
        "mp3" | "wav" | "m4a" | "flac" | "aac" | "ogg" | "wma" => "Audio",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" => "Archive",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "json" | "html" | "css" | "cpp" | "c" | "java" | "go" | "rb" | "php" | "swift" | "kt" | "scala" | "sh" | "bat" | "ps1" | "yaml" | "yml" | "toml" | "xml" | "sql" => "Code",
        _ => "Other",
    }
}

pub fn system_time_to_rfc3339(t: SystemTime) -> Option<String> {
    let dt: DateTime<Utc> = t.into();
    Some(dt.to_rfc3339())
}

pub fn parse_iso_or_millis(s: &str) -> Option<i64> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    // Try parsing as a non-RFC3339 ISO-like string (e.g. "2026-09-21T00:00:00.000Z")
    if let Ok(dt) = s.parse::<DateTime<Utc>>() {
        return Some(dt.timestamp_millis());
    }
    if let Ok(ts) = s.parse::<i64>() {
        return Some(ts);
    }
    None
}

pub fn is_within_time_range(t: Option<SystemTime>, after_str: Option<&str>, before_str: Option<&str>) -> bool {
    let Some(t) = t else { return false; };
    let Ok(dur) = t.duration_since(std::time::UNIX_EPOCH) else { return false; };
    let millis = dur.as_millis() as i64;

    if let Some(after) = after_str {
        if let Some(after_ms) = parse_iso_or_millis(after) {
            if millis < after_ms {
                return false;
            }
        }
    }
    if let Some(before) = before_str {
        if let Some(before_ms) = parse_iso_or_millis(before) {
            if millis > before_ms {
                return false;
            }
        }
    }
    true
}

pub fn should_ignore_entry(name: &str) -> bool {
    name.starts_with('.')
        || name.starts_with('~')
        || name.starts_with('$')
        || name == "node_modules"
        || name == "AppData"
        || name == "Application Data"
        || name == "Local Settings"
        || name == "$Recycle.Bin"
        || name == "System Volume Information"
        || name == "target"
        || name == "Windows"
        || name == "Program Files"
        || name == "Program Files (x86)"
        || name == "ProgramData"
        || name == "Recovery"
        || name == "MSOCache"
        || name == "Intel"
        || name == "PerfLogs"
        || name == "msys64"
        || name == "cygwin64"
        || name == "__pycache__"
        || name == "dist"
        || name == "build"
        || name == "bin"
        || name == "obj"
        || name == ".git"
        || name == ".svn"
        || name == ".hg"
        || name == "venv"
        || name == ".venv"
        || name == "Android"
}

#[tauri::command(async)]
pub fn get_accessible_directories() -> Vec<UserDirectory> {
    let mut dirs = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // 1. Android Standard Shared Storage Locations
    let android_base = Path::new("/storage/emulated/0");
    if android_base.exists() {
        let android_folders = [
            ("Downloads", "Download"),
            ("Documents", "Documents"),
            ("Photos & Camera", "DCIM"),
            ("Pictures", "Pictures"),
            ("Music", "Music"),
            ("Movies & Video", "Movies"),
        ];
        for (label, sub) in android_folders {
            let p = android_base.join(sub);
            let exists = p.exists();
            let path_str = p.to_string_lossy().to_string();
            if exists && seen.insert(path_str.to_lowercase()) {
                dirs.push(UserDirectory {
                    name: label.to_string(),
                    path: path_str,
                    exists: true,
                });
            }
        }
        let root_str = android_base.to_string_lossy().to_string();
        if seen.insert(root_str.to_lowercase()) {
            dirs.push(UserDirectory {
                name: "Internal Storage".to_string(),
                path: root_str,
                exists: true,
            });
        }
    } else {
        // Fallback check for /sdcard link
        let sdcard_base = Path::new("/sdcard");
        if sdcard_base.exists() {
            let path_str = sdcard_base.to_string_lossy().to_string();
            if seen.insert(path_str.to_lowercase()) {
                dirs.push(UserDirectory {
                    name: "Internal Storage".to_string(),
                    path: path_str,
                    exists: true,
                });
            }
        }
    }

    // 2. User Profile Standard Locations (Windows)
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let base = PathBuf::from(profile);
        let standard = [
            ("Desktop", "Desktop"),
            ("Documents", "Documents"),
            ("Downloads", "Downloads"),
            ("Pictures", "Pictures"),
            ("Videos", "Videos"),
            ("Music", "Music"),
            ("OneDrive", "OneDrive"),
        ];
        for (label, sub) in standard {
            let p = base.join(sub);
            let exists = p.exists();
            let path_str = p.to_string_lossy().to_string();
            if exists && seen.insert(path_str.to_lowercase()) {
                dirs.push(UserDirectory {
                    name: label.to_string(),
                    path: path_str,
                    exists: true,
                });
            }
        }
    }

    // 3. User Home Directory (macOS / Linux)
    if let Ok(home) = std::env::var("HOME") {
        let base = PathBuf::from(home);
        let standard = [
            ("Desktop", "Desktop"),
            ("Documents", "Documents"),
            ("Downloads", "Downloads"),
            ("Pictures", "Pictures"),
            ("Videos", "Videos"),
            ("Music", "Music"),
        ];
        for (label, sub) in standard {
            let p = base.join(sub);
            let exists = p.exists();
            let path_str = p.to_string_lossy().to_string();
            if exists && seen.insert(path_str.to_lowercase()) {
                dirs.push(UserDirectory {
                    name: label.to_string(),
                    path: path_str,
                    exists: true,
                });
            }
        }
    }

    // 4. Discover all other mounted and available Windows drives (D:\, E:\, etc.)
    #[cfg(target_os = "windows")]
    {
        for letter in b'C'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            let p = Path::new(&drive_path);
            if p.exists() {
                // Don't add C:\ root directly because system files/Windows are there,
                // but DO add all secondary/data drives like D:\, E:\, F:\ etc.!
                if (letter as char) != 'C' && seen.insert(drive_path.to_lowercase()) {
                    dirs.push(UserDirectory {
                        name: format!("Drive ({}:)", letter as char),
                        path: drive_path,
                        exists: true,
                    });
                }
            }
        }
    }

    // 5. Ensure current working directory / workspace directory drive is accessible
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(prefix) = cwd.ancestors().last() {
            let prefix_str = prefix.to_string_lossy().to_string();
            if seen.insert(prefix_str.to_lowercase()) {
                dirs.push(UserDirectory {
                    name: format!("Drive ({})", prefix_str.trim_end_matches('\\')),
                    path: prefix_str,
                    exists: true,
                });
            }
        }
    }

    dirs
}

/// Live real-time folder search directly over the computer's user directories
#[tauri::command(async)]
pub fn search_folders_live(
    created_after: Option<String>,
    created_before: Option<String>,
    modified_after: Option<String>,
    modified_before: Option<String>,
    name_query: Option<String>,
    limit: Option<usize>,
) -> Vec<DiscoveredFolder> {
    let max_results = limit.unwrap_or(200);
    let mut results = Vec::new();
    let lower_name = name_query.as_deref().map(|s| s.to_lowercase());

    // Determine scan depth based on whether we have specific name filter
    let max_depth = if lower_name.is_some() { 6 } else { 5 };

    let accessible = get_accessible_directories();
    for dir in accessible {
        if !dir.exists || results.len() >= max_results {
            continue;
        }
        let root = PathBuf::from(&dir.path);
        search_folders_recursive(
            &root,
            0,
            max_depth,
            created_after.as_deref(),
            created_before.as_deref(),
            modified_after.as_deref(),
            modified_before.as_deref(),
            lower_name.as_deref(),
            max_results,
            &mut results,
        );
    }

    results
}

fn search_folders_recursive(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    created_after: Option<&str>,
    created_before: Option<&str>,
    modified_after: Option<&str>,
    modified_before: Option<&str>,
    name_query: Option<&str>,
    max_results: usize,
    results: &mut Vec<DiscoveredFolder>,
) {
    if depth > max_depth || results.len() >= max_results {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // Handle ACCESS_DENIED gracefully
    };

    for entry in entries.flatten() {
        if results.len() >= max_results {
            break;
        }
        let path = entry.path();
        if path.is_dir() {
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if should_ignore_entry(&dir_name) {
                continue;
            }

            let metadata = entry.metadata().ok();
            let created = metadata.as_ref().and_then(|m| m.created().ok());
            let modified = metadata.as_ref().and_then(|m| m.modified().ok());
            let accessed = metadata.as_ref().and_then(|m| m.accessed().ok());

            // Check creation range
            let passes_creation = if created_after.is_some() || created_before.is_some() {
                is_within_time_range(created, created_after, created_before)
            } else {
                true
            };

            // Check modification range
            let passes_modification = if modified_after.is_some() || modified_before.is_some() {
                is_within_time_range(modified, modified_after, modified_before)
            } else {
                true
            };

            // Check name query (support multiple words as separate substrings)
            let passes_name = if let Some(query) = name_query {
                let lower_dir_name = dir_name.to_lowercase();
                query.split_whitespace().all(|word| lower_dir_name.contains(word))
            } else {
                true
            };

            // Folder matches all criteria
            if passes_creation && passes_modification && passes_name {
                let item_count = fs::read_dir(&path).map(|r| r.count()).unwrap_or(0);
                let parent_path = path.parent().map(|p| p.to_string_lossy().to_string());

                results.push(DiscoveredFolder {
                    path: path.to_string_lossy().to_string(),
                    name: dir_name,
                    parent_path,
                    created_at: created.and_then(system_time_to_rfc3339),
                    modified_at: modified.and_then(system_time_to_rfc3339),
                    accessed_at: accessed.and_then(system_time_to_rfc3339),
                    item_count,
                });
            }

            // Always recurse into children (even if THIS folder didn't match)
            search_folders_recursive(
                &path,
                depth + 1,
                max_depth,
                created_after,
                created_before,
                modified_after,
                modified_before,
                name_query,
                max_results,
                results,
            );
        }
    }
}

/// Live real-time file search directly over the computer's user directories
#[tauri::command(async)]
pub fn search_files_live(
    created_after: Option<String>,
    created_before: Option<String>,
    modified_after: Option<String>,
    modified_before: Option<String>,
    file_types: Option<Vec<String>>,
    extension: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
    scope_path: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Vec<DiscoveredFile> {
    #[cfg(target_os = "android")]
    {
        let mut request = serde_json::Map::new();
        if let Some(v) = created_after { request.insert("createdAfter".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = created_before { request.insert("createdBefore".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = modified_after { request.insert("modifiedAfter".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = modified_before { request.insert("modifiedBefore".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = file_types { request.insert("fileTypes".to_string(), serde_json::json!(v)); }
        if let Some(v) = extension { request.insert("extension".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = query { request.insert("query".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = limit { request.insert("limit".to_string(), serde_json::json!(v)); }
        if let Some(v) = scope_path { request.insert("scopePath".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = sort_by { request.insert("sortBy".to_string(), serde_json::Value::String(v)); }
        if let Some(v) = sort_order { request.insert("sortOrder".to_string(), serde_json::Value::String(v)); }
        let request_val = serde_json::Value::Object(request);
        match android_files::search_files(&request_val.to_string()) {
            Ok(json) => return serde_json::from_str(&json).unwrap_or_default(),
            Err(error) => {
                log::error!("[Foundry][AndroidFiles] SAF search failed: {}", error);
                return Vec::new();
            }
        }
    }

    #[cfg(not(target_os = "android"))]
    {
    let requested_limit = limit.unwrap_or(200);
    let is_sorting = sort_by.is_some();
    // When sorting, collect candidates up to 5000 files so top largest/newest are found across directories
    let scan_limit = if is_sorting || query.is_some() { requested_limit.max(5000) } else { requested_limit };
    let mut results = Vec::new();
    let lower_ext = extension.as_deref().map(|e| e.to_lowercase());
    let lower_query = query.as_deref().map(|q| q.to_lowercase());

    // Determine scan depth: deeper for specific searches
    let max_depth = if lower_query.is_some() || lower_ext.is_some() || file_types.is_some() { 6 } else { 5 };

    // Resolve scope directories
    let target_dirs: Vec<PathBuf> = if let Some(ref scope) = scope_path {
        let trimmed_scope = scope.trim();
        let path = Path::new(trimmed_scope);
        if path.exists() && path.is_dir() {
            vec![path.to_path_buf()]
        } else {
            // Check against accessible directories
            let accessible = get_accessible_directories();
            let lower_scope = trimmed_scope.to_lowercase();
            let matched: Vec<PathBuf> = accessible.into_iter()
                .filter(|d| d.exists && (d.name.to_lowercase().contains(&lower_scope) || d.path.to_lowercase().contains(&lower_scope)))
                .map(|d| PathBuf::from(d.path))
                .collect();
            if !matched.is_empty() {
                matched
            } else {
                let android_base = Path::new("/storage/emulated/0");
                if android_base.exists() {
                    let direct_cand = match lower_scope.as_str() {
                        "download" | "downloads" => Some(android_base.join("Download")),
                        "document" | "documents" | "doc" | "docs" => Some(android_base.join("Documents")),
                        "dcim" | "camera" | "photos" | "photo" => Some(android_base.join("DCIM")),
                        "pictures" | "picture" | "images" | "image" => Some(android_base.join("Pictures")),
                        "movies" | "movie" | "videos" | "video" => Some(android_base.join("Movies")),
                        "music" | "songs" | "audio" => Some(android_base.join("Music")),
                        _ => None,
                    };
                    if let Some(cand) = direct_cand {
                        if cand.exists() && cand.is_dir() {
                            vec![cand]
                        } else {
                            vec![android_base.to_path_buf()]
                        }
                    } else {
                        get_accessible_directories().into_iter().filter(|d| d.exists).map(|d| PathBuf::from(d.path)).collect()
                    }
                } else if let Ok(profile) = std::env::var("USERPROFILE") {
                    let candidate = PathBuf::from(&profile).join(trimmed_scope);
                    if candidate.exists() && candidate.is_dir() {
                        vec![candidate]
                    } else {
                        get_accessible_directories().into_iter().filter(|d| d.exists).map(|d| PathBuf::from(d.path)).collect()
                    }
                } else {
                    get_accessible_directories().into_iter().filter(|d| d.exists).map(|d| PathBuf::from(d.path)).collect()
                }
            }
        }
    } else {
        get_accessible_directories().into_iter().filter(|d| d.exists).map(|d| PathBuf::from(d.path)).collect()
    };

    for root in target_dirs {
        if results.len() >= scan_limit {
            break;
        }
        search_files_recursive(
            &root,
            0,
            max_depth,
            created_after.as_deref(),
            created_before.as_deref(),
            modified_after.as_deref(),
            modified_before.as_deref(),
            file_types.as_deref(),
            lower_ext.as_deref(),
            lower_query.as_deref(),
            scan_limit,
            &mut results,
        );
    }

    // Sort if requested, or sort by relevance if query is present
    if let Some(ref sort_key) = sort_by {
        let is_asc = sort_order.as_deref().map(|o| o.eq_ignore_ascii_case("asc")).unwrap_or(false);
        match sort_key.to_lowercase().as_str() {
            "size" => {
                if is_asc {
                    results.sort_by(|a, b| a.size.cmp(&b.size));
                } else {
                    results.sort_by(|a, b| b.size.cmp(&a.size));
                }
            }
            "modified" | "modifiedat" | "date" => {
                if is_asc {
                    results.sort_by(|a, b| a.modified_at.cmp(&b.modified_at));
                } else {
                    results.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
                }
            }
            "created" | "createdat" => {
                if is_asc {
                    results.sort_by(|a, b| a.created_at.cmp(&b.created_at));
                } else {
                    results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                }
            }
            "name" => {
                if is_asc {
                    results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
                } else {
                    results.sort_by(|a, b| b.name.to_lowercase().cmp(&a.name.to_lowercase()));
                }
            }
            "relevance" => {
                if let Some(ref q) = query {
                    results.sort_by(|a, b| {
                        let sa = compute_relevance_score(&a.name, &a.path, &a.file_type, &a.extension, q);
                        let sb = compute_relevance_score(&b.name, &b.path, &b.file_type, &b.extension, q);
                        sb.cmp(&sa)
                    });
                }
            }
            _ => {}
        }
    } else if let Some(ref q) = query {
        // Default ranking: intelligent multi-signal relevance scoring
        results.sort_by(|a, b| {
            let sa = compute_relevance_score(&a.name, &a.path, &a.file_type, &a.extension, q);
            let sb = compute_relevance_score(&b.name, &b.path, &b.file_type, &b.extension, q);
            sb.cmp(&sa)
        });
    }

    if results.len() > requested_limit {
        results.truncate(requested_limit);
    }

    results
    }
}

fn name_tokens(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

/// True when a file name looks like a resume: "resume", "CV", "curriculum", or a "Res" token as in
/// "Jagadeesh_Developer_Res.pdf".
fn looks_like_resume(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    lower.contains("resume") || name_tokens(file_name).iter().any(|t| t == "cv" || t == "res" || t == "curriculum")
}

/// Decide whether a file satisfies a free-text query. Every meaningful query word must appear in the
/// file name or path (plural-insensitive); resume/cv queries also match resume-like names.
pub fn query_matches(file_name: &str, file_path: &str, query: &str) -> bool {
    let q = query.to_lowercase();
    let lname = file_name.to_lowercase();
    let lpath = file_path.to_lowercase();
    if lname.contains(&q) || lpath.contains(&q) {
        return true;
    }
    let stop = ["from", "my", "the", "a", "an", "me", "in", "present", "system", "give", "show", "find", "file", "files", "document", "documents"];
    let words: Vec<String> = q
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && !stop.contains(w))
        .map(|w| w.to_string())
        .collect();
    if words.is_empty() {
        return true;
    }
    words.iter().all(|w| {
        let stem = if w.ends_with('s') && w.len() > 3 { &w[..w.len() - 1] } else { w.as_str() };
        let resume_word = w == "resume" || w == "resumes" || w == "cv";
        // Misspellings and transliterations ("resme", "adhar" vs "Aadhaar_Card.pdf") via fuzzy token match.
        let fuzzy_hit = w.chars().count() >= 4 && crate::fuzzy::matches_any_token(w, file_name);
        fuzzy_hit
            || (resume_word && looks_like_resume(file_name))
            || lname.contains(w.as_str())
            || lname.contains(stem)
            || lpath.contains(w.as_str())
            || lpath.contains(stem)
    })
}

pub fn compute_relevance_score(file_name: &str, file_path: &str, file_type: &str, ext: &str, query: &str) -> i32 {
    let lower_name = file_name.to_lowercase();
    let lower_path = file_path.to_lowercase();
    let lower_query = query.to_lowercase();
    let q_words: Vec<&str> = lower_query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && !["from", "my", "the", "a", "an", "me", "in", "present", "system", "give", "show", "find"].contains(w))
        .collect();

    if q_words.is_empty() {
        return 0;
    }

    let mut score = 0;

    // 1. Exact query match in filename or path
    if lower_name.contains(&lower_query) {
        score += 100;
    } else if lower_path.contains(&lower_query) {
        score += 50;
    }

    // 2. Token overlap: how many query keywords match filename
    let mut matched_in_name = 0;
    let mut matched_in_path = 0;
    for &word in &q_words {
        let clean_word = if word.ends_with('s') && word.len() > 3 { &word[..word.len()-1] } else { word };
        if lower_name.contains(word) || lower_name.contains(clean_word) {
            score += 25;
            matched_in_name += 1;
        } else if lower_path.contains(word) || lower_path.contains(clean_word) {
            score += 10;
            matched_in_path += 1;
        }
    }

    // Boost if all or most query words matched
    if matched_in_name == q_words.len() {
        score += 50;
    } else if matched_in_name + matched_in_path >= q_words.len() {
        score += 25;
    }

    // 3. Role Keywords vs Intent Matching
    let is_resume_query = q_words.iter().any(|&w| w == "resume" || w == "cv");
    let role_words: Vec<&str> = q_words.iter().cloned().filter(|&w| w != "resume" && w != "cv").collect();

    if !role_words.is_empty() {
        let matched_role_words = role_words.iter().filter(|&&w| {
            let clean = if w.ends_with('s') && w.len() > 3 { &w[..w.len()-1] } else { w };
            lower_name.contains(w) || lower_name.contains(clean)
        }).count();

        // Exact role match: all role words appear in filename
        if matched_role_words == role_words.len() {
            score += 70;
        } else if matched_role_words > 0 {
            score += (matched_role_words as i32) * 25;
        }
    }

    // 4. Semantic Role Filtering:
    if is_resume_query {
        let is_resume_file = looks_like_resume(file_name);
        let is_doc = file_type == "PDF" || file_type == "Document";

        if is_resume_file {
            score += 40;
        } else if !role_words.is_empty() && is_doc {
            // A document matching role keywords (e.g. Accessibility_Tester.pdf) when seeking a resume
            score += 40;
        }

        // Penalize bug reports, audits, spreadsheets, readmes, requirements when seeking a resume
        if lower_name.contains("bug") || lower_name.contains("report") || lower_name.contains("audit") 
           || lower_name.contains("readme") || lower_name.contains("requirements") || ext == "xlsx" || ext == "csv" {
            score -= 60;
        }

        if is_doc {
            score += 20;
        }
    }

    // If query mentions video / recording
    let is_video_query = q_words.iter().any(|&w| w == "video" || w == "recording" || w == "screen");
    if is_video_query && file_type == "Video" {
        score += 40;
    }

    // If query mentions spreadsheet / excel
    let is_sheet_query = q_words.iter().any(|&w| w == "excel" || w == "spreadsheet" || w == "sheet");
    if is_sheet_query && file_type == "Spreadsheet" {
        score += 40;
    }

    score
}

fn search_files_recursive(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    created_after: Option<&str>,
    created_before: Option<&str>,
    modified_after: Option<&str>,
    modified_before: Option<&str>,
    file_types: Option<&[String]>,
    extension: Option<&str>,
    query: Option<&str>,
    max_results: usize,
    results: &mut Vec<DiscoveredFile>,
) {
    if depth > max_depth || results.len() >= max_results {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if results.len() >= max_results {
            break;
        }
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if should_ignore_entry(&file_name) {
            continue;
        }

        if path.is_dir() {
            search_files_recursive(
                &path,
                depth + 1,
                max_depth,
                created_after,
                created_before,
                modified_after,
                modified_before,
                file_types,
                extension,
                query,
                max_results,
                results,
            );
        } else if path.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if let Some(target_ext) = extension {
                if ext != target_ext {
                    continue;
                }
            }

            let file_type = classify_file_type(&ext).to_string();
            if let Some(types) = file_types {
                if !types.iter().any(|t| {
                    t.eq_ignore_ascii_case(&file_type)
                        || (t.eq_ignore_ascii_case("Document") && file_type == "PDF")
                }) {
                    continue;
                }
            }

            let metadata = entry.metadata().ok();
            let created = metadata.as_ref().and_then(|m| m.created().ok());
            let modified = metadata.as_ref().and_then(|m| m.modified().ok());
            let accessed = metadata.as_ref().and_then(|m| m.accessed().ok());

            if (created_after.is_some() || created_before.is_some())
                && !is_within_time_range(created, created_after, created_before)
            {
                continue;
            }

            if (modified_after.is_some() || modified_before.is_some())
                && !is_within_time_range(modified, modified_after, modified_before)
            {
                continue;
            }

            if let Some(q) = query {
                if !query_matches(&file_name, &path.to_string_lossy(), q) {
                    continue;
                }
            }

            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

            results.push(DiscoveredFile {
                path: path.to_string_lossy().to_string(),
                name: file_name,
                extension: ext,
                size,
                created_at: created.and_then(system_time_to_rfc3339),
                modified_at: modified.and_then(system_time_to_rfc3339),
                accessed_at: accessed.and_then(system_time_to_rfc3339),
                file_type,
                mime_type: None,
            });
        }
    }
}

#[tauri::command(async)]
pub fn get_folder_metadata(path: String) -> Result<DiscoveredFolder, String> {
    let p = PathBuf::from(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Directory does not exist".to_string());
    }

    let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
    let created = metadata.created().ok();
    let modified = metadata.modified().ok();
    let accessed = metadata.accessed().ok();
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let parent_path = p.parent().map(|parent| parent.to_string_lossy().to_string());
    let item_count = fs::read_dir(&p).map(|r| r.count()).unwrap_or(0);

    Ok(DiscoveredFolder {
        path,
        name,
        parent_path,
        created_at: created.and_then(system_time_to_rfc3339),
        modified_at: modified.and_then(system_time_to_rfc3339),
        accessed_at: accessed.and_then(system_time_to_rfc3339),
        item_count,
    })
}

#[tauri::command(async)]
pub fn get_file_metadata(path: String) -> Result<DiscoveredFile, String> {
    #[cfg(target_os = "android")]
    if path.starts_with("content://") {
        let metadata = android_files::file_metadata(&path)?
            .ok_or_else(|| "SAF document metadata was not available".to_string())?;
        return serde_json::from_str(&metadata).map_err(|error| format!("Invalid SAF metadata: {error}"));
    }

    let p = crate::access_policy::permitted_path(&path)?;
    if !p.is_file() {
        return Err("File does not exist".to_string());
    }

    let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
    let created = metadata.created().ok();
    let modified = metadata.modified().ok();
    let accessed = metadata.accessed().ok();
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let file_type = classify_file_type(&ext).to_string();

    Ok(DiscoveredFile {
        path,
        name,
        extension: ext,
        size: metadata.len(),
        created_at: created.and_then(system_time_to_rfc3339),
        modified_at: modified.and_then(system_time_to_rfc3339),
        accessed_at: accessed.and_then(system_time_to_rfc3339),
        file_type,
        mime_type: None,
    })
}

#[tauri::command(async)]
pub fn scan_user_directory(dir_path: String, max_files: usize) -> Vec<DiscoveredFile> {
    let mut files = Vec::new();
    let root = Path::new(&dir_path);
    if !root.exists() || !root.is_dir() {
        return files;
    }
    search_files_recursive(root, 0, 5, None, None, None, None, None, None, None, max_files, &mut files);
    files
}

#[tauri::command(async)]
pub fn scan_user_folders(dir_path: String, max_folders: usize) -> Vec<DiscoveredFolder> {
    let mut folders = Vec::new();
    let root = Path::new(&dir_path);
    if !root.exists() || !root.is_dir() {
        return folders;
    }
    search_folders_recursive(root, 0, 5, None, None, None, None, None, max_folders, &mut folders);
    folders
}

pub fn extract_pdf_text(data: &[u8], max_bytes: usize) -> String {
    let mut text_parts = Vec::new();
    let mut in_parentheses = false;
    let mut current_literal = Vec::new();
    let mut is_escaped = false;

    // Scan for text within PDF string literals `(...)`
    for &byte in data {
        if text_parts.iter().map(|s: &String| s.len()).sum::<usize>() >= max_bytes {
            break;
        }

        if is_escaped {
            current_literal.push(byte);
            is_escaped = false;
            continue;
        }

        match byte {
            b'\\' => {
                if in_parentheses {
                    is_escaped = true;
                }
            }
            b'(' => {
                in_parentheses = true;
                current_literal.clear();
            }
            b')' => {
                if in_parentheses {
                    in_parentheses = false;
                    if let Ok(s) = std::str::from_utf8(&current_literal) {
                        let trimmed = s.trim();
                        // Filter out binary junk or internal PDF font IDs
                        if trimmed.len() >= 2 && trimmed.chars().all(|c| c.is_ascii_graphic() || c.is_whitespace()) {
                            text_parts.push(trimmed.to_string());
                        }
                    }
                    current_literal.clear();
                }
            }
            _ => {
                if in_parentheses {
                    current_literal.push(byte);
                }
            }
        }
    }

    let extracted = text_parts.join(" ");
    if extracted.len() >= 30 {
        extracted
    } else {
        // Look for readable metadata like /Title, /Author, etc.
        let lossy = String::from_utf8_lossy(data);
        let mut meta_hints = Vec::new();
        for key in &["/Title", "/Author", "/Subject", "/Creator", "/Producer"] {
            if let Some(pos) = lossy.find(key) {
                let snippet = &lossy[pos..std::cmp::min(pos + 120, lossy.len())];
                if let Some(end) = snippet.find('\n') {
                    meta_hints.push(snippet[..end].trim().to_string());
                }
            }
        }

        if !meta_hints.is_empty() {
            format!("PDF Document ({})\n[Note: Core body text is encoded in compressed streams. Use system viewer for full visual rendering]", meta_hints.join(", "))
        } else if !extracted.is_empty() {
            extracted
        } else {
            "PDF Document: Core body text is encoded in compressed streams or scanned pages. Open with system viewer for full visual rendering.".to_string()
        }
    }
}

#[tauri::command(async)]
pub fn read_file_content(path: String, max_bytes: usize) -> Result<String, String> {
    #[cfg(target_os = "android")]
    if path.starts_with("content://") {
        return android_files::read_file_content(&path, max_bytes);
    }

    let p = crate::access_policy::permitted_path(&path)?;
    if !p.is_file() {
        return Err("File does not exist or is not a regular file".to_string());
    }

    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext == "pdf" {
        // PDF text needs the whole file; refuse very large ones instead of loading them into memory.
        const MAX_PDF_BYTES: u64 = 64 * 1024 * 1024;
        let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        if size > MAX_PDF_BYTES {
            return Err(format!("PDF is too large to read ({} MB).", size / (1024 * 1024)));
        }
        let data = fs::read(&p).map_err(|e| format!("Cannot read file: {}", e))?;
        return Ok(extract_pdf_text(&data, max_bytes));
    }

    // Read only what was asked for, not the whole file.
    use std::io::Read;
    let file = fs::File::open(&p).map_err(|e| format!("Cannot read file: {}", e))?;
    let mut data = Vec::with_capacity(max_bytes.min(1024 * 1024));
    file.take(max_bytes as u64)
        .read_to_end(&mut data)
        .map_err(|e| format!("Cannot read file: {}", e))?;
    Ok(String::from_utf8_lossy(&data).to_string())
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    if path.starts_with("http://") || path.starts_with("https://") {
        return crate::oauth::open_browser_url(path);
    }

    #[cfg(target_os = "android")]
    if path.starts_with("content://") {
        return if android_files::open_file(&path)? {
            Ok(())
        } else {
            Err("No Android application can open this document".to_string())
        };
    }

    // Documents and folders only, inside the accessible folders, opened without a shell
    // (the old `cmd /c start <path>` would run executables and interpret cmd metacharacters).
    let p = crate::access_policy::permitted_path(&path)?;
    if p.is_file() && crate::access_policy::is_executable(&p) {
        return Err("Foundry opens documents and folders, not programs or scripts.".to_string());
    }
    let target = crate::access_policy::display_path(&p);
    if cfg!(target_os = "android") {
        return crate::access_policy::shell_open(&format!("file://{target}"));
    }
    crate::access_policy::shell_open(&target)
}

#[tauri::command]
pub fn reveal_file_in_explorer(path: String) -> Result<(), String> {
    let path = crate::access_policy::display_path(&crate::access_policy::permitted_path(&path)?);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| format!("Failed to reveal in explorer: {}", e))?;
    }
    #[cfg(target_os = "android")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        let folder_uri = if parent.starts_with("file://") { parent } else { format!("file://{}", parent) };
        let _ = std::process::Command::new("/system/bin/am")
            .arg("start")
            .arg("-a")
            .arg("android.intent.action.VIEW")
            .arg("-d")
            .arg(&folder_uri)
            .status();
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "android")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to reveal in explorer: {}", e))?;
    }
    Ok(())
}
