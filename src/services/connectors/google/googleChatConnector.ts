/**
 * Foundry Google Chat Connector
 * Integrates Google Chat spaces and messages via official Google Workspace Chat API.
 * Detects whether the user's account supports user-delegated Chat access and truthfully
 * reports limitations when personal/unsupported accounts are used.
 * Conforms to the Universal Communication Connector Architecture.
 */

import {
  Connector,
  ActionRequest,
  ActionResult,
  VerificationResult,
  MessageSearchQuery,
  SyncOptions,
  CommunicationProvider,
} from '../core/connector';
import { ConnectorCapability } from '../core/connectorCapabilities';
import { CommunicationItem, createCommunicationItem } from '@/services/commitments/communicationItem';
import { tokenStore } from '../core/tokenStore';
import { proxyFetch } from '@/services/ai/proxyFetch';
import { googleAuth } from './googleAuth';

const CHAT_BASE = 'https://chat.googleapis.com/v1';

export class GoogleChatConnector extends Connector {
  public readonly id = 'google_chat';
  public readonly name = 'Google Chat';
  public readonly provider: CommunicationProvider = 'google';
  public readonly capabilities: ConnectorCapability[] = ['READ_MESSAGES', 'SEARCH_MESSAGES'];

  public async connect(token?: string): Promise<boolean> {
    if (token) {
      await tokenStore.saveToken(this.id, {
        accessToken: token,
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });
    }

    const isValid = await tokenStore.isTokenValid(this.id);
    if (isValid) {
      const storedToken = await tokenStore.getToken(this.id);
      if (storedToken?.accessToken) {
        const v = await this.verifyConnection();
        await this.updateConfig({
          connected: true,
          accountEmail: v.accountEmail,
          accountName: v.accountName || 'Google Chat',
          syncErrorMessage: v.verified ? undefined : v.error,
        });
        return v.verified;
      }
    }
    return false;
  }

  public async verifyConnection(): Promise<VerificationResult> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return {
        verified: false,
        provider: 'google',
        error: 'No access token stored for Google Chat.',
      };
    }

    // First verify basic Google identity
    const baseAuth = await googleAuth.verifyToken(token.accessToken);
    if (!baseAuth.verified) return baseAuth;

    // Test Google Chat Spaces API
    try {
      const resp = await proxyFetch(`${CHAT_BASE}/spaces?pageSize=1`, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        // Standard consumer accounts or accounts without Google Workspace Chat API permission
        const errMsg =
          '⚠ Message analysis unavailable: Your Google account/API permissions do not provide the required message access.';
        return {
          verified: false,
          provider: 'google',
          accountEmail: baseAuth.accountEmail,
          accountName: baseAuth.accountName,
          error: errMsg,
          testedEndpoints: [
            { endpoint: `${CHAT_BASE}/spaces`, success: false, error: `${resp.status} ${resp.statusText}` },
          ],
        };
      }

      return {
        verified: true,
        provider: 'google',
        accountEmail: baseAuth.accountEmail,
        accountName: baseAuth.accountName,
        testedEndpoints: [{ endpoint: `${CHAT_BASE}/spaces`, success: true }],
      };
    } catch (err: any) {
      return {
        verified: false,
        provider: 'google',
        accountEmail: baseAuth.accountEmail,
        accountName: baseAuth.accountName,
        error: `⚠ Message analysis unavailable: ${err?.message || String(err)}`,
      };
    }
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const v = await this.verifyConnection();
    if (!v.verified) {
      return super.searchMessages(query);
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.searchMessages(query);

    try {
      // List spaces
      const spacesResp = await proxyFetch(`${CHAT_BASE}/spaces?pageSize=5`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (!spacesResp.ok) return super.searchMessages(query);

      const spacesData = await spacesResp.json();
      const items: CommunicationItem[] = [];
      const term = (query.query || '').toLowerCase();

      for (const space of spacesData.spaces || []) {
        const msgsResp = await proxyFetch(`${CHAT_BASE}/${space.name}/messages?pageSize=10`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        if (msgsResp.ok) {
          const msgsData = await msgsResp.json();
          for (const msg of msgsData.messages || []) {
            const text = msg.text || '';
            if (!term || text.toLowerCase().includes(term)) {
              items.push(
                createCommunicationItem({
                  id: `gchat_${msg.name}`,
                  source: 'google_chat',
                  conversationId: space.name,
                  subject: space.displayName || 'Google Chat',
                  content: text,
                  timestamp: msg.createTime ? new Date(msg.createTime) : new Date(),
                  sender: msg.sender?.displayName
                    ? { name: msg.sender.displayName, email: msg.sender.name }
                    : undefined,
                })
              );
            }
          }
        }
      }

      return items;
    } catch {
      return super.searchMessages(query);
    }
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const all = await this.searchMessages({ limit: 50 });
    return all.find((m) => m.id === messageId || m.id === `gchat_${messageId}`) || null;
  }

  public async sync(_options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error('Not authenticated: Google Chat access token is missing. Connect your Google account in Integrations.');
    }

    const v = await this.verifyConnection();
    if (!v.verified) {
      throw new Error(
        v.error || '⚠ Message analysis unavailable: Your Google account/API permissions do not provide the required message access.'
      );
    }

    return this.searchMessages({ limit: 30 });
  }

  public async executeAction(_request: ActionRequest): Promise<ActionResult> {
    return {
      success: false,
      message: 'Google Chat connector currently operates in read-only analysis mode.',
    };
  }
}

export const googleChatConnector = new GoogleChatConnector();
