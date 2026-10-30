# Testing Foundry

Three layers of tests, from fastest to most realistic. A change is not "done" until all three pass.

## 1. Unit tests

```powershell
npm test                      # frontend (Vitest): router, permissions, agents, connectors
cd src-tauri; cargo test --lib  # backend (Rust): search, access policy, system tools
```

Some Rust tests read real machine state (battery, installed apps, the Desktop folder). They are meant to run on the development laptop.

## 2. End-to-end chat tests (the real app, the real model, real files)

`scripts/e2e-chat.mjs` drives the running app through the Chrome DevTools Protocol. For each question in a suite it:
1. types the question into the chat box and presses send;
2. waits for the answer;
3. checks the answer text, the number of file cards and the response time against the suite's expectations.

Each suite is a JSON list of questions with expectations (`all`, `any` and `none` regexes, `minFiles`, `maxSeconds`).

### Desktop (Windows)

```powershell
npx tauri build --no-bundle
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process src-tauri\target\release\app.exe
node scripts/e2e-chat.mjs --port 9222 --suite tests/e2e/desktop-suite.json --out artifacts/e2e/desktop.json
```

Use the release build: the content security policy is only enforced there, so running it in dev mode would hide problems.

### Android phone (USB or Wi-Fi debugging)

```powershell
adb shell am start -n com.foundry.app.debug/com.foundry.app.MainActivity
$appPid = (adb shell pidof com.foundry.app.debug).Trim()
adb forward tcp:9225 localabstract:webview_devtools_remote_$appPid
node scripts/e2e-chat.mjs --port 9225 --suite tests/e2e/phone-suite.json --out artifacts/e2e/phone.json
```

The phone suite expects the test files in `/sdcard/FoundryTestData`. They are created by `provisionPhoneFixtures` in `tests/android/android-test-utils.ts`.

Do not run `tests/android/android-physical-device.test.ts` casually. If the app isn't running, it reinstalls the APK and runs `pm clear`, which deletes the downloaded AI model.

## 3. Reports

Reports are written to `artifacts/e2e/*.json`, which is git-ignored. Each report records every question, the full answer, the tools used, the number of file cards, the time taken and the reasons for any failure.
