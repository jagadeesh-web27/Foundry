/**
 * Foundry Connector Capabilities
 * Declares granular capabilities for external integrations, separating READ from ACTION.
 */

export type ConnectorCapability =
  | 'READ_MESSAGES'
  | 'READ_EMAIL'
  | 'READ_CALENDAR'
  | 'READ_FILES'
  | 'READ_CONTACTS'
  | 'READ_ATTACHMENTS'
  | 'SEARCH_MESSAGES'
  | 'SEND_MESSAGE'
  | 'REPLY_MESSAGE'
  | 'SEND_EMAIL'
  | 'CREATE_DRAFT'
  | 'CREATE_EVENT'
  | 'CREATE_TASK';

export interface CapabilityMeta {
  capability: ConnectorCapability;
  displayName: string;
  description: string;
  type: 'READ' | 'ACTION';
  requiresConfirmation: boolean;
}

export const CAPABILITY_METADATA: Record<ConnectorCapability, CapabilityMeta> = {
  READ_MESSAGES: {
    capability: 'READ_MESSAGES',
    displayName: 'Read Messages',
    description: 'Read authorized chat messages and conversation history.',
    type: 'READ',
    requiresConfirmation: false,
  },
  READ_EMAIL: {
    capability: 'READ_EMAIL',
    displayName: 'Read Email',
    description: 'Read authorized email messages, threads, and metadata.',
    type: 'READ',
    requiresConfirmation: false,
  },
  READ_CALENDAR: {
    capability: 'READ_CALENDAR',
    displayName: 'Read Calendar',
    description: 'Read upcoming calendar meetings, participants, and event details.',
    type: 'READ',
    requiresConfirmation: false,
  },
  READ_FILES: {
    capability: 'READ_FILES',
    displayName: 'Read Cloud Documents',
    description: 'Discover and index authorized documents and files.',
    type: 'READ',
    requiresConfirmation: false,
  },
  READ_CONTACTS: {
    capability: 'READ_CONTACTS',
    displayName: 'Read Contacts',
    description: 'Read contacts and participant identities.',
    type: 'READ',
    requiresConfirmation: false,
  },
  READ_ATTACHMENTS: {
    capability: 'READ_ATTACHMENTS',
    displayName: 'Read Attachments',
    description: 'Inspect attachment names, types, and document metadata.',
    type: 'READ',
    requiresConfirmation: false,
  },
  SEARCH_MESSAGES: {
    capability: 'SEARCH_MESSAGES',
    displayName: 'Search Messages',
    description: 'Query message history across email and chat threads.',
    type: 'READ',
    requiresConfirmation: false,
  },
  SEND_MESSAGE: {
    capability: 'SEND_MESSAGE',
    displayName: 'Send Messages',
    description: 'Send direct messages or channel messages upon explicit user confirmation.',
    type: 'ACTION',
    requiresConfirmation: true,
  },
  REPLY_MESSAGE: {
    capability: 'REPLY_MESSAGE',
    displayName: 'Reply to Messages',
    description: 'Draft and send replies to existing conversation threads upon explicit user confirmation.',
    type: 'ACTION',
    requiresConfirmation: true,
  },
  SEND_EMAIL: {
    capability: 'SEND_EMAIL',
    displayName: 'Send Email',
    description: 'Draft and dispatch outbound emails upon explicit user confirmation.',
    type: 'ACTION',
    requiresConfirmation: true,
  },
  CREATE_DRAFT: {
    capability: 'CREATE_DRAFT',
    displayName: 'Create Draft',
    description: 'Save draft emails or messages without sending.',
    type: 'ACTION',
    requiresConfirmation: true,
  },
  CREATE_EVENT: {
    capability: 'CREATE_EVENT',
    displayName: 'Create Calendar Events',
    description: 'Schedule calendar events or meetings upon explicit user confirmation.',
    type: 'ACTION',
    requiresConfirmation: true,
  },
  CREATE_TASK: {
    capability: 'CREATE_TASK',
    displayName: 'Create Tasks',
    description: 'Create tasks in remote task managers upon confirmation.',
    type: 'ACTION',
    requiresConfirmation: true,
  },
};

