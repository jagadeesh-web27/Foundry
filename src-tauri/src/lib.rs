

pub mod access_policy;
pub mod fuzzy;
#[cfg(not(target_os = "android"))]
pub mod extract;
#[cfg(not(target_os = "android"))]
pub mod index;
pub mod filesystem;
pub mod system;
pub mod applications;
pub mod whisper;
pub mod desktop_ai;
pub mod oauth;
pub mod security;

#[cfg(target_os = "android")]
mod android_bridge;
#[cfg(target_os = "android")]
mod android_files;
#[cfg(target_os = "android")]
mod android_ai;
#[cfg(target_os = "android")]
mod android_update;

pub use filesystem::*;
pub use system::*;
pub use applications::*;

#[cfg(target_os = "android")]
#[tauri::command]
fn android_download_and_install_apk(url: String) -> Result<String, String> {
    android_update::download_and_install(&url)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_download_and_install_apk(_url: String) -> Result<String, String> {
    Err("APK installation is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_status() -> Result<String, String> {
    android_ai::status()
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_status() -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_load_model() -> Result<String, String> {
    android_ai::load_model()
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_load_model() -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_start_download(url: Option<String>) -> Result<String, String> {
    android_ai::start_download(url)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_start_download(_url: Option<String>) -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_cancel_download() -> Result<String, String> {
    android_ai::cancel_download()
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_cancel_download() -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_delete_model() -> Result<String, String> {
    android_ai::delete_model()
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_delete_model() -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_install_model(uri: String) -> Result<String, String> {
    android_ai::install_model(&uri)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_install_model(_uri: String) -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_chat(prompt: String) -> Result<String, String> {
    android_ai::chat(&prompt)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_chat(_prompt: String) -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_local_ai_test_inference(prompt: String) -> Result<String, String> {
    android_ai::test_inference(&prompt)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_local_ai_test_inference(_prompt: String) -> Result<String, String> {
    Err("On-device Android AI is only available in the Android application".to_string())
}

// File index commands (desktop). On Android, file search goes through the Storage Access Framework.
#[cfg(not(target_os = "android"))]
#[tauri::command(async)]
fn index_status() -> index::IndexStatus {
    index::index_status()
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn index_rebuild() -> index::IndexStatus {
    index::index_rebuild()
}

#[cfg(target_os = "android")]
#[tauri::command]
fn index_status() -> serde_json::Value {
    serde_json::json!({ "state": "unavailable", "ready": false })
}

#[cfg(target_os = "android")]
#[tauri::command]
fn index_rebuild() -> serde_json::Value {
    serde_json::json!({ "state": "unavailable", "ready": false })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            #[cfg(not(target_os = "android"))]
            desktop_ai::autostart_if_installed();
            #[cfg(not(target_os = "android"))]
            index::start_background();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_accessible_directories,
            scan_user_directory,
            scan_user_folders,
            search_folders_live,
            search_files_live,
            get_folder_metadata,
            get_file_metadata,
            read_file_content,
            open_file,
            reveal_file_in_explorer,
            get_disk_information,
            get_battery_information,
            get_system_info,
            get_network_information,
            proxy_http_request,
            get_running_applications,
            discover_installed_applications,
            get_application_details,
            resolve_installed_application,
            launch_application_target,
            android_local_ai_status,
            android_local_ai_load_model,
            android_local_ai_start_download,
            android_local_ai_cancel_download,
            android_local_ai_delete_model,
            android_local_ai_install_model,
            android_local_ai_chat,
            android_local_ai_test_inference,
            android_download_and_install_apk,
            whisper::check_whisper_status,
            whisper::transcribe_audio,
            desktop_ai::desktop_ai_status,
            desktop_ai::desktop_ai_start_download,
            desktop_ai::desktop_ai_cancel_download,
            desktop_ai::desktop_ai_start_server,
            desktop_ai::desktop_ai_delete_model,
            index_status,
            index_rebuild,
            oauth::wait_for_oauth_callback,
            oauth::open_browser_url,
            security::secure_save_token,
            security::secure_get_token,
            security::secure_delete_token
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                desktop_ai::stop_server();
                whisper::stop_server();
                #[cfg(not(target_os = "android"))]
                index::stop_background();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use chrono::Utc;

    #[test]
    fn test_search_folders_live_discovers_real_folder() {
        let profile = std::env::var("USERPROFILE").unwrap();
        let onedrive_desktop = PathBuf::from(&profile).join("OneDrive").join("Desktop");
        let desktop = if onedrive_desktop.exists() {
            onedrive_desktop
        } else {
            PathBuf::from(&profile).join("Desktop")
        };
        let test_dir = desktop.join("FoundryTestToday");
        let _ = fs::remove_dir_all(&test_dir);
        let _ = fs::create_dir(&test_dir);

        let now = Utc::now();
        let start_of_today = (now.date_naive() - chrono::Duration::days(1))
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .to_rfc3339();
        let end_of_today = (now.date_naive() + chrono::Duration::days(1))
            .and_hms_opt(23, 59, 59)
            .unwrap()
            .and_utc()
            .to_rfc3339();

        let results = search_folders_live(
            Some(start_of_today),
            Some(end_of_today),
            None,
            None,
            Some("FoundryTestToday".to_string()),
            Some(10),
        );

        println!("Discovered real folders on disk: {:?}", results);
        assert!(!results.is_empty(), "Should discover real FoundryTestToday created on Desktop");
        assert_eq!(results[0].name, "FoundryTestToday");
        assert!(results[0].path.contains("FoundryTestToday"));

        // Cleanup
        let _ = fs::remove_dir(&test_dir);
    }

    #[test]
    fn test_query_matches_resume_variants() {
        assert!(query_matches("Jagadeesh_Developer_Res.pdf", "C:/Downloads/Jagadeesh_Developer_Res.pdf", "resume"));
        assert!(query_matches("Jagadeesh_CV_2026.pdf", "C:/Docs/Jagadeesh_CV_2026.pdf", "resume"));
        assert!(query_matches("My Resume.docx", "C:/Docs/My Resume.docx", "resume"));
        assert!(!query_matches("10th.pdf", "C:/Downloads/10th.pdf", "resume"));
        assert!(!query_matches("AB2409260000014919.PDF", "C:/Downloads/AB2409260000014919.PDF", "resume"));
    }

    #[test]
    fn test_misspelled_app_names_resolve() {
        let app = |name: &str| DiscoveredApplication {
            name: name.to_string(),
            display_name: name.to_string(),
            application_id: None,
            package_name: None,
            publisher: None,
            executable_path: None,
            launch_identifier: name.to_string(),
            source: "test".to_string(),
            version: None,
        };
        let whatsapp = app("WhatsApp");
        let steam = app("Steam");
        for q in ["whatapp", "watsapp", "whats app", "WhatsApp", "open whatapp app"] {
            assert!(score_application_match(&whatsapp, q) > 0, "{q} should match WhatsApp");
        }
        assert!(score_application_match(&steam, "whatapp") <= 0);
        // An exact name still outranks a fuzzy one.
        assert!(score_application_match(&app("Telegram"), "telegram") > score_application_match(&app("Telegram"), "telegarm"));
    }

    #[test]
    fn test_query_matches_aadhaar_spellings() {
        assert!(query_matches_fuzzy("Aadhaar_Card_Jagadeesh.pdf", "C:/Docs/Aadhaar_Card_Jagadeesh.pdf", "adhar"));
        // exact mode does not guess spellings
        assert!(!query_matches("Aadhaar_Card_Jagadeesh.pdf", "C:/Docs/Aadhaar_Card_Jagadeesh.pdf", "adhar"));
        assert!(query_matches_fuzzy("my aadhar.jpg", "C:/Pictures/my aadhar.jpg", "aadhaar"));
        assert!(!query_matches_fuzzy("CTEST_DROP_SITE_PASSWORD.html", "C:/x/CTEST_DROP_SITE_PASSWORD.html", "passport"));
        assert!(!query_matches_fuzzy("10th.pdf", "C:/Downloads/10th.pdf", "adhar"));
    }

    #[test]
    fn test_query_matches_requires_all_words() {
        assert!(query_matches("Offer_Letter_Acme.pdf", "C:/Docs/Offer_Letter_Acme.pdf", "offer letter"));
        assert!(!query_matches("Offer_Terms.pdf", "C:/Docs/Offer_Terms.pdf", "offer letter"));
        assert!(query_matches("quarterly sales report.xlsx", "C:/Docs/quarterly sales report.xlsx", "sales reports"));
    }

    /// Diagnostic (run with --ignored --nocapture): shows what the live search returns on this machine.
    #[test]
    #[ignore]
    fn diagnostic_search_resume() {
        for q in ["resume", "cv", "adhar", "passport"] {
            let r = search_files_live(None, None, None, None, None, None, Some(q.to_string()), Some(10), None, None, None, None);
            println!("query '{}' -> {} results", q, r.len());
            for f in r.iter().take(6) {
                println!("   {} | {} | {}", f.name, f.file_type, f.path);
            }
        }
        let pdfs = search_files_live(None, None, None, None, None, Some("pdf".to_string()), None, Some(10000), None, None, None, None);
        println!("pdf count -> {}", pdfs.len());
        for q in ["whatapp", "watsapp", "whatsapp", "chorme", "calcualtor", "notpad", "teams", "spotfy"] {
            let r = resolve_installed_application(q.to_string()).unwrap();
            println!("app '{}' -> found={} {} {:?}", q, r.found, r.app_name, r.target_path);
        }
    }

    #[test]
    fn test_battery_information() {
        let res = get_battery_information();
        assert!(res.is_ok(), "get_battery_information should return Ok");
        let battery = res.unwrap();
        println!("Battery info: {:?}", battery);
        assert!(battery.level <= 100, "Battery level must be <= 100%");
    }

    #[test]
    fn test_network_information() {
        let net = get_network_information().expect("Failed to get network info");
        println!("Network info: {:?}", net);
        assert!(!net.interfaces.is_empty(), "Must have at least one network interface");
        assert!(net.is_connected, "Machine must report connected status");
    }

    #[test]
    fn test_search_files_live_sort_by_size() {
        let results = search_files_live(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(5),
            None,
            Some("size".to_string()),
            Some("desc".to_string()),
            None,
        );
        println!("Top largest files: {:?}", results);
        assert!(!results.is_empty(), "Must discover files");
        if results.len() > 1 {
            assert!(results[0].size >= results[1].size, "First file must be larger than or equal to second");
        }
    }

    #[test]
    fn test_real_filesystem_lifecycle() {
        let profile = std::env::var("USERPROFILE").unwrap();
        let onedrive_desktop = PathBuf::from(&profile).join("OneDrive").join("Desktop");
        let desktop = if onedrive_desktop.exists() {
            onedrive_desktop
        } else {
            PathBuf::from(&profile).join("Desktop")
        };
        let second = desktop.join("FoundryTestSecond");
        let renamed = desktop.join("FoundryTestRenamed");

        // Clean up any stale items
        let _ = fs::remove_dir_all(&second);
        let _ = fs::remove_dir_all(&renamed);

        // 1. Create second folder
        fs::create_dir(&second).expect("Failed to create FoundryTestSecond");

        let now = Utc::now();
        let start_of_today = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc().to_rfc3339();
        let end_of_today = (now.date_naive() + chrono::Duration::days(1))
            .and_hms_opt(23, 59, 59)
            .unwrap()
            .and_utc()
            .to_rfc3339();

        let res1 = search_folders_live(
            Some(start_of_today.clone()),
            Some(end_of_today.clone()),
            None,
            None,
            Some("FoundryTest".to_string()),
            Some(10),
        );
        let names1: Vec<_> = res1.iter().map(|f| f.name.as_str()).collect();
        println!("After creating FoundryTestSecond: {:?}", names1);
        assert!(names1.contains(&"FoundryTestSecond"), "Should find newly created FoundryTestSecond");

        // 2. Rename it to FoundryTestRenamed
        fs::rename(&second, &renamed).expect("Failed to rename folder");

        let res2 = search_folders_live(
            Some(start_of_today.clone()),
            Some(end_of_today.clone()),
            None,
            None,
            Some("FoundryTest".to_string()),
            Some(10),
        );
        let names2: Vec<_> = res2.iter().map(|f| f.name.as_str()).collect();
        println!("After renaming to FoundryTestRenamed: {:?}", names2);
        assert!(names2.contains(&"FoundryTestRenamed"), "Should find renamed folder");
        assert!(!names2.contains(&"FoundryTestSecond"), "Old name should be gone");

        // 3. Delete it
        fs::remove_dir(&renamed).expect("Failed to delete renamed folder");

        let res3 = search_folders_live(
            Some(start_of_today),
            Some(end_of_today),
            None,
            None,
            Some("FoundryTestRenamed".to_string()),
            Some(10),
        );
        println!("After deleting FoundryTestRenamed: {:?}", res3);
        assert!(res3.is_empty(), "Deleted folder should immediately disappear");
    }

    #[test]
    fn test_search_folders_live_discovers_d_foundry() {
        let results = search_folders_live(
            None,
            None,
            None,
            None,
            Some("Foundry".to_string()),
            Some(20),
        );

        println!("Discovered Foundry folders: {:?}", results);
        let paths: Vec<_> = results.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.iter().any(|p| p.to_lowercase().contains("foundry")), "Should discover real D:\\Foundry folder");
    }

    #[test]
    fn test_search_folders_without_name() {
        let js_start = "2026-09-20T18:30:00.000Z";
        let js_end = "2026-09-21T18:29:59.999Z";

        let results = search_folders_live(
            Some(js_start.to_string()),
            Some(js_end.to_string()),
            None,
            None,
            None,
            Some(200),
        );

        println!("Discovered folders created today (no name query): count = {}", results.len());
        for f in &results {
            println!("Folder: {} -> {} (created: {:?})", f.name, f.path, f.created_at);
        }
        let paths: Vec<_> = results.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.iter().any(|p| p.to_lowercase().contains("foundry")), "Should discover D:\\Foundry when querying folders created today without name filter");
    }

    #[test]
    fn test_compute_relevance_score_accessibility_resume() {
        let query = "give accessibility tester resume present in the system";
        
        let target_score = compute_relevance_score(
            "Jagadeesh_Accessibility_Tester.pdf",
            "C:\\Users\\jagadeesh\\Downloads\\Jagadeesh_Accessibility_Tester.pdf",
            "PDF",
            "pdf",
            query,
        );

        let general_resume_score = compute_relevance_score(
            "Jagadeesh_Professional_Resume_Final.pdf",
            "C:\\Users\\jagadeesh\\Documents\\Jagadeesh_Professional_Resume_Final.pdf",
            "PDF",
            "pdf",
            query,
        );

        let bug_report_score = compute_relevance_score(
            "Accessibility Bug Report - Bangalore Airport.xlsx",
            "C:\\Users\\jagadeesh\\Documents\\Accessibility Bug Report - Bangalore Airport.xlsx",
            "Spreadsheet",
            "xlsx",
            query,
        );

        let readme_score = compute_relevance_score(
            "README.md",
            "C:\\Users\\jagadeesh\\Projects\\README.md",
            "Document",
            "md",
            query,
        );

        println!("Scores: target={}, general_resume={}, bug_report={}, readme={}",
            target_score, general_resume_score, bug_report_score, readme_score);

        assert!(target_score > general_resume_score, "Target accessibility tester resume must outrank general resume");
        assert!(general_resume_score > bug_report_score, "General resume must outrank bug report");
        assert!(bug_report_score < 0, "Bug report should be penalized for resume query");
        assert!(readme_score <= 0, "Unrelated README should have zero/negative score");
    }

    #[test]
    fn test_resolve_installed_application_teams() {
        let res = resolve_installed_application("Teams".to_string()).expect("Failed to resolve Teams");
        println!("Resolved Teams: {:?}", res);
        assert!(res.found, "Teams must be discovered as installed");
        assert!(res.target_path.is_some(), "Teams must have a launch target path or AppID");
        let target = res.target_path.unwrap();
        assert!(target.contains("MSTeams") || target.contains("Teams"), "Target must point to Teams executable or AppX ID");
    }

    #[test]
    fn test_resolve_installed_application_aliases() {
        let queries = ["Microsoft Teams", "ms teams", "Teams app", "Chrome", "Notepad", "Calculator"];
        for q in queries {
            let res = resolve_installed_application(q.to_string()).unwrap_or_else(|_| panic!("Failed to resolve {}", q));
            println!("Query '{}' resolved to: {:?}", q, res);
            assert!(res.found, "Query '{}' should resolve an installed application", q);
        }
    }

    #[test]
    fn test_get_application_details_teams() {
        let details = get_application_details("Teams".to_string()).expect("Failed to get Teams details");
        println!("Teams details: {:?}", details);
        assert!(details.found, "Teams must be found");
        assert_eq!(details.display_name, "Microsoft Teams");
        assert!(details.source == "AppX/MSIX" || details.source == "Start Menu" || details.source == "Win32");
        assert!(details.version.is_some(), "Teams version should be retrieved from AppX package or binary");
    }

    #[test]
    fn test_uninstalled_application_not_found() {
        let res = resolve_installed_application("SomeRandomApplicationThatDoesNotExist".to_string()).expect("Resolution failed");
        println!("Non-existent app result: {:?}", res);
        assert!(!res.found, "Non-existent application must not be reported as found");
        assert!(res.target_path.is_none(), "Target path must be None");
    }

    #[test]
    fn test_get_system_info_includes_uptime() {
        let sys = get_system_info().expect("Failed to get system info");
        println!("System info: OS={}, CPU={}, RAM={}/{} ({:.1}%), Uptime={}",
            sys.os_name, sys.cpu_brand, sys.used_ram_formatted, sys.total_ram_formatted, sys.ram_percentage_used, sys.uptime_formatted);
        assert!(!sys.os_name.is_empty(), "OS name should not be empty");
        assert!(sys.total_ram_bytes > 0, "Total RAM should be greater than 0");
        assert!(sys.uptime_seconds > 0, "Uptime seconds should be greater than 0 on running OS");
        assert!(!sys.uptime_formatted.is_empty(), "Uptime formatted should not be empty");
    }

    #[test]
    fn test_get_top_processes_returns_metrics() {
        let procs = get_top_processes(Some(5)).expect("Failed to get top processes");
        println!("Top processes count = {}", procs.len());
        for (i, p) in procs.iter().enumerate() {
            println!("  #{}: PID={} Name={} Mem={} ({:.1}%) CPU={:.1}%",
                i + 1, p.pid, p.name, p.memory_formatted, p.memory_percent, p.cpu_usage);
        }
        assert!(!procs.is_empty(), "Should return at least 1 running process on the system");
        assert!(procs.len() <= 5, "Should respect requested limit of 5");
        // Verify sorted by memory descending
        if procs.len() >= 2 {
            assert!(procs[0].memory_bytes >= procs[1].memory_bytes, "Must be sorted by memory descending");
        }
    }
}
