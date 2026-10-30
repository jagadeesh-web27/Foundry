use std::fs;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
mod dpapi {
    use std::ptr::null_mut;

    #[repr(C)]
    pub struct DATA_BLOB {
        pub cb_data: u32,
        pub pb_data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        pub fn CryptProtectData(
            p_data_in: *mut DATA_BLOB,
            sz_data_descr: *const u16,
            p_optional_entropy: *mut DATA_BLOB,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DATA_BLOB,
        ) -> i32;

        pub fn CryptUnprotectData(
            p_data_in: *mut DATA_BLOB,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *mut DATA_BLOB,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DATA_BLOB,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn LocalFree(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    pub fn encrypt_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
        let mut in_blob = DATA_BLOB {
            cb_data: data.len() as u32,
            pb_data: data.as_ptr() as *mut u8,
        };

        let mut out_blob = DATA_BLOB {
            cb_data: 0,
            pb_data: null_mut(),
        };

        unsafe {
            let res = CryptProtectData(
                &mut in_blob,
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            );

            if res == 0 || out_blob.pb_data.is_null() {
                return Err("Windows DPAPI CryptProtectData encryption failed".to_string());
            }

            let slice = std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize);
            let encrypted = slice.to_vec();
            LocalFree(out_blob.pb_data as *mut std::ffi::c_void);
            Ok(encrypted)
        }
    }

    pub fn decrypt_bytes(encrypted: &[u8]) -> Result<Vec<u8>, String> {
        let mut in_blob = DATA_BLOB {
            cb_data: encrypted.len() as u32,
            pb_data: encrypted.as_ptr() as *mut u8,
        };

        let mut out_blob = DATA_BLOB {
            cb_data: 0,
            pb_data: null_mut(),
        };

        unsafe {
            let res = CryptUnprotectData(
                &mut in_blob,
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            );

            if res == 0 || out_blob.pb_data.is_null() {
                return Err("Windows DPAPI CryptUnprotectData decryption failed".to_string());
            }

            let slice = std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize);
            let decrypted = slice.to_vec();
            LocalFree(out_blob.pb_data as *mut std::ffi::c_void);
            Ok(decrypted)
        }
    }
}

/// Resolves the secure credentials storage directory on the host OS.
fn get_credentials_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let p = PathBuf::from(appdata).join("Foundry").join("credentials");
            return Ok(p);
        }
    }

    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let p = PathBuf::from(home)
            .join(".foundry")
            .join("credentials");
        return Ok(p);
    }

    Err("Could not determine user credentials directory".to_string())
}

/// Securely encrypts and stores an OAuth token JSON payload using Windows DPAPI.
#[tauri::command]
pub fn secure_save_token(provider: String, tokens_json: String) -> Result<(), String> {
    let clean_provider = provider
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();

    if clean_provider.is_empty() {
        return Err("Invalid provider name for secure token storage".to_string());
    }

    let dir = get_credentials_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create credentials directory {:?}: {}", dir, e))?;

    let file_path = dir.join(format!("{}.bin", clean_provider));

    #[cfg(target_os = "windows")]
    let data_to_write = dpapi::encrypt_bytes(tokens_json.as_bytes())?;

    #[cfg(not(target_os = "windows"))]
    let data_to_write = tokens_json.as_bytes().to_vec();

    fs::write(&file_path, data_to_write)
        .map_err(|e| format!("Failed to write secure credential file {:?}: {}", file_path, e))?;

    Ok(())
}

/// Securely retrieves and decrypts an OAuth token JSON payload using Windows DPAPI.
#[tauri::command]
pub fn secure_get_token(provider: String) -> Result<Option<String>, String> {
    let clean_provider = provider
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();

    if clean_provider.is_empty() {
        return Err("Invalid provider name for secure token retrieval".to_string());
    }

    let dir = get_credentials_dir()?;
    let file_path = dir.join(format!("{}.bin", clean_provider));

    if !file_path.exists() {
        return Ok(None);
    }

    let raw_bytes = fs::read(&file_path)
        .map_err(|e| format!("Failed to read secure credential file {:?}: {}", file_path, e))?;

    if raw_bytes.is_empty() {
        return Ok(None);
    }

    #[cfg(target_os = "windows")]
    let decrypted_bytes = dpapi::decrypt_bytes(&raw_bytes)?;

    #[cfg(not(target_os = "windows"))]
    let decrypted_bytes = raw_bytes;

    let token_str = String::from_utf8(decrypted_bytes)
        .map_err(|e| format!("Secure credential content is not valid UTF-8: {}", e))?;

    Ok(Some(token_str))
}

/// Securely deletes a stored credential file from the disk.
#[tauri::command]
pub fn secure_delete_token(provider: String) -> Result<(), String> {
    let clean_provider = provider
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();

    if clean_provider.is_empty() {
        return Err("Invalid provider name".to_string());
    }

    let dir = get_credentials_dir()?;
    let file_path = dir.join(format!("{}.bin", clean_provider));

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete credential file {:?}: {}", file_path, e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "windows")]
    fn test_windows_dpapi_round_trip() {
        let original = "{\"access_token\":\"secret_token_12345\",\"refresh_token\":\"refresh_98765\"}";
        let encrypted = dpapi::encrypt_bytes(original.as_bytes()).expect("DPAPI encryption failed");
        assert_ne!(encrypted, original.as_bytes(), "Encrypted bytes must not match plaintext");

        let decrypted = dpapi::decrypt_bytes(&encrypted).expect("DPAPI decryption failed");
        let decrypted_str = String::from_utf8(decrypted).expect("UTF-8 decoding failed");
        assert_eq!(decrypted_str, original, "Decrypted text must match original plaintext");
    }

    #[test]
    fn test_secure_save_get_delete_cycle() {
        let test_provider = "test_unit_provider";
        let test_payload = "{\"accessToken\":\"test_xyz_999\",\"tokenType\":\"Bearer\"}";

        secure_save_token(test_provider.to_string(), test_payload.to_string())
            .expect("Secure save failed");

        let retrieved = secure_get_token(test_provider.to_string())
            .expect("Secure get failed");
        assert_eq!(retrieved, Some(test_payload.to_string()));

        secure_delete_token(test_provider.to_string()).expect("Secure delete failed");

        let after_delete = secure_get_token(test_provider.to_string())
            .expect("Secure get after delete failed");
        assert_eq!(after_delete, None);
    }
}
