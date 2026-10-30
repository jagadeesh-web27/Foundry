import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { followUpEngine } from '@/services/followup/followUpEngine';
import { goalEngine } from '@/services/goals/goalEngine';
import { digitalOrganizerEngine } from '@/services/organization/digitalOrganizerEngine';
import { documentAssistantEngine } from '@/services/documents/documentAssistantEngine';
import { productivityEngine } from '@/services/productivity/productivityEngine';
import { agentRunner } from '@/services/agent/agentRunner';
import { db } from '@/services/db/database';

describe('Foundry Daily-Use AI Assistant & Operating Layer', () => {
  beforeEach(async () => {
    // Seed some test data into IndexedDB
    await db.upsertTask({
      id: 'task_daily_1',
      title: 'Submit weekly team status report',
      status: 'todo',
      priority: 'high',
      dueDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('FollowUpEngine', () => {
    it('creates and lists follow-up commitments', async () => {
      const item = await followUpEngine.createFollowUp({
        title: 'Waiting for HR offer letter',
        type: 'waiting_for',
        targetPerson: 'HR Director',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(item.id).toBeDefined();
      expect(item.status).toBe('pending');
      expect(item.targetPerson).toBe('HR Director');

      const list = await followUpEngine.listFollowUps('pending');
      expect(list.some((f) => f.id === item.id)).toBe(true);

      const resolved = await followUpEngine.resolveFollowUp(item.id);
      expect(resolved).toBe(true);

      const pendingAfter = await followUpEngine.listFollowUps('pending');
      expect(pendingAfter.some((f) => f.id === item.id)).toBe(false);
    });

    it('heuristically detects potential follow-ups from natural conversational statements', () => {
      const text1 = 'I am waiting for Rahul to send the API documentation';
      const res1 = followUpEngine.detectPotentialFollowUp(text1);
      expect(res1.detected).toBe(true);
      expect(res1.suggestion?.type).toBe('waiting_for');

      const text2 = 'I need to send the financial audit report to Priya tomorrow';
      const res2 = followUpEngine.detectPotentialFollowUp(text2);
      expect(res2.detected).toBe(true);
      expect(res2.suggestion?.targetPerson).toBe('Priya');
    });
  });

  describe('GoalEngine & Progress Memory', () => {
    it('creates goal and recalculates progress dynamically upon milestone completion', async () => {
      const goal = await goalEngine.createGoal({
        title: 'Interview Preparation',
        category: 'Career',
        steps: [
          'Review resume and skills',
          'Practice system design mock questions',
          'Review Foundry project architecture',
        ],
      });

      expect(goal.id).toBeDefined();
      expect(goal.progress).toBe(0);
      expect(goal.steps.length).toBe(3);

      // Toggle first milestone
      const updated = await goalEngine.toggleStep(goal.id, goal.steps[0].id);
      expect(updated).not.toBeNull();
      expect(updated!.progress).toBe(33);
      expect(updated!.steps[0].completed).toBe(true);
      expect(updated!.nextAction).toBe('Practice system design mock questions');
    });

    it('resumes ongoing goal from conversational request', async () => {
      await goalEngine.createGoal({
        title: 'Ship Foundry v2 Release',
        category: 'Development',
        steps: ['Implement Today dashboard', 'Run tests', 'Tag v2.0 release'],
      });

      const resume = await goalEngine.resumeGoal('Foundry v2');
      expect(resume.found).toBe(true);
      expect(resume.goal?.title).toBe('Ship Foundry v2 Release');
      expect(resume.message).toContain('Ship Foundry v2 Release');
    });
  });

  describe('DigitalOrganizerEngine & Downloads Intelligence', () => {
    it('generates a structured downloads organization plan without modifying files silently', async () => {
      const proposal = await digitalOrganizerEngine.proposeDownloadsOrganization();
      expect(proposal.id).toBeDefined();
      expect(proposal.type).toBe('downloads_organization');
      expect(proposal.status).toBe('proposed');
      expect(Array.isArray(proposal.items)).toBe(true);
    });

    it('classifies downloads categories', async () => {
      const classification = await digitalOrganizerEngine.classifyDownloads();
      expect(classification.totalFiles).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(classification.categories)).toBe(true);
    });
  });

  describe('DocumentAssistantEngine', () => {
    it('summarizes document text cleanly', async () => {
      const summary = await documentAssistantEngine.summarizeDocument('test/sample_notes.txt');
      expect(summary.fileName).toBe('sample_notes.txt');
      expect(Array.isArray(summary.keyPoints)).toBe(true);
    });

    it('extracts action items and dates from text', async () => {
      const actions = await documentAssistantEngine.extractActionItems('test/notes.txt');
      expect(Array.isArray(actions)).toBe(true);

      const dates = await documentAssistantEngine.extractDates('test/notes.txt');
      expect(Array.isArray(dates)).toBe(true);
    });
  });

  describe('Productivity Planning & Daily Intelligence', () => {
    it('synthesizes "What should I do today?" based on due tasks and goals', async () => {
      const focus = await productivityEngine.getWhatShouldIDoToday();
      expect(focus.headline).toBeDefined();
      expect(focus.summary).toContain('Daily Focus Recommendation');
    });

    it('generates a factual daily activity summary', async () => {
      const activity = await productivityEngine.getDailyActivitySummary();
      expect(activity.date).toBeDefined();
      expect(activity.narrative).toContain('Today');
    });
  });

  describe('AgentRunner Daily Assistant Routing', () => {
    const mockContext = {
      indexedFiles: [],
      indexedFolders: [],
      openFile: async () => true,
      revealFile: async () => true,
    };

    it('routes "What should I do today?" to daily focus planning', async () => {
      const res = await agentRunner.run('What should I do today?', mockContext);
      expect(res.toolsExecuted).toContain('getWhatShouldIDoToday');
      expect(res.message).toBeDefined();
      expect(res.plan?.intent).toBe('DAILY_FOCUS');
    });

    it('routes "Why is my computer slow?" to troubleshooter', async () => {
      const res = await agentRunner.run('Why is my computer slow?', mockContext);
      expect(res.toolsExecuted).toContain('troubleshootComputer');
      expect(res.message).toBeDefined();
      expect(res.plan?.intent).toBe('COMPUTER_TROUBLESHOOT');
    });

    it('routes "What is in my downloads folder?" to downloads breakdown', async () => {
      const res = await agentRunner.run("What's in my downloads folder?", mockContext);
      expect(res.toolsExecuted).toContain('classifyDownloads');
      expect(res.message).toContain('Downloads');
      expect(res.plan?.intent).toBe('DOWNLOADS_BREAKDOWN');
    });

    it('routes "Find duplicate files" to storage cleanup tool', async () => {
      const res = await agentRunner.run('Find duplicate files', mockContext);
      expect(res.toolsExecuted).toContain('analyzeStorageCleanup');
      expect(res.message).toContain('duplicate');
      expect(res.plan?.intent).toBe('DUPLICATE_FILES');
    });
  });
});
