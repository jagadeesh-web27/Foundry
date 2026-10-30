import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { dateResolver } from '@/services/commitments/dateResolver';
import { confidenceEngine } from '@/services/commitments/confidenceEngine';
import { messageAnalyzer } from '@/services/commitments/messageAnalyzer';
import { commitmentStore } from '@/services/commitments/commitmentStore';
import { connectorRegistry } from '@/services/connectors/core/connectorRegistry';
import { agentRunner } from '@/services/agent/agentRunner';

describe('Foundry AI Operating Layer - Commitment Intelligence & Connectors', () => {
  describe('Temporal Reasoning & DateResolver', () => {
    const fixedRef = new Date('2026-09-22T10:00:00Z'); // A Tuesday

    it('resolves "today" and "by EOD"', () => {
      const res = dateResolver.resolve('by EOD', fixedRef);
      expect(res).not.toBeNull();
      expect(res!.date.getHours()).toBe(17);
      expect(res!.date.getDate()).toBe(fixedRef.getDate());
    });

    it('resolves "tomorrow"', () => {
      const res = dateResolver.resolve('tomorrow', fixedRef);
      expect(res).not.toBeNull();
      expect(res!.date.getDate()).toBe(fixedRef.getDate() + 1);
    });

    it('resolves relative weekdays (e.g. "Friday")', () => {
      const res = dateResolver.resolve('Friday', fixedRef);
      expect(res).not.toBeNull();
      // Tuesday (2) to Friday (5) -> diff is 3 days
      expect(res!.date.getDay()).toBe(5);
    });

    it('resolves "next Monday"', () => {
      const res = dateResolver.resolve('next Monday', fixedRef);
      expect(res).not.toBeNull();
      expect(res!.date.getDay()).toBe(1);
    });

    it('resolves "in two days"', () => {
      const res = dateResolver.resolve('in two days', fixedRef);
      expect(res).not.toBeNull();
      expect(res!.date.getDate()).toBe(fixedRef.getDate() + 2);
    });

    it('extracts date expressions from natural language text', () => {
      const expressions = dateResolver.extractExpressions('Please send the draft by tomorrow afternoon and submit the form before Friday.', fixedRef);
      expect(expressions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Confidence Scoring & Over-Detection Prevention', () => {
    it('gives high confidence (>0.85) to explicit affirmations', () => {
      const assessment = confidenceEngine.evaluate("I'll definitely send the resume tomorrow.", true);
      expect(assessment.confidence).toBeGreaterThanOrEqual(0.85);
      expect(assessment.isTentative).toBe(false);
    });

    it('penalizes tentative modal verbs and marks as tentative', () => {
      const assessment = confidenceEngine.evaluate('Maybe I will try to send it next week.', true);
      expect(assessment.confidence).toBeLessThan(0.75);
      expect(assessment.isTentative).toBe(true);
    });

    it('disqualifies dismissals and negations ("Don\'t worry about the report")', () => {
      const assessment = confidenceEngine.evaluate("Don't worry about the report, it's already done.", false);
      expect(assessment.confidence).toBeLessThanOrEqual(0.2);
      expect(assessment.isTentative).toBe(true);
    });

    it('disqualifies generic acknowledgments ("Thanks, received")', () => {
      const assessment = confidenceEngine.evaluate('Thanks, received.', false);
      expect(assessment.confidence).toBeLessThanOrEqual(0.2);
    });
  });

  describe('MessageAnalyzer Linguistic Extractions', () => {
    const testRef = new Date('2026-09-22T10:00:00Z');

    it('detects PROMISE from "I\'ll send the resume by Friday"', () => {
      const candidates = messageAnalyzer.analyzeText("I'll send the resume by Friday.", { referenceDate: testRef });
      expect(candidates.length).toBe(1);
      expect(candidates[0].type).toBe('PROMISE');
      expect(candidates[0].action.toLowerCase()).toContain('send the resume');
      expect(candidates[0].dueAt).toBeDefined();
      expect(candidates[0].confidence).toBeGreaterThan(0.7);
    });

    it('detects DEADLINE from "Please submit the form by tomorrow"', () => {
      const candidates = messageAnalyzer.analyzeText('Please submit the form by tomorrow.', { referenceDate: testRef });
      expect(candidates.length).toBe(1);
      expect(candidates[0].type).toBe('DEADLINE');
      expect(candidates[0].action.toLowerCase()).toContain('submit the form');
      expect(candidates[0].dueAt).toBeDefined();
    });

    it('detects REQUEST from "Can you send me the report?"', () => {
      const candidates = messageAnalyzer.analyzeText('Can you send me the report?', { referenceDate: testRef });
      expect(candidates.length).toBe(1);
      expect(candidates[0].type).toBe('REQUEST');
      expect(candidates[0].action.toLowerCase()).toContain('send me the report');
    });

    it('detects WAITING_FOR from "Waiting on Rahul for the contract review"', () => {
      const candidates = messageAnalyzer.analyzeText('Waiting on Rahul for the contract review.', { referenceDate: testRef });
      expect(candidates.length).toBe(1);
      expect(candidates[0].type).toBe('WAITING_FOR');
      expect(candidates[0].action).toContain('Rahul');
    });

    it('detects FOLLOW_UP from "I\'ll confirm by EOD"', () => {
      const candidates = messageAnalyzer.analyzeText("I'll confirm by EOD.", { referenceDate: testRef });
      expect(candidates.length).toBe(1);
      expect(candidates[0].type).toBe('FOLLOW_UP');
      expect(candidates[0].dueAt).toBeDefined();
    });

    it('does NOT create commitments from polite conversation ("Thanks, received")', () => {
      const candidates = messageAnalyzer.analyzeText('Thanks, received.');
      expect(candidates.length).toBe(0);
    });
  });

  describe('CommitmentStore & Deduplication', () => {
    it('deduplicates identical commitments across sources', async () => {
      const item1 = {
        id: 'com_teams_1',
        type: 'PROMISE' as const,
        title: 'Send project proposal',
        status: 'PENDING' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        source: { provider: 'TEAMS' },
        person: { name: 'Rahul' },
        confidence: 0.85,
      };

      const item2 = {
        id: 'com_outlook_2',
        type: 'PROMISE' as const,
        title: 'Send project proposal',
        status: 'PENDING' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        source: { provider: 'OUTLOOK' },
        person: { name: 'Rahul' },
        confidence: 0.95,
      };

      await commitmentStore.addCommitment(item1);
      const merged = await commitmentStore.addCommitment(item2);

      expect(merged.confidence).toBe(0.95);
      const all = await commitmentStore.getCommitmentsForPerson('Rahul');
      expect(all.length).toBe(1);
    });

    it('correctly structures the 4 overview buckets for the Pending page', async () => {
      const overview = await commitmentStore.getOverview();
      expect(Array.isArray(overview.needToDo)).toBe(true);
      expect(Array.isArray(overview.waitingFor)).toBe(true);
      expect(Array.isArray(overview.peopleWaitingForMe)).toBe(true);
      expect(Array.isArray(overview.upcoming)).toBe(true);
    });
  });

  describe('Connectors & Security Boundaries', () => {
    it('declares official connectors in ConnectorRegistry', () => {
      const all = connectorRegistry.getAllConnectors();
      const ids = all.map((c) => c.id);
      expect(ids).toContain('microsoft_outlook');
      expect(ids).toContain('microsoft_teams');
      expect(ids).toContain('google_gmail');
      expect(ids).toContain('google_calendar');
      expect(ids).toContain('whatsapp_business');
    });

    it('strictly separates READ capabilities from ACTION capabilities', async () => {
      const outlook = connectorRegistry.getConnector('microsoft_outlook')!;
      expect(outlook.capabilities).toContain('READ_EMAIL');
      expect(outlook.capabilities).toContain('SEND_EMAIL');

      // Actions must fail if not confirmed
      const actionRes = await outlook.executeAction({
        action: 'SEND_EMAIL',
        payload: { to: 'test@example.com', subject: 'Test', body: 'Hello' },
        confirmed: false, // Unconfirmed
      });
      expect(actionRes.success).toBe(false);
      expect(actionRes.message).toContain('confirmation');
    });

    it('enforces WhatsApp compliance policy without scraping private databases', async () => {
      const wa = connectorRegistry.getConnector('whatsapp_business')!;
      const res = await wa.executeAction({
        action: 'SEND_MESSAGE',
        payload: { to: '12345', content: 'Hi' },
        confirmed: true,
      });
      expect(res.success).toBe(false);
      expect(res.message).toContain('WhatsApp integration is not available for this account');
    });
  });

  describe('Agent Dynamic Routing for Digital Life Queries', () => {
    const mockContext = {
      indexedFiles: [],
      indexedFolders: [],
      openFile: async () => true,
      revealFile: async () => true,
    };

    it('routes "What am I forgetting?" to getWhatAmIForgetting', async () => {
      const res = await agentRunner.run('What am I forgetting?', mockContext);
      expect(res.toolsExecuted).toContain('getWhatAmIForgetting');
      expect(res.message.length).toBeGreaterThan(0);
      expect(res.plan?.intent).toBe('WHAT_AM_I_FORGETTING');
    });

    it('routes "What did I promise Rahul?" to getPendingCommitments with person filter', async () => {
      const res = await agentRunner.run('What did I promise Rahul?', mockContext);
      expect(res.toolsExecuted).toContain('getPendingCommitments');
      expect(res.plan?.intent).toBe('PROMISES_QUERY');
      expect(res.plan?.person).toBe('Rahul');
    });

    it('routes "Who am I waiting for?" to getPendingCommitments with waitingFor category', async () => {
      const res = await agentRunner.run('Who am I waiting for?', mockContext);
      expect(res.toolsExecuted).toContain('getPendingCommitments');
      expect(res.plan?.intent).toBe('WAITING_FOR_QUERY');
    });

    it('routes "Who is waiting for me?" to getPendingCommitments with peopleWaitingOnMe category', async () => {
      const res = await agentRunner.run('Who is waiting for me?', mockContext);
      expect(res.toolsExecuted).toContain('getPendingCommitments');
      expect(res.plan?.intent).toBe('PEOPLE_WAITING_ON_ME');
    });

    it('routes "Prepare me for tomorrow\'s meeting" to prepareForMeeting tool', async () => {
      const res = await agentRunner.run("Prepare me for tomorrow's meeting", mockContext);
      expect(res.toolsExecuted).toContain('prepareForMeeting');
      expect(res.plan?.intent).toBe('PREPARE_MEETING');
      expect(res.trace).toBeDefined();
      expect(res.trace!.length).toBeGreaterThan(0);
    });

    it('includes verified execution trace with truthful provenance on "What am I forgetting?"', async () => {
      const res = await agentRunner.run('What am I forgetting?', mockContext);
      expect(res.trace).toBeDefined();
      expect(res.trace!.some((t) => t.action.includes('task store'))).toBe(true);
      expect(res.trace!.some((t) => t.action.includes('commitments'))).toBe(true);
    });
  });

  describe('Data-Truth Audit: Connector Status & Error Propagation', () => {
    it('TeamsConnector.sync throws explicit error when unauthenticated instead of returning empty array', async () => {
      const teams = connectorRegistry.getConnector('microsoft_teams')!;
      // Ensure disconnected state
      await teams.disconnect();
      await expect(teams.sync()).rejects.toThrow('Not authenticated');
    });

    it('OutlookConnector.sync throws explicit error when unauthenticated instead of returning empty array', async () => {
      const outlook = connectorRegistry.getConnector('microsoft_outlook')!;
      await outlook.disconnect();
      await expect(outlook.sync()).rejects.toThrow('Not authenticated');
    });

    it('ConnectorStatusManager truthfully classifies unconfigured connectors as not_connected', async () => {
      const { connectorStatusManager } = await import('@/services/connectors/core/connectorStatus');
      const status = await connectorStatusManager.getStatus('microsoft_outlook');
      expect(status).not.toBeNull();
      expect(status!.connected).toBe(false);
      expect(status!.dataState).toBe('not_connected');
    });
  });
});
