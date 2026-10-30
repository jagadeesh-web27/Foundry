# Android Standalone AI & Download Reliability Architecture (Agent 6)

> **Document**: `ANDROID_ARCHITECTURE.md`  
> **Author**: Agent 6 (Android Engineering & Reliability)  
> **Target SDK**: Android 14+ (API 34)  
> **Status**: ACTIVE & ARCHITECTURALLY SPECIFIED  

---

## 1. On-Device AI Architecture (MediaPipe Tasks GenAI)

Foundry on Android executes 100% offline using Google MediaPipe Tasks GenAI:

```text
┌─────────────────────────┐
│     Foundry UI / TS     │
└────────────┬────────────┘
             │ invoke('android_local_ai_chat', { prompt })
┌────────────▼────────────┐
│   Tauri IPC / Rust      │ (src-tauri/src/android_ai.rs)
└────────────┬────────────┘
             │ JNI call
┌────────────▼────────────┐
│    AndroidLocalAI.kt    │ (Kotlin bridge)
└────────────┬────────────┘
             │ com.google.mediapipe.tasks.genai.llminference.LlmInference
┌────────────▼────────────┐
│      Gemma 2B IT        │ (Quantized 4-bit .task model stored in filesDir)
└─────────────────────────┘
```

---

## 2. Model Download Manager Upgrade Plan

### A. Current Limitation
In the current prototype, large model downloads (~1.4 GB to 1.8 GB) execute inside an in-process Java background thread. If the user minimizes Foundry or the screen locks, Android OS battery optimizations will suspend or kill the thread, corrupting the partial download.

### B. Production Architecture: Android `DownloadManager` / `WorkManager`

```text
┌─────────────────────────────────────────────────────────────┐
│                 Foundry Model Download Request              │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │   Android Native DownloadManager    │
            └──────────────────┬──────────────────┘
                               │
      ├── Network Constraint: SetAllowedNetworkTypes (Wi-Fi preferred)
      ├── Notification: System notification bar with live progress %
      ├── Persistence: Survives activity recreation & app suspension
      └── Storage: Saves directly to scoped app private directory
```

### C. Download State Machine & Event Contracts
The state machine exposed to the React frontend remains identical, preserving API compatibility:

```text
1. NOT_STARTED: No model file present in filesDir/foundry-models/
2. DOWNLOADING: Active download job running; provides downloadProgress (0-100) & downloadBytes
3. PAUSED: Waiting for Wi-Fi reconnection
4. VERIFYING: Model downloaded; validating file size and MediaPipe task header
5. READY: Model verified and loaded into LlmInference session
6. FAILED: Error with actionable user-facing message
7. CANCELLED: Download aborted by user; partial temp files purged
```
