# Foundry Future Connectors Specification

This document outlines the architecture for extending Foundry to additional communication, productivity, and collaboration providers without modifying the core `CommitmentEngine`.

---

## 1. Extension Pattern

To add a new provider (e.g., Discord, Zoom Chat, Notion, Asana, Linear):

1. **Subclass `Connector`**:
   Implement `CommunicationConnector` in `connectors/<provider>/<Provider>Connector.ts`:
   - `id`: unique identifier (e.g. `discord_bot`, `zoom_chat`)
   - `name`: display name
   - `provider`: provider category
   - `capabilities`: declare only officially supported capabilities (e.g., `READ_MESSAGES`, `SEARCH_MESSAGES`)
   - `verifyConnection()`: test official identity endpoint (e.g. `/users/@me`)
   - `searchMessages(query)`: return normalized `CommunicationItem[]`
   - `getMessage(id)`: return normalized `CommunicationItem`
   - `sync(options)`: fetch latest messages, format to `CommunicationItem[]`, never swallow 401/403 errors
   - `executeAction(request)`: action confirmation layer

2. **Register in `ConnectorRegistry`**:
   Add the instance to `ConnectorRegistry.ts`.

3. **Normalized Ingestion**:
   All communication entries are passed to `createCommunicationItem(...)`.
   The `CommitmentEngine` automatically extracts tasks, deadlines, follow-ups, promises, and waiting-for obligations without needing provider-specific parsing code.

---

## 2. Planned Providers

### Discord
- **Official API**: Discord Gateway / REST API (`/users/@me`, `/channels/{id}/messages`)
- **Authentication**: Bot Token or User OAuth2 with `messages.read`
- **Capabilities**: `READ_MESSAGES`, `SEARCH_MESSAGES`, `SEND_MESSAGE`
- **Constraints**: Compliance with Discord Terms of Service (no self-bot token extraction).

### Zoom Chat
- **Official API**: Zoom Team Chat API v2 (`/chat/users/me/messages`)
- **Authentication**: Server-to-Server OAuth or User OAuth
- **Capabilities**: `READ_MESSAGES`, `SEARCH_MESSAGES`

### Notion
- **Official API**: Notion API (`/v1/search`, `/v1/databases/{id}/query`)
- **Authentication**: Internal Integration Token or Public OAuth
- **Capabilities**: `READ_FILES`, `CREATE_TASK`

### Asana / Trello / Linear
- **Official API**: REST API v1
- **Capabilities**: `READ_FILES`, `CREATE_TASK`
