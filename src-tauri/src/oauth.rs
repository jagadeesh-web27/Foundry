use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct OAuthCallbackResponse {
    pub code: String,
    pub state: String,
}

/// Awaits an OAuth redirect on the specified localhost loopback port (default: 1420).
/// Enforces CSRF state validation, responds with an accessible styled HTML success/failure page,
/// and returns the authorization code.
#[tauri::command]
pub async fn wait_for_oauth_callback(
    port: u16,
    expected_state: String,
    timeout_seconds: Option<u64>,
) -> Result<String, String> {
    let timeout_secs = timeout_seconds.unwrap_or(120);

    tokio::task::spawn_blocking(move || {
        let addr = format!("127.0.0.1:{}", port);
        let listener = TcpListener::bind(&addr).map_err(|e| {
            format!(
                "Failed to bind OAuth loopback listener to {}: {}. Is another instance running?",
                addr, e
            )
        })?;

        // Set non-blocking with a loop check so we can observe the overall timeout
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("Failed to set non-blocking on listener: {}", e))?;

        let start = std::time::Instant::now();
        let timeout_dur = Duration::from_secs(timeout_secs);

        loop {
            if start.elapsed() > timeout_dur {
                return Err("OAuth authorization timed out waiting for user browser response (120s limit).".to_string());
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    // Set a fast read timeout on the active connection
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

                    let mut buffer = [0u8; 4096];
                    let bytes_read = match stream.read(&mut buffer) {
                        Ok(n) => n,
                        Err(e) => {
                            eprintln!("[Foundry OAuth] Failed to read stream: {}", e);
                            continue;
                        }
                    };

                    let request_text = String::from_utf8_lossy(&buffer[..bytes_read]);
                    let first_line = request_text.lines().next().unwrap_or("");

                    // Ignore non-GET requests or favicon requests
                    if !first_line.starts_with("GET ") {
                        let resp = "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        continue;
                    }

                    if first_line.contains("/favicon.ico") {
                        let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        continue;
                    }

                    // Parse query parameters
                    let target_path = first_line.split_whitespace().nth(1).unwrap_or("");
                    let query_str = target_path.split('?').nth(1).unwrap_or("");

                    let mut code = None;
                    let mut state = None;
                    let mut error = None;
                    let mut error_description = None;

                    for pair in query_str.split('&') {
                        let mut kv = pair.split('=');
                        let k = kv.next().unwrap_or("");
                        let v = kv.next().unwrap_or("");
                        let decoded_val = urlencoding_decode(v);

                        match k {
                            "code" => code = Some(decoded_val),
                            "state" => state = Some(decoded_val),
                            "error" => error = Some(decoded_val),
                            "error_description" => error_description = Some(decoded_val),
                            _ => {}
                        }
                    }

                    // Handle provider-reported errors
                    if let Some(err) = error {
                        let err_msg = error_description.unwrap_or(err);
                        let html = render_oauth_html(
                            false,
                            "Authorization Cancelled or Denied",
                            &format!("Provider returned: {}. You can close this tab and retry in Foundry.", err_msg),
                        );
                        let http_resp = format!(
                            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );
                        let _ = stream.write_all(http_resp.as_bytes());
                        let _ = stream.flush();
                        return Err(format!("OAuth authorization error: {}", err_msg));
                    }

                    // Enforce CSRF state match
                    let received_state = state.unwrap_or_default();
                    if received_state.is_empty() || received_state != expected_state {
                        let html = render_oauth_html(
                            false,
                            "Security Verification Failed",
                            "The OAuth state parameter did not match. This protects against CSRF attacks. Please return to Foundry and retry.",
                        );
                        let http_resp = format!(
                            "HTTP/1.1 403 Forbidden\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );
                        let _ = stream.write_all(http_resp.as_bytes());
                        let _ = stream.flush();
                        return Err("OAuth state mismatch - potential CSRF attempt or expired state.".to_string());
                    }

                    // Valid code received
                    if let Some(auth_code) = code {
                        let html = render_oauth_html(
                            true,
                            "Authorization Successful",
                            "Foundry has securely received your authorization. You can close this tab and return to Foundry.",
                        );
                        let http_resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );
                        let _ = stream.write_all(http_resp.as_bytes());
                        let _ = stream.flush();
                        return Ok(auth_code);
                    }

                    // Missing authorization code
                    let html = render_oauth_html(
                        false,
                        "Authorization Incomplete",
                        "No authorization code was returned by the provider. Please try again.",
                    );
                    let http_resp = format!(
                        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        html.len(),
                        html
                    );
                    let _ = stream.write_all(http_resp.as_bytes());
                    let _ = stream.flush();
                    return Err("Missing authorization code in redirect response.".to_string());
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Sleep briefly and retry
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    eprintln!("[Foundry OAuth] Loopback accept error: {}", e);
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
    })
    .await
    .map_err(|e| format!("OAuth loopback task execution failed: {}", e))?
}

/// Spawns the default system browser to navigate to an external URL.
/// Uses Windows ShellExecuteW directly so ampersands (&), query params, and scopes are NEVER chopped off by cmd.exe.
#[tauri::command]
pub fn open_browser_url(url: String) -> Result<(), String> {
    // Only plain web links: refuse file:, javascript:, ms-settings: and other handlers that could run code.
    crate::access_policy::check_browser_url(&url)?;
    #[cfg(target_os = "windows")]
    {
        // ShellExecuteW directly, so ampersands and query strings are never mangled by cmd.exe.
        crate::access_policy::shell_open(&url)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open system browser: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open system browser: {}", e))?;
    }
    #[cfg(target_os = "android")]
    {
        let _ = std::process::Command::new("/system/bin/am")
            .arg("start")
            .arg("-a")
            .arg("android.intent.action.VIEW")
            .arg("-d")
            .arg(&url)
            .status();
    }
    Ok(())
}

fn urlencoding_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(c1), Some(c2)) = (h1, h2) {
                let hex_str = [c1, c2];
                if let Ok(s) = std::str::from_utf8(&hex_str) {
                    if let Ok(byte_val) = u8::from_str_radix(s, 16) {
                        out.push(byte_val as char);
                        continue;
                    }
                }
                out.push('%');
                out.push(c1 as char);
                out.push(c2 as char);
            } else {
                out.push('%');
            }
        } else if b == b'+' {
            out.push(' ');
        } else {
            out.push(b as char);
        }
    }
    out
}

fn render_oauth_html(success: bool, title: &str, message: &str) -> String {
    let status_color = if success { "#10b981" } else { "#f43f5e" };
    let icon = if success { "&#x2713;" } else { "&#x2715;" };
    let auto_close_script = if success {
        "<script>setTimeout(function(){ window.close(); }, 2500);</script>"
    } else {
        ""
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - Foundry</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }}
    .card {{
      background: #131b2e;
      border: 1px solid #1e293b;
      border-radius: 20px;
      padding: 48px;
      max-width: 480px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    }}
    .icon {{
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: bold;
      color: {status_color};
      background: rgba(16, 185, 129, 0.1);
      border: 2px solid {status_color};
    }}
    h1 {{
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px;
      color: #ffffff;
    }}
    p {{
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 24px;
    }}
    .notice {{
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #1e293b;
      padding-top: 16px;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <h1>{title}</h1>
    <p>{message}</p>
    <div class="notice">Foundry Desktop Integration &bull; Secure Loopback Callback</div>
  </div>
  {auto_close_script}
</body>
</html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_urlencoding_decode() {
        assert_eq!(urlencoding_decode("hello%20world"), "hello world");
        assert_eq!(urlencoding_decode("code%3DM.123%26state%3Dxyz"), "code=M.123&state=xyz");
        assert_eq!(urlencoding_decode("hello+world"), "hello world");
    }

    #[test]
    fn test_render_oauth_html() {
        let html = render_oauth_html(true, "Test Title", "Test Message");
        assert!(html.contains("Test Title"));
        assert!(html.contains("Test Message"));
        assert!(html.contains("window.close()"));
    }
}
