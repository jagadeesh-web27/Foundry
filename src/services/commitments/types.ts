/**
 * Foundry Commitment Intelligence Engine - Core Types
 */

export type CommitmentType =
  | 'TASK'
  | 'DEADLINE'
  | 'PROMISE'
  | 'FOLLOW_UP'
  | 'WAITING_FOR'
  | 'REQUEST'
  | 'MEETING'
  | 'REMINDER';

export type CommitmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'DISMISSED'
  | 'WAITING'
  | 'CANCELLED';

export interface Person {
  id?: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  role?: string;
}

export interface CommitmentSourceRef {
  provider: string; // 'OUTLOOK' | 'TEAMS' | 'GMAIL' | 'SLACK' | 'WHATSAPP' | 'LOCAL'
  messageId?: string;
  conversationId?: string;
  subject?: string;
  senderName?: string;
  timestamp?: string; // ISO string
}

export interface Commitment {
  id: string;
  type: CommitmentType;
  title: string;
  description?: string;
  status: CommitmentStatus;
  dueAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  source: CommitmentSourceRef;
  sources?: CommitmentSourceRef[];
  person?: Person;
  confidence: number; // 0.0 to 1.0
  evidence?: string; // Verbatim snippet from communication
  reminderState?: {
    scheduledAt?: Date;
    notified?: boolean;
  };
  isTentative?: boolean; // When confidence < 0.75, requires user confirmation
}

export interface CommitmentOverview {
  needToDo: Commitment[];
  waitingFor: Commitment[];
  peopleWaitingForMe: Commitment[];
  upcoming: Commitment[];
  overdue: Commitment[];
  tentativeCount: number;
}
