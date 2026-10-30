/**
 * Foundry WhatsApp Connector
 * Strictly compliant implementation for WhatsApp.
 * Conforms to Meta Cloud API policies and Foundry Security Policy.
 *
 * CRITICAL POLICY ENFORCEMENT:
 * - NEVER scrapes WhatsApp Web
 * - NEVER extracts WhatsApp Web cookies
 * - NEVER reads WhatsApp desktop SQLite databases
 * - NEVER copies WhatsApp session tokens
 * - NEVER bypasses QR authentication
 * - NEVER injects into WhatsApp client
 * - NEVER reverse engineers private APIs
 *
 * Truthfully displays:
 * "⚠ Personal chat analysis unavailable: The official WhatsApp integration does not provide
 * the required personal-chat access for this account. Foundry will not access WhatsApp
 * through scraping or private application data."
 *
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
import { CommunicationItem } from '@/services/commitments/communicationItem';
import { tokenStore } from '../core/tokenStore';
import { proxyFetch } from '@/services/ai/proxyFetch';

export const WHATSAPP_POLICY_LIMITATION_MESSAGE =
  '⚠ Personal chat analysis unavailable\n\nThe official WhatsApp integration does not provide the required personal-chat access for this account.\n\nFoundry will not access WhatsApp through scraping or private application data.';

export class WhatsAppConnector extends Connector {
  public readonly id = 'whatsapp_business';
  public readonly name = 'WhatsApp';
  public readonly provider: CommunicationProvider = 'whatsapp';
  public readonly capabilities: ConnectorCapability[] = ['SEND_MESSAGE'];

  public async connect(token?: string): Promise<boolean> {
    if (token) {
      await tokenStore.saveToken(this.id, {
        accessToken: token,
        tokenType: 'Bearer',
      });

      const v = await this.verifyConnection();
      if (v.verified) {
        await this.updateConfig({
          connected: true,
          accountName: v.accountName || 'WhatsApp Cloud API',
        });
        return true;
      }
    }

    return false;
  }

  public async verifyConnection(): Promise<VerificationResult> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return {
        verified: false,
        provider: 'whatsapp',
        error: WHATSAPP_POLICY_LIMITATION_MESSAGE,
      };
    }

    try {
      const resp = await proxyFetch('https://graph.facebook.com/v19.0/me', {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        return {
          verified: false,
          provider: 'whatsapp',
          error: `WhatsApp Meta Cloud API rejected token (${resp.status}): ${resp.statusText}`,
        };
      }

      const data = await resp.json();
      return {
        verified: true,
        provider: 'whatsapp',
        accountName: data.name || 'WhatsApp Business Cloud',
        testedEndpoints: [{ endpoint: 'https://graph.facebook.com/v19.0/me', success: true }],
      };
    } catch (err: any) {
      return {
        verified: false,
        provider: 'whatsapp',
        error: `Meta Cloud API verification exception: ${err?.message || String(err)}`,
      };
    }
  }

  public async searchMessages(_query: MessageSearchQuery): Promise<CommunicationItem[]> {
    // Personal WhatsApp messages cannot be accessed via official public API without scraping
    return [];
  }

  public async getMessage(_messageId: string): Promise<CommunicationItem | null> {
    return null;
  }

  public async sync(_options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const isConnected = await this.isConnected();
    if (!isConnected) {
      throw new Error(WHATSAPP_POLICY_LIMITATION_MESSAGE);
    }
    // Meta Cloud API operates via incoming webhooks rather than mailbox polling
    return [];
  }

  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    const isConnected = await this.isConnected();
    if (!isConnected) {
      return {
        success: false,
        error: 'UNAVAILABLE',
        message: `WhatsApp integration is not available for this account. ${WHATSAPP_POLICY_LIMITATION_MESSAGE}`,
      };
    }

    if (!request.confirmed) {
      return { success: false, message: 'WhatsApp message dispatch requires explicit user confirmation.' };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'WhatsApp Cloud API is not authenticated.' };
    }

    if (request.action === 'SEND_MESSAGE') {
      try {
        const { to, text, phoneNumberId } = request.payload;
        if (!to || !text || !phoneNumberId) {
          return { success: false, message: 'Missing phoneNumberId, recipient phone, or message body.' };
        }

        const resp = await proxyFetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { preview_url: false, body: text },
          }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to dispatch WhatsApp message: ${resp.statusText}` };
        }

        return { success: true, message: `WhatsApp message dispatched to ${to}.` };
      } catch (err: any) {
        return { success: false, message: `Error sending WhatsApp message: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const whatsAppConnector = new WhatsAppConnector();
