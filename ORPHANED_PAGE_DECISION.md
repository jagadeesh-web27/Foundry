# Orphaned Page & UI Component Architectural Decision (Agent 5)

> **Document**: `ORPHANED_PAGE_DECISION.md`  
> **Author**: Agent 5 (Orphan Page / Product Architecture)  
> **Status**: APPROVED & CODIFIED  

---

## 1. Executive Context

During Foundry's evolution from a multi-page "Local Knowledge Base" web dashboard to a consolidated, conversational **Local AI Computer Assistant ("Chat with my computer")**, the main interface was concentrated into `MainAssistantPage.tsx`.

Consequently, 9 full-page components and 2 layout components were left orphaned in `src/pages/` and `src/components/layout/`, disconnected from `App.tsx` routing.

---

## 2. Page-by-Page Audit & Decision Matrix

| Page Component | Original Purpose | Duplication / Overlap | Decision | Rationale & Recommended Integration |
| :--- | :--- | :--- | :---: | :--- |
| **`ChatPage.tsx`** | Early prototype chat UI | 100% superseded by `MainAssistantPage` | **DELETE** | Pure duplicate prototype; removing it saves ~11 kB and prevents confusion with `MainAssistantPage`. |
| **`DashboardPage.tsx`** | Stats cards & recent documents feed | Overlaps with `TodayPage` & `StatusBar` | **DEPRECATE** | `TodayPage` provides superior daily context (timeline, tasks, commitments). Relevant stats are already surfaced in `StatusBar`. |
| **`SearchPage.tsx`** | Manual keyword/filter search form | Overlaps with conversational search | **DEPRECATE** | Search is directly executed via natural language in Chat and live Tauri explorer. |
| **`SettingsPage.tsx`** | Standalone settings view | 95% identical to `SettingsModal.tsx` | **MERGE** | Consolidate logic into `SettingsModal.tsx`. Keep `SettingsModal` as the single source of truth for settings. |
| **`KnowledgePage.tsx`** | Document browser, chunk viewer | Unique document inspection tool | **KEEP + INTEGRATE** | Valuable for inspecting chunked PDFs and text extractions. Wire into `MainAssistantPage` tab bar or modal drawer. |
| **`NotesPage.tsx`** | Local markdown scratchpad | Unique local notes functionality | **KEEP + INTEGRATE** | Allows users to write quick notes that the agent can read and search. Add as an accessible tab/drawer. |
| **`GraphPage.tsx`** | Interactive visual knowledge graph | Unique visual relationship mapping | **KEEP + INTEGRATE** | High-value visual capability showing semantic connections between files, entities, and commitments. |
| **`CollectionsPage.tsx`** | Themed folder/file groupings | Unique grouping capability | **KEEP + INTEGRATE** | Allows users to bundle related files across different disk locations into projects. |
| **`ImportsPage.tsx`** | Manual file drop & folder ingest | Overlaps with FirstLaunchScreen | **MERGE** | Fold manual file dropzone into `KnowledgePage` or `SettingsModal`. |
| **`Sidebar.tsx` (layout)**| Old desktop sidebar | Superseded by `ChatSidebar.tsx` | **DELETE** | Dead legacy component. |
| **`Header.tsx` (layout)** | Old desktop top header | Superseded by in-page headers | **DELETE** | Dead legacy component. |

---

## 3. Implementation Plan

1. **Retain High-Value Functional Pages**:
   - `KnowledgePage.tsx`, `GraphPage.tsx`, `NotesPage.tsx`, `CollectionsPage.tsx`.
2. **Wire Routes in `App.tsx`**:
   - Add explicit sub-routes or integrate as lazy tabs in the primary assistant shell so users and power users can navigate to them without breaking the single-page chat experience:
     - `/` -> `MainAssistantPage` (Default)
     - `/knowledge` -> `KnowledgePage`
     - `/graph` -> `GraphPage`
     - `/notes` -> `NotesPage`
     - `/collections` -> `CollectionsPage`
3. **Safe Cleanup**:
   - Delete obsolete `ChatPage.tsx` and legacy unused `src/components/layout/Sidebar.tsx` and `Header.tsx`.
