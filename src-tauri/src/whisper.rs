use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

static WHISPER_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

pub const WHISPER_PORT: u16 = 8171;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct WhisperServiceStatus {
    pub available: bool,
    pub running: bool,
    pub port: u16,
    pub model_found: bool,
}

pub fn check_whisper_health(port: u16) -> bool {
    use std::io::{Read, Write};
    if let Ok(mut stream) = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(300),
    ) {
        stream.set_read_timeout(Some(Duration::from_millis(500))).ok();
        let req = format!(
            "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            port
        );
        if stream.write_all(req.as_bytes()).is_ok() {
            let mut buf = [0u8; 512];
            if let Ok(n) = stream.read(&mut buf) {
                let resp = String::from_utf8_lossy(&buf[..n]);
                return resp.contains("200 OK") || resp.contains("HTTP/1.1 200") || resp.contains("HTTP/1.0 200");
            }
        }
    }
    false
}

/// Locate whisper-server and its model: next to the installed app first, then the dev source tree.
/// (No machine-specific absolute paths: those only worked on the developer's laptop.)
pub fn resolve_whisper_paths() -> Option<(PathBuf, PathBuf)> {
    let exe_name = if cfg!(windows) { "whisper-server.exe" } else { "whisper-server" };
    let mut runtime_dirs: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            runtime_dirs.push(dir.join("whisper-runtime"));
            runtime_dirs.push(dir.join("resources").join("whisper-runtime"));
        }
    }
    runtime_dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("whisper-runtime"));
    runtime_dirs.push(PathBuf::from("whisper-runtime"));

    runtime_dirs.into_iter().find_map(|dir| {
        let exe = dir.join(exe_name);
        let model = dir.join("ggml-base.en.bin");
        (exe.exists() && model.exists()).then_some((exe, model))
    })
}

/// Stop the whisper-server child process (called when Foundry exits).
pub fn stop_server() {
    if let Ok(mut guard) = WHISPER_CHILD.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

pub fn ensure_whisper_server_running() -> Result<u16, String> {
    let port = WHISPER_PORT;
    if check_whisper_health(port) {
        return Ok(port);
    }

    let (exe, model) = resolve_whisper_paths()
        .ok_or_else(|| "Whisper runtime (whisper-server.exe or ggml-base.en.bin) not found".to_string())?;

    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("-m")
        .arg(&model)
        .arg("--port")
        .arg(port.to_string())
        .arg("-t")
        .arg("4")
        .arg("-l")
        .arg("en")
        .arg("-sns")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start whisper-server: {}", e))?;

    if let Ok(mut guard) = WHISPER_CHILD.lock() {
        if let Some(mut prev) = guard.take() {
            let _ = prev.kill();
        }
        *guard = Some(child);
    }

    let deadline = Instant::now() + Duration::from_secs(12);
    while Instant::now() < deadline {
        if check_whisper_health(port) {
            println!("[Foundry] Whisper server successfully online on port {}", port);
            return Ok(port);
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    Err("Timed out waiting for whisper-server to become ready on port 8171".to_string())
}

#[tauri::command]
pub fn check_whisper_status() -> WhisperServiceStatus {
    let port = WHISPER_PORT;
    let running = check_whisper_health(port);
    let (available, model_found) = if let Some((exe, model)) = resolve_whisper_paths() {
        (exe.exists(), model.exists())
    } else {
        (false, false)
    };

    WhisperServiceStatus {
        available: available && model_found,
        running,
        port,
        model_found,
    }
}

#[tauri::command]
pub async fn transcribe_audio(wav_bytes: Vec<u8>) -> Result<String, String> {
    if wav_bytes.is_empty() {
        return Err("Audio payload is empty".to_string());
    }

    #[cfg(not(target_os = "android"))]
    let _foreground = crate::index::foreground_work();
    let port = ensure_whisper_server_running()?;

    let boundary = "----FoundryWhisperBoundary7f";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n");
    body.extend_from_slice(b"Content-Type: audio/wav\r\n\r\n");
    body.extend_from_slice(&wav_bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"language\"\r\n\r\nen\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"temperature\"\r\n\r\n0.0\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let resp = client
        .post(format!("http://127.0.0.1:{}/inference", port))
        .header("Content-Type", format!("multipart/form-data; boundary={}", boundary))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Inference HTTP request failed: {}", e))?;

    let status = resp.status();
    let text_content = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Whisper response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Whisper inference error ({status}): {text_content}"));
    }

    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text_content) {
        if let Some(txt) = val.get("text").and_then(|t| t.as_str()) {
            return Ok(txt.trim().to_string());
        }
    }

    Ok(text_content.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whisper_paths_found() {
        let res = resolve_whisper_paths();
        println!("Resolved whisper paths: {:?}", res);
        assert!(res.is_some(), "Whisper runtime and ggml model should be discovered");
        let (exe, model) = res.unwrap();
        assert!(exe.exists(), "whisper-server.exe must exist");
        assert!(model.exists(), "ggml-base.en.bin must exist");
    }

    #[test]
    fn test_transcribe_jfk_sample() {
        let sample_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("whisper-runtime")
            .join("jfk.wav");
        if !sample_path.exists() {
            println!("jfk.wav not found, skipping transcription test");
            return;
        }

        let wav_bytes = std::fs::read(&sample_path).expect("Failed to read jfk.wav");
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let res = rt.block_on(async {
            transcribe_audio(wav_bytes).await
        });
        println!("Transcription result for jfk.wav: {:?}", res);
        assert!(res.is_ok(), "Transcription should succeed");
        let transcript = res.unwrap();
        assert!(!transcript.is_empty(), "Transcript should not be empty");
        assert!(
            transcript.to_lowercase().contains("country") || transcript.to_lowercase().contains("ask not"),
            "Expected JFK speech content, got: {}", transcript
        );
    }
}
