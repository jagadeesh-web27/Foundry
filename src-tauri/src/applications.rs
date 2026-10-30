use std::fs;
use std::path::{Path, PathBuf};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RunningApp {
    pub name: String,
    pub process_name: String,
    pub pid: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ResolvedApplication {
    pub found: bool,
    pub app_name: String,
    pub target_path: Option<String>,
    pub is_running: bool,
}

fn scan_shortcuts_recursive(dir: &Path, out: &mut Vec<(String, PathBuf)>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_shortcuts_recursive(&path, out);
            } else if path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|e| e.eq_ignore_ascii_case("lnk"))
                .unwrap_or(false)
            {
                if let Some(stem) = path.file_stem() {
                    out.push((stem.to_string_lossy().to_string(), path));
                }
            }
        }
    }
}

pub fn check_if_process_running(proc_query: &str) -> bool {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let q_lower = proc_query.to_lowercase();
    for (_, process) in sys.processes() {
        let name_lower = process.name().to_string_lossy().to_lowercase();
        if name_lower.contains(&q_lower) || q_lower.contains(&name_lower) {
            return true;
        }
    }
    false
}

#[tauri::command(async)]
pub fn get_running_applications() -> Result<Vec<RunningApp>, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let ignore_list = [
        "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe",
        "lsass.exe", "svchost.exe", "fontdrvhost.exe", "dwm.exe", "memory compression",
        "spoolsv.exe", "sihost.exe", "taskhostw.exe", "explorer.exe", "searchhost.exe",
        "startmenuexperiencehost.exe", "shellexperiencehost.exe", "runtimebroker.exe",
        "conhost.exe", "ctfmon.exe", "wlanext.exe", "securityhealthservice.exe",
        "msmpeng.exe", "nissrv.exe", "audiodg.exe", "smartscreen.exe", "werfault.exe",
        "compattelrunner.exe", "backgroundtaskhost.exe", "wmiprvse.exe", "dllhost.exe",
        "applicationframehost.exe", "lockapp.exe", "textinputhost.exe",
    ];

    let mut apps: Vec<RunningApp> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (pid, process) in sys.processes() {
        let p_name = process.name().to_string_lossy().to_string();
        let lower = p_name.to_lowercase();

        if ignore_list.iter().any(|ig| lower == *ig || lower.starts_with(ig)) {
            continue;
        }

        let display_name = if lower.ends_with(".exe") {
            p_name[..p_name.len() - 4].to_string()
        } else {
            p_name.clone()
        };

        if !seen.insert(lower.clone()) {
            continue;
        }

        apps.push(RunningApp {
            name: display_name,
            process_name: p_name,
            pid: pid.as_u32(),
        });
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(apps)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DiscoveredApplication {
    pub name: String,
    pub display_name: String,
    pub application_id: Option<String>,
    pub package_name: Option<String>,
    pub publisher: Option<String>,
    pub executable_path: Option<String>,
    pub launch_identifier: String,
    pub source: String,
    pub version: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ApplicationDetails {
    pub found: bool,
    pub name: String,
    pub display_name: String,
    pub application_id: Option<String>,
    pub package_name: Option<String>,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_location: Option<String>,
    pub launch_identifier: Option<String>,
    pub source: String,
    pub is_running: bool,
    pub process_name: Option<String>,
    pub pid: Option<u32>,
}

static APP_CACHE: std::sync::Mutex<Option<(std::time::Instant, Vec<DiscoveredApplication>)>> = std::sync::Mutex::new(None);

pub fn discover_installed_applications_internal() -> Vec<DiscoveredApplication> {
    if let Ok(guard) = APP_CACHE.lock() {
        if let Some((instant, ref apps)) = *guard {
            if instant.elapsed().as_secs() < 60 {
                return apps.clone();
            }
        }
    }

    let mut apps: Vec<DiscoveredApplication> = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    // 1. Standard Windows applications
    let standard_apps = [
        ("Notepad", "Notepad", "notepad.exe", "Windows System"),
        ("Calculator", "Calculator", "calc.exe", "Windows System"),
        ("File Explorer", "File Explorer", "explorer.exe", "Windows System"),
        ("Paint", "Paint", "mspaint.exe", "Windows System"),
        ("Task Manager", "Task Manager", "taskmgr.exe", "Windows System"),
        ("Microsoft Edge", "Microsoft Edge", "msedge.exe", "Windows System"),
    ];

    for (name, display, target, src) in standard_apps {
        let key = display.to_lowercase();
        if seen_keys.insert(key) {
            apps.push(DiscoveredApplication {
                name: name.to_string(),
                display_name: display.to_string(),
                application_id: None,
                package_name: None,
                publisher: Some("Microsoft Corporation".to_string()),
                executable_path: Some(target.to_string()),
                launch_identifier: target.to_string(),
                source: src.to_string(),
                version: None,
            });
        }
    }

    // 2. Start Menu shortcuts (.lnk)
    let mut search_dirs = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        search_dirs.push(PathBuf::from(appdata).join("Microsoft").join("Windows").join("Start Menu").join("Programs"));
    }
    if let Ok(progdata) = std::env::var("ProgramData") {
        search_dirs.push(PathBuf::from(progdata).join("Microsoft").join("Windows").join("Start Menu").join("Programs"));
    }

    let mut lnk_candidates: Vec<(String, PathBuf)> = Vec::new();
    for base_dir in search_dirs {
        scan_shortcuts_recursive(&base_dir, &mut lnk_candidates);
    }

    for (name, path) in lnk_candidates {
        let key = name.to_lowercase();
        if !seen_keys.contains(&key) {
            seen_keys.insert(key);
            apps.push(DiscoveredApplication {
                name: name.clone(),
                display_name: name.clone(),
                application_id: None,
                package_name: None,
                publisher: None,
                executable_path: Some(path.to_string_lossy().to_string()),
                launch_identifier: path.to_string_lossy().to_string(),
                source: "Start Menu".to_string(),
                version: None,
            });
        }
    }

    // 3. Windows StartApps / AppX / MSIX / Store apps
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if let Ok(output) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress"])
            .creation_flags(0x08000000)
            .output()
        {
            if output.status.success() {
                let json_str = String::from_utf8_lossy(&output.stdout);
                #[derive(serde::Deserialize)]
                struct StartAppEntry {
                    #[serde(rename = "Name")]
                    name: Option<String>,
                    #[serde(rename = "AppID")]
                    app_id: Option<String>,
                }

                if let Ok(entries) = serde_json::from_str::<Vec<StartAppEntry>>(&json_str) {
                    for entry in entries {
                        if let (Some(name), Some(app_id)) = (entry.name, entry.app_id) {
                            let key = name.to_lowercase();
                            let is_appx = app_id.contains('!') || (app_id.contains('_') && !app_id.ends_with(".exe"));
                            let src = if is_appx { "AppX/MSIX" } else { "StartApps" };
                            let launch_id = if is_appx {
                                format!("shell:AppsFolder\\{}", app_id)
                            } else {
                                app_id.clone()
                            };

                            let pkg_name = if is_appx {
                                app_id.split('!').next().and_then(|p| p.split('_').next()).map(|s| s.to_string())
                            } else {
                                None
                            };

                            if !seen_keys.contains(&key) {
                                seen_keys.insert(key);
                                apps.push(DiscoveredApplication {
                                    name: name.clone(),
                                    display_name: name.clone(),
                                    application_id: Some(app_id),
                                    package_name: pkg_name,
                                    publisher: None,
                                    executable_path: None,
                                    launch_identifier: launch_id,
                                    source: src.to_string(),
                                    version: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    if let Ok(mut guard) = APP_CACHE.lock() {
        *guard = Some((std::time::Instant::now(), apps.clone()));
    }

    apps
}

pub fn score_application_match(app: &DiscoveredApplication, query: &str) -> i32 {
    let lower_display = app.display_name.to_lowercase();
    let lower_name = app.name.to_lowercase();
    let lower_id = app.application_id.as_deref().unwrap_or("").to_lowercase();
    let lower_query = query.trim().to_lowercase();

    let clean_query = lower_query
        .replace(" application", "")
        .replace(" app", "")
        .replace(" desktop", "")
        .trim()
        .to_string();

    if clean_query.is_empty() {
        return 0;
    }

    let mut score = 0;

    // 1. Exact matches
    if lower_display == clean_query || lower_name == clean_query {
        score += 150;
    } else if lower_display.starts_with(&clean_query) || lower_name.starts_with(&clean_query) {
        score += 100;
    } else if lower_display.contains(&clean_query) || lower_name.contains(&clean_query) {
        score += 70;
    }

    // 2. Token overlap
    let q_tokens: Vec<&str> = clean_query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && !["open", "launch", "start", "the", "a", "an", "can", "you", "me"].contains(w))
        .collect();

    if q_tokens.is_empty() {
        return score;
    }

    let mut matched_tokens = 0;
    for &token in &q_tokens {
        if lower_display.contains(token) || lower_name.contains(token) || lower_id.contains(token) {
            score += 30;
            matched_tokens += 1;
        } else if crate::fuzzy::matches_any_token(token, &lower_display) || crate::fuzzy::matches_any_token(token, &lower_name) {
            // Misspelled app name ("whatapp", "chorme"): weaker than an exact hit, so exact matches win.
            score += 25;
            matched_tokens += 1;
        }
    }

    // Whole-name typo with spacing differences ("whats app" / "whatapp" vs "WhatsApp").
    let compact_query: String = clean_query.chars().filter(|c| c.is_alphanumeric()).collect();
    let compact_display: String = lower_display.chars().filter(|c| c.is_alphanumeric()).collect();
    if score == 0 && compact_query.len() >= 4 && crate::fuzzy::words_match(&compact_query, &compact_display) {
        score += 90;
    }

    if matched_tokens == q_tokens.len() {
        score += 50;
    }

    // 3. Dynamic Acronyms & Short forms
    if q_tokens.iter().any(|&t| t == "teams") && (lower_display.contains("teams") || lower_id.contains("teams")) {
        score += 80;
    }
    if q_tokens.iter().any(|&t| t == "chrome") && lower_display.contains("chrome") {
        score += 80;
    }
    if (clean_query == "code" || clean_query == "vscode" || clean_query == "vs code") && (lower_display.contains("visual studio code") || lower_id.contains("visualstudiocode")) {
        score += 80;
    }
    if (clean_query == "calc" || clean_query == "calculator") && (lower_display.contains("calculator") || lower_id.contains("calculator")) {
        score += 80;
    }
    if (clean_query == "explorer" || clean_query == "file explorer") && lower_display.contains("explorer") {
        score += 80;
    }
    if clean_query.contains("ms ") && (lower_display.contains("microsoft") || lower_id.contains("microsoft")) {
        score += 40;
    }

    // 4. Heavy Penalties for helpers/uninstallers
    if lower_display.contains("uninstall") || lower_display.contains("documentation") || lower_display.contains("readme") 
       || lower_display.contains("manual") || lower_display.contains("help") || lower_display.contains("troubleshooter") {
        score -= 200;
    }

    score
}

pub fn check_app_is_running(app: &DiscoveredApplication) -> bool {
    let lower_name = app.name.to_lowercase();
    let lower_id = app.application_id.as_deref().unwrap_or("").to_lowercase();

    if lower_name.contains("teams") || lower_id.contains("teams") {
        return check_if_process_running("teams") || check_if_process_running("msteams");
    }
    if lower_name.contains("chrome") {
        return check_if_process_running("chrome");
    }
    if lower_name.contains("code") || lower_name.contains("visual studio code") {
        return check_if_process_running("code");
    }
    if lower_name.contains("notepad") {
        return check_if_process_running("notepad");
    }
    if lower_name.contains("calculator") {
        return check_if_process_running("calculator") || check_if_process_running("calc");
    }
    if lower_name.contains("explorer") {
        return check_if_process_running("explorer");
    }

    if let Some(ref exec) = app.executable_path {
        let p = Path::new(exec);
        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
            if check_if_process_running(stem) {
                return true;
            }
        }
    }

    check_if_process_running(&app.name)
}

#[tauri::command(async)]
pub fn discover_installed_applications() -> Result<Vec<DiscoveredApplication>, String> {
    Ok(discover_installed_applications_internal())
}

#[tauri::command(async)]
pub fn get_application_details(application: String) -> Result<ApplicationDetails, String> {
    let apps = discover_installed_applications_internal();
    let mut scored: Vec<(i32, DiscoveredApplication)> = apps
        .into_iter()
        .map(|app| {
            let s = score_application_match(&app, &application);
            (s, app)
        })
        .filter(|(s, _)| *s > 0)
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));

    if let Some((score, app)) = scored.first() {
        if *score > 0 {
            #[allow(unused_mut)]
            let mut version = app.version.clone();
            #[allow(unused_mut)]
            let mut publisher = app.publisher.clone();
            #[allow(unused_mut)]
            let mut install_location = app.executable_path.clone();

            #[cfg(target_os = "windows")]
            if app.source == "AppX/MSIX" {
                if let Some(ref pkg) = app.package_name {
                    use std::os::windows::process::CommandExt;
                    let cmd_str = format!("Get-AppxPackage *{}* | Select-Object -First 1 Name, Version, Publisher, InstallLocation | ConvertTo-Json -Compress", pkg);
                    if let Ok(output) = std::process::Command::new("powershell")
                        .args(["-NoProfile", "-NonInteractive", "-Command", &cmd_str])
                        .creation_flags(0x08000000)
                        .output()
                    {
                        if output.status.success() {
                            let json_str = String::from_utf8_lossy(&output.stdout);
                            #[derive(serde::Deserialize)]
                            struct AppxDetail {
                                #[serde(rename = "Version")]
                                version: Option<String>,
                                #[serde(rename = "Publisher")]
                                publisher: Option<String>,
                                #[serde(rename = "InstallLocation")]
                                install_location: Option<String>,
                            }
                            if let Ok(detail) = serde_json::from_str::<AppxDetail>(&json_str) {
                                if version.is_none() { version = detail.version; }
                                if publisher.is_none() { publisher = detail.publisher; }
                                if install_location.is_none() { install_location = detail.install_location; }
                            }
                        }
                    }
                }
            }

            let mut is_running = false;
            let mut process_name = None;
            let mut pid = None;

            use sysinfo::System;
            let mut sys = System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

            let lower_name = app.name.to_lowercase();
            let search_procs: Vec<&str> = if lower_name.contains("teams") {
                vec!["teams", "msteams", "ms-teams"]
            } else if lower_name.contains("chrome") {
                vec!["chrome"]
            } else if lower_name.contains("code") {
                vec!["code"]
            } else {
                vec![lower_name.as_str()]
            };

            for (p_id, p) in sys.processes() {
                let p_lower = p.name().to_string_lossy().to_lowercase();
                if search_procs.iter().any(|&sp| p_lower.contains(sp)) {
                    is_running = true;
                    process_name = Some(p.name().to_string_lossy().to_string());
                    pid = Some(p_id.as_u32());
                    break;
                }
            }

            return Ok(ApplicationDetails {
                found: true,
                name: app.name.clone(),
                display_name: app.display_name.clone(),
                application_id: app.application_id.clone(),
                package_name: app.package_name.clone(),
                publisher,
                version,
                install_location,
                launch_identifier: Some(app.launch_identifier.clone()),
                source: app.source.clone(),
                is_running,
                process_name,
                pid,
            });
        }
    }

    Ok(ApplicationDetails {
        found: false,
        name: application.clone(),
        display_name: application,
        application_id: None,
        package_name: None,
        publisher: None,
        version: None,
        install_location: None,
        launch_identifier: None,
        source: "None".to_string(),
        is_running: false,
        process_name: None,
        pid: None,
    })
}

#[tauri::command(async)]
pub fn resolve_installed_application(query: String) -> Result<ResolvedApplication, String> {
    println!("[FOUNDry] Application request:\n{}", query);
    println!("[FOUNDry] Searching installed applications...");

    let apps = discover_installed_applications_internal();

    let mut scored: Vec<(i32, DiscoveredApplication)> = apps
        .into_iter()
        .map(|app| {
            let s = score_application_match(&app, &query);
            (s, app)
        })
        .filter(|(s, _)| *s > 0)
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));

    if let Some((score, best_app)) = scored.first() {
        println!(
            "[FOUNDry] Best application match: \"{}\" ({}) [Score: {}]",
            best_app.display_name, best_app.source, score
        );

        let running = check_app_is_running(best_app);
        let launch_target = if let Some(ref exec) = best_app.executable_path {
            exec.clone()
        } else {
            best_app.launch_identifier.clone()
        };
        // Only targets resolved here from the installed-application list may be launched later.
        crate::access_policy::register_launch_target(&launch_target);

        return Ok(ResolvedApplication {
            found: true,
            app_name: best_app.display_name.clone(),
            target_path: Some(launch_target),
            is_running: running,
        });
    }

    println!("[FOUNDry] Resolved application:\nNone (Application not found)");
    Ok(ResolvedApplication {
        found: false,
        app_name: query,
        target_path: None,
        is_running: false,
    })
}

#[tauri::command]
pub fn launch_application_target(target_path: String) -> Result<bool, String> {
    println!("[FOUNDry] Launch method executing for target: {}", target_path);

    let is_builtin = ["notepad.exe", "calc.exe", "explorer.exe", "mspaint.exe", "taskmgr.exe", "msedge.exe"]
        .iter()
        .any(|&exe| target_path.eq_ignore_ascii_case(exe));
    // The webview may not launch arbitrary programs: the target must come from the installed-app resolver.
    if !is_builtin && !crate::access_policy::is_registered_launch_target(&target_path) {
        return Err("This application was not found among installed applications, so Foundry will not launch it.".to_string());
    }

    if target_path.starts_with("shell:AppsFolder\\") {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("explorer.exe")
                .arg(&target_path)
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| {
                    println!("[FOUNDry] Launch result: Failed to launch AppX/MSIX: {}", e);
                    format!("Failed to launch AppX/MSIX application: {}", e)
                })?;
            println!("[FOUNDry] Launch result: Success (launched via explorer.exe shell:AppsFolder)");
            return Ok(true);
        }
    }

    let is_standard_exe = ["notepad.exe", "calc.exe", "explorer.exe", "mspaint.exe", "taskmgr.exe", "msedge.exe"]
        .iter()
        .any(|&exe| target_path.eq_ignore_ascii_case(exe));

    let path = Path::new(&target_path);
    if !is_standard_exe && !path.exists() {
        println!("[FOUNDry] Launch result: Target application not found: {}", target_path);
        return Err(format!("Target application not found: {}", target_path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if is_standard_exe {
            std::process::Command::new(&target_path)
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| {
                    println!("[FOUNDry] Launch result: Failed to launch standard exe {}: {}", target_path, e);
                    format!("Failed to launch {}: {}", target_path, e)
                })?;
            println!("[FOUNDry] Launch result: Success (launched standard exe)");
        } else if target_path.to_lowercase().ends_with(".lnk") {
            std::process::Command::new("explorer.exe")
                .arg(&target_path)
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| {
                    println!("[FOUNDry] Launch result: Failed to launch shortcut: {}", e);
                    format!("Failed to launch shortcut: {}", e)
                })?;
            println!("[FOUNDry] Launch result: Success (launched via explorer shortcut)");
        } else if target_path.to_lowercase().ends_with(".exe") {
            std::process::Command::new(&target_path)
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| {
                    println!("[FOUNDry] Launch result: Failed to launch executable: {}", e);
                    format!("Failed to launch executable: {}", e)
                })?;
            println!("[FOUNDry] Launch result: Success (launched executable directly)");
        } else {
            println!("[FOUNDry] Launch result: Unsupported application target type");
            return Err("Unsupported application target type".to_string());
        }
    }

    Ok(true)
}
