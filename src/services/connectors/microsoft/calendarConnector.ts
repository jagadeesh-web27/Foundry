/**
 * Foundry Microsoft Calendar Connector
 * Dedicated connector for Microsoft Calendar events and meetings.
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

export class MicrosoftCalendarConnector extends Connector {
  public readonly id = 'microsoft_calendar';
  public readonly name = 'Microsoft Calendar';
  public readonly provider: CommunicationProvider = 'microsoft';
  public readonly capabilities: ConnectorCapability[] = ['READ_CALENDAR', 'CREATE_EVENT'];

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
            accountName: v.accountName || 'Microsoft Calendar Account',
          });
          return true;
        } else {
          throw new Error(v.error || 'Microsoft Calendar verification failed.');
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
        error: 'No access token stored for Microsoft Calendar.',
      };
    }
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return microsoftAuth.verifyToken(
      token.accessToken,
      `/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=1`
    );
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.searchMessages(query);

    try {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const limit = query.limit || 25;
      const url = `${MICROSOFT_GRAPH_BASE}/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=${limit}&$select=id,subject,bodyPreview,start,end,attendees,location`;

      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) return super.searchMessages(query);

      const data = await resp.json();
      const term = (query.query || '').toLowerCase();
      const items: CommunicationItem[] = [];

      for (const ev of data.value || []) {
        const subject = ev.subject || 'Calendar Event';
        const body = ev.bodyPreview || '';
        if (!term || subject.toLowerCase().includes(term) || body.toLowerCase().includes(term)) {
          items.push(
            createCommunicationItem({
              id: `mscal_${ev.id}`,
              source: 'outlook',
              subject: `Meeting: ${subject}`,
              content: `Scheduled meeting: ${subject}. ${body} Time: ${ev.start?.dateTime}`,
              timestamp: ev.start?.dateTime || new Date(),
              metadata: {
                isMeeting: true,
                start: ev.start?.dateTime,
                end: ev.end?.dateTime,
                attendees: ev.attendees,
                location: ev.location?.displayName,
              },
            })
          );
        }
      }

      return items;
    } catch {
      return super.searchMessages(query);
    }
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const cleanId = messageId.replace(/^mscal_/, '');
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.getMessage(messageId);

    try {
      const url = `${MICROSOFT_GRAPH_BASE}/me/events/${cleanId}`;
      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) return super.getMessage(messageId);

      const ev = await resp.json();
      return createCommunicationItem({
        id: `mscal_${ev.id}`,
        source: 'outlook',
        subject: `Meeting: ${ev.subject}`,
        content: `Scheduled meeting: ${ev.subject}. ${ev.bodyPreview || ''} Time: ${ev.start?.dateTime}`,
        timestamp: ev.start?.dateTime || new Date(),
        metadata: {
          isMeeting: true,
          start: ev.start?.dateTime,
          end: ev.end?.dateTime,
          attendees: ev.attendees,
          location: ev.location?.displayName,
        },
      });
    } catch {
      return super.getMessage(messageId);
    }
  }

  public async sync(_options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error(
        'Not authenticated: Microsoft Calendar access token is missing. Connect your Microsoft account in Integrations.'
      );
    }

    const hasCal = await this.hasCapability('READ_CALENDAR');
    if (!hasCal) {
      throw new Error('Permission missing: Read Calendar capability is disabled in Foundry Settings.');
    }

    const now = new Date();
    const endWindow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const calUrl = `${MICROSOFT_GRAPH_BASE}/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${endWindow.toISOString()}&$select=id,subject,bodyPreview,start,end,attendees,location`;

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
      throw new Error(`Microsoft Calendar API error (${calResp.status}): ${errText}`);
    }

    const calData = await calResp.json();
    const items: CommunicationItem[] = [];

    for (const ev of calData.value || []) {
      items.push(
        createCommunicationItem({
          id: `mscal_${ev.id}`,
          source: 'outlook',
          subject: `Meeting: ${ev.subject}`,
          content: `Scheduled meeting: ${ev.subject}. ${ev.bodyPreview || ''} Time: ${ev.start?.dateTime}`,
          timestamp: ev.start?.dateTime || new Date(),
          metadata: {
            isMeeting: true,
            start: ev.start?.dateTime,
            end: ev.end?.dateTime,
            attendees: ev.attendees,
            location: ev.location?.displayName,
          },
        })
      );
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

    const hasCap = await this.hasCapability('CREATE_EVENT');
    if (!hasCap) {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Create Calendar Event capability is disabled in Foundry Settings.',
      };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'Microsoft Calendar is not authenticated.' };
    }

    if (request.action === 'CREATE_EVENT') {
      try {
        const { subject, start, end, attendees } = request.payload;
        const postUrl = `${MICROSOFT_GRAPH_BASE}/me/events`;
        const resp = await proxyFetch(postUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject,
            start: { dateTime: start, timeZone: 'UTC' },
            end: { dateTime: end, timeZone: 'UTC' },
            attendees: (attendees || []).map((email: string) => ({
              emailAddress: { address: email },
              type: 'required',
            })),
          }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to create calendar event: ${resp.statusText}` };
        }

        return { success: true, message: `Meeting "${subject}" created on Microsoft Calendar.` };
      } catch (err: any) {
        return { success: false, message: `Error creating meeting: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const microsoftCalendarConnector = new MicrosoftCalendarConnector();
