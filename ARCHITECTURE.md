# Foundry System Architecture & Engineering Reference (Agent 14)

> **Document**: `ARCHITECTURE.md`  
> **Author**: Agent 14 (Architecture & Engineering Documentation)  
> **Status**: CURRENT & PRODUCTION-ACCURATE  

---

## 1. System Topology & Architectural Layers

Foundry is structured into five distinct, decoupled architectural layers:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        1. PRESENTATION LAYER                           │
│  React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons                │
│  - MainAssistantPage (Hero, Chat Stream, Voice Waveform, Action Cards)  │
│  - Tabs: Today, Pending, Goals, Clean-Up, Analytics, Tasks, Automations│
│  - Modals: SettingsModal, LocalAISetupModal, AppUpdateModal            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                  2. AGENT & REASONING LAYER                            │
│  DynamicAgent & AgentRunner (intent classification, planning)          │
│  - Iterative Reasoning Loop (up to 10 tool calls per turn)             │
│  - Multi-Signal Relevance & Quality Scoring                            │
│  - Two-Tier Permission Engine (Automatic READ vs. Confirmed ACTION)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    3. TOOL REGISTRY & CONNECTORS                       │
│  toolRegistry.ts (30+ registered system & productivity tools)          │
│  - Filesystem: searchFiles, searchFolders, readFile, openFile          │
│  - Diagnostics: getDiskInformation, getBatteryInformation, getSystem   │
│  - Obligations: commitmentEngine, followUpEngine, goalEngine           │
│  - Connectors: Google (Gmail, Drive, Calendar), Microsoft Graph        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                   4. PLATFORM DEVICE ABSTRACTION                       │
│  DeviceService (dynamic adapter selection based on runtime)            │
│  - Desktop Adapter: Tauri 2 IPC commands (src-tauri/src/lib.rs)        │
│  - Android Adapter: JNI & MediaPipe GenAI (AndroidLocalAI.kt)          │
│  - Web Fallback: Mock / IndexedDB Adapter for browser testing          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    5. LOCAL AI & STORAGE ENGINES                       │
│  - Desktop Speech: Embedded whisper-server.exe & ggml-base.en.bin      │
│  - Android LLM: On-device MediaPipe GenAI (Gemma 2B IT int4 .task)     │
│  - Desktop LLM: Pluggable Ollama / LM Studio / Local Anthropic         │
│  - Local Data: IndexedDB (foundry_local_db v7) & SQLite               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure & Key Subsystems

```text
Foundry/
├── src/
│   ├── components/
│   │   ├── assistant/      # Modular assistant components (AssistantHeader, AssistantTabs, AssistantModals)
│   │   ├── chat/           # Chat input, message cards, local AI modal
│   │   ├── layout/         # Navigation, TabNav
│   │   ├── ui/             # Reusable primitives (Modal with focus-trap, Button)
│   │   ├── diagnostics/    # DataDiagnosticsModal ("Verify My Data")
│   │   └── connectors/     # Connector connection modals (Google, Microsoft)
│   ├── hooks/              # Custom hooks (useAssistantChat, useVoiceInput, useDebounce)
│   ├── pages/              # MainAssistantPage, TodayPage, PendingPage, etc.
│   ├── services/
│   │   ├── agent/          # DynamicAgent, AgentRunner, tools, toolRegistry
│   │   ├── ai/             # AI provider abstractions (Ollama, LM Studio, MediaPipe)
│   │   ├── commitments/    # Obligations, promises, deadlines engine
│   │   ├── connectors/     # Universal communication connectors (Google, MS)
│   │   ├── db/             # IndexedDB / SQLite database schemas & stores
│   │   ├── device/         # DeviceService & platform adapters
│   │   ├── native/         # computerService (Tauri IPC invocations)
│   │   ├── permissions/    # PermissionManager (Action confirmation barriers)
│   │   └── voice/          # AudioRecorder and speech handlers
│   └── stores/             # React Context stores (AppContext, ThemeContext)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Thin Tauri bootstrap & command registration hub
│   │   ├── filesystem.rs   # Modular filesystem search, scan, and file ops
│   │   ├── system.rs       # Modular system telemetry, battery, disk, network
│   │   ├── applications.rs # Modular application discovery, launching, process ops
│   │   ├── whisper.rs      # Embedded Whisper server process manager
│   │   ├── oauth.rs        # Loopback OAuth callback HTTP server
│   │   ├── security.rs     # Platform-secure DPAPI token encryption
│   │   ├── android_ai.rs   # JNI bridge for Android on-device AI
│   │   └── android_bridge.rs # Android JNI context and lifecycle helpers
│   └── whisper-runtime/    # Embedded whisper-server.exe & model weights
└── tests/                  # Android physical device and E2E tests
```

---

## 3. Communication Contracts

### A. Intent Classification & Tool Calling
When user input is received:
1. `DynamicAgent.classifyIntent(query)` categorizes intent (`general`, `device_system`, `file_query`, `all`).
2. If intent is `general` with no device context, LLM answers directly without tool execution.
3. If intent matches hardware, storage, or files, the model is prompted with a strict JSON schema:
   ```json
   { "tool": "tool_name", "arguments": { ... } }
   ```
4. Tool outputs are injected back into the LLM conversation loop for up to 10 iterations until a natural language synthesis is reached.

### B. Safety Guarantee
- If a tool has `requiresConfirmation: true` (e.g. `openApplication`), execution pauses and yields a `PendingAction` to the frontend.
- The UI renders an interactive confirmation banner. The action will NOT proceed until the user clicks `[Confirm]`.
