#[cfg(target_os = "android")]
use crate::android_ai;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DiskInfo {
    pub drive: String,
    pub volume_name: String,
    pub total_bytes: u64,
    pub total_formatted: String,
    pub free_bytes: u64,
    pub free_formatted: String,
    pub used_bytes: u64,
    pub used_formatted: String,
    pub percentage_used: f64,
    pub percentage_free: f64,
    pub file_system: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BatteryInfo {
    pub level: u8,
    pub is_charging: bool,
    pub temperature_celsius: Option<f64>,
}

#[tauri::command]
pub fn get_battery_information() -> Result<BatteryInfo, String> {
    #[cfg(target_os = "android")]
    {
        let json_str = android_ai::get_battery_info()
            .map_err(|e| format!("Failed to read Android native battery bridge: {e}"))?;
        let info: BatteryInfo = serde_json::from_str(&json_str)
            .map_err(|e| format!("Invalid battery JSON from Android bridge: {e}"))?;
        Ok(info)
    }

    #[cfg(all(not(target_os = "android"), target_os = "windows"))]
    {
        #[repr(C)]
        struct SYSTEM_POWER_STATUS {
            ac_line_status: u8,
            battery_flag: u8,
            battery_life_percent: u8,
            system_status_flag: u8,
            battery_life_time: u32,
            battery_full_life_time: u32,
        }

        #[link(name = "kernel32")]
        extern "system" {
            fn GetSystemPowerStatus(status: *mut SYSTEM_POWER_STATUS) -> i32;
        }

        let mut status = SYSTEM_POWER_STATUS {
            ac_line_status: 255,
            battery_flag: 255,
            battery_life_percent: 255,
            system_status_flag: 0,
            battery_life_time: 0,
            battery_full_life_time: 0,
        };

        let success = unsafe { GetSystemPowerStatus(&mut status) };
        if success != 0 && status.battery_life_percent <= 100 {
            Ok(BatteryInfo {
                level: status.battery_life_percent,
                is_charging: status.ac_line_status == 1,
                temperature_celsius: None,
            })
        } else {
            // Desktop or AC connected
            Ok(BatteryInfo {
                level: 100,
                is_charging: status.ac_line_status == 1,
                temperature_celsius: None,
            })
        }
    }

    #[cfg(all(not(target_os = "android"), not(target_os = "windows")))]
    {
        Ok(BatteryInfo {
            level: 100,
            is_charging: true,
            temperature_celsius: None,
        })
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SystemHardwareInfo {
    pub os_name: String,
    pub os_version: String,
    pub host_name: String,
    pub cpu_brand: String,
    pub cpu_cores: usize,
    pub cpu_logical_cores: usize,
    pub total_ram_bytes: u64,
    pub total_ram_formatted: String,
    pub free_ram_bytes: u64,
    pub free_ram_formatted: String,
    pub used_ram_bytes: u64,
    pub used_ram_formatted: String,
    pub ram_percentage_used: f64,
    pub uptime_seconds: u64,
    pub uptime_formatted: String,
    pub cpu_usage_percent: f64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProcessMetrics {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub memory_formatted: String,
    pub memory_percent: f64,
}

pub fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    const TB: f64 = GB * 1024.0;

    let b = bytes as f64;
    if b >= TB {
        format!("{:.2} TB", b / TB)
    } else if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

#[tauri::command]
pub fn get_disk_information() -> Result<Vec<DiskInfo>, String> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    let mut result = Vec::new();

    for disk in &disks {
        let total = disk.total_space();
        let free = disk.available_space();
        let used = total.saturating_sub(free);
        let pct_used = if total > 0 { (used as f64 / total as f64) * 100.0 } else { 0.0 };
        let pct_free = if total > 0 { (free as f64 / total as f64) * 100.0 } else { 0.0 };

        let mount = disk.mount_point().to_string_lossy().to_string();
        let name = disk.name().to_string_lossy().to_string();
        let fs = disk.file_system().to_string_lossy().to_string();

        result.push(DiskInfo {
            drive: mount,
            volume_name: name,
            total_bytes: total,
            total_formatted: format_bytes(total),
            free_bytes: free,
            free_formatted: format_bytes(free),
            used_bytes: used,
            used_formatted: format_bytes(used),
            percentage_used: (pct_used * 10.0).round() / 10.0,
            percentage_free: (pct_free * 10.0).round() / 10.0,
            file_system: fs,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn get_system_info() -> Result<SystemHardwareInfo, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let total_ram = sys.total_memory();
    let used_ram = sys.used_memory();
    let free_ram = sys.free_memory();
    let ram_pct = if total_ram > 0 { (used_ram as f64 / total_ram as f64) * 100.0 } else { 0.0 };

    let cpu_brand = sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_logical = sys.cpus().len();
    let cpu_physical = System::physical_core_count().unwrap_or(cpu_logical);

    let os_name = System::name().unwrap_or_else(|| "Windows".to_string());
    let os_version = System::os_version().unwrap_or_default();
    let host_name = System::host_name().unwrap_or_default();

    let uptime_secs = System::uptime();
    let days = uptime_secs / 86400;
    let hours = (uptime_secs % 86400) / 3600;
    let mins = (uptime_secs % 3600) / 60;
    let uptime_formatted = if days > 0 {
        format!("{}d {}h {}m", days, hours, mins)
    } else if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else {
        format!("{}m", mins)
    };

    let cpu_pct = (sys.global_cpu_usage() as f64 * 10.0).round() / 10.0;

    Ok(SystemHardwareInfo {
        os_name,
        os_version,
        host_name,
        cpu_brand,
        cpu_cores: cpu_physical,
        cpu_logical_cores: cpu_logical,
        total_ram_bytes: total_ram,
        total_ram_formatted: format_bytes(total_ram),
        free_ram_bytes: free_ram,
        free_ram_formatted: format_bytes(free_ram),
        used_ram_bytes: used_ram,
        used_ram_formatted: format_bytes(used_ram),
        ram_percentage_used: (ram_pct * 10.0).round() / 10.0,
        uptime_seconds: uptime_secs,
        uptime_formatted,
        cpu_usage_percent: cpu_pct,
    })
}

#[tauri::command]
pub fn get_top_processes(limit: Option<usize>) -> Result<Vec<ProcessMetrics>, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.refresh_memory();

    let total_ram = sys.total_memory();
    let max_items = limit.unwrap_or(10);

    let mut list = Vec::new();
    for (pid, process) in sys.processes() {
        let mem = process.memory();
        let mem_pct = if total_ram > 0 { (mem as f64 / total_ram as f64) * 100.0 } else { 0.0 };
        list.push(ProcessMetrics {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().to_string(),
            cpu_usage: process.cpu_usage(),
            memory_bytes: mem,
            memory_formatted: format_bytes(mem),
            memory_percent: (mem_pct * 10.0).round() / 10.0,
        });
    }

    list.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
    list.truncate(max_items);
    Ok(list)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NetworkInterfaceInfo {
    pub name: String,
    pub ip_addresses: Vec<String>,
    pub mac_address: String,
    pub received_bytes: u64,
    pub received_formatted: String,
    pub transmitted_bytes: u64,
    pub transmitted_formatted: String,
    pub is_up: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NetworkInfo {
    pub is_connected: bool,
    pub internet_access: bool,
    pub connection_type: String,
    pub primary_ip: Option<String>,
    pub wifi_ssid: Option<String>,
    pub wifi_signal_percent: Option<u32>,
    pub wifi_description: Option<String>,
    pub interfaces: Vec<NetworkInterfaceInfo>,
}

#[tauri::command]
pub fn get_network_information() -> Result<NetworkInfo, String> {
    use sysinfo::Networks;
    let networks = Networks::new_with_refreshed_list();
    let mut interfaces = Vec::new();
    let mut primary_ip = None;

    for (name, data) in &networks {
        let mut ips = Vec::new();
        for ip_net in data.ip_networks() {
            let addr = ip_net.addr;
            let addr_str = addr.to_string();
            ips.push(addr_str.clone());

            if primary_ip.is_none() && addr.is_ipv4() && !addr.is_loopback() {
                primary_ip = Some(addr_str);
            }
        }

        let rx = data.total_received();
        let tx = data.total_transmitted();
        let is_up = !ips.is_empty() || rx > 0 || tx > 0;

        interfaces.push(NetworkInterfaceInfo {
            name: name.clone(),
            ip_addresses: ips,
            mac_address: data.mac_address().to_string(),
            received_bytes: rx,
            received_formatted: format_bytes(rx),
            transmitted_bytes: tx,
            transmitted_formatted: format_bytes(tx),
            is_up,
        });
    }

    #[allow(unused_mut)]
    let mut wifi_ssid = None;
    #[allow(unused_mut)]
    let mut wifi_signal = None;
    #[allow(unused_mut)]
    let mut wifi_desc = None;
    #[allow(unused_mut)]
    let mut is_wifi_connected = false;

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("netsh")
            .args(["wlan", "show", "interfaces"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let trimmed = line.trim();
                if let Some((k, v)) = trimmed.split_once(':') {
                    let key = k.trim().to_lowercase();
                    let val = v.trim();
                    if key == "state" && val.eq_ignore_ascii_case("connected") {
                        is_wifi_connected = true;
                    } else if key == "ssid" && !val.is_empty() {
                        wifi_ssid = Some(val.to_string());
                    } else if key == "signal" {
                        let clean_pct = val.replace('%', "").trim().parse::<u32>().ok();
                        wifi_signal = clean_pct;
                    } else if key == "description" {
                        wifi_desc = Some(val.to_string());
                    }
                }
            }
        }
    }

    let internet_access = if let Ok(addr) = "8.8.8.8:53".parse::<std::net::SocketAddr>() {
        std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(800)).is_ok()
    } else {
        false
    };

    let is_connected = primary_ip.is_some() || is_wifi_connected || internet_access;

    let connection_type = if is_wifi_connected || wifi_ssid.is_some() {
        "Wi-Fi".to_string()
    } else if is_connected {
        "Ethernet".to_string()
    } else {
        "Disconnected".to_string()
    };

    Ok(NetworkInfo {
        is_connected,
        internet_access,
        connection_type,
        primary_ip,
        wifi_ssid,
        wifi_signal_percent: wifi_signal,
        wifi_description: wifi_desc,
        interfaces,
    })
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct HttpProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: std::collections::HashMap<String, String>,
}

#[tauri::command]
pub async fn proxy_http_request(
    url: String,
    method: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpProxyResponse, String> {
    static HTTP_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let client = HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_millis(3000))
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    });

    let req_method = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        _ => return Err(format!("Unsupported HTTP method: {}", method)),
    };

    let mut request = client.request(req_method, &url);

    if let Some(ms) = timeout_ms {
        request = request.timeout(std::time::Duration::from_millis(ms));
    }

    for (key, value) in &headers {
        request = request.header(key.as_str(), value.as_str());
    }

    if let Some(body_str) = body {
        request = request.body(body_str);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("HTTP request to {} failed: {}", url, e))?;

    let status = response.status().as_u16();
    let mut resp_headers = std::collections::HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            resp_headers.insert(key.to_string(), v.to_string());
        }
    }

    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(HttpProxyResponse {
        status,
        body: body_text,
        headers: resp_headers,
    })
}
