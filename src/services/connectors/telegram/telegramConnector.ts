/**
 * Foundry Telegram Connector
 * Compliant Telegram integration using the official Telegram Bot API.
 * In compliance with Foundry Security Policy, this connector NEVER attempts
 * session extraction, SQLite scraping of Telegram Desktop, or credential theft.
 * For personal user accounts, it truthfully reports that personal-message analysis
 * is not available with the current official connector.
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

const TELEGRAM_BASE = 'https://api.telegram.org/bot';

export class TelegramConnector extends Connector {
  public readonly id = 'telegram_bot';
  public readonly name = 'Telegram';
  public readonly provider: CommunicationProvider = 'telegram';
  public readonly capabilities: ConnectorCapability[] = ['READ_MESSAGES', 'SEND_MESSAGE'];

  public async connect(botToken?: string): Promise<boolean> {
    if (botToken) {
      await tokenStore.saveToken(this.id, {
        accessToken: botToken,
        tokenType: 'BotToken',
      });
    }

    const isValid = await tokenStore.isTokenValid(this.id);
    if (isValid) {
      const stored = await tokenStore.getToken(this.id);
      if (stored?.accessToken) {
        const v = await this.verifyConnection();
        if (v.verified) {
          await this.updateConfig({
            connected: true,
            accountName: v.accountName || 'Telegram Bot',
          });
          return true;
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
        provider: 'telegram',
        error: 'Telegram: Not available for personal-message analysis with the current connector.',
      };
    }

    try {
      const resp = await proxyFetch(`${TELEGRAM_BASE}${token.accessToken}/getMe`);
      if (!resp.ok) {
        return {
          verified: false,
          provider: 'telegram',
          error: `Telegram Bot API error (${resp.status}): ${resp.statusText}`,
        };
      }

      const data = await resp.json();
      if (!data.ok) {
        return {
          verified: false,
          provider: 'telegram',
          error: `Telegram Bot authorization error: ${data.description || 'Invalid Bot Token'}`,
        };
      }

      return {
        verified: true,
        provider: 'telegram',
        accountName: `@${data.result.username || data.result.first_name}`,
        testedEndpoints: [{ endpoint: 'getMe', success: true }],
      };
    } catch (err: any) {
      return {
        verified: false,
        provider: 'telegram',
        error: `Telegram connection exception: ${err?.message || String(err)}`,
      };
    }
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.searchMessages(query);

    const items = await this.sync({ incremental: true });
    const term = (query.query || '').toLowerCase();
    return term ? items.filter((i) => i.content.toLowerCase().includes(term)) : items;
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const all = await this.searchMessages({ limit: 50 });
    return all.find((m) => m.id === messageId) || null;
  }

  public async sync(_options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error('Not available for personal-message analysis with the current connector.');
    }

    const resp = await proxyFetch(`${TELEGRAM_BASE}${token.accessToken}/getUpdates?limit=25`);
    if (!resp.ok) {
      throw new Error(`Telegram API error (${resp.status}): ${resp.statusText}`);
    }

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Telegram rejected request: ${data.description || 'Unknown error'}`);
    }

    const items: CommunicationItem[] = [];
    for (const update of data.result || []) {
      const msg = update.message || update.channel_post;
      if (msg && msg.text) {
        items.push(
          createCommunicationItem({
            id: `tg_${msg.message_id}`,
            source: 'telegram',
            conversationId: String(msg.chat?.id || ''),
            subject: msg.chat?.title || 'Telegram Chat',
            content: msg.text,
            timestamp: msg.date ? new Date(msg.date * 1000) : new Date(),
            sender: msg.from ? { name: msg.from.first_name || msg.from.username, id: String(msg.from.id) } : undefined,
          })
        );
      }
    }

    return items;
  }

  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    if (!request.confirmed) {
      return { success: false, message: 'Sending a Telegram message requires explicit user confirmation.' };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'Telegram is not authenticated.' };
    }

    if (request.action === 'SEND_MESSAGE') {
      try {
        const { chatId, text } = request.payload;
        const postUrl = `${TELEGRAM_BASE}${token.accessToken}/sendMessage`;
        const resp = await proxyFetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to dispatch Telegram message: ${resp.statusText}` };
        }

        return { success: true, message: 'Telegram message dispatched successfully.' };
      } catch (err: any) {
        return { success: false, message: `Error sending Telegram message: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const telegramConnector = new TelegramConnector();
