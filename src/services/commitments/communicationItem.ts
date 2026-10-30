/**
 * Normalized Communication Item Model
 * Provides a provider-agnostic representation for emails, chat messages, meetings, and notes.
 */

import { Person } from './types';

export type CommunicationSource =
  | 'outlook'
  | 'teams'
  | 'gmail'
  | 'google_chat'
  | 'slack'
  | 'telegram'
  | 'whatsapp'
  | 'OUTLOOK'
  | 'TEAMS'
  | 'GMAIL'
  | 'SLACK'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'LOCAL'
  | string;

export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl?: string;
}

export interface CommunicationItem {
  id: string;
  source: CommunicationSource;
  conversationId?: string;
  sender?: Person;
  recipients?: Person[];
  subject?: string;
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

/**
 * Normalizes an external message payload into a standard CommunicationItem.
 */
export function createCommunicationItem(params: {
  id: string;
  source: CommunicationSource;
  conversationId?: string;
  sender?: Person;
  recipients?: Person[];
  subject?: string;
  content: string;
  timestamp?: Date | string | number;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}): CommunicationItem {
  let ts: Date;
  if (!params.timestamp) {
    ts = new Date();
  } else if (params.timestamp instanceof Date) {
    ts = params.timestamp;
  } else {
    ts = new Date(params.timestamp);
  }

  return {
    id: params.id,
    source: params.source,
    conversationId: params.conversationId,
    sender: params.sender,
    recipients: params.recipients || [],
    subject: params.subject,
    content: params.content.trim(),
    timestamp: isNaN(ts.getTime()) ? new Date() : ts,
    attachments: params.attachments || [],
    metadata: params.metadata || {},
  };
}
