use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, Ordering};
use jni::objects::{JClass, JObject, JString, JValue};
use jni::sys::{jclass, jobject, JNIEnv as SysJNIEnv, JavaVM as SysJavaVM};
use jni::JavaVM;

static IS_INITIALIZED: AtomicBool = AtomicBool::new(false);
static mut SAVED_VM: *mut SysJavaVM = std::ptr::null_mut();
static mut SAVED_CONTEXT: jobject = std::ptr::null_mut();
static mut CLASS_LOCAL_AI: jobject = std::ptr::null_mut();
static mut CLASS_FILE_ACCESS: jobject = std::ptr::null_mut();
static mut CLASS_APK_INSTALLER: jobject = std::ptr::null_mut();
static mut CLASS_APPS: jobject = std::ptr::null_mut();

#[no_mangle]
pub unsafe extern "C" fn Java_com_foundry_app_MainActivity_initNdkContext(
    env: *mut SysJNIEnv,
    _class: jclass,
    context: jobject,
) {
    if IS_INITIALIZED.load(Ordering::Acquire) {
        println!("[Foundry][Rust] initNdkContext already initialized");
        return;
    }

    let mut vm: *mut SysJavaVM = std::ptr::null_mut();
    if (**env).GetJavaVM.unwrap()(env, &mut vm) != 0 || vm.is_null() {
        eprintln!("[Foundry][Rust] Failed to obtain JavaVM in initNdkContext");
        return;
    }

    let global_context = (**env).NewGlobalRef.unwrap()(env, context);
    if global_context.is_null() {
        eprintln!("[Foundry][Rust] Failed to create global ref for context");
        return;
    }

    SAVED_VM = vm;
    SAVED_CONTEXT = global_context;

    // Cache class references while on main UI thread with full App ClassLoader
    let cache_class = |name: &str| -> jobject {
        if let Ok(c_name) = CString::new(name) {
            let local_cls = (**env).FindClass.unwrap()(env, c_name.as_ptr());
            if !local_cls.is_null() {
                let global_cls = (**env).NewGlobalRef.unwrap()(env, local_cls as jobject);
                (**env).DeleteLocalRef.unwrap()(env, local_cls as jobject);
                return global_cls;
            } else {
                (**env).ExceptionClear.unwrap()(env);
                eprintln!("[Foundry][Rust] Could not find class: {name}");
            }
        }
        std::ptr::null_mut()
    };

    CLASS_LOCAL_AI = cache_class("com/foundry/app/AndroidLocalAI");
    CLASS_FILE_ACCESS = cache_class("com/foundry/app/AndroidFileAccess");
    CLASS_APK_INSTALLER = cache_class("com/foundry/app/AndroidApkInstaller");
    CLASS_APPS = cache_class("com/foundry/app/AndroidApps");

    // Also initialize ndk_context crate safely if not already initialized
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        ndk_context::initialize_android_context(vm as *mut c_void, global_context as *mut c_void);
    }));

    IS_INITIALIZED.store(true, Ordering::Release);
    println!("[Foundry][Rust] Android bridge successfully initialized");
}

pub fn get_class_local_ai() -> jobject {
    unsafe { CLASS_LOCAL_AI }
}

pub fn get_class_file_access() -> jobject {
    unsafe { CLASS_FILE_ACCESS }
}

pub fn get_class_apk_installer() -> jobject {
    unsafe { CLASS_APK_INSTALLER }
}

pub fn get_class_apps() -> jobject {
    unsafe { CLASS_APPS }
}

pub fn with_android_context<F, R>(operation: F) -> Result<R, String>
where
    F: FnOnce(&mut jni::JNIEnv<'_>, JObject<'_>) -> Result<R, String>,
{
    println!("[Foundry][Rust] with_android_context called");
    let (vm_ptr, ctx_ptr) = unsafe {
        let initialized = IS_INITIALIZED.load(Ordering::Acquire);
        let vm_null = SAVED_VM.is_null();
        let ctx_null = SAVED_CONTEXT.is_null();
        println!("[Foundry][Rust] with_android_context: IS_INITIALIZED={}, SAVED_VM.is_null()={}, SAVED_CONTEXT.is_null()={}", initialized, vm_null, ctx_null);
        if initialized && !vm_null && !ctx_null {
            println!("[Foundry][Rust] with_android_context: using saved VM and context");
            (SAVED_VM, SAVED_CONTEXT)
        } else {
            println!("[Foundry][Rust] with_android_context: trying ndk_context::android_context()");
            // Check if ndk_context was initialized externally
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                println!("[Foundry][Rust] Calling ndk_context::android_context()");
                ndk_context::android_context()
            }));
            match result {
                Ok(ctx) => {
                    println!("[Foundry][Rust] ndk_context::android_context() succeeded");
                    (ctx.vm() as *mut SysJavaVM, ctx.context() as jobject)
                }
                Err(e) => {
                    eprintln!("[Foundry][Rust] ndk_context::android_context() panicked: {:?}", e);
                    return Err("Android native context not yet initialized (waiting for MainActivity)".to_string());
                }
            }
        }
    };

    println!("[Foundry][Rust] with_android_context: obtained vm_ptr={:?}, ctx_ptr={:?}", vm_ptr, ctx_ptr);

    let vm = unsafe { JavaVM::from_raw(vm_ptr) }
        .map_err(|error| format!("Unable to attach to Android JVM: {error}"))?;
    let context = unsafe { JObject::from_raw(ctx_ptr) };
    let mut env = vm
        .attach_current_thread()
        .map_err(|error| format!("Android JNI operation failed: {error}"))?;
    println!("[Foundry][Rust] with_android_context: attached to VM, calling operation");
    let result = operation(&mut env, context);
    println!("[Foundry][Rust] with_android_context: operation completed");
    result
}

pub fn call_cached_class_string(
    env: &mut jni::JNIEnv<'_>,
    context: &JObject<'_>,
    cached_class_ptr: jobject,
    class_fallback_name: &str,
    method: &str,
    signature: &str,
    arguments: &[JValue<'_, '_>],
) -> Result<String, String> {
    let class: JClass<'_> = if !cached_class_ptr.is_null() {
        unsafe { JClass::from_raw(cached_class_ptr as jclass) }
    } else {
        match env.find_class(class_fallback_name) {
            Ok(c) => c,
            Err(_) => {
                let loader = env
                    .call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
                    .map_err(|e| format!("Failed to get classloader: {e}"))?
                    .l()
                    .map_err(|e| format!("Invalid classloader: {e}"))?;
                let dot_name = class_fallback_name.replace('/', ".");
                let jname = env
                    .new_string(dot_name)
                    .map_err(|e| format!("Failed to create class name string: {e}"))?;
                let loaded = env
                    .call_method(
                        &loader,
                        "loadClass",
                        "(Ljava/lang/String;)Ljava/lang/Class;",
                        &[JValue::Object(&jname)],
                    )
                    .map_err(|e| format!("ClassLoader failed to load {class_fallback_name}: {e}"))?
                    .l()
                    .map_err(|e| format!("Invalid loaded class: {e}"))?;
                JClass::from(loaded)
            }
        }
    };

    let mut values = Vec::with_capacity(arguments.len() + 1);
    values.push(JValue::Object(context));
    values.extend_from_slice(arguments);

    let result = env
        .call_static_method(class, method, signature, &values)
        .map_err(|error| format!("{class_fallback_name}.{method} failed: {error}"))?
        .l()
        .map_err(|error| format!("{class_fallback_name}.{method} returned an invalid value: {error}"))?;

    if result.is_null() {
        return Err(format!("{class_fallback_name}.{method} returned null"));
    }

    env.get_string(&JString::from(result))
        .map(|value| value.into())
        .map_err(|error| format!("{class_fallback_name}.{method} returned invalid text: {error}"))
}
