/**
 * Foundry Connector Base - Unified Abstract Interface for all Cloud & Messaging Providers
 * Conforms to the Universal Communication Connector Architecture.
 */

import { ConnectorCapability } from './connectorCapabilities';
import { CommunicationItem } from '@/services/commitments/communicationItem';
import { db, StoredConnectorConfig } from '@/services/db/database';
import { tokenStore } from './tokenStore';
import type { ConnectorStatus } from './connectorStatus';

export type CommunicationProvider =
  | 'microsoft'
  | 'google'
  | 'slack'
  | 'telegram'
  | 'whatsapp'
  | string;

export interface MessageSearchQuery {
  query?: string;
  since?: string | Date;
  until?: string | Date;
  sender?: string;
  recipient?: string;
  limit?: number;
  unreadOnly?: boolean;
}

export interface SyncOptions {
  incremental?: boolean;
  maxRecords?: number;
  since?: string | Date;
}

export interface SyncResult {
  success: boolean;
  recordsRetrieved: number;
  recordsAnalyzed: number;
  commitmentsFound: number;
  error?: string;
  lastSyncAt?: string;
}

export interface VerificationResult {
  verified: boolean;
  provider: string;
  accountEmail?: string;
  accountName?: string;
  scopes?: string[];
  error?: string;
  testedEndpoints?: {
    endpoint: string;
    success: boolean;
    error?: string;
  }[];
}

export interface ActionRequest<TPayload = any> {
  action: string;
  payload: TPayload;
  confirmed?: boolean;
}

export interface ActionResult<TData = any> {
  success: boolean;
  data?: TData;
  error?: string;
  message?: string;
}

export interface CommunicationConnector {
  id: string;
  name: string;
  provider: CommunicationProvider;
  capabilities: ConnectorCapability[];

  connect(authCodeOrToken?: string): Promise<boolean | void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<ConnectorStatus>;
  verifyConnection(): Promise<VerificationResult>;
  searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]>;
  getMessage(messageId: string): Promise<CommunicationItem | null>;
  sync(options?: SyncOptions | boolean): Promise<CommunicationItem[]>;
  executeAction(request: ActionRequest): Promise<ActionResult>;
}

export abstract class Connector implements CommunicationConnector {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly provider: CommunicationProvider;
  public abstract readonly capabilities: ConnectorCapability[];

  /**
   * Retrieves persistent configuration and capability states for this connector.
   */
  public async getConfig(): Promise<StoredConnectorConfig> {
    const existing = await db.getConnectorConfig(this.id);
    if (existing) return existing;

    const defaultConfig: StoredConnectorConfig = {
      id: this.id,
      name: this.name,
      provider: this.provider,
      connected: false,
      grantedCapabilities: this.capabilities.filter(
        (c) => !c.startsWith('SEND_') && !c.startsWith('REPLY_') && !c.startsWith('CREATE_')
      ),
      actionPermissions: {
        SEND_MESSAGE: false,
        REPLY_MESSAGE: false,
        SEND_EMAIL: false,
        CREATE_EVENT: false,
        CREATE_TASK: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.saveConnectorConfig(defaultConfig);
    return defaultConfig;
  }

  /**
   * Updates capability or action permission settings.
   */
  public async updateConfig(updates: Partial<StoredConnectorConfig>): Promise<StoredConnectorConfig> {
    const current = await this.getConfig();
    const updated: StoredConnectorConfig = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await db.saveConnectorConfig(updated);
    return updated;
  }

  /**
   * Check if the connector is connected with valid credentials.
   */
  public async isConnected(): Promise<boolean> {
    const config = await this.getConfig();
    if (!config.connected) return false;
    return tokenStore.isTokenValid(this.id);
  }

  /**
   * Check if a specific capability is enabled for this connector.
   */
  public async hasCapability(capability: ConnectorCapability): Promise<boolean> {
    if (!this.capabilities.includes(capability)) return false;
    const config = await this.getConfig();
    if (
      capability.startsWith('SEND_') ||
      capability.startsWith('REPLY_') ||
      capability.startsWith('CREATE_')
    ) {
      return !!config.actionPermissions[capability];
    }
    return config.grantedCapabilities.includes(capability);
  }

  /**
   * Initiate connection flow or exchange code.
   */
  public abstract connect(authCodeOrToken?: string): Promise<boolean | void>;

  /**
   * Disconnect and wipe credentials.
   */
  public async disconnect(): Promise<void> {
    await tokenStore.deleteToken(this.id);
    await this.updateConfig({
      connected: false,
      accountEmail: undefined,
      accountName: undefined,
      lastSyncAt: undefined,
      syncStatus: undefined,
      syncErrorMessage: undefined,
    });
  }

  /**
   * Retrieves the comprehensive status of this connector.
   */
  public async getStatus(): Promise<ConnectorStatus> {
    const { connectorStatusManager } = await import('./connectorStatus');
    const s = await connectorStatusManager.getStatus(this.id);
    if (s) return s;

    return {
      provider: this.provider,
      connectorId: this.id,
      displayName: this.name,
      connected: false,
      authenticated: false,
      permissionGranted: false,
      syncState: 'never',
      dataState: 'not_connected',
      capabilities: this.capabilities,
      recordsRetrieved: 0,
      recordsAnalyzed: 0,
      commitmentsDetected: 0,
    };
  }

  /**
   * Verifies credentials against live provider API endpoints.
   */
  public abstract verifyConnection(): Promise<VerificationResult>;

  /**
   * Searches provider messages matching query parameters.
   */
  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    // Default implementation: search persisted communication items for this provider
    const term = query.query || '';
    const items = await db.searchCommunicationItems(term, query.limit || 50);
    return items.filter(
      (i) => i.source.toLowerCase() === this.provider.toLowerCase() ||
             i.source.toLowerCase().includes(this.id.replace(/^(microsoft_|google_)/, ''))
    ).map((stored) => ({
      id: stored.id,
      source: stored.source as any,
      conversationId: stored.conversationId,
      sender: stored.sender,
      recipients: stored.recipients,
      subject: stored.subject,
      content: stored.content,
      timestamp: new Date(stored.timestamp),
      attachments: stored.attachments?.map((a) => ({
        id: a.id,
        name: a.name,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
      })),
      metadata: stored.metadata,
    }));
  }

  /**
   * Retrieves a single communication item by ID.
   */
  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const all = await this.searchMessages({ limit: 100 });
    return all.find((m) => m.id === messageId || m.id === `msg_${messageId}`) || null;
  }

  /**
   * Performs an incremental or full sync, returning normalized CommunicationItem entries.
   */
  public abstract sync(options?: SyncOptions | boolean): Promise<CommunicationItem[]>;

  /**
   * Dispatches a consequential ACTION (e.g. sending an email or message) with confirmation enforcement.
   */
  public abstract executeAction(request: ActionRequest): Promise<ActionResult>;
}

