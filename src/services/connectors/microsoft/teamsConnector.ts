/**
 * Foundry Teams Connector
 * Integrates Microsoft Teams chats and messages via authorized Microsoft Graph API endpoints.
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
import { microsoftAuth, MICROSOFT_GRAPH_BASE } from './microsoftAuth';
import { microsoftOAuthProvider } from './microsoftOAuthProvider';

export class TeamsConnector extends Connector {
  public readonly id = 'microsoft_teams';
  public readonly name = 'Microsoft Teams';
  public readonly provider: CommunicationProvider = 'microsoft';
  public readonly capabilities: ConnectorCapability[] = [
    'READ_MESSAGES',
    'SEARCH_MESSAGES',
    'SEND_MESSAGE',
    'REPLY_MESSAGE',
  ];

  public async connect(token?: string): Promise<boolean> {
    if (token) {
      await tokenStore.saveToken(this.id, {
        accessToken: token,
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });
    } else {
      const isValid = await tokenStore.isTokenValid(this.id);
      if (!isValid) {
        const authRes = await microsoftOAuthProvider.authorize();
        if (!authRes.success) {
          throw new Error(authRes.error || 'Microsoft browser authorization failed.');
        }
      }
    }

    const isValid = await tokenStore.isTokenValid(this.id);
    if (isValid) {
      const storedToken = await tokenStore.getToken(this.id);
      if (storedToken?.accessToken) {
        const v = await this.verifyConnection();
        if (v.verified) {
          await this.updateConfig({
            connected: true,
            accountEmail: v.accountEmail,
            accountName: v.accountName || 'Microsoft Teams Account',
          });
          return true;
        } else {
          throw new Error(v.error || 'Microsoft Teams verification failed.');
        }
      }
    }
    return false;
  }

  public async verifyConnection(): Promise<VerificationResult> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return {
        verified: false,
        provider: 'microsoft',
        error: 'No access token stored for Microsoft Teams.',
      };
    }
    return microsoftAuth.verifyToken(token.accessToken, '/me/chats?$top=1');
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.searchMessages(query);

    try {
      // Teams API doesn't support generic message search without app permissions,
      // so we fetch active chat message previews and match against query
      const limit = query.limit || 15;
      const chatsUrl = `${MICROSOFT_GRAPH_BASE}/me/chats?$top=${limit}&$expand=lastMessagePreview`;
      const chatsResp = await proxyFetch(chatsUrl, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!chatsResp.ok) return super.searchMessages(query);

      const data = await chatsResp.json();
      const items: CommunicationItem[] = [];
      const term = (query.query || '').toLowerCase();

      for (const chat of data.value || []) {
        const preview = chat.lastMessagePreview;
        if (preview && preview.body?.content) {
          const content = preview.body.content.replace(/<[^>]*>?/gm, '').trim();
          if (!term || content.toLowerCase().includes(term) || (chat.topic && chat.topic.toLowerCase().includes(term))) {
            items.push(
              createCommunicationItem({
                id: `teams_${preview.id || chat.id}`,
                source: 'teams',
                conversationId: chat.id,
                subject: chat.topic || 'Teams Chat',
                content,
                timestamp: preview.createdDateTime || new Date(),
                sender: preview.from?.user
                  ? {
                      name: preview.from.user.displayName || 'Teams User',
                      id: preview.from.user.id,
                    }
                  : undefined,
              })
            );
          }
        }
      }

      return items.length > 0 ? items : super.searchMessages(query);
    } catch {
      return super.searchMessages(query);
    }
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const cleanId = messageId.replace(/^teams_/, '');
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.getMessage(messageId);

    try {
      // Find in active chats
      const chats = await this.searchMessages({ limit: 50 });
      return chats.find((c) => c.id === messageId || c.id === `teams_${cleanId}`) || null;
    } catch {
      return super.getMessage(messageId);
    }
  }

  public async sync(options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error(
        'Not authenticated: Microsoft Teams access token is missing. Connect your Microsoft account in Integrations.'
      );
    }

    const hasRead = await this.hasCapability('READ_MESSAGES');
    if (!hasRead) {
      throw new Error('Permission missing: Read Messages capability is disabled for Teams in Foundry Settings.');
    }

    const isIncremental = typeof options === 'boolean' ? options : options?.incremental ?? true;
    const topChats = isIncremental ? 10 : 25;
    const items: CommunicationItem[] = [];

    // 1. Fetch user's active chats with previews
    const chatsUrl = `${MICROSOFT_GRAPH_BASE}/me/chats?$top=${topChats}&$expand=lastMessagePreview`;
    const chatsResp = await proxyFetch(chatsUrl, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!chatsResp.ok) {
      let errText = chatsResp.statusText;
      try {
        const errJson = await chatsResp.json();
        if (errJson?.error?.message) errText = errJson.error.message;
      } catch {}
      throw new Error(`Microsoft Teams API error (${chatsResp.status}): ${errText}`);
    }

    const chatsData = await chatsResp.json();
    for (const chat of chatsData.value || []) {
      const preview = chat.lastMessagePreview;
      if (preview && preview.body?.content) {
        items.push(
          createCommunicationItem({
            id: `teams_${preview.id || chat.id}`,
            source: 'teams',
            conversationId: chat.id,
            subject: chat.topic || 'Teams Chat',
            content: preview.body.content.replace(/<[^>]*>?/gm, '').trim(),
            timestamp: preview.createdDateTime || new Date(),
            sender: preview.from?.user
              ? {
                  name: preview.from.user.displayName || 'Teams User',
                  id: preview.from.user.id,
                }
              : undefined,
          })
        );
      }
    }

    return items;
  }

  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    if (!request.confirmed) {
      return {
        success: false,
        message: 'Action requires explicit user confirmation before dispatching.',
      };
    }

    const hasCap = (await this.hasCapability('SEND_MESSAGE')) || (await this.hasCapability('REPLY_MESSAGE'));
    if (!hasCap) {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Send Teams Message capability is disabled in Foundry Settings.',
      };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'Teams is not authenticated.' };
    }

    if (request.action === 'SEND_MESSAGE' || request.action === 'REPLY_MESSAGE') {
      try {
        const { chatId, content } = request.payload;
        if (!chatId || !content) {
          return { success: false, message: 'Missing chatId or content in payload.' };
        }

        const msgUrl = `${MICROSOFT_GRAPH_BASE}/chats/${chatId}/messages`;
        const resp = await proxyFetch(msgUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            body: { content },
          }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to send Teams message: ${resp.statusText}` };
        }

        return { success: true, message: 'Teams message sent successfully.' };
      } catch (err: any) {
        return { success: false, message: `Error sending Teams message: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const teamsConnector = new TeamsConnector();
