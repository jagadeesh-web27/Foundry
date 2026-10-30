# Foundry Security & Permissions Audit (Agent 10)

> **Document**: `SECURITY_AUDIT.md`  
> **Author**: Agent 10 (Security & Permissions Engineering)  
> **Classification**: Internal Security Assessment & Hardening Guide  
> **Status**: VERIFIED  

---

## 1. Core Principle: The READ vs. ACTION Boundary

Foundry adheres to a strict privilege boundary:
1. **READ-ONLY Operations**:
   - `searchFiles`, `searchFolders`, `readFile`, `getSystemInfo`, `getDiskInformation`, `getBatteryInformation`, `getNetworkInformation`, `getRunningApplications`.
   - *Behavior*: Allowed to execute automatically inside the autonomous agent loop to retrieve context for the user.
2. **ACTION Operations**:
   - `openApplication`, `launch_application_target`, file modifications, deletions, sending emails, external mutations.
   - *Behavior*: **MANDATORY EXPLICIT USER CONFIRMATION**. The agent must NEVER execute an action tool autonomously. It must return a `pendingAction` object rendered in the UI with explicit `[Confirm]` and `[Cancel]` buttons.

---

## 2. Security Threat Model & Analysis

### A. Path Traversal & Unsafe Filesystem Access
- **Threat**: Prompt injection or malicious query attempting to pass `../../../../Windows/System32` or access sensitive OS credentials (`id_rsa`, SAM, passwords).
- **Mitigation in `lib.rs` & `tools.ts`**:
  - Scanning is bounded to user-permitted standard directories (`Documents`, `Downloads`, `Desktop`, `Pictures`, `Videos`, `Music`).
  - System and hidden directories (`AppData`, `Windows`, `Program Files`, `.git`, `.ssh`) are filtered out by `is_ignored_dir()` in [lib.rs:230-246](file:///d:/Foundry/src-tauri/src/lib.rs#L230-L246).
  - Absolute path normalization (`PathBuf::canonicalize`) prevents directory traversal attacks via relative dot-segments.

### B. Arbitrary Application & Binary Execution
- **Threat**: LLM tricked into launching arbitrary malicious commands (e.g. `powershell.exe -enc ...` or `cmd.exe /c ...`).
- **Mitigation in `computerTools.openApplication` & `lib.rs`**:
  - `launch_application_target` strictly validates that the target path resolves to an already installed executable registered in the Windows Registry or Start Menu.
  - Raw shell commands (`sh`, `bash`, `powershell`, `cmd`) cannot be invoked directly by tool calls.
  - User confirmation dialog shows the exact resolved executable path and application name prior to invocation.

### C. OAuth Token Security & Secrets Storage
- **Threat**: Access tokens and refresh tokens (for Google, Microsoft Graph) stored in plaintext or logged to stdout.
- **Mitigation in `security.rs` & `tokenStore.ts`**:
  - Tokens are encrypted at rest using AES-GCM or native OS credential store ([security.rs](file:///d:/Foundry/src-tauri/src/security.rs)).
  - OAuth flow uses a temporary loopback HTTP server binding strictly to `127.0.0.1` on an ephemeral port ([oauth.rs](file:///d:/Foundry/src-tauri/src/oauth.rs)). The server terminates immediately upon receiving the authorization code.
  - Access tokens are never emitted into `console.log` or Tauri IPC logging.

### D. Zero-Cloud Telemetry Guarantee
- **Threat**: Unintentional leakage of file metadata, filenames, or user queries to external analytics servers.
- **Verification**:
  - Zero external tracking or analytics SDKs exist in `package.json`.
  - All file search indexing and vector calculations are executed locally via SQLite/IndexedDB and local Rust threads.
  - Offline mode functions completely when network connectivity is severed.

---

## 3. Security Verification Checklist

- [x] **Privilege Separation**: READ tools execute; ACTION tools require explicit user confirmation.
- [x] **Path Sanitization**: Directory walkers ignore hidden, system, and encrypted OS directories.
- [x] **Loopback Binding**: OAuth server binds strictly to `127.0.0.1`.
- [x] **Token Encryption**: Tokens encrypted with AES-256-GCM.
- [x] **Telemetry Audit**: Zero telemetry or tracking endpoints configured.
