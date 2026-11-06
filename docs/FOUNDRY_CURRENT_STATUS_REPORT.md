# Foundry Current Status Report

**Assessment date:** 6 November 2026  
**Repository:** Foundry  
**Assessment basis:** Source-code inspection, repository documentation, fresh automated validation, and comparison with current local-assistant products.

## Executive verdict

Foundry is an advanced private alpha/developer preview, not a production-ready personal AI assistant.

The project has a real desktop/mobile shell, native OS integration, persistent SQLite/FTS5 file indexing, document extraction, local AI providers, voice transcription, permissions, commitments, and a growing automated test suite. Its strongest capability is fast local file discovery with native device integration.

Its largest gap is the missing end-to-end evidence workflow:

```text
query -> structured plan -> indexed retrieval -> verified evidence -> grounded answer -> citations
```

Until that workflow is reliable, Foundry should not be positioned as a finished replacement for Microsoft Recall, Raycast AI, GPT4All, or AnythingLLM.

## Verified engineering status

| Area | Current result |
|---|---|
| Frontend tests | 203 passed |
| Rust tests | 52 passed, 0 failed, 2 ignored |
| TypeScript/Vite production build | Passed |
| Rust type/build check | Passed |
| Lint | Passed with 3 warnings |
| Production bundle | Builds; main JavaScript chunk is approximately 676 KB |
| Current worktree | `src/pages/MemoryPage.tsx` has an existing uncommitted modification |

The repository's older status documents claim 149 frontend tests; the current test run reports 203. The older documentation should be updated.

## What works today

### Local file discovery

The Rust index in `src-tauri/src/index.rs` provides:

- SQLite persistence.
- FTS5 full-text search.
- File metadata indexing.
- Extracted text indexing.
- Incremental crawling.
- Changed-file detection.
- Deletion handling.
- Fuzzy matching.
- Date and file-type filters.
- Background indexing.
- Android shared-storage indexing.

This makes queries such as these realistic:

- “Find my resume.”
- “Show PDFs modified today.”
- “Find files mentioning React.”
- “Find large videos.”
- “Find my Aadhaar document.”
- “Open this file.”

### Document extraction

`src-tauri/src/extract.rs` supports plain text, code, HTML/XML, PDF, DOCX, XLSX, PPTX, and OpenDocument formats. It includes size limits, PDF timeout protection, ZIP/XML extraction, and avoids fabricated fallback content.

### Native computer capabilities

Foundry has native operations for file search, reading, opening, Explorer reveal, disk, battery, network, system information, running applications, installed application discovery, application launch, and Whisper transcription.

### Privacy and permissions

The project supports local AI providers and local databases. The access policy restricts sensitive paths, credential files, executable opening, proxy destinations, and application launch targets. Sensitive application actions require confirmation in the UI.

### Productivity features

The project includes commitments, waiting-for tracking, overdue items, due dates, evidence snippets, confidence scores, connectors, goals, tasks, notes, memory, analytics, and automations.

## What it cannot reliably do yet

### Reliable grounded answers

Foundry can often locate files, but it does not yet consistently answer questions from verified document evidence with visible citations. The RAG answer method exists, but the complete retrieval-to-answer workflow is not reliably the primary chat path.

This affects:

- Document summarization.
- Comparing two files.
- Extracting contract dates.
- Answering questions about project documentation.
- Explaining relationships between files.

### Complete semantic search

Cosine-similarity logic exists in `src/services/search/searchService.ts`, but embedding generation, persistence, hybrid retrieval, and reranking are not consistently complete across providers.

Keyword queries work better than conceptual queries. “Find files containing React” is substantially more reliable than “Find where I discussed improving component architecture.”

### Unified intent understanding

There are multiple routing/intent systems:

- `directRouter.ts`
- `dynamicAgent.ts`
- `agentRunner.ts`
- `intentParser.ts`
- `intentEngine.ts`

This creates inconsistent behavior. Foundry needs one canonical query planner for find, count, read, summarize, compare, open, device, date/time, follow-up, and general requests.

### Follow-up conversations

The assistant does not yet reliably maintain result references such as:

- “Summarize the second one.”
- “Open that file.”
- “Compare it with yesterday’s PDF.”
- “What did the document say about salary?”

### OCR and visual understanding

Scanned PDFs, screenshots, document photos, receipts, and text inside images are not comprehensively searchable without an OCR pipeline.

### Production connector maturity

Connector registration does not prove production sync. Each connector still needs validation for OAuth, refresh tokens, incremental sync, rate limits, revocation, deduplication, errors, mobile behavior, and outgoing-action confirmation.

### Release readiness

The repository still needs signed release artifacts, upgrade/migration testing, crash diagnostics, reproducible release builds, privacy documentation, and broader physical-device validation.

## Real-world standing

### Microsoft Recall

Recall is focused on continuous visual/application history and timeline-style retrieval. Foundry is stronger in explicit local file ownership, open local-model architecture, and cross-platform ambition. It is weaker in activity history, visual context, OS integration, and production maturity.

### GPT4All

GPT4All has a mature local document-chat and embeddings workflow. Foundry is stronger in native OS actions, device information, voice, Android ambitions, and productivity concepts. It is weaker in document-chat maturity, embeddings reliability, and grounded citations.

### AnythingLLM

AnythingLLM is stronger in workspace-based document ingestion, RAG workflows, provider flexibility, and knowledge-base operations. Foundry is stronger in personal-computer integration, native actions, device state, and mobile direction.

### Raycast AI

Raycast is stronger in automation, extensions, screen awareness, projects, scheduling, integrations, and product polish. Foundry is more local-first and more focused on personal filesystem/device control.

## Maturity by dimension

| Dimension | Assessment |
|---|---|
| UI/product shell | Beta-quality prototype |
| Native filesystem integration | Strong alpha / early beta |
| Local file indexing | Promising beta foundation |
| Semantic retrieval | Incomplete alpha |
| AI reasoning | Prototype |
| Document understanding | Partial beta |
| Voice | Functional, environment-dependent |
| Security model | Improving; requires continued audit |
| Connector ecosystem | Framework/prototype stage |
| Android | Working development build; not release-ready |
| Production operations | Not ready |
| Market readiness | Private alpha |

## Priority roadmap

### P0: Trust and safety

1. Remove every remaining fabricated or success-shaped fallback.
2. Enforce one backend access policy for every file/path operation.
3. Validate every Windows and Android token-storage path.
4. Keep production tracing free of user data.
5. Add failure-path security tests.

### P1: One assistant brain

Replace the competing routers with one structured query planner and a corpus of at least 150 natural-language routing cases.

### P2: Grounded answers

Wire retrieval, evidence selection, local model generation, citations, source cards, and explicit insufficient-evidence responses into the main chat flow.

### P3: Conversation context

Persist recent turns, referenced files, result ordering, pronoun references, and follow-up actions.

### P4: OCR and richer extraction

Add OCR for scanned PDFs, images, screenshots, receipts, and document photos.

### P5: Android hardening

Test permission denial, low-memory devices, Android versions, background/foreground transitions, interrupted downloads, battery usage, and large storage collections.

### P6: Release engineering

Add signed Windows and Android release artifacts, migrations, crash diagnostics, privacy documentation, upgrade tests, and an automated release pipeline.

## Final recommendation

Position Foundry today as:

> **A privacy-first local computer and phone assistant in private alpha, with strong file indexing and native device integration, but incomplete grounded reasoning and production hardening.**

Do not market it yet as a complete general-purpose AI assistant. The next major milestone should be trustworthy cited answers from the user's indexed files, not additional dashboard features.
