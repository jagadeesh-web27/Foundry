# Foundry Communication & Productivity Connectors Audit (Agent 11)

> **Document**: `CONNECTORS.md`  
> **Author**: Agent 11 (Integrations & Connectors Architecture)  
> **Status**: FORMALIZED & VERIFIED  

---

## 1. Connector Classification & State Summary

Foundry strictly avoids presenting simulated or fake data as production data. All connectors inherit from the base `Connector` class ([src/services/connectors/core/connector.ts](file:///d:/Foundry/src/services/connectors/core/connector.ts)) and declare their explicit status:

```text
IMPLEMENTED:  Real official OAuth, real REST API requests, persistent tokens
PARTIAL:      Real API schema, webhook/token ingestion active, awaiting daemon sync
SIMULATED:    Explicitly labelled development fixtures; never disguised as live data
PLANNED:      Documented specifications for future integrations
```

---

## 2. Service-by-Service Breakdown

| Provider | Connector ID | Status | Auth / Authorization | Token Storage | Offline Behavior | Background Sync Requirements |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **Google Gmail** | `google_gmail` | **IMPLEMENTED** | OAuth 2.0 PKCE with `gmail.readonly` | Encrypted via AES-256 in `tokenStore` | Cached messages in IndexedDB | Incremental sync using `historyId` |
| **Google Drive** | `google_drive` | **IMPLEMENTED** | OAuth 2.0 PKCE with `drive.metadata.readonly` | Encrypted via AES-256 in `tokenStore` | Offline file metadata cache | Periodic change tokens polling |
| **Google Calendar**| `google_calendar` | **IMPLEMENTED** | OAuth 2.0 PKCE with `calendar.events.readonly` | Encrypted via AES-256 in `tokenStore` | Cached upcoming events | 15-minute polling window |
| **Google Chat** | `google_chat` | **IMPLEMENTED** | OAuth 2.0 PKCE with `chat.messages.readonly` | Encrypted via AES-256 in `tokenStore` | Cached space messages | Space event listeners |
| **Microsoft Outlook** | `microsoft_outlook` | **IMPLEMENTED** | MSAL / MS Graph OAuth with `Mail.Read` | Encrypted via AES-256 in `tokenStore` | Cached email items | Delta query tokens |
| **Microsoft OneDrive**| `microsoft_onedrive`| **IMPLEMENTED** | MSAL / MS Graph OAuth with `Files.Read` | Encrypted via AES-256 in `tokenStore` | Cached folder tree | Delta links polling |
| **Slack** | `slack_workspace` | **PARTIAL** | Bot User OAuth / User Token (`channels:read`) | Encrypted via AES-256 in `tokenStore` | Cached channel history | Requires persistent WebSocket / Events API |
| **Telegram** | `telegram_bot` | **PARTIAL** | Bot Father API Token | Encrypted via AES-256 in `tokenStore` | Cached chat messages | Long-polling HTTP daemon |
| **WhatsApp** | `whatsapp_personal`| **SIMULATED** | Local mock fixture / QR scaffolding | None (sandbox mode) | Offline fixtures only | Requires local SQLite DB parsing or WhatsApp Cloud API |
| **Notion** | `notion_workspace` | **PLANNED** | Integration Token (Internal OAuth) | — | — | Documented in `futureConnectors.md` |
| **Linear** | `linear_tracker` | **PLANNED** | Personal API Key / OAuth | — | — | Documented in `futureConnectors.md` |
| **Discord** | `discord_client` | **PLANNED** | Discord Bot Gateway API | — | — | Documented in `futureConnectors.md` |

---

## 3. Truthful Transparency Guarantee

- The UI ([IntegrationsPage.tsx](file:///d:/Foundry/src/pages/IntegrationsPage.tsx)) displays explicit badges:
  - `Connected` (green) with active verified tokens
  - `Disconnected` (neutral)
  - `Simulated / Sandbox` (amber) for WhatsApp and test endpoints
- The agent never claims an email was fetched from a live inbox if the connector is disconnected or simulated.
