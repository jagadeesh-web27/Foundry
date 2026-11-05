//! Android installed-app discovery and launching (Kotlin `AndroidApps` via JNI).

use jni::objects::{JObject, JValue};

use crate::android_bridge::{call_cached_class_string, get_class_apps, with_android_context};
use crate::applications::DiscoveredApplication;

fn call_string(
    env: &mut jni::JNIEnv<'_>,
    context: &JObject<'_>,
    method: &str,
    signature: &str,
    arguments: &[JValue<'_, '_>],
) -> Result<String, String> {
    call_cached_class_string(env, context, get_class_apps(), "com/foundry/app/AndroidApps", method, signature, arguments)
}

#[derive(serde::Deserialize)]
struct LaunchableApp {
    label: String,
    package: String,
}

/// Apps shown in the phone's app drawer, as `DiscoveredApplication`s (launch target = package name).
pub fn list_launchable() -> Vec<DiscoveredApplication> {
    let json = with_android_context(|env, context| {
        call_string(env, &context, "listLaunchable", "(Landroid/content/Context;)Ljava/lang/String;", &[])
    });
    let apps: Vec<LaunchableApp> = match json {
        Ok(j) => serde_json::from_str(&j).unwrap_or_default(),
        Err(e) => {
            log::error!("[Foundry][AndroidApps] cannot list apps: {e}");
            Vec::new()
        }
    };
    apps.into_iter()
        .map(|a| DiscoveredApplication {
            name: a.label.clone(),
            display_name: a.label,
            application_id: Some(a.package.clone()),
            package_name: Some(a.package.clone()),
            publisher: None,
            executable_path: None,
            launch_identifier: a.package,
            source: "Android".to_string(),
            version: None,
        })
        .collect()
}

pub fn launch(package: &str) -> Result<bool, String> {
    with_android_context(|env, context| {
        let pkg = env.new_string(package).map_err(|e| format!("Cannot create package name: {e}"))?;
        call_string(env, &context, "launch", "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;", &[JValue::Object(&pkg)])
            .map(|r| r == "true")
    })
}
