/**
 * Foundry Central Tool Registry
 * Manages all platform and agent tools with strict schemas, categorized capabilities,
 * permission levels, and dynamic LLM schema synthesis.
 */

import { computerService } from '@/services/native/computerService';
import { guardTool } from '@/services/permissions/permissionManager';

export type ToolCategory =
  | 'filesystem'
  | 'documents'
  | 'system'
  | 'network'
  | 'applications'
  | 'memory'
  | 'productivity'
  | 'automation'
  | 'developer'
  | 'accessibility';

export type PermissionLevel = 'READ' | 'WRITE' | 'ACTION' | 'PRIVILEGED';

export interface ToolExecutionContext {
  userId?: string;
  conversationId?: string;
  [key: string]: any;
}

export interface FoundryTool<TInput = any, TOutput = any> {
  name: string;
  displayName?: string;
  description: string;
  category: ToolCategory;
  permissionLevel: PermissionLevel;
  humanActivityPhrase?: string; // e.g. "Searching your files..."
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
}

export class ToolRegistry {
  private tools: Map<string, FoundryTool> = new Map();

  /**
   * Register a new tool in the central registry
   */
  public registerTool(tool: FoundryTool): void {
    // Enforce the user's permission settings on every execution, whichever code path calls the tool.
    this.tools.set(tool.name, { ...tool, execute: guardTool(tool.name, tool.execute.bind(tool)) });
  }

  /**
   * Register multiple tools at once
   */
  public registerTools(tools: FoundryTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Get a registered tool by name
   */
  public getTool(name: string): FoundryTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  public getAllTools(): FoundryTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  public getToolsByCategory(category: ToolCategory): FoundryTool[] {
    return this.getAllTools().filter((t) => t.category === category);
  }

  /**
   * Generate human-friendly system prompt descriptions for the runtime LLM
   */
  public getToolsPromptDescription(): string {
    const lines: string[] = ['Available tools:'];

    for (const tool of this.getAllTools()) {
      const argsList = Object.keys(tool.inputSchema.properties || {}).join(', ');
      lines.push(
        `- ${tool.name}: ${tool.description} (Arguments: { ${argsList} }) [Category: ${tool.category}, Level: ${tool.permissionLevel}]`
      );
    }

    return lines.join('\n');
  }

  /**
   * Generate OpenAI / Anthropic format function calling schemas
   */
  public getFunctionSchemas(): any[] {
    return this.getAllTools().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
}

export const toolRegistry = new ToolRegistry();

// Register all core platform tools
toolRegistry.registerTools([
  {
    name: 'searchFiles',
    // Schema and execution both delegate to computerTools.searchFiles (src/services/agent/tools.ts),
    // the one real implementation dynamicAgent and directRouter also call — this registry used to
    // define its own competing copy that called computerService.searchFilesLive directly, which
    // skipped the Android device-adapter selection computerTools.searchFiles does.
    displayName: 'Search Files',
    description: 'Search and sort files by query, type (Spreadsheet, Document, PDF, Video, Image, Audio, Code), extension, folder scope, or size/date comparison (largest, smallest, newest, oldest).',
    category: 'filesystem',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Searching your files...',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or query keyword to search for' },
        fileTypes: { type: 'array', items: { type: 'string' }, description: 'File categories such as Spreadsheet, Document, PDF, Video' },
        extension: { type: 'string', description: 'File extension without dot, e.g. xlsx, pdf' },
        scopePath: { type: 'string', description: 'Folder to search within, e.g. Downloads, Documents, DCIM' },
        sortBy: { type: 'string', enum: ['size', 'modified', 'created', 'name'] },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number', description: 'Maximum items to return' },
      },
    },
    execute: async (input) => {
      const { computerTools } = await import('@/services/agent/tools');
      return computerTools.searchFiles.execute(input, {
        indexedFiles: [], indexedFolders: [],
        openFile: async () => false, revealFile: async () => false,
      });
    },
  },
  {
    name: 'searchFolders',
    displayName: 'Search Folders',
    description: 'Search for directories or folders created or modified on the system.',
    category: 'filesystem',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Searching your folders...',
    inputSchema: {
      type: 'object',
      properties: {
        nameQuery: { type: 'string', description: 'Folder name search term' },
        limit: { type: 'number', description: 'Max folders to return' },
      },
    },
    execute: async (input) => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.searchFoldersLive(input);
    },
  },
  {
    name: 'readFileContent',
    displayName: 'Read File',
    description: 'Read the text or content of a file on the user device.',
    category: 'documents',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Reading document content...',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        maxChars: { type: 'number', description: 'Maximum characters to read' },
      },
      required: ['path'],
    },
    execute: async (input) => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.readFileContent(input.path, input.maxChars);
    },
  },
  {
    name: 'getFileMetadata',
    displayName: 'File Metadata',
    description: 'Get real file metadata including name, extension, type, size, and modified time from the active device.',
    category: 'filesystem',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Reading file metadata...',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path or Android content URI' },
      },
      required: ['path'],
    },
    execute: async (input) => {
      const { deviceService } = await import('@/services/device/deviceService');
      const adapter = deviceService.getAdapter();
      if (adapter.filesystem.getFileMetadata) return adapter.filesystem.getFileMetadata(input.path);
      return computerService.getFileMetadata(input.path);
    },
  },
  {
    name: 'getSystemInfo',
    displayName: 'System Hardware Info',
    description: 'Get real hardware specs: CPU brand, cores, RAM total/used/free, OS name/version, and system uptime.',
    category: 'system',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking system information...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.getSystemInfo();
    },
  },
  {
    name: 'getDiskInformation',
    displayName: 'Disk Storage Info',
    description: 'Get real disk drive storage info: volume names, total, free, and used space per partition.',
    category: 'system',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking disk drives...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.getDiskInformation();
    },
  },
  {
    name: 'getTopProcesses',
    displayName: 'Top Processes',
    description: 'Get top processes consuming CPU and RAM to diagnose computer performance or high memory usage.',
    category: 'system',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Inspecting top resource processes...',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of top processes to return (default: 10)' },
      },
    },
    execute: async (input) => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.getTopProcesses(input?.limit || 10);
    },
  },
  {
    name: 'getNetworkInformation',
    displayName: 'Network Status',
    description: 'Get real network connection status, Wi-Fi details, SSID, signal strength, and IP addresses.',
    category: 'network',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking network status...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.getNetworkInformation();
    },
  },
  {
    name: 'getRunningApplications',
    displayName: 'Running Applications',
    description: 'List user-facing applications currently open and running on the computer.',
    category: 'applications',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking open applications...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.getRunningApplications();
    },
  },
  {
    name: 'discoverInstalledApplications',
    displayName: 'Discover Installed Applications',
    description: 'Discover installed Windows programs, Start Menu applications, and AppX/Store packages.',
    category: 'applications',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Searching installed programs...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { computerService } = await import('@/services/native/computerService');
      return computerService.discoverInstalledApplications();
    },
  },
  {
    name: 'openApplication',
    displayName: 'Open Application',
    description: 'Launch an installed desktop application safely after explicit user confirmation.',
    category: 'applications',
    permissionLevel: 'ACTION',
    humanActivityPhrase: 'Launching application...',
    inputSchema: {
      type: 'object',
      properties: {
        application: { type: 'string', description: 'Name of the application to launch (e.g. Teams, Chrome)' },
      },
      required: ['application'],
    },
    execute: async (input) => {
      const { computerService } = await import('@/services/native/computerService');
      const resolved = await computerService.resolveInstalledApplication(input.application);
      if (!resolved.found || !resolved.targetPath) {
        throw new Error(`Application "${input.application}" was not found on this computer.`);
      }
      return computerService.launchApplication(resolved.targetPath);
    },
  },
  {
    name: 'storeMemory',
    displayName: 'Store Memory',
    description: 'Store a user preference, active project context, or important persistent information.',
    category: 'memory',
    permissionLevel: 'WRITE',
    humanActivityPhrase: 'Remembering personal context...',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory identifier or topic' },
        tier: { type: 'string', enum: ['short_term', 'long_term', 'preference', 'project', 'episodic'] },
        content: { type: 'string', description: 'Detailed knowledge to remember' },
      },
      required: ['key', 'content'],
    },
    execute: async (input) => {
      const { memoryEngine } = await import('@/services/memory/memoryEngine');
      return memoryEngine.save(input);
    },
  },
  {
    name: 'recallMemory',
    displayName: 'Recall Memory',
    description: 'Recall relevant memories and stored preferences matching a query.',
    category: 'memory',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Recalling memories...',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic or search phrase' },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const { memoryEngine } = await import('@/services/memory/memoryEngine');
      return memoryEngine.recall(input.query);
    },
  },
  {
    name: 'createTask',
    displayName: 'Create Task',
    description: 'Add a new task, follow-up, or reminder to the user productivity list.',
    category: 'productivity',
    permissionLevel: 'WRITE',
    humanActivityPhrase: 'Creating task...',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        dueDate: { type: 'string', description: 'ISO due date' },
      },
      required: ['title'],
    },
    execute: async (input) => {
      const { productivityEngine } = await import('@/services/productivity/productivityEngine');
      return productivityEngine.createTask(input);
    },
  },
  {
    name: 'listTasks',
    displayName: 'List Tasks',
    description: 'View active productivity tasks and reminders.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking your tasks...',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
      },
    },
    execute: async (input) => {
      const { productivityEngine } = await import('@/services/productivity/productivityEngine');
      return productivityEngine.listTasks(input?.status);
    },
  },
  {
    name: 'getDailyBriefing',
    displayName: 'Daily Briefing',
    description: 'Generate an intelligent morning briefing combining device status, pending tasks, and recent projects.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Compiling your daily briefing...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { productivityEngine } = await import('@/services/productivity/productivityEngine');
      return productivityEngine.getDailyBriefing();
    },
  },
  {
    name: 'inspectProject',
    displayName: 'Inspect Project',
    description: 'Inspect a software project repository, package.json / Cargo.toml manifests, and dependency count.',
    category: 'developer',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Inspecting software project...',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Project folder path' },
      },
    },
    execute: async (input) => {
      const { developerEngine } = await import('@/services/developer/developerEngine');
      return developerEngine.inspectProject(input?.dirPath);
    },
  },
  {
    name: 'getWhatShouldIDoToday',
    displayName: 'Daily Focus & Plan',
    description: 'Analyze tasks due today, high-priority items, pending follow-ups, and active goals to recommend what to focus on today.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Planning your day...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { productivityEngine } = await import('@/services/productivity/productivityEngine');
      return productivityEngine.getWhatShouldIDoToday();
    },
  },
  {
    name: 'getEndOfDaySummary',
    displayName: 'End-of-Day Summary',
    description: 'Generate a factual end-of-day summary of completed tasks, pending items, and files modified today.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Generating end-of-day summary...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { productivityEngine } = await import('@/services/productivity/productivityEngine');
      return productivityEngine.getEndOfDaySummary();
    },
  },
  {
    name: 'getDailyActivitySummary',
    displayName: 'Daily Activity Summary',
    description: 'Retrieve verified activity summary of tasks completed and files modified on your computer today.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking today’s activity...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { productivityEngine } = await import('@/services/productivity/productivityEngine');
      return productivityEngine.getDailyActivitySummary();
    },
  },
  {
    name: 'manageFollowUps',
    displayName: 'Manage Follow-Ups',
    description: 'Track promises, deadlines, and items waiting for other people or documents. Actions: list, create, resolve.',
    category: 'productivity',
    permissionLevel: 'WRITE',
    humanActivityPhrase: 'Managing follow-up commitments...',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'resolve'] },
        title: { type: 'string', description: 'Follow-up title or description' },
        type: { type: 'string', enum: ['task', 'promise', 'deadline', 'waiting_for', 'pending_approval', 'pending_document'] },
        targetPerson: { type: 'string', description: 'Name of person waiting on or promised to' },
        dueDate: { type: 'string', description: 'Due date ISO string' },
        id: { type: 'string', description: 'Follow-up ID to resolve' },
      },
    },
    execute: async (input) => {
      const { followUpEngine } = await import('@/services/followup/followUpEngine');
      if (input.action === 'create' && input.title) {
        return followUpEngine.createFollowUp({
          title: input.title,
          type: input.type || 'waiting_for',
          targetPerson: input.targetPerson,
          dueDate: input.dueDate,
        });
      }
      if (input.action === 'resolve' && input.id) {
        return followUpEngine.resolveFollowUp(input.id);
      }
      return followUpEngine.listFollowUps();
    },
  },
  {
    name: 'manageGoals',
    displayName: 'Manage Goals & Progress',
    description: 'Manage multi-step goals, track milestone progress %, update next actions, or resume work on an ongoing goal.',
    category: 'productivity',
    permissionLevel: 'WRITE',
    humanActivityPhrase: 'Updating goals and progress memory...',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'resume', 'update_progress', 'toggle_step'] },
        title: { type: 'string', description: 'Goal title' },
        category: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
        goalId: { type: 'string' },
        stepId: { type: 'string' },
        progress: { type: 'number' },
        nextAction: { type: 'string' },
        query: { type: 'string', description: 'Query to resume matching goal' },
      },
    },
    execute: async (input) => {
      const { goalEngine } = await import('@/services/goals/goalEngine');
      if (input.action === 'create' && input.title) {
        return goalEngine.createGoal({
          title: input.title,
          category: input.category,
          steps: input.steps,
        });
      }
      if (input.action === 'resume') {
        return goalEngine.resumeGoal(input.query || input.title || '');
      }
      if (input.action === 'toggle_step' && input.goalId && input.stepId) {
        return goalEngine.toggleStep(input.goalId, input.stepId);
      }
      if (input.action === 'update_progress' && input.goalId && input.progress !== undefined) {
        return goalEngine.updateGoalProgress(input.goalId, input.progress, input.nextAction);
      }
      return goalEngine.listGoals();
    },
  },
  {
    name: 'analyzeStorageCleanup',
    displayName: 'Analyze Storage Cleanup',
    description: 'Scan computer for duplicate files, large files (>100MB), and cluttered downloads to identify safe space reclamation opportunities.',
    category: 'filesystem',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Analyzing storage cleanup opportunities...',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['duplicates', 'large_files', 'all'] },
      },
    },
    execute: async (input) => {
      const { digitalOrganizerEngine } = await import('@/services/organization/digitalOrganizerEngine');
      if (input?.type === 'duplicates') {
        return digitalOrganizerEngine.findDuplicateFiles();
      }
      if (input?.type === 'large_files') {
        return digitalOrganizerEngine.findLargeFiles();
      }
      const [duplicates, largeFiles] = await Promise.all([
        digitalOrganizerEngine.findDuplicateFiles(),
        digitalOrganizerEngine.findLargeFiles(),
      ]);
      return { duplicates, largeFiles };
    },
  },
  {
    name: 'classifyDownloads',
    displayName: 'Classify Downloads',
    description: 'Classify files in Downloads into Documents, Installers, Archives, Images, and Videos.',
    category: 'filesystem',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Inspecting Downloads folder...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { digitalOrganizerEngine } = await import('@/services/organization/digitalOrganizerEngine');
      return digitalOrganizerEngine.classifyDownloads();
    },
  },
  {
    name: 'proposeDownloadsOrganization',
    displayName: 'Propose Downloads Organization Plan',
    description: 'Generate a structured proposal to organize Downloads into subfolders. Requires explicit user review and confirmation before moving files.',
    category: 'automation',
    permissionLevel: 'ACTION',
    humanActivityPhrase: 'Preparing organization proposal...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { digitalOrganizerEngine } = await import('@/services/organization/digitalOrganizerEngine');
      return digitalOrganizerEngine.proposeDownloadsOrganization();
    },
  },
  {
    name: 'analyzeDocument',
    displayName: 'Analyze Document',
    description: 'Analyze documents: summarize content, compare two documents, extract action items, or extract important dates.',
    category: 'documents',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Analyzing document content...',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['summarize', 'compare', 'extract_actions', 'extract_dates'] },
        path: { type: 'string', description: 'Primary document path' },
        comparePath: { type: 'string', description: 'Secondary document path for comparison' },
      },
      required: ['action', 'path'],
    },
    execute: async (input) => {
      const { documentAssistantEngine } = await import('@/services/documents/documentAssistantEngine');
      if (input.action === 'summarize') {
        return documentAssistantEngine.summarizeDocument(input.path);
      }
      if (input.action === 'compare' && input.comparePath) {
        return documentAssistantEngine.compareDocuments(input.path, input.comparePath);
      }
      if (input.action === 'extract_actions') {
        return documentAssistantEngine.extractActionItems(input.path);
      }
      if (input.action === 'extract_dates') {
        return documentAssistantEngine.extractDates(input.path);
      }
      return documentAssistantEngine.summarizeDocument(input.path);
    },
  },
  {
    name: 'troubleshootComputer',
    displayName: 'Diagnose Computer Performance',
    description: 'Diagnose why the computer is slow by analyzing real CPU usage, RAM utilization, top resource-consuming processes, and storage bottlenecks.',
    category: 'system',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Diagnosing computer performance...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { computerService } = await import('@/services/native/computerService');
      const [sys, topProcs, disks] = await Promise.all([
        computerService.getSystemInfo(),
        computerService.getTopProcesses(5),
        computerService.getDiskInformation(),
      ]);

      const issues: string[] = [];
      if (sys.ramPercentageUsed > 80) {
        issues.push(`High RAM usage: ${sys.ramPercentageUsed}% (${sys.usedRamFormatted} / ${sys.totalRamFormatted}).`);
      }
      if (sys.cpuUsagePercent && sys.cpuUsagePercent > 75) {
        issues.push(`High CPU load: ${sys.cpuUsagePercent}%.`);
      }
      for (const d of disks) {
        if (d.percentageUsed > 85) {
          issues.push(`Drive ${d.drive} is nearly full: ${d.percentageUsed}% used (${d.freeFormatted} free).`);
        }
      }

      const diagnosis = issues.length > 0
        ? `I identified performance bottlenecks:\n${issues.map((i) => `- ${i}`).join('\n')}`
        : `Your computer appears to be running in a healthy state. RAM is at ${sys.ramPercentageUsed}% and disk drives have sufficient free capacity.`;

      return {
        diagnosis,
        issues,
        hardware: {
          cpu: sys.cpuBrand,
          ramUsed: sys.usedRamFormatted,
          ramTotal: sys.totalRamFormatted,
          ramPercentage: sys.ramPercentageUsed,
        },
        topProcesses: topProcs.slice(0, 5).map((p) => ({
          name: p.name,
          memoryFormatted: p.memoryFormatted,
          cpuPercent: p.cpuUsage,
        })),
        disks: disks.map((d) => ({
          drive: d.drive,
          free: d.freeFormatted,
          usedPercent: d.percentageUsed,
        })),
      };
    },
  },
  {
    name: 'getPendingCommitments',
    displayName: 'Get Pending Commitments',
    description: 'Retrieve tracked commitments, promises, and obligations across authorized communication channels (Teams, Outlook, Gmail, Slack). Arguments: { category?: "needToDo"|"waitingFor"|"peopleWaitingForMe"|"upcoming"|"all", person?: string }.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Looking for pending commitments...',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['needToDo', 'waitingFor', 'peopleWaitingForMe', 'upcoming', 'all'] },
        person: { type: 'string', description: 'Filter by person involved (e.g. Rahul, HR)' },
      },
    },
    execute: async (input) => {
      const { commitmentEngine } = await import('@/services/commitments/commitmentEngine');
      if (input?.person) {
        return commitmentEngine.getCommitmentsForPerson(input.person);
      }
      const overview = await commitmentEngine.getOverview();
      if (input?.category && input.category !== 'all') {
        return (overview as any)[input.category] || [];
      }
      return overview;
    },
  },
  {
    name: 'getWhatAmIForgetting',
    displayName: 'What Am I Forgetting',
    description: 'Synthesize overdue obligations, impending deadlines, and unresolved promises across communication channels and calendar.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking what needs your attention...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { commitmentEngine } = await import('@/services/commitments/commitmentEngine');
      return commitmentEngine.getWhatAmIForgetting();
    },
  },
  {
    name: 'analyzeCommunicationForCommitments',
    displayName: 'Analyze Communication For Commitments',
    description: 'Extract actionable commitments, promises, deadlines, and waiting-for items from a message with confidence assessment.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Analyzing communication commitments...',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Message or conversation snippet to analyze' },
        sourceProvider: { type: 'string', description: 'Source channel (Teams, Outlook, Gmail, Slack)' },
        senderName: { type: 'string', description: 'Name of sender or participant' },
      },
      required: ['text'],
    },
    execute: async (input) => {
      const { commitmentEngine } = await import('@/services/commitments/commitmentEngine');
      return commitmentEngine.analyzeTextAndTrack(input.text, {
        sourceProvider: input.sourceProvider || 'LOCAL',
        senderName: input.senderName,
      });
    },
  },
  {
    name: 'searchCrossSourceData',
    displayName: 'Search Cross-Source Data',
    description: 'Search across communications (emails, chats), files, and commitments to locate relevant reports, conversations, and obligations.',
    category: 'filesystem',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Searching across your authorized sources...',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or report name' },
        person: { type: 'string', description: 'Optional person filter' },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const { db } = await import('@/services/db/database');
      const { computerService } = await import('@/services/native/computerService');
      const { commitmentEngine } = await import('@/services/commitments/commitmentEngine');

      const [commMatches, fileMatches, personCommitments] = await Promise.all([
        db.searchCommunicationItems(input.query, 10),
        computerService.searchFilesLive({ query: input.query, limit: 10 }),
        input.person ? commitmentEngine.getCommitmentsForPerson(input.person) : Promise.resolve([]),
      ]);

      return {
        query: input.query,
        communications: commMatches.map((c) => ({
          source: c.source,
          sender: c.sender?.name,
          subject: c.subject,
          contentPreview: c.content.slice(0, 150),
          timestamp: c.timestamp,
        })),
        files: fileMatches.map((f) => ({
          name: f.name,
          path: f.path,
          sizeFormatted: `${(f.size / 1024).toFixed(1)} KB`,
          modifiedAt: f.modifiedAt,
        })),
        commitments: personCommitments.map((p) => ({
          title: p.title,
          status: p.status,
          dueAt: p.dueAt,
          source: p.source.provider,
        })),
      };
    },
  },
  {
    name: 'prepareForMeeting',
    displayName: 'Prepare For Meeting',
    description: 'Prepare a briefing for an upcoming meeting by synthesizing participants, relevant communications, referenced documents, and unresolved commitments.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Preparing briefing for your meeting...',
    inputSchema: {
      type: 'object',
      properties: {
        meetingQuery: { type: 'string', description: 'Meeting name or participant to prepare for' },
      },
    },
    execute: async (input) => {
      const { db } = await import('@/services/db/database');
      const { commitmentEngine } = await import('@/services/commitments/commitmentEngine');
      const { computerService } = await import('@/services/native/computerService');

      const q = input?.meetingQuery || '';
      const commItems = await db.getCommunicationItems({ limit: 30 });
      const meetings = commItems.filter((i) => i.metadata?.isMeeting || i.subject?.toLowerCase().includes('meeting'));

      const targetMeeting = meetings.find((m) => !q || m.subject?.toLowerCase().includes(q.toLowerCase())) || meetings[0];

      if (!targetMeeting) {
        return {
          found: false,
          message: 'No upcoming scheduled meetings found in authorized calendars.',
        };
      }

      const attendees = (targetMeeting.metadata?.attendees as any[]) || [];
      const participantNames = attendees.map((a: any) => a.emailAddress?.name || a.name || '').filter(Boolean);

      // Search commitments involving these participants
      const relatedCommitments = [];
      for (const name of participantNames) {
        const coms = await commitmentEngine.getCommitmentsForPerson(name);
        relatedCommitments.push(...coms);
      }

      // Search files matching the meeting topic
      const relatedFiles = await computerService.searchFilesLive({
        query: targetMeeting.subject?.replace(/meeting:?/i, '').trim() || '',
        limit: 5,
      });

      return {
        found: true,
        meeting: {
          title: targetMeeting.subject,
          scheduledStart: targetMeeting.metadata?.start || targetMeeting.timestamp,
          participants: participantNames,
        },
        unresolvedCommitments: relatedCommitments.map((c) => ({
          title: c.title,
          status: c.status,
          person: c.person?.name,
          source: c.source.provider,
        })),
        relevantDocuments: relatedFiles.map((f) => ({
          name: f.name,
          path: f.path,
        })),
      };
    },
  },
  {
    name: 'syncConnectors',
    displayName: 'Sync Connectors',
    description: 'Trigger synchronization of all authorized integrations (Microsoft, Google, Slack).',
    category: 'automation',
    permissionLevel: 'WRITE',
    humanActivityPhrase: 'Synchronizing authorized integrations...',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const { syncManager } = await import('@/services/connectors/core/syncManager');
      const { connectorRegistry } = await import('@/services/connectors/core/connectorRegistry');
      return syncManager.syncAll(connectorRegistry.getAllConnectors());
    },
  },
  // GENERIC COMMUNICATION CONNECTOR TOOLS (Conforms to Section 27)
  {
    name: 'search_communications',
    displayName: 'Search Communications',
    description: 'Search across authorized communications (emails, chat messages, meetings) with optional query, provider filter (outlook, teams, gmail, slack), or sender filter.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Searching communications...',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or keywords' },
        provider: { type: 'string', description: 'Filter by provider (e.g. outlook, teams, gmail, slack)' },
        sender: { type: 'string', description: 'Filter by sender name or email' },
        limit: { type: 'number', description: 'Maximum items to return (default: 20)' },
      },
    },
    execute: async (input) => {
      const { db } = await import('@/services/db/database');
      const term = input?.query || '';
      const limit = input?.limit || 20;
      const items = await db.searchCommunicationItems(term, limit * 2);
      const filtered = items.filter((i) => {
        if (input?.provider && i.source.toLowerCase() !== input.provider.toLowerCase()) return false;
        if (input?.sender && !i.sender?.name?.toLowerCase().includes(input.sender.toLowerCase()) && !i.sender?.email?.toLowerCase().includes(input.sender.toLowerCase())) return false;
        return true;
      }).slice(0, limit);

      return filtered.map((c) => ({
        id: c.id,
        source: c.source,
        sender: c.sender?.name || c.sender?.email,
        subject: c.subject,
        contentPreview: c.content.slice(0, 200),
        timestamp: c.timestamp,
        attachments: c.attachments?.map((a) => a.name),
      }));
    },
  },
  {
    name: 'get_communication',
    displayName: 'Get Communication Details',
    description: 'Retrieve full details of a specific communication item by its ID, including complete content, recipients, and timestamps.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Retrieving communication details...',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The unique ID of the message or item' },
      },
      required: ['messageId'],
    },
    execute: async (input) => {
      const { db } = await import('@/services/db/database');
      const items = await db.searchCommunicationItems('', 500);
      const item = items.find((i) => i.id === input.messageId);
      if (!item) {
        return { found: false, message: `Message ${input.messageId} not found in local cache.` };
      }
      return { found: true, item };
    },
  },
  {
    name: 'search_commitments',
    displayName: 'Search Commitments',
    description: 'Search tracked commitments, promises, deadlines, and follow-ups by keyword, person, or status.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Searching tracked commitments...',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to search in commitment title or evidence' },
        person: { type: 'string', description: 'Filter by person involved' },
        status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'WAITING', 'OVERDUE'] },
      },
    },
    execute: async (input) => {
      const { commitmentStore } = await import('@/services/commitments/commitmentStore');
      if (input?.person) {
        return commitmentStore.getCommitmentsForPerson(input.person);
      }
      const all = await commitmentStore.listCommitments();
      const q = (input?.query || '').toLowerCase();
      return all.filter((c) => {
        if (input?.status && c.status !== input.status) return false;
        if (q && !c.title.toLowerCase().includes(q) && !c.evidence?.toLowerCase().includes(q)) return false;
        return true;
      });
    },
  },
  {
    name: 'list_pending_commitments',
    displayName: 'List Pending Commitments',
    description: 'List categorized commitments across all authorized channels: needToDo, waitingFor, peopleWaitingForMe, upcoming, or filtered by person.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Retrieving pending commitments...',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['needToDo', 'waitingFor', 'peopleWaitingForMe', 'upcoming', 'overdue', 'all'] },
        person: { type: 'string', description: 'Optional person filter (e.g. Rahul, Sarah)' },
      },
    },
    execute: async (input) => {
      const { commitmentEngine } = await import('@/services/commitments/commitmentEngine');
      if (input?.person) {
        return commitmentEngine.getCommitmentsForPerson(input.person);
      }
      const overview = await commitmentEngine.getOverview();
      if (input?.category && input.category !== 'all') {
        return (overview as any)[input.category] || [];
      }
      return overview;
    },
  },
  {
    name: 'search_calendar',
    displayName: 'Search Calendar',
    description: 'Search meetings, attendees, locations, and schedules across all authorized Microsoft and Google calendars.',
    category: 'productivity',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Searching calendar events...',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Meeting topic or attendee name' },
        limit: { type: 'number', description: 'Maximum meetings to return (default: 10)' },
      },
    },
    execute: async (input) => {
      const { db } = await import('@/services/db/database');
      const commItems = await db.getCommunicationItems({ limit: 50 });
      const meetings = commItems.filter((i) => i.metadata?.isMeeting || i.subject?.toLowerCase().includes('meeting'));
      const q = (input?.query || '').toLowerCase();
      const matched = meetings.filter((m) => {
        if (!q) return true;
        const subMatch = m.subject?.toLowerCase().includes(q);
        const contentMatch = m.content?.toLowerCase().includes(q);
        return subMatch || contentMatch;
      });
      return matched.slice(0, input?.limit || 10).map((m) => ({
        id: m.id,
        source: m.source,
        title: m.subject,
        scheduledStart: m.metadata?.start || m.timestamp,
        scheduledEnd: m.metadata?.end,
        attendees: m.metadata?.attendees,
        location: m.metadata?.location,
        meetingLink: m.metadata?.meetingLink,
      }));
    },
  },
  {
    name: 'get_connector_status',
    displayName: 'Get Connector Status',
    description: 'Retrieve real-time truthful connection, authentication, and sync statuses for all or a specific communication connector (microsoft_outlook, microsoft_teams, google_gmail, slack_workspace, etc.).',
    category: 'system',
    permissionLevel: 'READ',
    humanActivityPhrase: 'Checking connector status...',
    inputSchema: {
      type: 'object',
      properties: {
        connectorId: { type: 'string', description: 'Optional ID of specific connector' },
      },
    },
    execute: async (input) => {
      const { connectorStatusManager } = await import('@/services/connectors/core/connectorStatus');
      if (input?.connectorId) {
        return connectorStatusManager.getStatus(input.connectorId);
      }
      return connectorStatusManager.getAllStatuses();
    },
  },
  {
    name: 'sync_connector',
    displayName: 'Sync Connector',
    description: 'Trigger incremental synchronization for all connected providers or a specific provider.',
    category: 'automation',
    permissionLevel: 'WRITE',
    humanActivityPhrase: 'Synchronizing external communications...',
    inputSchema: {
      type: 'object',
      properties: {
        connectorId: { type: 'string', description: 'Optional specific connector ID to sync. Omit to sync all.' },
      },
    },
    execute: async (input) => {
      const { syncManager } = await import('@/services/connectors/core/syncManager');
      const { connectorRegistry } = await import('@/services/connectors/core/connectorRegistry');
      if (input?.connectorId) {
        const c = connectorRegistry.getConnector(input.connectorId);
        if (!c) return { success: false, error: `Connector ${input.connectorId} not found.` };
        return syncManager.syncConnector(c, true);
      }
      return syncManager.syncAll(connectorRegistry.getAllConnectors());
    },
  },
]);
