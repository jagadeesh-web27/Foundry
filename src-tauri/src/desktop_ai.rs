//! Desktop on-device AI: a bundled `llama-server` (llama.cpp) running a local GGUF model.
//!
//! Mirrors the whisper-server pattern: Foundry owns the child process, so users do not need
//! Ollama, LM Studio or any other separately installed AI program. llama-server exposes an
//! OpenAI-compatible API on 127.0.0.1 only, which the frontend talks to.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const LLAMA_PORT: u16 = 8172;

const MODEL_FILE: &str = "foundry-desktop-model.gguf";
const MODEL_NAME: &str = "Llama 3.2 3B Instruct (Q4_K_M)";
const DEFAULT_MODEL_URL: &str =
    "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf";
// A real model is well over this; anything smaller is a failed or truncated download.
const MIN_VALID_MODEL_BYTES: u64 = 200 * 1024 * 1024;

static LLAMA_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);
static DOWNLOAD: Mutex<DownloadState> = Mutex::new(DownloadState::new());

#[derive(Clone, Debug)]
struct DownloadState {
    state: &'static str, // idle | downloading | done | error
    downloaded: u64,
    total: u64,
    error: Option<String>,
    cancel: bool,
}

impl DownloadState {
    const fn new() -> Self {
        Self { state: "idle", downloaded: 0, total: 0, error: None, cancel: false }
    }
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAiStatus {
    pub runtime_found: bool,
    pub model_found: bool,
    pub model_path: String,
    pub model_size_bytes: u64,
    pub model_name: String,
    pub server_running: bool,
    pub server_ready: bool,
    pub port: u16,
    pub download_state: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub error_message: Option<String>,
    pub default_download_url: String,
}

fn models_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("XDG_DATA_HOME"))
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(std::env::temp_dir);
    base.join("Foundry").join("models")
}

fn model_path() -> PathBuf {
    models_dir().join(MODEL_FILE)
}

fn server_exe_name() -> &'static str {
    if cfg!(windows) { "llama-server.exe" } else { "llama-server" }
}

/// Locate llama-server: next to the installed app first, then the dev source tree.
pub fn resolve_llama_server() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("llama-runtime").join(server_exe_name()));
            candidates.push(dir.join("resources").join("llama-runtime").join(server_exe_name()));
        }
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("llama-runtime").join(server_exe_name()));
    candidates.push(PathBuf::from("llama-runtime").join(server_exe_name()));
    candidates.into_iter().find(|c| c.exists())
}

fn model_size() -> u64 {
    std::fs::metadata(model_path()).map(|m| m.len()).unwrap_or(0)
}

fn model_installed() -> bool {
    model_size() >= MIN_VALID_MODEL_BYTES
}

fn http_status_line(port: u16, path: &str) -> Option<String> {
    use std::io::Read;
    let mut stream = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(300),
    )
    .ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(800))).ok();
    let req = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = [0u8; 256];
    let n = stream.read(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf[..n]).lines().next().unwrap_or("").to_string())
}

/// llama-server answers 200 on /health only once the model is loaded (503 while loading).
fn server_ready() -> bool {
    http_status_line(LLAMA_PORT, "/health").map(|l| l.contains(" 200")).unwrap_or(false)
}

fn child_alive() -> bool {
    match LLAMA_CHILD.lock() {
        Ok(mut guard) => match guard.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        },
        Err(_) => false,
    }
}

pub fn ensure_server_running() -> Result<u16, String> {
    if server_ready() {
        return Ok(LLAMA_PORT);
    }
    let exe = resolve_llama_server().ok_or_else(|| {
        "Local AI engine (llama-server) was not found. Reinstall Foundry or place llama-server in the llama-runtime folder.".to_string()
    })?;
    if !model_installed() {
        return Err("Local AI model is not downloaded yet.".to_string());
    }

    if !child_alive() {
        let threads = std::thread::available_parallelism().map(|n| n.get() / 2).unwrap_or(4).clamp(2, 8);
        let mut cmd = std::process::Command::new(&exe);
        cmd.current_dir(exe.parent().unwrap_or(&PathBuf::from(".")))
            .arg("-m").arg(model_path())
            .arg("--host").arg("127.0.0.1")
            .arg("--port").arg(LLAMA_PORT.to_string())
            .arg("-c").arg("4096")
            .arg("-t").arg(threads.to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let child = cmd.spawn().map_err(|e| format!("Failed to start local AI engine: {e}"))?;
        if let Ok(mut guard) = LLAMA_CHILD.lock() {
            if let Some(mut prev) = guard.take() {
                let _ = prev.kill();
            }
            *guard = Some(child);
        }
    }

    let deadline = Instant::now() + Duration::from_secs(120);
    while Instant::now() < deadline {
        if server_ready() {
            println!("[Foundry] Local AI engine online on port {LLAMA_PORT}");
            return Ok(LLAMA_PORT);
        }
        if !child_alive() {
            return Err("Local AI engine exited while loading the model (the model file may be corrupt; delete it and download again).".to_string());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err("Timed out waiting for the local AI engine to load the model.".to_string())
}

pub fn stop_server() {
    if let Ok(mut guard) = LLAMA_CHILD.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

/// Start the engine in the background at app launch if everything is already installed.
pub fn autostart_if_installed() {
    if resolve_llama_server().is_some() && model_installed() {
        std::thread::spawn(|| {
            if let Err(e) = ensure_server_running() {
                eprintln!("[Foundry] Local AI autostart failed: {e}");
            }
        });
    }
}

fn snapshot() -> DesktopAiStatus {
    let dl = DOWNLOAD.lock().map(|g| g.clone()).unwrap_or_else(|_| DownloadState::new());
    let installed = model_installed();
    let state = if dl.state == "downloading" {
        "downloading"
    } else if installed {
        "done"
    } else if dl.state == "error" {
        "error"
    } else {
        "idle"
    };
    DesktopAiStatus {
        runtime_found: resolve_llama_server().is_some(),
        model_found: installed,
        model_path: model_path().to_string_lossy().to_string(),
        model_size_bytes: model_size(),
        model_name: MODEL_NAME.to_string(),
        server_running: child_alive(),
        server_ready: server_ready(),
        port: LLAMA_PORT,
        download_state: state.to_string(),
        downloaded_bytes: dl.downloaded,
        total_bytes: dl.total,
        error_message: dl.error,
        default_download_url: DEFAULT_MODEL_URL.to_string(),
    }
}

fn set_download<F: FnOnce(&mut DownloadState)>(f: F) {
    if let Ok(mut guard) = DOWNLOAD.lock() {
        f(&mut guard);
    }
}

async fn run_download(url: String) -> Result<(), String> {
    let dir = models_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create model folder {dir:?}: {e}"))?;
    let part = dir.join(format!("{MODEL_FILE}.part"));
    let final_path = model_path();

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;
    let mut resp = client.get(&url).send().await.map_err(|e| format!("Download request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download server returned {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    set_download(|d| d.total = total);

    let mut file = std::fs::File::create(&part).map_err(|e| format!("Cannot write {part:?}: {e}"))?;
    let mut written: u64 = 0;
    loop {
        if DOWNLOAD.lock().map(|g| g.cancel).unwrap_or(false) {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Err("Download cancelled.".to_string());
        }
        match resp.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
            Some(bytes) => {
                file.write_all(&bytes).map_err(|e| format!("Disk write failed: {e}"))?;
                written += bytes.len() as u64;
                set_download(|d| d.downloaded = written);
            }
            None => break,
        }
    }
    file.flush().ok();
    drop(file);

    if total > 0 && written != total {
        let _ = std::fs::remove_file(&part);
        return Err(format!("Download incomplete ({written} of {total} bytes). Please try again."));
    }
    if written < MIN_VALID_MODEL_BYTES {
        let _ = std::fs::remove_file(&part);
        return Err("Downloaded file is too small to be a model. Check the download URL.".to_string());
    }
    // Stop an engine still holding the old file before replacing it.
    stop_server();
    let _ = std::fs::remove_file(&final_path);
    std::fs::rename(&part, &final_path).map_err(|e| format!("Cannot finalize model file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn desktop_ai_status() -> DesktopAiStatus {
    snapshot()
}

#[tauri::command]
pub fn desktop_ai_start_download(url: Option<String>) -> Result<DesktopAiStatus, String> {
    {
        let mut guard = DOWNLOAD.lock().map_err(|_| "Download state unavailable".to_string())?;
        if guard.state == "downloading" {
            drop(guard);
            return Ok(snapshot());
        }
        *guard = DownloadState { state: "downloading", ..DownloadState::new() };
    }
    let url = url.filter(|u| !u.trim().is_empty()).unwrap_or_else(|| DEFAULT_MODEL_URL.to_string());
    if !url.starts_with("https://") {
        set_download(|d| {
            d.state = "error";
            d.error = Some("Model URL must start with https://".to_string());
        });
        return Ok(snapshot());
    }
    tauri::async_runtime::spawn(async move {
        match run_download(url).await {
            Ok(()) => set_download(|d| {
                d.state = "done";
                d.error = None;
            }),
            Err(e) => set_download(|d| {
                d.state = "error";
                d.error = Some(e);
            }),
        }
        // Bring the engine up as soon as a model is available.
        if model_installed() {
            let _ = tauri::async_runtime::spawn_blocking(ensure_server_running).await;
        }
    });
    Ok(snapshot())
}

#[tauri::command]
pub fn desktop_ai_cancel_download() -> DesktopAiStatus {
    set_download(|d| d.cancel = true);
    snapshot()
}

#[tauri::command]
pub async fn desktop_ai_start_server() -> Result<DesktopAiStatus, String> {
    tauri::async_runtime::spawn_blocking(ensure_server_running)
        .await
        .map_err(|e| format!("Engine start task failed: {e}"))??;
    Ok(snapshot())
}

#[tauri::command]
pub fn desktop_ai_delete_model() -> Result<DesktopAiStatus, String> {
    stop_server();
    let _ = std::fs::remove_file(model_path());
    set_download(|d| *d = DownloadState::new());
    Ok(snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_path_is_in_foundry_models_dir() {
        let p = model_path();
        assert!(p.ends_with(MODEL_FILE));
        assert!(p.to_string_lossy().contains("Foundry"));
    }

    #[test]
    fn status_snapshot_is_consistent() {
        let s = snapshot();
        assert_eq!(s.port, LLAMA_PORT);
        assert!(s.default_download_url.starts_with("https://"));
        if !s.model_found {
            assert_ne!(s.download_state, "done");
        }
    }

    #[test]
    fn missing_model_is_reported_not_panicked() {
        if !model_installed() {
            assert!(ensure_server_running().is_err());
        }
    }
}
