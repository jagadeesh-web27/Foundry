use jni::objects::{JObject, JValue};
use crate::android_bridge::{call_cached_class_string, get_class_local_ai, with_android_context};

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
        get_class_local_ai(),
        "com/foundry/app/AndroidLocalAI",
        method,
        signature,
        arguments,
    )
}

pub fn status() -> Result<String, String> {
    with_android_context(|env, context| call_string(env, &context, "status", "(Landroid/content/Context;)Ljava/lang/String;", &[]))
}

pub fn load_model() -> Result<String, String> {
    with_android_context(|env, context| call_string(env, &context, "loadModel", "(Landroid/content/Context;)Ljava/lang/String;", &[]))
}

pub fn start_download(url: Option<String>) -> Result<String, String> {
    with_android_context(|env, context| {
        let string_target = url.unwrap_or_default();
        let j_str = env.new_string(string_target).map_err(|e| format!("Cannot create URL string: {e}"))?;
        call_string(
            env,
            &context,
            "startDownload",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&j_str)],
        )
    })
}

pub fn cancel_download() -> Result<String, String> {
    with_android_context(|env, context| call_string(env, &context, "cancelDownload", "(Landroid/content/Context;)Ljava/lang/String;", &[]))
}

pub fn delete_model() -> Result<String, String> {
    with_android_context(|env, context| call_string(env, &context, "deleteModel", "(Landroid/content/Context;)Ljava/lang/String;", &[]))
}

pub fn install_model(uri: &str) -> Result<String, String> {
    with_android_context(|env, context| {
        let uri_value = env
            .new_string(uri)
            .map_err(|error| format!("Cannot create Android model URI: {error}"))?;
        call_string(
            env,
            &context,
            "installModel",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&uri_value)],
        )
    })
}

pub fn chat(prompt: &str) -> Result<String, String> {
    with_android_context(|env, context| {
        let prompt_value = env
            .new_string(prompt)
            .map_err(|error| format!("Cannot create Android AI prompt: {error}"))?;
        call_string(
            env,
            &context,
            "chat",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&prompt_value)],
        )
    })
}

pub fn test_inference(prompt: &str) -> Result<String, String> {
    with_android_context(|env, context| {
        let prompt_value = env
            .new_string(prompt)
            .map_err(|error| format!("Cannot create Android AI test prompt: {error}"))?;
        call_string(
            env,
            &context,
            "testInference",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&prompt_value)],
        )
    })
}

pub fn get_battery_info() -> Result<String, String> {
    with_android_context(|env, context| {
        call_string(
            env,
            &context,
            "getBatteryInfo",
            "(Landroid/content/Context;)Ljava/lang/String;",
            &[],
        )
    })
}
