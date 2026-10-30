# Desktop Local AI Architecture & Provider Lifecycle (Agent 12)

> **Document**: `DESKTOP_LOCAL_AI.md`  
> **Author**: Agent 12 (Desktop Local AI Architecture)  
> **Status**: SPECIFIED & VERIFIED  

---

## 1. Executive Summary

While Foundry on Android includes a true zero-config on-device AI runtime powered by Google MediaPipe (`.task` models), Foundry on Desktop currently connects to local LLM engines (Ollama, LM Studio, or local Anthropic runtime).

This document formalizes the **Desktop Local AI Discovery & Zero-Config Architecture**, detailing auto-detection, fallback handling, and the desktop provider state machine.

---

## 2. Desktop Provider State Machine

All desktop providers implement the standard `AIProvider` contract with the following lifecycle states:

```text
┌─────────────────┐
│  NOT_INSTALLED  │ ── (Installer / download link presented to user)
└────────┬────────┘
         │ (Service launched)
┌────────▼────────┐
│    DETECTING    │ ── (Probe 11434 [Ollama], 1234 [LM Studio], 8082 [Custom])
└────────┬────────┘
         │
    ┌────┴───────────────────────────┐
    │                                │
┌───▼───────────┐            ┌───────▼───────┐
│ MODEL_MISSING │            │   AVAILABLE   │
└───┬───────────┘            └───────┬───────┘
    │ (Pull model)                   │ (Model loaded in VRAM)
┌───▼───────────┐            ┌───────▼───────┐
│ MODEL_LOADING │            │     READY     │
└───┬───────────┘            └───────────────┘
    │
┌───▼───────────┐
│     READY     │
└───────────────┘
```

---

## 3. Supported Desktop AI Providers

| Provider | Endpoint | Health / Status Endpoint | Detection Method | Recommended Models |
| :--- | :--- | :--- | :--- | :--- |
| **Ollama** | `http://127.0.0.1:11434` | `GET /api/tags` | TCP probe + JSON tags list | `llama3.2:3b`, `qwen2.5:3b`, `mistral:7b` |
| **LM Studio** | `http://127.0.0.1:1234` | `GET /v1/models` | OpenAI-compatible models list | `Qwen2.5-7B-Instruct-GGUF`, `Llama-3.2-3B` |
| **Local Anthropic** | `http://127.0.0.1:8082` | `GET /health` | Custom local reverse-proxy | `claude-3-5-sonnet-20241022` |
| **Direct Cloud** (Optional) | `https://api.anthropic.com` | `POST /v1/messages` (dry run) | API key validation | `claude-3-5-haiku-latest` |

---

## 4. Zero-Config Future Roadmap (Desktop Embedded LLM)

To bring desktop to complete parity with Android's self-contained APK:
1. **Bundle `llama-server.exe`** inside `src-tauri/llama-runtime/` (following the exact pattern used for `whisper-server.exe`).
2. Provide a one-click in-app model downloader in `LocalAISetupModal.tsx` for GGUF models (e.g. `Llama-3.2-3B-Instruct-Q4_K_M.gguf`, ~2 GB).
3. Run `llama-server` as a managed child process on port `8172` with zero manual user installation or terminal setup required.
