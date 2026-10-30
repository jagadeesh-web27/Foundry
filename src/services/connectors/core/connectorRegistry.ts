/**
 * Foundry Connector Registry - Central Service Catalog
 * Tracks all available, active, and configured integrations across Microsoft, Google, Slack, Telegram, and WhatsApp.
 */

import { Connector } from './connector';
import { outlookConnector } from '../microsoft/outlookConnector';
import { teamsConnector } from '../microsoft/teamsConnector';
import { microsoftCalendarConnector } from '../microsoft/calendarConnector';
import { oneDriveConnector } from '../microsoft/oneDriveConnector';
import { gmailConnector } from '../google/gmailConnector';
import { googleCalendarConnector } from '../google/googleCalendarConnector';
import { googleChatConnector } from '../google/googleChatConnector';
import { googleDriveConnector } from '../google/googleDriveConnector';
import { slackConnector } from '../slack/slackConnector';
import { telegramConnector } from '../telegram/telegramConnector';
import { whatsAppConnector } from '../whatsapp/whatsAppConnector';

export class ConnectorRegistry {
  private connectors: Map<string, Connector> = new Map();

  constructor() {
    // Microsoft
    this.register(outlookConnector);
    this.register(teamsConnector);
    this.register(microsoftCalendarConnector);
    this.register(oneDriveConnector);

    // Google
    this.register(gmailConnector);
    this.register(googleCalendarConnector);
    this.register(googleChatConnector);
    this.register(googleDriveConnector);

    // Messaging & Collaboration
    this.register(slackConnector);
    this.register(telegramConnector);
    this.register(whatsAppConnector);
  }

  public register(connector: Connector): void {
    this.connectors.set(connector.id, connector);
  }

  public getConnector(id: string): Connector | undefined {
    return this.connectors.get(id);
  }

  public getAllConnectors(): Connector[] {
    return Array.from(this.connectors.values());
  }

  public async getConnectedConnectors(): Promise<Connector[]> {
    const all = this.getAllConnectors();
    const connected: Connector[] = [];
    for (const c of all) {
      if (await c.isConnected()) {
        connected.push(c);
      }
    }
    return connected;
  }
}

export const connectorRegistry = new ConnectorRegistry();
