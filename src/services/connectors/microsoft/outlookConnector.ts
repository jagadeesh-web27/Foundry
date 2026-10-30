/**
 * Foundry Outlook Connector
 * Integrates Outlook emails and calendar events via Microsoft Graph API.
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

export class OutlookConnector extends Connector {
  public readonly id = 'microsoft_outlook';
  public readonly name = 'Microsoft Outlook';
  public readonly provider: CommunicationProvider = 'microsoft';
  public readonly capabilities: ConnectorCapability[] = [
    'READ_EMAIL',
    'READ_CALENDAR',
    'READ_ATTACHMENTS',
    'SEARCH_MESSAGES',
    'SEND_EMAIL',
    'CREATE_EVENT',
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
            accountName: v.accountName || 'Microsoft Account',
          });
          return true;
        } else {
          throw new Error(v.error || 'Microsoft Graph verification failed.');
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
        error: 'No access token stored for Microsoft Outlook.',
      };
    }
    return microsoftAuth.verifyToken(token.accessToken, '/me/messages?$top=1');
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return super.searchMessages(query);
    }

    try {
      const limit = query.limit || 20;
      let url = `${MICROSOFT_GRAPH_BASE}/me/messages?$top=${limit}&$select=id,subject,bodyPreview,receivedDateTime,from,toRecipients,hasAttachments`;

      if (query.query) {
        url += `&$search="${encodeURIComponent(query.query)}"`;
      }

      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        return super.searchMessages(query);
      }

      const data = await resp.json();
      return (data.value || []).map((msg: any) =>
        createCommunicationItem({
          id: `msg_${msg.id}`,
          source: 'outlook',
          subject: msg.subject || '(No Subject)',
          content: msg.bodyPreview || msg.subject || '',
          timestamp: msg.receivedDateTime,
          sender: msg.from?.emailAddress
            ? {
                name: msg.from.emailAddress.name || msg.from.emailAddress.address,
                email: msg.from.emailAddress.address,
              }
            : undefined,
          recipients: (msg.toRecipients || []).map((r: any) => ({
            name: r.emailAddress?.name || r.emailAddress?.address,
            email: r.emailAddress?.address,
          })),
        })
      );
    } catch {
      return super.searchMessages(query);
    }
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const cleanId = messageId.replace(/^msg_/, '');
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.getMessage(messageId);

    try {
      const url = `${MICROSOFT_GRAPH_BASE}/me/messages/${cleanId}?$select=id,subject,bodyPreview,body,receivedDateTime,from,toRecipients,hasAttachments`;
      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) return super.getMessage(messageId);

      const msg = await resp.json();
      return createCommunicationItem({
        id: `msg_${msg.id}`,
        source: 'outlook',
        subject: msg.subject || '(No Subject)',
        content: msg.body?.content?.replace(/<[^>]*>?/gm, '').trim() || msg.bodyPreview || '',
        timestamp: msg.receivedDateTime,
        sender: msg.from?.emailAddress
          ? {
              name: msg.from.emailAddress.name || msg.from.emailAddress.address,
              email: msg.from.emailAddress.address,
            }
          : undefined,
        recipients: (msg.toRecipients || []).map((r: any) => ({
          name: r.emailAddress?.name || r.emailAddress?.address,
          email: r.emailAddress?.address,
        })),
      });
    } catch {
      return super.getMessage(messageId);
    }
  }

  public async sync(options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error(
        'Not authenticated: Microsoft Outlook access token is missing. Connect your Microsoft account in Integrations.'
      );
    }

    const hasEmail = await this.hasCapability('READ_EMAIL');
    const hasCal = await this.hasCapability('READ_CALENDAR');

    if (!hasEmail && !hasCal) {
      throw new Error(
        'Permission missing: Both Read Email and Read Calendar capabilities are disabled in Foundry Settings.'
      );
    }

    const isIncremental = typeof options === 'boolean' ? options : options?.incremental ?? true;
    const items: CommunicationItem[] = [];

    // 1. Fetch authorized recent emails
    if (hasEmail) {
      const topCount = isIncremental ? 15 : 50;
      const url = `${MICROSOFT_GRAPH_BASE}/me/messages?$top=${topCount}&$select=id,subject,bodyPreview,receivedDateTime,from,toRecipients,hasAttachments`;

      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        let errText = resp.statusText;
        try {
          const errJson = await resp.json();
          if (errJson?.error?.message) errText = errJson.error.message;
        } catch {}
        throw new Error(`Microsoft Outlook Mail API error (${resp.status}): ${errText}`);
      }

      const data = await resp.json();
      for (const msg of data.value || []) {
        items.push(
          createCommunicationItem({
            id: `msg_${msg.id}`,
            source: 'outlook',
            subject: msg.subject,
            content: msg.bodyPreview || msg.subject || '',
            timestamp: msg.receivedDateTime,
            sender: msg.from?.emailAddress
              ? {
                  name: msg.from.emailAddress.name || msg.from.emailAddress.address,
                  email: msg.from.emailAddress.address,
                }
              : undefined,
            recipients: (msg.toRecipients || []).map((r: any) => ({
              name: r.emailAddress?.name || r.emailAddress?.address,
              email: r.emailAddress?.address,
            })),
          })
        );
      }
    }

    // 2. Fetch authorized calendar events
    if (hasCal) {
      const now = new Date();
      const endWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const calUrl = `${MICROSOFT_GRAPH_BASE}/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${endWindow.toISOString()}&$select=id,subject,bodyPreview,start,end,attendees`;

      const calResp = await proxyFetch(calUrl, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!calResp.ok) {
        let errText = calResp.statusText;
        try {
          const errJson = await calResp.json();
          if (errJson?.error?.message) errText = errJson.error.message;
        } catch {}
        throw new Error(`Microsoft Outlook Calendar API error (${calResp.status}): ${errText}`);
      }

      const calData = await calResp.json();
      for (const ev of calData.value || []) {
        items.push(
          createCommunicationItem({
            id: `evt_${ev.id}`,
            source: 'outlook',
            subject: `Meeting: ${ev.subject}`,
            content: `Scheduled meeting: ${ev.subject}. ${ev.bodyPreview || ''} Time: ${ev.start?.dateTime}`,
            timestamp: ev.start?.dateTime || new Date(),
            metadata: {
              isMeeting: true,
              start: ev.start?.dateTime,
              end: ev.end?.dateTime,
              attendees: ev.attendees,
            },
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

    const hasCap = await this.hasCapability('SEND_EMAIL');
    if (!hasCap) {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Send Email capability is disabled in Foundry Settings.',
      };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'Outlook is not authenticated.' };
    }

    if (request.action === 'SEND_EMAIL') {
      try {
        const { to, subject, body } = request.payload;
        const sendUrl = `${MICROSOFT_GRAPH_BASE}/me/sendMail`;
        const resp = await proxyFetch(sendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: 'Text', content: body },
              toRecipients: [{ emailAddress: { address: to } }],
            },
          }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to send email: ${resp.statusText}` };
        }

        return { success: true, message: `Email to ${to} dispatched successfully.` };
      } catch (err: any) {
        return { success: false, message: `Error sending email: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const outlookConnector = new OutlookConnector();
