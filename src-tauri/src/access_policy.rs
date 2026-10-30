//! Access policy for every backend command that touches files, URLs or processes.
//!
//! The webview can call any registered command, so the backend must not trust its arguments.
//! Rules enforced here:
//! - Files are readable/openable only inside the folders Foundry searches (the accessible
//!   directories), after resolving `..` and symlinks, and never inside hidden/system folders
//!   that search itself skips. Key and credential files are always refused.
//! - Opening a file never executes it: executables and scripts are refused.
//! - The HTTP proxy only reaches the local machine (local AI engines) and the specific
//!   cloud APIs that Foundry's connectors use.
//! - Applications can only be launched from targets that the backend itself resolved.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

/// Cloud API hosts used by Foundry's connectors (suffix match, HTTPS only).
const ALLOWED_API_HOSTS: &[&str] = &[
    "googleapis.com",
    "accounts.google.com",
    "login.microsoftonline.com",
    "graph.microsoft.com",
    "slack.com",
    "api.telegram.org",
    "graph.facebook.com",
    "api.foundry-ai.com",
    "api.anthropic.com",
];

/// Extensions that would execute code if handed to the OS "open" action.
const EXECUTABLE_EXTENSIONS: &[&str] = &[
    "exe", "com", "bat", "cmd", "ps1", "psm1", "psd1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp",
    "scr", "hta", "cpl", "jar", "reg", "lnk", "url", "pif", "scf", "inf", "sys", "dll", "appref-ms",
    "application", "gadget", "msc", "sh",
];

/// Private keys, certificates and password vaults: never readable through Foundry.
const SECRET_EXTENSIONS: &[&str] = &["pem", "key", "pfx", "p12", "kdbx", "keychain", "gpg", "ppk"];
const SECRET_FILE_NAMES: &[&str] = &["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"];

static LAUNCHABLE_TARGETS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn eq_component(a: &Component, b: &Component) -> bool {
    if cfg!(windows) {
        a.as_os_str().to_string_lossy().eq_ignore_ascii_case(&b.as_os_str().to_string_lossy())
    } else {
        a == b
    }
}

fn starts_with_path(path: &Path, root: &Path) -> bool {
    let mut p = path.components();
    for r in root.components() {
        match p.next() {
            Some(c) if eq_component(&c, &r) => {}
            _ => return false,
        }
    }
    true
}

/// Strip the Windows verbatim prefix (`\\?\`) that `canonicalize` adds, for display and shell use.
pub fn display_path(path: &Path) -> String {
    let s = path.to_string_lossy().to_string();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    s.strip_prefix(r"\\?\").map(|r| r.to_string()).unwrap_or(s)
}

fn extension_of(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
}

fn is_secret_file(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
    SECRET_FILE_NAMES.contains(&name.as_str()) || SECRET_EXTENSIONS.contains(&extension_of(path).as_str())
}

/// Check a path against explicit roots. Separated from the live directory list for testing.
pub fn permitted_path_within(raw: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(raw).map_err(|_| format!("Not found: {raw}"))?;
    let root = roots
        .iter()
        .filter_map(|r| std::fs::canonicalize(r).ok())
        .find(|r| starts_with_path(&canonical, r))
        .ok_or_else(|| "This location is outside the folders Foundry is allowed to access.".to_string())?;

    // Below the root, refuse hidden and system folders that search never surfaces either.
    let relative: Vec<Component> = canonical.components().skip(root.components().count()).collect();
    for component in &relative {
        let name = component.as_os_str().to_string_lossy();
        if crate::filesystem::should_ignore_entry(&name) {
            return Err("This location is a hidden or system folder that Foundry does not access.".to_string());
        }
    }
    if is_secret_file(&canonical) {
        return Err("Foundry does not access key, certificate or password-vault files.".to_string());
    }
    Ok(canonical)
}

/// Resolve `raw` and confirm it is inside the folders Foundry is allowed to access.
pub fn permitted_path(raw: &str) -> Result<PathBuf, String> {
    let roots: Vec<PathBuf> = crate::filesystem::get_accessible_directories()
        .into_iter()
        .filter(|d| d.exists)
        .map(|d| PathBuf::from(d.path))
        .collect();
    permitted_path_within(raw, &roots)
}

/// True when opening this file with the OS default handler would run code.
pub fn is_executable(path: &Path) -> bool {
    EXECUTABLE_EXTENSIONS.contains(&extension_of(path).as_str())
}

/// Only plain web links may be opened in the browser (no file:, javascript:, ms-settings: and so on).
pub fn check_browser_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid URL".to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(()),
        other => Err(format!("Refusing to open a '{other}:' link; only web links are allowed.")),
    }
}

fn host_is_allowed_api(host: &str) -> bool {
    let host = host.to_lowercase();
    ALLOWED_API_HOSTS.iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

/// Proxy policy: loopback (local AI engines) over http/https, or allow-listed cloud APIs over https.
pub fn check_proxy_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid URL".to_string())?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Proxy refused: unsupported scheme '{scheme}'."));
    }
    let loopback = match parsed.host() {
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        Some(url::Host::Domain(d)) => d.eq_ignore_ascii_case("localhost"),
        None => false,
    };
    if loopback {
        return Ok(());
    }
    match parsed.host() {
        Some(url::Host::Domain(d)) if scheme == "https" && host_is_allowed_api(d) => Ok(()),
        _ => Err(format!(
            "Proxy refused: {} is not the local machine or an allowed service.",
            parsed.host_str().unwrap_or("this host")
        )),
    }
}

/// Remember an application target the backend resolved, so it may be launched later.
pub fn register_launch_target(target: &str) {
    if let Ok(mut guard) = LAUNCHABLE_TARGETS.lock() {
        guard.get_or_insert_with(HashSet::new).insert(target.to_lowercase());
    }
}

/// Launching is only allowed for targets previously produced by the backend's own resolver.
pub fn is_registered_launch_target(target: &str) -> bool {
    LAUNCHABLE_TARGETS
        .lock()
        .map(|g| g.as_ref().map(|s| s.contains(&target.to_lowercase())).unwrap_or(false))
        .unwrap_or(false)
}

/// Open a document, folder or web link with the OS default handler, without going through a shell.
pub fn shell_open(target: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        let wide = |s: &str| -> Vec<u16> { OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect() };
        let file = wide(target);
        let op = wide("open");

        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(
                hwnd: *mut std::ffi::c_void,
                lp_operation: *const u16,
                lp_file: *const u16,
                lp_parameters: *const u16,
                lp_directory: *const u16,
                n_show_cmd: i32,
            ) -> isize;
        }
        let res = unsafe {
            ShellExecuteW(std::ptr::null_mut(), op.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), 1)
        };
        if res <= 32 {
            return Err(format!("Windows could not open this item (error {res})."));
        }
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(target).spawn().map(|_| ()).map_err(|e| format!("Failed to open: {e}"))
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos"), not(target_os = "android")))]
    {
        std::process::Command::new("xdg-open").arg(target).spawn().map(|_| ()).map_err(|e| format!("Failed to open: {e}"))
    }
    #[cfg(target_os = "android")]
    {
        std::process::Command::new("/system/bin/am")
            .args(["start", "-a", "android.intent.action.VIEW", "-d", target])
            .status()
            .map_err(|e| format!("Failed to open: {e}"))
            .and_then(|s| if s.success() { Ok(()) } else { Err("No application could open this item".to_string()) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sandbox(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("foundry_policy_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn paths_inside_roots_are_allowed_and_outside_refused() {
        let root = sandbox("roots");
        let inside = root.join("docs");
        fs::create_dir_all(&inside).unwrap();
        fs::write(inside.join("resume.pdf"), b"x").unwrap();
        let outside = sandbox("outside");
        fs::write(outside.join("secret.txt"), b"x").unwrap();

        let roots = vec![root.clone()];
        assert!(permitted_path_within(inside.join("resume.pdf").to_str().unwrap(), &roots).is_ok());
        assert!(permitted_path_within(outside.join("secret.txt").to_str().unwrap(), &roots).is_err());
        // `..` that escapes the root is resolved and refused
        let escape = inside.join("..").join("..").join(outside.file_name().unwrap()).join("secret.txt");
        assert!(permitted_path_within(escape.to_str().unwrap(), &roots).is_err());
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn hidden_folders_and_secret_files_are_refused() {
        let root = sandbox("hidden");
        fs::create_dir_all(root.join(".ssh")).unwrap();
        fs::write(root.join(".ssh").join("config"), b"x").unwrap();
        fs::write(root.join("server.pem"), b"x").unwrap();
        fs::write(root.join("notes.txt"), b"x").unwrap();
        let roots = vec![root.clone()];
        assert!(permitted_path_within(root.join(".ssh").join("config").to_str().unwrap(), &roots).is_err());
        assert!(permitted_path_within(root.join("server.pem").to_str().unwrap(), &roots).is_err());
        assert!(permitted_path_within(root.join("notes.txt").to_str().unwrap(), &roots).is_ok());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn executables_are_detected() {
        assert!(is_executable(Path::new("C:/x/setup.EXE")));
        assert!(is_executable(Path::new("C:/x/run.ps1")));
        assert!(is_executable(Path::new("C:/x/app.lnk")));
        assert!(!is_executable(Path::new("C:/x/resume.pdf")));
        assert!(!is_executable(Path::new("C:/x/photo.jpg")));
    }

    #[test]
    fn proxy_allows_local_ai_and_listed_apis_only() {
        assert!(check_proxy_url("http://127.0.0.1:8172/v1/chat/completions").is_ok());
        assert!(check_proxy_url("http://localhost:11434/api/tags").is_ok());
        assert!(check_proxy_url("https://www.googleapis.com/oauth2/v3/userinfo").is_ok());
        assert!(check_proxy_url("https://oauth2.googleapis.com/token").is_ok());
        assert!(check_proxy_url("https://graph.microsoft.com/v1.0/me").is_ok());
        // not allowed: plain http to cloud, other hosts, LAN, metadata, look-alike domains, other schemes
        assert!(check_proxy_url("http://www.googleapis.com/x").is_err());
        assert!(check_proxy_url("https://evil.example.com/steal").is_err());
        assert!(check_proxy_url("http://192.168.1.1/admin").is_err());
        assert!(check_proxy_url("http://169.254.169.254/latest/meta-data").is_err());
        assert!(check_proxy_url("https://googleapis.com.evil.net/x").is_err());
        assert!(check_proxy_url("file:///C:/Windows/win.ini").is_err());
    }

    #[test]
    fn browser_urls_must_be_web_links() {
        assert!(check_browser_url("https://accounts.google.com/o/oauth2/auth?x=1&y=2").is_ok());
        assert!(check_browser_url("file:///C:/Windows/System32/calc.exe").is_err());
        assert!(check_browser_url("ms-settings:privacy").is_err());
        assert!(check_browser_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn launch_targets_must_be_registered() {
        assert!(!is_registered_launch_target(r"C:\evil\payload.exe"));
        register_launch_target(r"C:\Program Files\App\app.exe");
        assert!(is_registered_launch_target(r"c:\program files\app\APP.exe"));
    }

    #[test]
    fn display_path_strips_verbatim_prefix() {
        assert_eq!(display_path(Path::new(r"\\?\D:\Docs\a.pdf")), r"D:\Docs\a.pdf");
        assert_eq!(display_path(Path::new(r"\\?\UNC\server\share\a.pdf")), r"\\server\share\a.pdf");
    }
}
