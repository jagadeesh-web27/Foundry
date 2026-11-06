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

Date and time cases use placeholders that the harness fills in from the app page's own clock and time zone at check time: `{{weekday}}`, `{{day}}`, `{{month}}`, `{{year}}`, `{{tomorrowWeekday}}`, `{{tomorrowDay}}`, `{{tomorrowMonth}}`, and `{{time}}` (a regex matching the current minute, one minute either side).

### Desktop (Windows)

```powershell
npx tauri build --no-bundle
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process src-tauri\target\release\app.exe
node scripts/e2e-chat.mjs --port 9222 --suite tests/e2e/desktop-suite.json --out artifacts/e2e/desktop.json
```

Use the release build: the content security policy is only enforced there, so running it in dev mode would hide problems.

### File index checks (desktop)

Wait until the status bar shows "… files indexed · up to date", then run:

```powershell
node scripts/e2e-chat.mjs --port 9333 --suite tests/e2e/desktop-index-suite.json
node scripts/e2e-chat.mjs --port 9333 --suite tests/e2e/desktop-apps-suite.json
```

Real-data index diagnostic. It indexes this machine's folders into a throwaway database, then prints timings and sample results:

```powershell
cd src-tauri; cargo test --release --lib diagnostic_index_real_folders -- --ignored --nocapture
```

### Android phone (USB or Wi-Fi debugging)

```powershell
adb shell am start -n com.foundry.app.debug/com.foundry.app.MainActivity
$appPid = (adb shell pidof com.foundry.app.debug).Trim()
adb forward tcp:9225 localabstract:webview_devtools_remote_$appPid
node scripts/e2e-chat.mjs --port 9225 --suite tests/e2e/phone-suite.json --out artifacts/e2e/phone.json
```

The phone suite expects the test files in `/sdcard/FoundryTestData`. They are created by `provisionPhoneFixtures` in `tests/android/android-test-utils.ts`.

The date checks also need a file dated today. Create it on the day of the run:

```powershell
adb shell "echo test > /sdcard/FoundryTestData/test-today-note.txt"
```

Do not run `tests/android/android-physical-device.test.ts` casually. If the app isn't running, it reinstalls the APK and runs `pm clear`, which deletes the downloaded AI model.

**File index on Android (added 6 Nov):** the app needs Android's "All files access" permission (`MANAGE_EXTERNAL_STORAGE`) to see anything beyond photos/videos/audio; without it, file search and the index only cover media. The app shows an in-app banner to grant it, or grant it directly for test automation:

```powershell
adb shell appops set com.foundry.app.debug MANAGE_EXTERNAL_STORAGE allow
```

It survives app updates (reinstalling the APK does not revoke it), but `pm clear` does revoke it, same as it wipes the model.

**Wireless debugging (Wi-Fi, no cable):** `adb pair <ip>:<pairing-port> <code>` once (code and pairing port come from the phone's Developer options → Wireless debugging → "Pair device with pairing code" screen — the two "words" of that row open the page, not the toggle), then `adb connect <ip>:<port>` (the regular connect port shown on the same screen, found via `adb mdns services` if unknown). Pairing is remembered, but **the phone turns wireless debugging off when its screen locks or goes idle** — if `adb devices` and `adb mdns services` both come up empty while the phone still answers `ping`, the toggle has turned off; wake the phone and switch it back on (no re-pairing needed), then `adb connect` again.

## 3. Reports

Reports are written to `artifacts/e2e/*.json`, which is git-ignored. Each report records every question, the full answer, the tools used, the number of file cards, the time taken and the reasons for any failure.
