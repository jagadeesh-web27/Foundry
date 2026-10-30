use jni::objects::{JObject, JValue};
use crate::android_bridge::{call_cached_class_string, get_class_file_access, with_android_context};

fn call_string(
    env: &mut jni::JNIEnv<'_>,
    context: &JObject<'_>,
    method: &str,
    signature: &str,
    arguments: &[JValue<'_, '_>],
) -> Result<String, String> {
    call_cached_class_string(
        env,
        context,
        get_class_file_access(),
        "com/foundry/app/AndroidFileAccess",
        method,
        signature,
        arguments,
    )
}

pub fn search_files(request_json: &str) -> Result<String, String> {
    with_android_context(|env, context| {
        let request = env
            .new_string(request_json)
            .map_err(|error| format!("Cannot create Android search request: {error}"))?;
        call_string(
            env,
            &context,
            "searchFiles",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&request)],
        )
    })
}

pub fn read_file_content(uri: &str, max_bytes: usize) -> Result<String, String> {
    with_android_context(|env, context| {
        let uri_value = env
            .new_string(uri)
            .map_err(|error| format!("Cannot create Android URI: {error}"))?;
        call_string(
            env,
            &context,
            "readFileContent",
            "(Landroid/content/Context;Ljava/lang/String;I)Ljava/lang/String;",
            &[JValue::Object(&uri_value), JValue::Int(max_bytes as i32)],
        )
    })
}

pub fn file_metadata(uri: &str) -> Result<Option<String>, String> {
    with_android_context(|env, context| {
        let uri_value = env
            .new_string(uri)
            .map_err(|error| format!("Cannot create Android metadata URI: {error}"))?;
        match call_string(
            env,
            &context,
            "getFileMetadata",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&uri_value)],
        ) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.contains("returned null") => Ok(None),
            Err(error) => Err(error),
        }
    })
}

pub fn open_file(uri: &str) -> Result<bool, String> {
    with_android_context(|env, context| {
        let uri_value = env
            .new_string(uri)
            .map_err(|error| format!("Cannot create Android open URI: {error}"))?;
        let result = call_string(
            env,
            &context,
            "openFile",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&uri_value)],
        )?;
        Ok(result == "true")
    })
}
