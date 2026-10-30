# Physical Android E2E testing over USB ADB

This suite tests the real Foundry APK on one physical Android phone over USB ADB. It does not use an emulator, a mock filesystem, or the Windows filesystem as the Android data source.

## Connect by USB

Enable **Developer options** and **USB debugging** on the phone, connect the USB cable, then verify authorization:

```powershell
adb devices
```

The device must appear as `<device-id> device`. The test runner rejects `unauthorized` devices, emulator properties, zero devices, and multiple devices. Wireless ADB remains an optional future transport, but it is not required by the current suite.

## Build and run

Build the debug APK first:

```powershell
npm run android:build
```

Install the newest successfully built APK over USB:

```powershell
npm run android:install
```

Build, install, launch, and verify the physical package in one command:

```powershell
npm run android:dev:usb
```

USB does not push source changes automatically. Normal USB development is:

```text
source change -> APK build -> adb install -r -> app launch
```

`npm run android:dev:usb` performs those steps. `npm run android:dev` is the separate Tauri development/HMR mode and may depend on a development server; it is not the production APK runtime.

Then run the transport guard:

```powershell
npm run android:device-check
```

Run the complete suite:

```powershell
npm run android:e2e
```

Or run the focused slices:

```powershell
npm run android:e2e:files
npm run android:e2e:metadata
```

Optional environment variables:

```powershell
$env:ANDROID_DEVICE = '<USB_DEVICE_ID>'
$env:ANDROID_PACKAGE = 'com.foundry.app.debug'
$env:ANDROID_APK = 'D:\\Foundry\\Foundry-Android-debug.apk'
```

The current runner requires exactly one authorized physical device and selects the newest APK by timestamp from the root APK, `public`, or Tauri Gradle output. Set `ANDROID_APK` to override the candidate explicitly. It creates the controlled fixtures directly on the phone at `/sdcard/FoundryTestData`, then drives Android's `ACTION_OPEN_DOCUMENT_TREE` picker to grant that directory to Foundry. The test runner does not search the Windows filesystem for Android results.

## What is asserted

The suite installs and launches the selected APK, verifies the Foundry process, completes the real SAF folder grant, submits natural-language prompts in Foundry's main assistant UI, and checks the rendered response. It covers PDF/DOCX/XLSX discovery, dynamic PDF count, resume content extraction, laptop-data isolation, app restart with persisted URI access, Android system/storage/network/battery metadata, and USB ADB transport. Filtered `adb logcat` is written to `artifacts/android/` after the run.

## Android data ownership

Documents are enumerated and read through the persisted SAF `content://` tree using `ContentResolver`. Photos, videos, and audio use MediaStore with granular media permissions. The Rust Tauri commands preserve the existing platform-neutral tool contracts while adapting those Android results into Foundry file metadata. Direct paths such as `/storage/emulated/0/Documents` are not used as the document source.

Source validation (`npm test`, `npm run build`, Rust `cargo check`, and Kotlin compilation) does not validate an APK. APK build validation requires `npm run android:build` to complete. Physical-device validation requires that newly built APK to be installed and the USB suite to pass on the real phone.

A test is not considered a pass when no phone is connected. The suite intentionally fails in that case instead of reporting an emulator or unit-test result as physical-device success.

## Report discipline

The runner prints an `Android Physical Device Test` header only after the USB physical-device guard passes. A successful APK build is not a physical-device test result. The final report includes the installed APK path and timestamp and must be generated from a connected phone run; it must not be copied from a previous run.

## Optional wireless transport

Wireless debugging may be used later with `adb pair <PHONE_IP>:<PAIRING_PORT>` followed by `adb connect <PHONE_IP>:<ADB_PORT>`, but the current physical-device acceptance flow is USB-first and does not require those commands.
