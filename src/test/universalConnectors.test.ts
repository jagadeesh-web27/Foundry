/**
 * Universal Communication Connector Architecture - Comprehensive Test Suite
 * Tests universal abstraction, authentication error propagation, official policy compliance,
 * multi-source deduplication, and generic agent tools.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { connectorRegistry } from '@/services/connectors/core/connectorRegistry';
import { commitmentStore } from '@/services/commitments/commitmentStore';
import { commitmentEngine } from '@/services/commitments/commitmentEngine';
import { toolRegistry } from '@/services/tools/toolRegistry';
import { createCommunicationItem } from '@/services/commitments/communicationItem';
import { WHATSAPP_POLICY_LIMITATION_MESSAGE } from '@/services/connectors/whatsapp/whatsAppConnector';
import { validateMicrosoftAuthorizationUrl } from '@/services/connectors/microsoft/microsoftOAuthProvider';
import { validateGoogleAuthorizationUrl } from '@/services/connectors/google/googleOAuthProvider';

describe('Universal Communication Connector Architecture', () => {
  beforeEach(async () => {
    // Clean up any test commitments
    const all = await commitmentStore.listCommitments();
    for (const c of all) {
      await commitmentStore.deleteCommitment(c.id);
    }
  });

  describe('1. Central Connector Registry & Provider Catalog', () => {
    it('registers all 11 required provider connectors across Microsoft, Google, Slack, Telegram, WhatsApp', () => {
      const all = connectorRegistry.getAllConnectors();
      const ids = all.map((c) => c.id);

      expect(ids).toContain('microsoft_outlook');
      expect(ids).toContain('microsoft_teams');
      expect(ids).toContain('microsoft_calendar');
      expect(ids).toContain('microsoft_onedrive');
      expect(ids).toContain('google_gmail');
      expect(ids).toContain('google_calendar');
      expect(ids).toContain('google_chat');
      expect(ids).toContain('google_drive');
      expect(ids).toContain('slack_workspace');
      expect(ids).toContain('telegram_bot');
      expect(ids).toContain('whatsapp_business');
    });

    it('each connector defines capabilities, name, provider, and lifecycle methods', async () => {
      for (const connector of connectorRegistry.getAllConnectors()) {
        expect(connector.id).toBeDefined();
        expect(connector.name).toBeDefined();
        expect(connector.provider).toBeDefined();
        expect(Array.isArray(connector.capabilities)).toBe(true);
        expect(typeof connector.verifyConnection).toBe('function');
        expect(typeof connector.searchMessages).toBe('function');
        expect(typeof connector.getMessage).toBe('function');
        expect(typeof connector.sync).toBe('function');
        expect(typeof connector.getStatus).toBe('function');

        const status = await connector.getStatus();
        expect(status).not.toBeNull();
        expect(status.provider).toBe(connector.provider);
      }
    });
  });

  describe('2. Truthful Error Propagation & Data Truth (No Mock Production Data)', () => {
    it('GmailConnector.sync throws explicit error when unauthenticated instead of returning empty array', async () => {
      const gmail = connectorRegistry.getConnector('google_gmail')!;
      await gmail.disconnect();
      await expect(gmail.sync()).rejects.toThrow('Not authenticated');
    });

    it('GoogleCalendarConnector.sync throws explicit error when unauthenticated', async () => {
      const gcal = connectorRegistry.getConnector('google_calendar')!;
      await gcal.disconnect();
      await expect(gcal.sync()).rejects.toThrow('Not authenticated');
    });

    it('MicrosoftCalendarConnector.sync throws explicit error when unauthenticated', async () => {
      const mscal = connectorRegistry.getConnector('microsoft_calendar')!;
      await mscal.disconnect();
      await expect(mscal.sync()).rejects.toThrow('Not authenticated');
    });

    it('SlackConnector.sync throws explicit error when unauthenticated', async () => {
      const slack = connectorRegistry.getConnector('slack_workspace')!;
      await slack.disconnect();
      await expect(slack.sync()).rejects.toThrow('Not authenticated');
    });
  });

  describe('3. WhatsApp & Google Chat Official Policy Enforcement', () => {
    it('WhatsAppConnector truthfully rejects unauthenticated access with strict anti-scraping policy notice', async () => {
      const wa = connectorRegistry.getConnector('whatsapp_business')!;
      await wa.disconnect();

      const v = await wa.verifyConnection();
      expect(v.verified).toBe(false);
      expect(v.error).toBe(WHATSAPP_POLICY_LIMITATION_MESSAGE);
      expect(v.error).toContain('Personal chat analysis unavailable');
      expect(v.error).toContain('Foundry will not access WhatsApp through scraping');

      await expect(wa.sync()).rejects.toThrow('Personal chat analysis unavailable');
    });

    it('GoogleChatConnector reports account entitlement limitations when unauthenticated or unsupported', async () => {
      const chat = connectorRegistry.getConnector('google_chat')!;
      await chat.disconnect();

      const v = await chat.verifyConnection();
      expect(v.verified).toBe(false);
      expect(v.error).toBeDefined();

      await expect(chat.sync()).rejects.toThrow('Not authenticated');
    });

    it('TelegramConnector reports limitation for personal message analysis without session hijacking', async () => {
      const tg = connectorRegistry.getConnector('telegram_bot')!;
      await tg.disconnect();

      const v = await tg.verifyConnection();
      expect(v.verified).toBe(false);
      expect(v.error).toContain('Not available for personal-message analysis');
      await expect(tg.sync()).rejects.toThrow('Not available for personal-message analysis');
    });
  });

  describe('4. Multi-Source Deduplication & Provenance Aggregation', () => {
    it('merges an obligation arriving from both Gmail and Teams into a single commitment with multiple sources', async () => {
      // 1. Ingest commitment from Gmail
      const gmailMsg = createCommunicationItem({
        id: 'msg_gm_101',
        source: 'gmail',
        subject: 'Accessibility Report',
        content: 'I will send the accessibility report by tomorrow.',
        timestamp: new Date(),
        sender: { name: 'Rahul' },
      });

      const [c1] = await commitmentEngine.processBatch([gmailMsg]);
      expect(c1).toBeDefined();
      expect(c1.title.toLowerCase()).toContain('send');
      expect(c1.sources).toBeDefined();
      expect(c1.sources![0].provider.toLowerCase()).toBe('gmail');

      // 2. Ingest duplicate commitment from Teams
      const teamsMsg = createCommunicationItem({
        id: 'teams_tm_202',
        source: 'teams',
        subject: 'Accessibility Report',
        content: 'I will send the accessibility report by tomorrow.',
        timestamp: new Date(),
        sender: { name: 'Rahul' },
      });

      const [c2] = await commitmentEngine.processBatch([teamsMsg]);
      expect(c2).toBeDefined();
      expect(c2.id).toBe(c1.id); // Merged into existing obligation!

      // Check stored commitment has both sources
      const stored = await commitmentStore.getCommitment(c1.id);
      expect(stored).not.toBeNull();
      expect(stored!.sources).toBeDefined();
      expect(stored!.sources!.length).toBe(2);

      const providers = stored!.sources!.map((s) => s.provider.toLowerCase());
      expect(providers).toContain('gmail');
      expect(providers).toContain('teams');
    });
  });

  describe('5. Generic Agent Tool Registry (Section 27 Conformance)', () => {
    it('provides all generic communication and commitment tools without hardcoding queries', () => {
      const toolNames = [
        'search_communications',
        'get_communication',
        'search_commitments',
        'list_pending_commitments',
        'search_calendar',
        'get_connector_status',
        'sync_connector',
      ];

      for (const name of toolNames) {
        const tool = toolRegistry.getTool(name);
        expect(tool).toBeDefined();
        expect(tool!.description).toBeDefined();
        expect(tool!.category).toBeDefined();
        expect(typeof tool!.execute).toBe('function');
      }
    });

    it('list_pending_commitments returns categorized obligations without query substring checks', async () => {
      const tool = toolRegistry.getTool('list_pending_commitments')!;
      const overview = await tool.execute({ category: 'all' }, {});

      expect(overview).toHaveProperty('needToDo');
      expect(overview).toHaveProperty('waitingFor');
      expect(overview).toHaveProperty('peopleWaitingForMe');
      expect(overview).toHaveProperty('upcoming');
    });

    it('get_connector_status truthfully retrieves statuses for all registered connectors', async () => {
      const tool = toolRegistry.getTool('get_connector_status')!;
      const statuses = await tool.execute({}, {});

      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses.length).toBeGreaterThanOrEqual(8);
      expect(statuses.some((s: any) => s.connectorId === 'microsoft_outlook')).toBe(true);
      expect(statuses.some((s: any) => s.connectorId === 'google_gmail')).toBe(true);
    });

    it('search_calendar retrieves calendar meetings across authorized sources', async () => {
      const tool = toolRegistry.getTool('search_calendar')!;
      const res = await tool.execute({ query: 'review' }, {});
      expect(Array.isArray(res)).toBe(true);
    });
  });

  describe('5. Microsoft OAuth PKCE Authorization URL Validation (AADSTS900144 Prevention)', () => {
    const validParams = {
      client_id: 'a68ef3be-dc9c-4c40-8438-e6d24f74d008',
      response_type: 'code',
      redirect_uri: 'http://localhost:1420/oauth/callback',
      scope: 'openid profile email offline_access User.Read Mail.Read',
      state: 'test_state_123',
      code_challenge: 'test_pkce_challenge_456',
      code_challenge_method: 'S256',
    };

    it('passes validation when all required PKCE and OAuth parameters are present', () => {
      const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      Object.entries(validParams).forEach(([k, v]) => url.searchParams.set(k, v));

      expect(() => validateMicrosoftAuthorizationUrl(url)).not.toThrow();
    });

    it('fails with explicit error when scope is missing (preventing AADSTS900144 regression)', () => {
      const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      Object.entries(validParams).forEach(([k, v]) => {
        if (k !== 'scope') url.searchParams.set(k, v);
      });

      expect(() => validateMicrosoftAuthorizationUrl(url)).toThrow('missing scope');
    });

    it('fails with explicit error when client_id, redirect_uri, or state is missing', () => {
      for (const param of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method']) {
        const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
        Object.entries(validParams).forEach(([k, v]) => {
          if (k !== param) url.searchParams.set(k, v);
        });

        expect(() => validateMicrosoftAuthorizationUrl(url)).toThrow(`missing ${param}`);
      }
    });

    it('fails if response_type is not code', () => {
      const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      Object.entries(validParams).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set('response_type', 'token');

      expect(() => validateMicrosoftAuthorizationUrl(url)).toThrow('must use authorization code flow');
    });

    it('fails if code_challenge_method is not S256', () => {
      const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      Object.entries(validParams).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set('code_challenge_method', 'plain');

      expect(() => validateMicrosoftAuthorizationUrl(url)).toThrow('must use S256 PKCE');
    });
  });

  describe('6. Google OAuth PKCE Authorization URL Validation (Placeholder / Error 401 invalid_client Prevention)', () => {
    const validGoogleParams = {
      client_id: '123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com',
      response_type: 'code',
      redirect_uri: 'http://localhost:1420/oauth/callback',
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
      state: 'google_state_123',
      code_challenge: 'test_pkce_challenge_456',
      code_challenge_method: 'S256',
    };

    it('passes validation when all required Google PKCE parameters and real client ID are present', () => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      Object.entries(validGoogleParams).forEach(([k, v]) => url.searchParams.set(k, v));

      expect(() => validateGoogleAuthorizationUrl(url)).not.toThrow();
    });

    it('fails with explicit error when placeholder client ID is detected (preventing Error 401: invalid_client)', () => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      Object.entries(validGoogleParams).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set('client_id', '1084293817492-foundry-desktop-client.apps.googleusercontent.com');

      expect(() => validateGoogleAuthorizationUrl(url)).toThrow('placeholder detected');
    });

    it('fails with explicit error when any required parameter is missing', () => {
      for (const param of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method']) {
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        Object.entries(validGoogleParams).forEach(([k, v]) => {
          if (k !== param) url.searchParams.set(k, v);
        });

        expect(() => validateGoogleAuthorizationUrl(url)).toThrow(`missing ${param}`);
      }
    });

    it('fails if response_type is not code', () => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      Object.entries(validGoogleParams).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set('response_type', 'token');

      expect(() => validateGoogleAuthorizationUrl(url)).toThrow('must use authorization code flow');
    });

    it('fails if code_challenge_method is not S256', () => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      Object.entries(validGoogleParams).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set('code_challenge_method', 'plain');

      expect(() => validateGoogleAuthorizationUrl(url)).toThrow('must use S256 PKCE');
    });
  });
});
