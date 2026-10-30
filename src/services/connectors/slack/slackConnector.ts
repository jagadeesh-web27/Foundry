/**
 * Foundry Slack Connector
 * Integrates Slack channels and direct messages via authorized Slack Web API.
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
import { slackOAuthProvider } from './slackOAuthProvider';

const SLACK_BASE = 'https://slack.com/api';

export class SlackConnector extends Connector {
  public readonly id = 'slack_workspace';
  public readonly name = 'Slack';
  public readonly provider: CommunicationProvider = 'slack';
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
        tokenType: 'Bearer',
      });
    } else {
      const isValid = await tokenStore.isTokenValid(this.id);
      if (!isValid) {
        const authRes = await slackOAuthProvider.authorize();
        if (!authRes.success) {
          throw new Error(authRes.error || 'Slack browser authorization failed.');
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
            accountName: v.accountName || 'Slack Workspace',
          });
          return true;
        } else {
          throw new Error(v.error || 'Slack verification failed.');
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
        provider: 'slack',
        error: 'No access token stored for Slack.',
      };
    }

    try {
      const resp = await proxyFetch(`${SLACK_BASE}/auth.test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        return {
          verified: false,
          provider: 'slack',
          error: `Slack HTTP error (${resp.status}): ${resp.statusText}`,
          testedEndpoints: [{ endpoint: `${SLACK_BASE}/auth.test`, success: false, error: resp.statusText }],
        };
      }

      const data = await resp.json();
      if (!data.ok) {
        return {
          verified: false,
          provider: 'slack',
          error: `Slack authentication error: ${data.error || 'Unknown error'}`,
          testedEndpoints: [{ endpoint: `${SLACK_BASE}/auth.test`, success: false, error: data.error }],
        };
      }

      return {
        verified: true,
        provider: 'slack',
        accountName: `${data.user} @ ${data.team}`,
        testedEndpoints: [{ endpoint: `${SLACK_BASE}/auth.test`, success: true }],
      };
    } catch (err: any) {
      return {
        verified: false,
        provider: 'slack',
        error: `Slack connection exception: ${err?.message || String(err)}`,
      };
    }
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.searchMessages(query);

    try {
      // 1. Try search.messages if search scope is available
      if (query.query) {
        const searchUrl = `${SLACK_BASE}/search.messages?query=${encodeURIComponent(query.query)}&count=${query.limit || 15}`;
        const sResp = await proxyFetch(searchUrl, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });

        if (sResp.ok) {
          const sData = await sResp.json();
          if (sData.ok && sData.messages?.matches) {
            return sData.messages.matches.map((m: any) =>
              createCommunicationItem({
                id: `slack_${m.channel?.id || 'ch'}_${m.ts}`,
                source: 'slack',
                conversationId: m.channel?.id,
                subject: `#${m.channel?.name || 'slack'}`,
                content: m.text || '',
                timestamp: new Date(parseFloat(m.ts) * 1000),
                sender: m.username ? { name: m.username, id: m.user } : undefined,
              })
            );
          }
        }
      }

      // 2. Fallback to scanning channels
      const items = await this.sync({ incremental: true });
      const term = (query.query || '').toLowerCase();
      return term ? items.filter((i) => i.content.toLowerCase().includes(term) || (i.subject && i.subject.toLowerCase().includes(term))) : items;
    } catch {
      return super.searchMessages(query);
    }
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const all = await this.searchMessages({ limit: 50 });
    return all.find((m) => m.id === messageId) || null;
  }

  public async sync(_options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error('Not authenticated: Slack access token is missing. Connect your Slack workspace in Integrations.');
    }

    const hasRead = await this.hasCapability('READ_MESSAGES');
    if (!hasRead) {
      throw new Error('Permission missing: Read Messages capability is disabled for Slack in Foundry Settings.');
    }

    const items: CommunicationItem[] = [];

    // Fetch public and private channels
    const listUrl = `${SLACK_BASE}/conversations.list?types=public_channel,private_channel&limit=10`;
    const resp = await proxyFetch(listUrl, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!resp.ok) {
      throw new Error(`Slack API error (${resp.status}): ${resp.statusText}`);
    }

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Slack API rejected request: ${data.error || 'Unknown error'}`);
    }

    for (const channel of (data.channels || []).slice(0, 5)) {
      const histUrl = `${SLACK_BASE}/conversations.history?channel=${channel.id}&limit=10`;
      const hResp = await proxyFetch(histUrl, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });

      if (hResp.ok) {
        const hData = await hResp.json();
        if (hData.ok) {
          for (const msg of hData.messages || []) {
            if (msg.text) {
              items.push(
                createCommunicationItem({
                  id: `slack_${channel.id}_${msg.ts}`,
                  source: 'slack',
                  conversationId: channel.id,
                  subject: `#${channel.name || 'channel'}`,
                  content: msg.text || '',
                  timestamp: new Date(parseFloat(msg.ts) * 1000),
                  sender: msg.user ? { name: msg.user, id: msg.user } : undefined,
                })
              );
            }
          }
        }
      }
    }

    return items;
  }

  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    if (!request.confirmed) {
      return { success: false, message: 'Sending a Slack message requires explicit user confirmation.' };
    }

    const hasCap = (await this.hasCapability('SEND_MESSAGE')) || (await this.hasCapability('REPLY_MESSAGE'));
    if (!hasCap) {
      return { success: false, error: 'PERMISSION_DENIED', message: 'Send Slack message capability is disabled.' };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'Slack is not authenticated.' };
    }

    if (request.action === 'SEND_MESSAGE' || request.action === 'REPLY_MESSAGE') {
      try {
        const { channel, text } = request.payload;
        const postUrl = `${SLACK_BASE}/chat.postMessage`;
        const resp = await proxyFetch(postUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel, text }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to post Slack message: ${resp.statusText}` };
        }

        return { success: true, message: 'Slack message posted successfully.' };
      } catch (err: any) {
        return { success: false, message: `Error posting Slack message: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const slackConnector = new SlackConnector();
