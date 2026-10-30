/**
 * Foundry Google Calendar Connector
 * Integrates Google Calendar events and meetings.
 * Uses narrow scope: https://www.googleapis.com/auth/calendar.readonly
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

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';

export class GoogleCalendarConnector extends Connector {
  public readonly id = 'google_calendar';
  public readonly name = 'Google Calendar';
  public readonly provider: CommunicationProvider = 'google';
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
            accountName: v.accountName || 'Google Calendar Account',
          });
          return true;
        } else {
          throw new Error(v.error || 'Google Calendar verification failed.');
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
        error: 'No access token stored for Google Calendar.',
      };
    }
    return googleAuth.verifyToken(token.accessToken, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1');
  }

  public async searchMessages(query: MessageSearchQuery): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.searchMessages(query);

    try {
      const now = new Date();
      const endWindow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      let url = `${CALENDAR_BASE}/events?timeMin=${now.toISOString()}&timeMax=${endWindow.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=${query.limit || 20}`;
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
      return (data.items || []).map((ev: any) => {
        const startTime = ev.start?.dateTime || ev.start?.date;
        return createCommunicationItem({
          id: `gcal_${ev.id}`,
          source: 'gmail',
          subject: `Meeting: ${ev.summary || 'Calendar Event'}`,
          content: `Meeting: ${ev.summary}. ${ev.description || ''} Starting: ${startTime}`,
          timestamp: startTime ? new Date(startTime) : new Date(),
          metadata: {
            isMeeting: true,
            start: startTime,
            end: ev.end?.dateTime || ev.end?.date,
            attendees: ev.attendees,
            location: ev.location,
            meetingLink: ev.hangoutLink || ev.conferenceData?.entryPoints?.[0]?.uri,
          },
        });
      });
    } catch {
      return super.searchMessages(query);
    }
  }

  public async getMessage(messageId: string): Promise<CommunicationItem | null> {
    const cleanId = messageId.replace(/^gcal_/, '');
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return super.getMessage(messageId);

    try {
      const url = `${CALENDAR_BASE}/events/${cleanId}`;
      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) return super.getMessage(messageId);

      const ev = await resp.json();
      const startTime = ev.start?.dateTime || ev.start?.date;
      return createCommunicationItem({
        id: `gcal_${ev.id}`,
        source: 'gmail',
        subject: `Meeting: ${ev.summary || 'Calendar Event'}`,
        content: `Meeting: ${ev.summary}. ${ev.description || ''} Starting: ${startTime}`,
        timestamp: startTime ? new Date(startTime) : new Date(),
        metadata: {
          isMeeting: true,
          start: startTime,
          end: ev.end?.dateTime || ev.end?.date,
          attendees: ev.attendees,
          location: ev.location,
          meetingLink: ev.hangoutLink || ev.conferenceData?.entryPoints?.[0]?.uri,
        },
      });
    } catch {
      return super.getMessage(messageId);
    }
  }

  public async sync(_options?: SyncOptions | boolean): Promise<CommunicationItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      throw new Error('Not authenticated: Google Calendar access token is missing. Connect your Google account in Integrations.');
    }

    const hasCal = await this.hasCapability('READ_CALENDAR');
    if (!hasCal) {
      throw new Error('Permission missing: Read Calendar capability is disabled for Google Calendar in Foundry Settings.');
    }

    const now = new Date();
    const endWindow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const url = `${CALENDAR_BASE}/events?timeMin=${now.toISOString()}&timeMax=${endWindow.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=50`;

    const resp = await proxyFetch(url, {
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
      throw new Error(`Google Calendar API error (${resp.status}): ${errDetail}`);
    }

    const data = await resp.json();
    const items: CommunicationItem[] = [];

    for (const ev of data.items || []) {
      const startTime = ev.start?.dateTime || ev.start?.date;
      items.push(
        createCommunicationItem({
          id: `gcal_${ev.id}`,
          source: 'gmail',
          subject: `Meeting: ${ev.summary || 'Calendar Event'}`,
          content: `Meeting: ${ev.summary}. ${ev.description || ''} Starting: ${startTime}`,
          timestamp: startTime ? new Date(startTime) : new Date(),
          metadata: {
            isMeeting: true,
            start: startTime,
            end: ev.end?.dateTime || ev.end?.date,
            attendees: ev.attendees,
            location: ev.location,
            meetingLink: ev.hangoutLink || ev.conferenceData?.entryPoints?.[0]?.uri,
          },
        })
      );
    }

    return items;
  }

  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    if (!request.confirmed) {
      return { success: false, message: 'Creating an event requires explicit user confirmation.' };
    }

    const hasCap = await this.hasCapability('CREATE_EVENT');
    if (!hasCap) {
      return { success: false, error: 'PERMISSION_DENIED', message: 'Create Calendar Event capability is disabled.' };
    }

    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return { success: false, error: 'NOT_CONNECTED', message: 'Google Calendar is not authenticated.' };
    }

    if (request.action === 'CREATE_EVENT') {
      try {
        const { summary, description, startDateTime, endDateTime } = request.payload;
        const url = `${CALENDAR_BASE}/events`;
        const resp = await proxyFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary,
            description,
            start: { dateTime: startDateTime },
            end: { dateTime: endDateTime },
          }),
        });

        if (!resp.ok) {
          return { success: false, message: `Failed to create event: ${resp.statusText}` };
        }

        return { success: true, message: `Event "${summary}" created on Google Calendar.` };
      } catch (err: any) {
        return { success: false, message: `Error creating Google Calendar event: ${err?.message || String(err)}` };
      }
    }

    return { success: false, message: `Unknown action: ${request.action}` };
  }
}

export const googleCalendarConnector = new GoogleCalendarConnector();
