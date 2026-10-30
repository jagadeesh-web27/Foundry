/**
 * Foundry Gmail Connector
 * Integrates Gmail messages and threads via official Google Gmail REST API.
 * Uses narrow scope: https://www.googleapis.com/auth/gmail.readonly
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
import { googleOAuthProvider } from './googleOAuthProvider';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailConnector extends Connector {
  public readonly id = 'google_gmail';
  public readonly name = 'Google Gmail';
  public readonly provider: CommunicationProvider = 'google';
  public readonly capabilities: ConnectorCapability[] = [
    'READ_EMAIL',
    'SEARCH_MESSAGES',
    'READ_ATTACHMENTS',
    'SEND_EMAIL',
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
        const authRes = await googleOAuthProvider.authorize();
        if (!authRes.success) {
          throw new Error(authRes.error || 'Google browser authorization failed.');
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
            accountName: v.accountName || 'Google Account',
          });
          return true;
        } else {
          throw new Error(v.error || 'Gmail verification failed.');
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
        provider: 'google',
        error: 'No access token stored for Google Gmail.',
      };
    }
    return googleAuth.verifyToken(token.accessToken, `${GMAIL_BASE}/profile`);
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.searchMessages(query);

    try {
      const maxResults = query.limit || 20;
      let url = `${GMAIL_BASE}/messages?maxResults=${maxResults}`;
      if (query.query) {
        url += `&q=${encodeURIComponent(query.query)}`;
      }

      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) return super.searchMessages(query);

      const data = await resp.json();
      const messageRefs = data.messages || [];
      const items: CommunicationItem[] = [];

      for (const ref of messageRefs.slice(0, 10)) {
        try {
          const detail = await this.getMessage(ref.id);
          if (detail) items.push(detail);
        } catch {}
      }

      return items;
    } catch {
      return super.searchMessages(query);
    }
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const cleanId = messageId.replace(/^gmail_/, '');
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.getMessage(messageId);

    try {
      const detailUrl = `${GMAIL_BASE}/messages/${cleanId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`;
      const dResp = await proxyFetch(detailUrl, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!dResp.ok) return super.getMessage(messageId);

      const msgData = await dResp.json();
      const headers: Record<string, string> = {};
      for (const h of msgData.payload?.headers || []) {
        headers[h.name.toLowerCase()] = h.value;
      }

      return createCommunicationItem({
        id: `gmail_${msgData.id}`,
        source: 'gmail',
        subject: headers['subject'] || '(No Subject)',
        content: msgData.snippet || headers['subject'] || '',
        timestamp: msgData.internalDate ? new Date(parseInt(msgData.internalDate, 10)) : new Date(),
        sender: headers['from'] ? { name: headers['from'] } : undefined,
        recipients: headers['to'] ? [{ name: headers['to'] }] : [],
      });
    } catch {
      return super.getMessage(messageId);
    }
  }

  public async sync(options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error('Not authenticated: Google Gmail access token is missing. Connect your Google account in Integrations.');
    }

    const hasRead = await this.hasCapability('READ_EMAIL');
    if (!hasRead) {
      throw new Error('Permission missing: Read Email capability is disabled for Gmail in Foundry Settings.');
    }

    const isIncremental = typeof options === 'boolean' ? options : options?.incremental ?? true;
    const maxResults = isIncremental ? 15 : 40;
    const listUrl = `${GMAIL_BASE}/messages?maxResults=${maxResults}`;

    const resp = await proxyFetch(listUrl, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      let errDetail = resp.statusText;
      try {
        const errJson = await resp.json();
        if (errJson?.error?.message) errDetail = errJson.error.message;
      } catch {}
      throw new Error(`Google Gmail API error (${resp.status}): ${errDetail}`);
    }

    const data = await resp.json();
    const messageRefs = data.messages || [];
    const items: CommunicationItem[] = [];

    // Fetch detail snippets for recent messages
    for (const ref of messageRefs.slice(0, 15)) {
      try {
        const item = await this.getMessage(ref.id);
        if (item) items.push(item);
      } catch {}
    }

    return items;
  }

  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    if (!request.confirmed) {
      return { success: false, message: 'Action requires explicit user confirmation before dispatching.' };
    }

    const hasCap = await this.hasCapability('SEND_EMAIL');
    if (!hasCap) {
      return { success: false, error: 'PERMISSION_DENIED', message: 'Send Gmail capability is disabled.' };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'Gmail is not authenticated.' };
    }

    if (request.action === 'SEND_EMAIL') {
      try {
        const { to, subject, body } = request.payload;
        const emailLines = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          body,
        ];
        const raw = btoa(unescape(encodeURIComponent(emailLines.join('\r\n'))))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const sendUrl = `${GMAIL_BASE}/messages/send`;
        const resp = await proxyFetch(sendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to send email: ${resp.statusText}` };
        }

        return { success: true, message: `Email to ${to} sent successfully via Gmail.` };
      } catch (err: any) {
        return { success: false, message: `Error sending Gmail: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const gmailConnector = new GmailConnector();
