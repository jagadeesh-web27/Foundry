# Foundry — Engineering Assessment and Improvement Plan

**Date:** 30 Oct 2026
**Scope:** Whole product — React/TypeScript frontend, Rust/Tauri backend, AI pipeline, data and retrieval, Android bridge.
**Method:** Code read across all subsystems (four parallel audits). Every high-severity claim was re-checked by hand against the source. Test suites were run, and live experiments were run against the bundled on-device model.

**Important:** this document supersedes the status claims in `FOUNDRY_AGENT_STATUS.md`, `QA_VERIFICATION_MATRIX.md`, `SECURITY_AUDIT.md` and `CONNECTORS.md` (8 Oct). Those documents describe several capabilities as complete that are not implemented. Section 9 lists the corrections.

---

## 1. Summary

Foundry has a solid skeleton:
- a working Tauri shell,
- real native tools (live file search, system, disk, battery, network, app launch, speech-to-text),
- a bundled on-device model on desktop and Android,
- a large, mostly well-typed UI with 169 passing frontend tests and 26 passing Rust tests.

It is **not yet an intelligent assistant**. The "intelligence" layer is mostly regex routing in several competing copies. The retrieval layer — index, embeddings, semantic search, knowledge graph, grounded answers — is largely declared but not implemented. Some code paths present placeholder text as if it were real file content. That is why every new phrasing exposes a new failure, and why fixes so far have been one symptom at a time.

The root causes are architectural, not individual bugs:

1. **There is no index.** Every question triggers a fresh walk of the disk that matches file *names* only. Nothing reads or understands file *contents*, so "documents related to React development" cannot work.
2. **There is no single "understanding" step.** Five separate routers guess intent with different regex lists, and they disagree.
3. **The small local model is used for jobs it cannot do.** It cannot reliably choose tools or classify intent; this was tested (see §5). It can write good answers when it is *given* the right content.
4. **There is no conversation memory.** Every message is handled in isolation, so follow-ups ("summarize it", "the second one") cannot work.
5. **Nothing marks which statements come from your files and which are model guesses**, and some fallbacks fabricate content.

---

## 2. What actually works today (verified)

| Capability | Status | Evidence |
|---|---|---|
| Desktop app shell, chat UI, conversation list saved locally | Works | `useAssistantChat.ts`, IndexedDB persistence |
| Live file-name search (Windows) with relevance ranking | Works, rebuilt 30 Oct | `filesystem.rs` `search_files_live`, `query_matches` |
| Count files by type, battery, disk, network, system specs | Works (rule-routed) | `directRouter.ts` |
| Open/reveal files, launch installed apps with confirmation | Works | `applications.rs`, `FileResultCard.tsx` |
| Offline speech-to-text (Whisper) | Works on this machine only (see §4 R5) | `whisper.rs` |
| Bundled on-device LLM on desktop (llama.cpp + Llama 3.2 3B) | Works: ~2 s short answers, ~15–20 s per paragraph at about 9 tokens/s | `desktop_ai.rs`, measured |
| On-device LLM on Android (MediaPipe Gemma 2B) | Worked in the 1 Oct phone test; not re-tested since the 8 Oct changes | `AndroidLocalAI.kt` |
| Manual document import, chunking, SHA-256 dedup | Partial: chunking real; PDF/DOCX extraction broken (see §3) | `ImportsPage.tsx`, `documentService.ts` |
| Windows token encryption (DPAPI) | Works | `security.rs` |

---

## 3. Data and retrieval — the biggest gap

| Capability | Status | Evidence |
|---|---|---|
| Persistent index of your files | **Missing.** IndexedDB only caches whatever a live search happened to return. It is never pruned, so deleted files stay forever. | `tools.ts:135`, `database.ts` |
| File-content search | **Missing.** Search matches names and paths only. | `filesystem.rs` |
| PDF/DOCX text extraction | **Broken.** Import UTF-8-decodes compressed binary into garbage, then substitutes the placeholder "Extracted document content from X" and indexes that as content. Rust PDF reading only sees uncompressed text and is O(n²). | `ImportsPage.tsx:85-98`, `filesystem.rs:930+` |
| Embeddings / semantic search | **Missing.** `embed()` throws for both on-device providers. Even with a provider, vectors are computed and never saved. The "Embeddings generation" step in the UI shows as done. | `ImportsPage.tsx:157-160`, `desktopLocalProvider.ts` |
| Hybrid search, reranking | **Not functional.** The formula exists, but the semantic score is always 0. Every search loads the whole corpus into memory. No reranker exists. | `searchService.ts:30-68` |
| Grounded answers with citations | **Dead code.** `generateRAGAnswer` has no callers. | `aiService.ts:141` |
| Knowledge graph | **Thin.** Only document nodes, plus note→document edges. No entities or concepts, and "similarity" edges are never written. | `graphService.ts`, `noteService.ts` |
| Detect new, changed and deleted files | **Missing.** The `notify` crate is a dependency but is never used. | `Cargo.toml:27`, grep |

---

## 4. Findings by severity

### Critical: honesty and safety

| # | Finding | Evidence |
|---|---|---|
| C1 | **Fabricated file content.** When a live read fails, `readFile` returns the fixed text "React Notes and documentation with details on components, hooks…", and the summarizer presents it as the file's content. | `tools.ts:314` |
| C2 | **Placeholder text indexed as document content** (see §3). | `ImportsPage.tsx:94-96` |
| C3 | **No content security policy.** Combined with the commands below, any injected script in the webview could read any file, make arbitrary network requests, or run executables. | `tauri.conf.json` `"csp": null` |
| C4 | **Over-powerful backend commands, callable by any webview script:** `proxy_http_request` fetches any URL, including LAN and localhost (an SSRF/exfiltration risk); `read_file_content` reads any path; `open_file` runs `cmd /c start <path>`, so it executes any file; `launch_application_target` runs any existing `.exe` or `.lnk`. | `system.rs:389`, `filesystem.rs:1006,1041`, `applications.rs:556` |
| C5 | **Permission settings are enforced on only one of three paths.** The direct router and the fallback path call tools without checking `permissionManager`. | grep: only `dynamicAgent.ts` uses it |
| C6 | **No version control.** The project is not a git repository, so no change can be reviewed or rolled back. | `git rev-parse` fails |

### High: intelligence and correctness

| # | Finding | Evidence |
|---|---|---|
| H1 | **Five competing intent routers** (directRouter, dynamicAgent.classifyIntent, the ~1,400-line regex cascade in agentRunner, plus intentParser and intentEngine, which are used only by tests). Each new phrasing breaks a different one. | `agentRunner.ts`, `dynamicAgent.ts:46` |
| H2 | **No conversation context** reaches the agent; only the latest message is passed. | `agentRunner.run(userInput, …)`, `dynamicAgent.ts:376` |
| H3 | **About 3,000-token desktop tool prompt** for a 3B model, so it is slow and picks tools poorly. | `dynamicAgent.ts:257-322` |
| H4 | **The tool-call parser guesses.** Any JSON containing `query` or `path` gets executed as a tool, and `readFile` may silently read a different file than the one the model asked for. | `dynamicAgent.ts:788-814, 907-941` |
| H5 | **An error loop can spin forever.** Tool errors `continue` without counting toward the loop limit. | `dynamicAgent.ts:569-576` |
| H6 | **No labelling** of "from your files" versus "general knowledge" in answers. | UI and agent |

### High: reliability and performance

| # | Finding | Evidence |
|---|---|---|
| R1 | **Heavy synchronous commands run on the UI thread** (search, scan, file read, app discovery), so the window freezes during big scans. | `filesystem.rs:404,909,1006` |
| R2 | **Whole-disk walk on every query.** A 5,000-entry cap makes results silently incomplete on large drives. | `filesystem.rs:446` |
| R3 | **No streaming and no cancel.** The user waits up to 300 s with a static "Thinking…" label. | `useAssistantChat.ts:253`, `MainAssistantPage.tsx:421` |
| R4 | **whisper-server is never stopped** when Foundry exits. | `whisper.rs`, `lib.rs` exit handler |
| R5 | **Hard-coded developer paths** (`D:\Foundry\…`, `D:\Crack\…`) mean speech input will fail on any other machine. | `whisper.rs:44-45, 62-63` |
| R6 | **Whole files are read into memory** before truncation, and the proxy response body has no size limit. | `filesystem.rs:1018`, `system.rs` |
| R7 | **Unbounded `getAll()`** loads the entire indexed corpus into React state and passes it to every query. | `database.ts:750`, `useAssistantChat.ts:257` |

### Medium: UX, privacy and code health

| # | Finding |
|---|---|
| U1 | Knowledge, Graph, Notes and Collections pages exist but have **no navigation links**. "Import" buttons navigate to `/imports`, which does not exist and silently returns to chat. |
| U2 | About 1,240 lines of unreachable pages (Dashboard, Imports, Search, Settings). The Settings modal does not show the on-device AI or index controls. |
| U3 | Queries, answers and file contents are logged to the console (`[PIPELINE_TRACE]`) in production builds. |
| U4 | Android OAuth tokens are stored in plain text, or storage fails outright. |
| U5 | The same battery, disk and network answer formatting is copied in three places. There are two tool registries with inconsistent names (`readFile` vs `readFileContent`), plus `any` casts and an unused `Function()` eval for math. |
| U6 | Unused dependencies (`clsx`, `tailwind-merge`); dev-only Vite proxies; the dev server is exposed on `0.0.0.0`. |
| U7 | Many Rust tests depend on this specific machine (Teams installed, `D:\Foundry` existing, writes to the real Desktop). |

---

## 5. Experiment: can the on-device model be the "brain"?

Tested 30 Oct against the bundled Llama 3.2 3B, using output constrained to a JSON schema so the result always parses.

- **Output was 100% valid JSON**, so constrained decoding works.
- **Intent was wrong in 7 of 9 requests.** For example, "how many pdfs do i have", "give me my adhar" and "is my laptop charging" were all labelled `general_chat`.
- **Each plan took 10–16 s.**
- **Keyword and synonym expansion was useful** ("adhar" → "adhaar", "aadhaar"; "marksheet" → "transcript", "academic record").

**Decision:** do not let the small model decide *what to do*. Use a deterministic, tested understanding layer for routing. Use the model for what it does well:
1. writing general answers;
2. summarizing, comparing and explaining content that retrieval has already found;
3. expanding search terms when a search finds nothing.

A larger model would route better, but on this CPU an 8B model would run at roughly 3–4 tokens/s, which is too slow to be the default. That speed is an estimate, not measured.

---

## 6. Target architecture

The aim is evolution, not a rewrite. Working tools and UI stay.

```
User message (+ last N turns, + files referenced earlier)
        │
        ▼
1. Query Understanding (ONE module, deterministic, unit-tested)
   → QueryPlan { intent, entities, file kinds, time range, follow-up reference }
   intents: general | find | count | read/summarize | compare | relate | device | open | recent
        │
        ├─ general ───────────────────────────────▶ 4. Answer (model, labelled "General knowledge")
        ├─ device / open ─▶ native tool ──────────▶ formatted answer (no model needed)
        ▼
2. Retrieval (Rust, local, always up to date)
   • Index: SQLite + FTS5 over names, paths, metadata AND extracted text
   • Embeddings: small local embedding model served by llama.cpp; vectors stored in SQLite
   • Hybrid ranking: keyword (BM25) + vector, fused (RRF) + metadata filters (type, date, folder)
   • Rerank top results; query expansion by the model only when results are empty
        │
        ▼
3. Evidence set (real file chunks with path, page, score); never placeholder text
        │
        ▼
4. Answer generation (model, streamed, cancellable)
   • grounded prompt: "answer only from these excerpts; cite [1], [2]"
   • the UI labels "From your files" (with source cards) vs "General knowledge"
   • if the evidence is empty, say so instead of guessing

Background: Indexer service (Rust)
   • initial crawl of the user-approved folders, then the notify file watcher (create/modify/delete)
   • content hash + mtime for dedup and skip-unchanged; retry queue for failures
   • extraction: PDF (Rust crate), DOCX (zip+xml), text/markdown/code; OCR later
   • progress and errors surfaced in the UI; runs off the UI thread, throttled

Cross-cutting
   • a single tool gateway enforces permissions for every path
   • backend commands restricted: allow-listed folders, no arbitrary exec, proxy limited to the local AI port
   • CSP enabled; console tracing only in dev builds
```

How this covers the requests in your brief:

| Request | Handled by |
|---|---|
| "Find all my resume PDFs" | find + kind filter + name/content match |
| "Files I added today" | metadata filter `created ≥ today` from the index |
| "Documents related to React development" | hybrid content search, which is impossible today |
| "Summarize my project documentation" / "Compare two documents" | retrieval → excerpts → grounded model answer |
| "Relationship between files" | the knowledge graph built from the index: shared entities and terms, similarity edges, folder/project co-location |
| Follow-ups ("summarize the second one") | conversation context + remembered result list |
| General / technical questions | model, labelled as general knowledge |

---

## 7. Prioritized plan

Each phase ships working software, and each is verified by tests plus a scripted end-to-end run of real questions on this laptop before it is called done.

| Phase | Goal | Main work | Size |
|---|---|---|---|
| **0. Safety and honesty** | Stop fabrications and close the open doors | git repo + `.gitignore` for models/APKs; remove the C1/C2 placeholders; CSP; restrict `proxy_http_request`, `open_file`, `read_file_content` and launch; one permission gate for all paths; error-loop cap; stop whisper on exit; remove hard-coded paths; dev-only logging | S |
| **1. Index foundation** | A real, always-current local index | Rust SQLite+FTS5 index; crawler for the approved folders; `notify` watcher; hash/mtime dedup; PDF/DOCX/text extraction; progress UI; move heavy commands off the UI thread | L |
| **2. Understanding and retrieval** | One brain, real search | Single Query Understanding module (replaces 5 routers, with a test corpus of 150+ phrasings); conversation context and follow-ups; hybrid search with embeddings and reranking; model query-expansion fallback | L |
| **3. Grounded answers and UX** | Trustworthy, responsive answers | Streaming + cancel; "From your files" vs "General knowledge" labels with citations; summarize/compare/relate flows; navigation to Knowledge/Graph/Notes; on-device AI and index controls in Settings; real loading/empty/error states | M |
| **4. Knowledge graph** | Relationships that mean something | Entity/term extraction during indexing, similarity edges from embeddings, "explain relationship" grounded in shared evidence; graph view driven by real data | M |
| **5. Code health** | Maintainable codebase | Delete dead pages and engines and the duplicate registry; one answer-formatting module; types instead of `any`; hermetic Rust tests; dependency cleanup; accurate docs | M |
| **6. Android parity** | Same brain on the phone | Reuse the Query Understanding and index design over SAF; Keystore for tokens; clean ~40 MB APK; repeat the physical-device E2E | M |

The order matters. Phase 0 is required before handing the app to anyone. Phases 1 and 2 are what make Foundry "intelligent"; UX polish before them would decorate a weak core.

---

## 7a. Progress log

### Baseline: old Android app (1 Oct build) on the physical phone, 30 Oct
Suite: `tests/e2e/phone-suite.json`. Report: `artifacts/e2e/phone-baseline-oldapp.txt`.
- **Score:** 9 of 11 checks passed, with the checks as they stood at the time. The passes overstate the quality:
  - "How much storage is left?" returned a raw JSON dump reporting 0 B free, after 72 s.
  - "Find my aadhaar card" claimed it had "located files containing an Aadhaar card". No such file exists, so this was a fabricated result.
  - "give me my resme" was refused as a request for a "residency number".
  - File questions took about 25 s each; general questions took 4–25 s.

### Phase 0: safety and honesty (done 30 Oct–5 Nov)
| Item | Status |
|---|---|
| git repo, `.gitignore` for models/runtimes/APKs; pushed to github.com/jagadeesh-web27/Foundry (office Wi-Fi name scrubbed from history first) | Done |
| Fabricated `readFile` content removed; PDF/DOCX import refuses instead of indexing placeholder text | Done + unit-tested |
| Single permission gateway for every tool (computerTools + toolRegistry) | Done + unit-tested |
| `access_policy.rs`: file access limited to the accessible folders (canonicalized; hidden/system folders and key files refused); `open_file` never executes programs and uses no shell; browser links limited to http/https; proxy limited to loopback + listed APIs, with no redirects and a 32 MB cap; app launch only for resolver-registered targets | Done + 7 Rust tests |
| Content security policy | Done: verified in the release build (outside fetch, inline script and eval are blocked; IPC works) |
| Agent loop bounded (model rounds capped) | Done |
| Whisper: no hard-coded `D:\` paths, stopped on exit | Done |
| User-data console logs only in dev builds (`services/debug/trace.ts`) | Done |
| Heavy commands (disk walks, reads, PowerShell, netsh) off the UI thread | Done (`#[tauri::command(async)]`) |
| End-to-end harness `scripts/e2e-chat.mjs` + desktop and phone suites (see `docs/TESTING.md`) | Done |
| Typo-tolerant matching (`fuzzy.rs`) for files and apps, used only as a fallback after exact matches | Done: "whatapp", "chorme", "resme", "adhar" resolve; "passport" no longer matches "password" |
| Mobile UX (bottom navigation, 44 px touch targets, fixed-height shell, readable text, full-screen dialogs) | Done; phone suite 11/11 on the 30 Oct APK |
| Build fix: the web UI is re-embedded whenever it changes (`build.rs`) | Done; found by comparing the embedded asset names with `dist/` |

### Phase 1: file index (5 Nov)
`src-tauri/src/index.rs` + `extract.rs`. SQLite with FTS5 in `%LOCALAPPDATA%\Foundry\index.sqlite`, desktop only.

| Measured on the developer laptop (35,639 files on D:\ and the profile folders) | Before (disk walk) | Index |
|---|---|---|
| Name search ("resume", "adhar", "accessibility audit") | 2–10 s | **1–15 ms** |
| Typo / content fallback ("resme", "invoice") | 2–10 s | **15–26 ms** |
| Full index of all folders / re-check with no changes | – | **0.9 s / 0.4 s** |
| Text extraction (PDF, Word, Excel, PowerPoint, OpenDocument, text, code) | none | ~130 files/s in the background; about 3 minutes for all ~21,000 readable files |

What the index does:
- **Stays current.** A watcher applies creations, edits, renames and deletions; each launch re-checks with an incremental crawl, which re-reads only changed files.
- **Ranks by match type.** Names and folder names come first; text inside files is searched when asked ("documents **about** X", "files **mentioning** Y"). Otherwise contents are a clearly labelled fallback ("no file is named X, but these documents mention it"), limited to personal documents.
- **Understands dates.** Filters such as "added today", "edited this week" and "downloaded in the last 3 days".
- **Shows why a file matched.** Content matches carry a snippet, which the file card displays.

Decisions driven by real-data results, not by tests on made-up files:
- **Content is only a fallback for "find my X".** "find my passport" first returned source code that uses the *passport* login library. Content search is now opt-in by phrasing, and the fallback excludes code and files inside software projects (folders with `.git`, `package.json`, `Cargo.toml` and the like).
- **The fallback requires the exact phrase.** "offer letter" had matched documents where the two words were far apart.
- **Random codes in file names are not split into words.** `popup_notification-CvTOvKpR.mp3` matched "resume" through the token "Cv".
- **Short consonant patterns no longer count as a typo match.** "salary" had matched "silero" (both "slr").
- **Credential files are indexed by name only.** The text of `GSC_Login_Credentials.txt` was being copied into the index; names containing password, credential, secret or token are now never read.
- **Per-file text is capped** (documents 40k characters, code 8k), keeping the index to about 100–150 MB.

**Scope (differs from decision 2 below):** the index covers the same locations the app already searched, meaning the profile folders plus secondary data drives (D:\ etc.). Restricting it to four folders would have lost results the user relies on, such as the Aadhaar and résumé files on D:\. The system drive root is not indexed.

## 8. Decisions (recommendations accepted by the product owner on 30 Oct)

1. **Index storage:** a SQLite index in the Rust backend (recommended — fast, durable, handles large drives) instead of growing IndexedDB in the webview.
2. **Folders to index by default:** Documents, Downloads, Desktop and Pictures only, plus user-added folders (recommended), or whole drives. This sets privacy, indexing time and disk use.
3. **Embedding model:** a one-time ~100–300 MB extra download, needed for semantic "related to…" search.
4. **OCR for scanned images** (Aadhaar photos, scanned certificates): adds a sizeable component, so it is proposed after Phase 3.
5. **Git:** start version control now (strongly recommended before any refactor).

---

## 9. Corrections to the 8 Oct documents

| Claim (8 Oct docs) | Reality |
|---|---|
| Tokens "encrypted with AES-256-GCM" | DPAPI on Windows; plain text on Android/other platforms |
| `is_ignored_dir` / `canonicalize` prevent traversal | Neither exists; any path can be read |
| Connectors show "Simulated" badges | No such badge exists |
| Embeddings / hybrid / RAG pipeline in place | Not functional (§3) |
| Android download uses DownloadManager | Plain background thread |
| "169/169 tests pass" (149 frontend + 20 Rust) | Accurate then; now 169 frontend + 26 Rust pass. But the tests cover helpers and single tools, not end-to-end retrieval or answers |
