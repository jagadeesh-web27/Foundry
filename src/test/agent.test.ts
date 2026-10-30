import { describe, it, expect, vi } from 'vitest';
import { parseUserIntent } from '@/services/agent/intentParser';
import { agentRunner } from '@/services/agent/agentRunner';
import { computerTools, AgentContext } from '@/services/agent/tools';
import { IndexedFile, IndexedFolder } from '@/types/file';

describe('Foundry Intelligence Engine & Agent Architecture', () => {
  const now = new Date();
  const todayIso = now.toISOString();
  const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sep15Iso = '2026-09-15T14:00:00.000Z';

  const mockFolders: IndexedFolder[] = [
    {
      id: 'f1',
      name: 'Foundry',
      path: 'C:\\Users\\User\\Projects\\Foundry',
      createdAt: todayIso,
      modifiedAt: todayIso,
      itemCount: 14,
    },
    {
      id: 'f2',
      name: 'Interview Preparation',
      path: 'C:\\Users\\User\\Documents\\Interview Preparation',
      createdAt: todayIso,
      modifiedAt: todayIso,
      itemCount: 8,
    },
    {
      id: 'f3',
      name: 'Project Files',
      path: 'C:\\Users\\User\\Desktop\\Project Files',
      createdAt: todayIso,
      modifiedAt: todayIso,
      itemCount: 22,
    },
    {
      id: 'f4',
      name: 'Tax 2024',
      path: 'C:\\Users\\User\\Documents\\Tax 2024',
      createdAt: '2024-03-01T10:00:00.000Z',
      modifiedAt: '2024-03-01T10:00:00.000Z',
      itemCount: 5,
    },
  ];

  const mockFiles: IndexedFile[] = [
    {
      id: 'doc1',
      name: 'Jagadeesh_Resume_2026.pdf',
      path: 'C:\\Users\\User\\Documents\\Jagadeesh_Resume_2026.pdf',
      extension: 'pdf',
      size: 250000,
      createdAt: todayIso,
      modifiedAt: todayIso,
      fileType: 'Document',
      indexedAt: todayIso,
      status: 'indexed',
    },
    {
      id: 'doc2',
      name: 'Jagadeesh_Resume_Old.pdf',
      path: 'C:\\Users\\User\\Documents\\Jagadeesh_Resume_Old.pdf',
      extension: 'pdf',
      size: 210000,
      createdAt: '2025-01-10T10:00:00.000Z',
      modifiedAt: '2025-01-10T10:00:00.000Z',
      fileType: 'Document',
      indexedAt: todayIso,
      status: 'indexed',
    },
    {
      id: 'doc3',
      name: 'Offer_Letter_Senior_Engineer.pdf',
      path: 'C:\\Users\\User\\Documents\\Offer_Letter_Senior_Engineer.pdf',
      extension: 'pdf',
      size: 320000,
      createdAt: yesterdayIso,
      modifiedAt: yesterdayIso,
      fileType: 'Document',
      indexedAt: todayIso,
      status: 'indexed',
    },
    {
      id: 'img1',
      name: 'Marriage_Ceremony_Reception.jpg',
      path: 'C:\\Users\\User\\Pictures\\Marriage_Ceremony_Reception.jpg',
      extension: 'jpg',
      size: 4500000,
      createdAt: '2025-11-20T10:00:00.000Z',
      modifiedAt: '2025-11-20T10:00:00.000Z',
      fileType: 'Image',
      indexedAt: todayIso,
      status: 'indexed',
      qualityScore: 0.95,
    },
    {
      id: 'vid1',
      name: 'Screen_Recording_Foundry_Demo.mp4',
      path: 'C:\\Users\\User\\Videos\\Screen_Recording_Foundry_Demo.mp4',
      extension: 'mp4',
      size: 55000000,
      createdAt: sep15Iso,
      modifiedAt: sep15Iso,
      fileType: 'Video',
      indexedAt: todayIso,
      status: 'indexed',
      isScreenRecording: true,
    },
    {
      id: 'note1',
      name: 'React_Notes.md',
      path: 'C:\\Users\\User\\Documents\\React_Notes.md',
      extension: 'md',
      size: 15000,
      createdAt: todayIso,
      modifiedAt: todayIso,
      fileType: 'Document',
      indexedAt: todayIso,
      status: 'indexed',
    },
  ];

  const mockContext: AgentContext = {
    indexedFiles: mockFiles,
    indexedFolders: mockFolders,
    openFile: vi.fn().mockResolvedValue(true),
    revealFile: vi.fn().mockResolvedValue(true),
  };

  describe('Natural Language Intent Understanding (No Literal Searching)', () => {
    it('understands "Is there any folder I created today?" as structured folder search with date constraint', () => {
      const plan = parseUserIntent('Is there any folder I created today?');
      expect(plan.targetObject).toBe('FOLDER');
      expect(plan.intent).toBe('SEARCH_FOLDERS');
      expect(plan.temporalConstraint).toBeDefined();
      expect(plan.temporalConstraint?.label).toBe('today');
      expect(plan.temporalConstraint?.dateField).toBe('created');
      // Must NOT search for conversational filler
      expect(plan.keywords).not.toContain('is');
      expect(plan.keywords).not.toContain('there');
      expect(plan.keywords).not.toContain('folder');
    });

    it('understands "Give me my resume PDFs" with document object, pdf extension, and resume keyword', () => {
      const plan = parseUserIntent('Give me my resume PDFs');
      expect(plan.targetObject).toBe('DOCUMENT');
      expect(plan.extension).toBe('pdf');
      expect(plan.keywords).toContain('resume');
      expect(plan.semanticTopics).toContain('employment');
    });

    it('understands "What files did I work on today?" with modified date condition', () => {
      const plan = parseUserIntent('What files did I work on today?');
      expect(plan.targetObject).toBe('FILE');
      expect(plan.temporalConstraint).toBeDefined();
      expect(plan.temporalConstraint?.dateField).toBe('modified');
      expect(plan.temporalConstraint?.label).toBe('today');
    });

    it('understands "Show me screen recordings from September 15"', () => {
      const plan = parseUserIntent('Show me screen recordings from September 15');
      expect(plan.targetObject).toBe('VIDEO');
      expect(plan.isScreenRecording).toBe(true);
      expect(plan.temporalConstraint).toBeDefined();
      expect(plan.temporalConstraint?.label).toBe('September 15');
    });
  });

  describe('Safe Computer Tools', () => {
    it('searchFolders correctly filters folders by creation date', async () => {
      const todayPlan = parseUserIntent('Is there any folder I created today?');
      const results = await computerTools.searchFolders.execute(
        {
          createdAfter: todayPlan.temporalConstraint?.after,
          createdBefore: todayPlan.temporalConstraint?.before,
        },
        mockContext
      );

      expect(results.length).toBe(3);
      expect(results.map((r) => r.name)).toEqual(
        expect.arrayContaining(['Foundry', 'Interview Preparation', 'Project Files'])
      );
    });

    it('searchFiles filters files by extension and keyword', async () => {
      const results = await computerTools.searchFiles.execute(
        {
          extension: 'pdf',
          query: 'resume',
        },
        mockContext
      );

      expect(results.length).toBe(2);
      expect(results.every((f) => f.name.toLowerCase().includes('resume'))).toBe(true);
    });
  });

  describe('Agent Loop & Autonomous Response', () => {
    it('Example 1: correctly answers "Is there any folder I created today?" with folder list', async () => {
      const response = await agentRunner.run('Is there any folder I created today?', mockContext);

      expect(response.toolsExecuted).toContain('searchFolders');
      expect(response.folders).toBeDefined();
      expect(response.folders?.length).toBe(3);
      expect(response.folders?.map((f) => f.name)).toEqual(
        expect.arrayContaining(['Foundry', 'Interview Preparation', 'Project Files'])
      );
      expect(response.message).toMatch(/I found \*\*?3\*\*? folders created today/i);
    });

    it('Example 1 (empty case): returns graceful explanation when no folders match', async () => {
      const emptyContext: AgentContext = {
        ...mockContext,
        indexedFolders: [mockFolders[3]], // Only 2024 folder
      };

      const response = await agentRunner.run('Is there any folder I created today?', emptyContext);

      expect(response.folders?.length).toBe(0);
      expect(response.message).toBe("I couldn't find any folders created today.");
    });

    it('Example 2: "Give me my resume PDFs" returns resume documents', async () => {
      const response = await agentRunner.run('Give me my resume PDFs', mockContext);

      expect(response.toolsExecuted).toContain('searchFiles');
      expect(response.files).toBeDefined();
      expect(response.files?.length).toBeGreaterThan(0);
      expect(response.files?.[0].extension).toBe('pdf');
      expect(response.message).toContain('resume');
    });

    it('Example 3: "What files did I work on today?" returns files modified today', async () => {
      const response = await agentRunner.run('What files did I work on today?', mockContext);

      expect(response.toolsExecuted).toContain('searchFiles');
      expect(response.files).toBeDefined();
      expect(response.files?.length).toBeGreaterThan(0);
      expect(response.files?.every((f) => f.modifiedAt === todayIso)).toBe(true);
    });

    it('Example 4: "Find the offer letter from my company" returns offer letter', async () => {
      const response = await agentRunner.run('Find the offer letter from my company', mockContext);

      expect(response.toolsExecuted).toContain('searchFiles');
      expect(response.files).toBeDefined();
      expect(response.files?.some((f) => f.name.includes('Offer_Letter'))).toBe(true);
    });

    it('Example 5: "Find my marriage photos" returns wedding pictures', async () => {
      const response = await agentRunner.run('Find my marriage photos', mockContext);

      expect(response.toolsExecuted).toContain('searchFiles');
      expect(response.files?.some((f) => f.name.includes('Marriage'))).toBe(true);
      expect(response.message).toContain('marriage photos');
    });

    it('Example 6: "Show me screen recordings from September 15" finds video demo', async () => {
      const response = await agentRunner.run('Show me screen recordings from September 15', mockContext);

      expect(response.toolsExecuted).toContain('searchFiles');
      expect(response.files?.some((f) => f.name.includes('Screen_Recording'))).toBe(true);
    });

    it('Multi-step intelligence: "Summarize my React notes" reads content and provides summary', async () => {
      const response = await agentRunner.run('Summarize my React notes', mockContext);

      expect(response.toolsExecuted).toContain('searchFiles');
      expect(response.toolsExecuted.some((t) => t.startsWith('readFile'))).toBe(true);
      expect(response.message).toContain('React_Notes.md');
    });

    // ────── APPLICATION LAUNCHING & RUNNING APPS TESTS ──────
    describe('Application Launching & Running Applications Intent Distinction', () => {
      it('Installed app: "Can you open the Teams app?" resolves Microsoft Teams and requires explicit confirmation', async () => {
        const response = await agentRunner.run('Can you open the Teams app?', mockContext);

        expect(response.toolsExecuted).toContain('openApplication');
        expect(response.toolsExecuted).not.toContain('searchFolders');
        expect(response.toolsExecuted).not.toContain('searchFiles');
        expect(response.pendingAction).toBeDefined();
        expect(response.pendingAction?.type).toBe('open_application');
        expect(response.pendingAction?.appName).toBe('Microsoft Teams');
        expect(response.message).toContain('Microsoft Teams');
      });

      it('Installed app: "Open Teams" resolves Microsoft Teams and requests confirmation', async () => {
        const response = await agentRunner.run('Open Teams', mockContext);

        expect(response.toolsExecuted).toContain('openApplication');
        expect(response.pendingAction).toBeDefined();
        expect(response.pendingAction?.appName).toBe('Microsoft Teams');
      });

      it('Uninstalled app: "Open SomeRandomApplicationThatDoesNotExist" reports not installed', async () => {
        const response = await agentRunner.run('Open SomeRandomApplicationThatDoesNotExist', mockContext);

        expect(response.toolsExecuted).toContain('openApplication');
        expect(response.pendingAction).toBeUndefined();
        expect(response.message.toLowerCase()).toContain('not installed');
      });

      it('Application details: "Is Teams installed?" retrieves application details', async () => {
        const details = await computerTools.getApplicationDetails.execute({ application: 'Teams' });
        expect(details.found).toBe(true);
        expect(details.displayName).toBe('Microsoft Teams');
        expect(details.version).toBeDefined();
        expect(details.source).toBe('AppX/MSIX');
      });

      it('Installed app: "Launch Chrome" resolves application and requires explicit user confirmation', async () => {
        const response = await agentRunner.run('Launch Chrome', mockContext);

        expect(response.toolsExecuted).toContain('openApplication');
        expect(response.pendingAction).toBeDefined();
        expect(response.pendingAction?.type).toBe('open_application');
        expect(response.pendingAction?.appName).toBe('Google Chrome');
        expect(response.message).toContain('I found Google Chrome. Do you want me to open it?');
      });

      it('Installed app: "Open VS Code" resolves Visual Studio Code and requests confirmation', async () => {
        const response = await agentRunner.run('Open VS Code', mockContext);

        expect(response.toolsExecuted).toContain('openApplication');
        expect(response.pendingAction).toBeDefined();
        expect(response.pendingAction?.appName).toBe('Visual Studio Code');
      });

      it('System app: "Start Notepad" resolves Notepad and requests confirmation', async () => {
        const response = await agentRunner.run('Start Notepad', mockContext);

        expect(response.toolsExecuted).toContain('openApplication');
        expect(response.pendingAction).toBeDefined();
        expect(response.pendingAction?.appName).toBe('Notepad');
      });

      it('Running apps: "Is Teams currently open?" executes getRunningApplications (read-only)', async () => {
        const response = await agentRunner.run('Is Teams currently open?', mockContext);

        expect(response.toolsExecuted).toContain('getRunningApplications');
        expect(response.pendingAction).toBeUndefined();
        expect(response.message.toLowerCase()).toContain('not currently open');
      });

      it('Running apps: "What applications are currently open?" returns active app list without confirmation', async () => {
        const response = await agentRunner.run('What applications are currently open?', mockContext);

        expect(response.toolsExecuted).toContain('getRunningApplications');
        expect(response.pendingAction).toBeUndefined();
        expect(response.message).toContain('running on your computer');
      });

      it('Filesystem folder query: "Find the Teams folder" calls searchFolders instead of openApplication', async () => {
        const response = await agentRunner.run('Find the Teams folder', mockContext);

        expect(response.toolsExecuted).toContain('searchFolders');
        expect(response.toolsExecuted).not.toContain('openApplication');
      });

      it('General AI query: "What is Microsoft Teams?" does not execute application tools', async () => {
        const response = await agentRunner.run('What is Microsoft Teams?', mockContext);

        expect(response.toolsExecuted).not.toContain('openApplication');
        expect(response.toolsExecuted).not.toContain('getRunningApplications');
      });
    });

    describe('Dynamic Computer-Agent Behavior & Tool Execution', () => {
      it('TEST 1: "What is the network status" executes getNetworkInformation and returns real network info', async () => {
        const response = await agentRunner.run('What is the network status', mockContext);

        expect(response.toolsExecuted).toContain('getNetworkInformation');
        expect(response.message.toLowerCase()).toContain('network status');
        expect(response.message).toContain('Wi-Fi');
        expect(response.message).toContain('IP Address');
      });

      it('TEST 1b: "What is my IP address" retrieves network information', async () => {
        const response = await agentRunner.run('What is my IP address', mockContext);

        expect(response.toolsExecuted).toContain('getNetworkInformation');
        expect(response.message).toContain('192.168.1.105');
      });

      it('TEST 2: "which one the largest file" sorts by real file metadata size and returns top file', async () => {
        const response = await agentRunner.run('which one the largest file', mockContext);

        expect(response.toolsExecuted).toContain('searchFiles');
        expect(response.files).toBeDefined();
        expect(response.files!.length).toBe(1);
        expect(response.files![0].name).toBe('Screen_Recording_Foundry_Demo.mp4');
        expect(response.message).toContain('Screen_Recording_Foundry_Demo.mp4');
        expect(response.message).toContain('MB');
      });

      it('TEST 3: "What is the large size video present in the system" filters by video and sorts by size', async () => {
        const response = await agentRunner.run('What is the large size video present in the system', mockContext);

        expect(response.toolsExecuted).toContain('searchFiles');
        expect(response.files).toBeDefined();
        expect(response.files!.length).toBe(1);
        expect(response.files![0].name).toBe('Screen_Recording_Foundry_Demo.mp4');
        expect(response.message).toContain('Screen_Recording_Foundry_Demo.mp4');
        // Crucial: Must NEVER contain raw tool-call JSON in the message
        expect(response.message).not.toContain('{"tool"');
        expect(response.message).not.toContain('"arguments"');
      });

      it('TEST 4: multi-tool parser handles concatenated tool call JSON blocks without SyntaxError', async () => {
        const { dynamicAgent } = await import('@/services/agent/dynamicAgent');

        const multiToolResponse = `
{
  "tool": "searchFiles",
  "arguments": {
    "extension": "mp4"
  }
}

{
  "tool": "searchFiles",
  "arguments": {
    "extension": "mkv"
  }
}
`;
        const parsed = dynamicAgent.parseToolCalls(multiToolResponse);
        expect(parsed.length).toBe(2);
        expect(parsed[0].name).toBe('searchFiles');
        expect(parsed[0].arguments).toEqual({ extension: 'mp4' });
        expect(parsed[1].name).toBe('searchFiles');
        expect(parsed[1].arguments).toEqual({ extension: 'mkv' });
      });

      it('TEST 5: multi-tool parser handles JSON array format [ { tool: ... }, { tool: ... } ]', async () => {
        const { dynamicAgent } = await import('@/services/agent/dynamicAgent');

        const arrayToolResponse = JSON.stringify([
          { tool: 'searchFiles', arguments: { extension: 'mp4' } },
          { tool: 'searchFiles', arguments: { extension: 'mkv' } },
        ]);
        const parsed = dynamicAgent.parseToolCalls(arrayToolResponse);
        expect(parsed.length).toBe(2);
        expect(parsed[0].name).toBe('searchFiles');
        expect(parsed[1].name).toBe('searchFiles');
      });

      it('TEST 6: dynamic agent executes multi-tool calls iteratively and never returns raw JSON to user', async () => {
        const { dynamicAgent } = await import('@/services/agent/dynamicAgent');

        // Mock AI service that returns multi-tool JSON in first turn, and natural-language summary in second turn
        let turn = 0;
        const mockAiService = {
          checkStatus: vi.fn().mockResolvedValue({ isAvailable: true }),
          getProvider: () => ({
            chat: vi.fn().mockImplementation(async () => {
              turn++;
              if (turn === 1) {
                return `{
  "tool": "searchFiles",
  "arguments": {
    "fileTypes": ["Video"],
    "sortBy": "size",
    "sortOrder": "desc",
    "limit": 1
  }
}`;
              }
              return "Your largest video is Screen_Recording_Foundry_Demo.mp4, located at C:\\Users\\User\\Videos\\Screen_Recording_Foundry_Demo.mp4. Its size is about 52.45 MB.";
            }),
          }),
        };

        dynamicAgent.aiService = mockAiService as any;

        const result = await dynamicAgent.run('What is the largest video present in the system', mockContext);
        expect(result.toolsExecuted).toContain('searchFiles');
        expect(result.message).toContain('Screen_Recording_Foundry_Demo.mp4');
        expect(result.message).not.toContain('{"tool"');
        expect(result.message).not.toContain('"arguments"');
      });

      it('TEST 7: "give accessibility tester resume present in the system" ranks target resume top #1 and penalizes bug reports', async () => {
        const testFiles: IndexedFile[] = [
          {
            id: 'f_target',
            name: 'Jagadeesh_Accessibility_Tester.pdf',
            path: 'C:\\Users\\jagadeesh\\Downloads\\Jagadeesh_Accessibility_Tester.pdf',
            extension: 'pdf',
            size: 98000,
            createdAt: todayIso,
            modifiedAt: todayIso,
            fileType: 'Document',
            indexedAt: todayIso,
            status: 'indexed',
          },
          {
            id: 'f_general_resume',
            name: 'Jagadeesh_Professional_Resume_Final.pdf',
            path: 'C:\\Users\\jagadeesh\\Documents\\Jagadeesh_Professional_Resume_Final.pdf',
            extension: 'pdf',
            size: 120000,
            createdAt: todayIso,
            modifiedAt: todayIso,
            fileType: 'Document',
            indexedAt: todayIso,
            status: 'indexed',
          },
          {
            id: 'f_bug_report',
            name: 'Accessibility Bug Report - Bangalore Airport.xlsx',
            path: 'C:\\Users\\jagadeesh\\Documents\\Accessibility Bug Report - Bangalore Airport.xlsx',
            extension: 'xlsx',
            size: 450000,
            createdAt: todayIso,
            modifiedAt: todayIso,
            fileType: 'Spreadsheet',
            indexedAt: todayIso,
            status: 'indexed',
          },
          {
            id: 'f_audit',
            name: 'Accessibility_Audit_Report.docx',
            path: 'C:\\Users\\jagadeesh\\Documents\\Accessibility_Audit_Report.docx',
            extension: 'docx',
            size: 150000,
            createdAt: todayIso,
            modifiedAt: todayIso,
            fileType: 'Document',
            indexedAt: todayIso,
            status: 'indexed',
          },
          {
            id: 'f_readme',
            name: 'README.md',
            path: 'C:\\Users\\jagadeesh\\Projects\\README.md',
            extension: 'md',
            size: 4000,
            createdAt: todayIso,
            modifiedAt: todayIso,
            fileType: 'Document',
            indexedAt: todayIso,
            status: 'indexed',
          },
        ];

        const customContext: AgentContext = {
          ...mockContext,
          indexedFiles: testFiles,
        };

        const results = await computerTools.searchFiles.execute(
          { query: 'give accessibility tester resume present in the system' },
          customContext
        );

        // Target resume must be ranked #1
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('Jagadeesh_Accessibility_Tester.pdf');
        
        // Bug report and audit report must rank lower or be penalized
        const targetIdx = results.findIndex((r) => r.name === 'Jagadeesh_Accessibility_Tester.pdf');
        const generalResumeIdx = results.findIndex((r) => r.name === 'Jagadeesh_Professional_Resume_Final.pdf');
        const bugReportIdx = results.findIndex((r) => r.name.includes('Bug Report'));

        expect(targetIdx).toBe(0);
        if (generalResumeIdx !== -1) {
          expect(targetIdx).toBeLessThan(generalResumeIdx);
        }
        if (bugReportIdx !== -1) {
          expect(targetIdx).toBeLessThan(bugReportIdx);
        }
      });
    });
  });
});
