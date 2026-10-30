# Foundry — Local AI Computer Assistant

> **"Chat with my computer."**
> An AI interface for the user's own computer. Ask naturally using text or voice to find, understand, and open files across your device.

Foundry is a privacy-first, local-first AI assistant that runs directly on your computer. It discovers accessible files (Documents, Downloads, Desktop, Pictures, Videos, Music), indexes metadata, analyzes queries using natural language intent detection, and directly opens files in your default operating system applications.

---

## 1. Core Experience

```text
Launch Foundry
      ↓
[ Connect ]
      ↓
Foundry indexes accessible computer files in background
      ↓
User asks naturally via Text or Voice:
"Give me my resume PDFs"
"Find my offer letter"
"Show screen recordings from September 15"
"Give me my marriage photos"
      ↓
Foundry finds relevant local files & renders AI cards
      ↓
User clicks [ Open File ]
      ↓
File opens in default OS app (PDF reader, Word, Video player, etc.)
```

---

## 2. Key Capabilities

1. **Minimalist AI Chat UI**:
   - Clean, uncluttered chat interface: **"What can I find for you?"**.
   - No confusing dashboards or complex document management overhead.
   - Quick natural suggestions for immediate productivity.

2. **First Launch `[ Connect ]` Flow**:
   - Zero configuration required.
   - Requests operating-system permitted access across standard user directories:
     - `Documents`, `Downloads`, `Desktop`, `Pictures`, `Videos`, `Music`, and `OneDrive`.
   - Never attempts to crack or circumvent protected/encrypted folders; respects OS security authorities.

3. **Natural Language Intent & Metadata Engine**:
   - **Documents**: *"Give me my resume PDFs"*, *"Find my offer letter"*, *"Find documents related to MCA"*.
   - **Temporal queries**: *"Files added today"*, *"Created yesterday"*, *"Modified on September 15"*, *"Downloaded last week"*.
   - **Images & Visual ranking**: *"Give me my marriage photos"*, *"Find pictures of my bike"*, *"Give me a good-looking photo of myself"*.
   - **Videos & Screen recordings**: *"Show screen recordings from September 15"*, *"Find video demos"*.
   - **Audio & Voice notes**: *"Find my voice recordings"*.

4. **Native OS Actions**:
   - **[ Open File ]**: Invokes default OS application (Adobe/Edge for PDF, Word for DOCX, default media player for MP4/MP3).
   - **[ Show in Folder ]**: Selects and highlights the file in Windows File Explorer.

5. **Integrated Voice Input**:
   - Built-in microphone button with live speech transcription (`useVoiceInput` hook).
   - Speak naturally to query your computer without typing.

6. **Local AI & Privacy**:
   - Operates 100% locally on-device.
   - Pluggable provider abstraction for **Ollama**, **LM Studio**, **llama.cpp**, and custom local endpoints.
   - Works fully offline even when local AI is disconnected.

---

## 3. Architecture

```text
UI Layer (React 19 + TypeScript + Tailwind CSS v4)
  - MainAssistantPage (Hero, Suggestions, Chat Stream, Voice Input)
  - FirstLaunchScreen (Connect Flow & Transparency)
  - FileResultCard (File Icon, Badges, [Open File], [Show in Folder])
  - SettingsModal (Directories, Local AI, WCAG 2.2 AA Controls)
 ↓
Intent & Search Engine (intentEngine.ts)
  - Natural Language Intent Detection (FILE_SEARCH, IMAGE_SEARCH, VIDEO_SEARCH)
  - Date Filter Normalization (today, yesterday, last_week, exact)
  - Multi-Signal Scoring (Type, Extension, Quality, Recency, Keyword)
 ↓
Native OS & Tauri 2 Layer (src-tauri/src/lib.rs & computerService.ts)
  - get_accessible_directories: Enumerates Windows user directories
  - scan_user_directory: Safe recursive file metadata walker
  - open_file: Launches file in default system application
  - reveal_file_in_explorer: Highlights file in Windows File Explorer
 ↓
Local SQLite & IndexedDB Storage (database.ts & schema.ts)
  - indexed_files: Path, name, size, timestamps, type, qualityScore
```

---

## 4. Development & Build

### Prerequisites
- Node.js v18+ (tested on Node 24)
- Rust & Cargo (tested on Rust 1.98)

### Commands

```bash
# Install dependencies
npm install

# Run automated unit tests
npm test

# Run TypeScript check and production build
npm run build

# Start Vite dev server
npm run dev

# Run desktop Tauri application
npm run tauri dev
```

---

## 5. Verification & Testing

The project contains 17 automated tests verifying:
- Natural language query parsing across documents, dates, screen recordings, and photos.
- Keyword and semantic expansion.
- Cosine similarity vector calculations.
- Deterministic text chunking and SHA-256 deduplication.

Run tests anytime with:
```bash
npm test
```
