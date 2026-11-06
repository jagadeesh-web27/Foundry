//! "All files access" on Android and opening files by path (Kotlin `AndroidStorage` via JNI).

use jni::objects::{JObject, JValue};

use crate::android_bridge::{call_cached_class_string, get_class_storage, with_android_context};

fn call_string(
    env: &mut jni::JNIEnv<'_>,
    context: &JObject<'_>,
    method: &str,
    signature: &str,
    arguments: &[JValue<'_, '_>],
) -> Result<String, String> {
    call_cached_class_string(env, context, get_class_storage(), "com/foundry/app/AndroidStorage", method, signature, arguments)
}

/// True when the user has allowed Foundry to read all files (documents, not only media).
pub fn has_all_files_access() -> bool {
    with_android_context(|env, context| {
        call_string(env, &context, "hasAllFilesAccess", "(Landroid/content/Context;)Ljava/lang/String;", &[])
    })
    .map(|r| r == "true")
    .unwrap_or(false)
}

/// Opens the system settings screen where the user can grant all files access.
pub fn request_all_files_access() -> Result<bool, String> {
    with_android_context(|env, context| {
        call_string(env, &context, "requestAllFilesAccess", "(Landroid/content/Context;)Ljava/lang/String;", &[])
    })
    .map(|r| r == "true")
}

/// Opens a file (plain path on shared storage) in the user's default app for its type.
pub fn open_path(path: &str) -> Result<(), String> {
    let result = with_android_context(|env, context| {
        let p = env.new_string(path).map_err(|e| format!("Cannot pass path: {e}"))?;
        call_string(env, &context, "openPath", "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;", &[JValue::Object(&p)])
    })?;
    match result.as_str() {
        "opened" => Ok(()),
        "missing" => Err("This file no longer exists.".to_string()),
        _ => Err("No app on this phone can open this type of file.".to_string()),
    }
}
