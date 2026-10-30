use jni::objects::JValue;
use crate::android_bridge::{call_cached_class_string, get_class_apk_installer, with_android_context};

pub fn download_and_install(url: &str) -> Result<String, String> {
    with_android_context(|env, context| {
        let url_value = env
            .new_string(url)
            .map_err(|error| format!("Cannot create update URL: {error}"))?;
        call_cached_class_string(
            env,
            &context,
            get_class_apk_installer(),
            "com/foundry/app/AndroidApkInstaller",
            "downloadAndInstall",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[JValue::Object(&url_value)],
        )
    })
}
