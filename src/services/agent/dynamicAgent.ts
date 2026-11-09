// Dynamic AI Agent - Central reasoning engine powered by runtime LLM
import { IndexedFile, IndexedFolder } from '@/types/file';
import { computerTools, AgentContext, ToolDefinition } from './tools';
import { AIService } from '@/services/ai/aiService';
import { permissionManager } from '@/services/permissions/permissionManager';
import { toolRegistry } from '@/services/tools/toolRegistry';
import { deviceService } from '@/services/device/deviceService';
import { computerService } from '@/services/native/computerService';
import { trace } from '@/services/debug/trace';
import { clockContext } from './clockAnswers';
import { detectComparison, detectLimit, detectScope, COMPARISON_WORDS } from './directRouter';

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  name: string;
  result: any;
}

export interface PendingAction {
  type: 'open_application';
  appName: string;
  targetPath: string;
  id: string;
}

export interface DynamicAgentResult {
  message: string;
  files?: IndexedFile[];
  folders?: IndexedFolder[];
  toolsExecuted: string[];
  pendingAction?: PendingAction;
}

export type AgentIntent = 'general' | 'device_system' | 'file_query' | 'all';

export class DynamicAgent {
  private maxToolCalls: number;
  public aiService: AIService | null;

  constructor(maxToolCalls = 10, aiService: AIService | null = null) {
    this.maxToolCalls = maxToolCalls;
    this.aiService = aiService;
  }

  public classifyIntent(userInput: string): AgentIntent {
    const text = userInput.trim().toLowerCase();

    // Check for explicit device/hardware status patterns
    const isDeviceHardware = /\b(battery|charging|charge|network|wifi|wi-fi|ssid|ip address|storage|disk|space|memory|ram|cpu|processor|model|specs|hardware|system info|device info|phone info)\b/i.test(text);

    // Check for file/document patterns
    const isFileOrDoc = /\b(files?|folders?|directories?|documents?|docs?|pdf|docx?|xlsx?|csv|sheets?|spreadsheets?|txt|notes?|resume|cv|photos?|images?|videos?)\b/i.test(text);
    const isFileAction = /\b(find|search|locate|read|summarize|inspect|count|open|reveal)\b/i.test(text);

    // General knowledge questions starting with definitions, explanations, or questions that don't refer to the user's device/files
    const isGeneralExploration = /^(?:what is|what are|explain|who is|who was|why is|how do|how does|write|code|tell me|translate|convert|define)\b/i.test(text);
    const hasPersonalContext = /\b(my|this|phone|device|computer|on device|on phone|do i have|installed|running)\b/i.test(text);

    if (isGeneralExploration && !hasPersonalContext && !isFileAction) {
      return 'general';
    }

    if (isDeviceHardware && !isFileOrDoc) {
      return 'device_system';
    }

    if (isFileOrDoc || (isFileAction && hasPersonalContext)) {
      return 'file_query';
    }

    if (isDeviceHardware) {
      return 'device_system';
    }

    // Default for pure questions with no device/file terms
    if (!isFileOrDoc && !isDeviceHardware && !isFileAction) {
      return 'general';
    }

    return 'all';
  }

  // Available tools that the LLM can call
  private getAvailableTools(): Record<string, ToolDefinition<any, any>> {
    return {
      // FILESYSTEM TOOLS
      searchFiles: computerTools.searchFiles,
      searchFolders: computerTools.searchFolders,
      countFiles: computerTools.countFiles,
      readFile: computerTools.readFile,
      openFile: computerTools.openFile,
      revealFile: computerTools.revealFile,
      getFileMetadata: computerTools.getFileMetadata,

      // SYSTEM & STORAGE TOOLS
      getDiskInformation: computerTools.getDiskInformation,
      getSystemInfo: computerTools.getSystemInfo,
      getBatteryInformation: computerTools.getBatteryInformation,
      getNetworkInformation: computerTools.getNetworkInformation,

      // APPLICATION TOOLS
      getRunningApplications: computerTools.getRunningApplications,
      getApplicationDetails: computerTools.getApplicationDetails,
      openApplication: computerTools.openApplication,
    };
  }

  // Convert tools to LLM-friendly description with strict usage rules scoped by intent
  private getToolsDescription(intent: AgentIntent = 'all'): string {
    const isAndroid = (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) ||
                      deviceService.getAdapter().platform === 'android';

    if (intent === 'general') {
      return '';
    }

    if (isAndroid) {
      if (intent === 'device_system') {
        return `Available tools on this Android device:
- getBatteryInformation: Retrieve real phone battery percentage, charging state, and temperature.
- getNetworkInformation: Retrieve real Android network status: Wi-Fi connectivity, SSID, IP address, and connection state.
- getDiskInformation: Retrieve real device storage info: total capacity, used storage, and free space.
- getSystemInfo: Retrieve real phone hardware specifications: Android OS version, phone model, CPU, and RAM.

HOW TO CALL A TOOL:
When you need to call a tool, you MUST respond with ONLY a single JSON object in this exact format:
{
  "tool": "tool_name",
  "arguments": {}
}

Examples:
To get battery level:
{
  "tool": "getBatteryInformation",
  "arguments": {}
}
To get Wi-Fi or network status:
{
  "tool": "getNetworkInformation",
  "arguments": {}
}
To get storage space:
{
  "tool": "getDiskInformation",
  "arguments": {}
}
To get hardware specifications:
{
  "tool": "getSystemInfo",
  "arguments": {}
}

GUIDELINES:
1. Always call the exact tool corresponding to what the user asked.
2. Respond with ONLY the JSON object. Do not include markdown or explanations.`;
      }

      if (intent === 'file_query') {
        return `Available tools on this Android device:
- searchFiles: Search and filter files on the device. Arguments: { query?: string, fileTypes?: string[], extension?: string, limit?: number }.
  * For finding a resume or CV: call searchFiles with query: "resume" or extension: "pdf".
  * For Word documents: call searchFiles with fileTypes: ["Document"] or extension: "docx".
  * For Excel spreadsheets: call searchFiles with fileTypes: ["Spreadsheet"] or extension: "xlsx".
  * For PDF documents: call searchFiles with fileTypes: ["PDF"] or extension: "pdf".
- countFiles: Count files on the device matching criteria. Arguments: { query?: string, fileTypes?: string[], extension?: string }. Call when user asks "How many..." files exist.
- readFile: Read textual contents of a file by path or content URI. Arguments: { path: string, maxChars?: number }.
  * CRITICAL: If you do not have the exact file path from a previous search, you MUST FIRST call searchFiles to locate the file! Never invent or guess file paths in readFile.
- searchFolders: Search folders by name.
- openFile: Open a file in the default viewer.

HOW TO CALL A TOOL:
When you need to call a tool, you MUST respond with ONLY a single JSON object in this exact format:
{
  "tool": "tool_name",
  "arguments": { ... }
}

Examples:
To search for PDF files:
{
  "tool": "searchFiles",
  "arguments": { "extension": "pdf" }
}

To search for Word files / documents:
{
  "tool": "searchFiles",
  "arguments": { "extension": "docx" }
}

To search for Excel files / spreadsheets:
{
  "tool": "searchFiles",
  "arguments": { "extension": "xlsx" }
}

To find a resume:
{
  "tool": "searchFiles",
  "arguments": { "query": "resume" }
}

To read or summarize a file or document (e.g. "Read my resume"):
{
  "tool": "readFile",
  "arguments": { "path": "resume" }
}

To count files (e.g. "How many PDF files do I have?"):
{
  "tool": "countFiles",
  "arguments": { "extension": "pdf" }
}

GUIDELINES:
1. For COUNT queries ("How many PDF files do I have?", "How many Excel files?"): You MUST call countFiles. When answering how many files exist, ALWAYS state the numeric count using digits (e.g., "You have 2 PDF files").
2. For READ or SUMMARIZE queries ("Read my resume", "Summarize report"): If you do not have the exact path, FIRST call searchFiles to find the file, then call readFile on the discovered path.
3. Respond with ONLY the JSON object. Do not include markdown or explanations.`;
      }

      return `CRITICAL INSTRUCTIONS:
- For general knowledge questions (e.g., "What is React?", "What is TypeScript?", "Explain promises", "What is AI?", "Write code"): Answer directly using your general knowledge. DO NOT output any tool call!
- Only call a tool when the user is explicitly asking about their device, phone settings, files, storage, battery, or network.

Available tools on this Android device:
- getBatteryInformation: Retrieve real battery percentage, charging state, and temperature from the active phone. Call this for any battery or charging questions.
- getNetworkInformation: Retrieve real Android network status: Wi-Fi connectivity, SSID, IP address, and connection state. Call this for network or Wi-Fi questions.
- getDiskInformation: Retrieve real device storage info: total capacity, used storage, and free space. Call this for storage or disk questions. Do NOT refer to Windows drive letters like C: or D:.
- getSystemInfo: Retrieve real phone hardware specifications: Android OS version, phone model, CPU, and RAM. Call this for system, CPU, processor, or hardware questions.
- searchFiles: Search and filter files on the device. Arguments: { query?: string, fileTypes?: string[], extension?: string, limit?: number }.
  * For finding a resume or CV: call searchFiles with query: "resume" or extension: "pdf".
  * For Word documents: call searchFiles with fileTypes: ["Document"] or extension: "docx".
  * For Excel spreadsheets: call searchFiles with fileTypes: ["Spreadsheet"] or extension: "xlsx".
  * For PDF documents: call searchFiles with fileTypes: ["PDF"] or extension: "pdf".
- countFiles: Count files on the device matching criteria. Arguments: { query?: string, fileTypes?: string[], extension?: string }. Call when user asks "How many..." files exist.
- readFile: Read textual contents of a file by path or content URI. Arguments: { path: string, maxChars?: number }. Call to inspect file content, e.g. after finding a resume to summarize it.
- searchFolders: Search folders by name.
- openFile: Open a file in the default viewer.

HOW TO CALL A TOOL:
When you need to call a tool, you MUST respond with ONLY a single JSON object in this exact format:
{
  "tool": "tool_name",
  "arguments": { ... }
}

GUIDELINES:
1. For GENERAL KNOWLEDGE questions: Answer directly using your general intelligence. DO NOT call any computer tools.
2. For BATTERY questions: You MUST call getBatteryInformation.
3. For COUNT queries: You MUST call countFiles. When answering how many files exist, ALWAYS state the numeric count using digits.
4. For READ/SUMMARIZE queries: Call searchFiles first if path is unknown, then readFile, then summarize.
5. Answer clearly, directly, and factually. Never mention Windows or drive letters like C: or D:.`;
    }

    return `Available tools:
  - getBatteryInformation: Retrieve the real battery level, charging state, and temperature from the active physical device. Call this for battery or charging questions.
- getNetworkInformation: Retrieve real Windows network status, internet connectivity, connection type (Wi-Fi or Ethernet), Wi-Fi SSID, signal percentage, primary IP address, and active network interfaces. Call this when the user asks about network status, Wi-Fi, SSID, IP address, or internet connectivity.
- searchFiles: Search, sort, and filter files across the computer. Arguments: { query?: string, fileTypes?: string[], extension?: string, scopePath?: string, sortBy?: "size"|"modified"|"created"|"name", sortOrder?: "asc"|"desc", limit?: number }.
  * For finding the LARGEST or BIGGEST file, video, or PDF: call searchFiles with sortBy: "size", sortOrder: "desc", limit: 1.
  * For videos (.mp4, .mkv, .avi, .mov, .webm, .wmv, etc.): set fileTypes: ["Video"].
  * For spreadsheets (.xlsx, .csv): set fileTypes: ["Spreadsheet"].
  * For documents or PDFs: set fileTypes: ["PDF"] or ["Document"].
  * For specific scope: set scopePath: "Downloads" or folder path.
  * Returns file objects with exact "size" in bytes and readable "sizeFormatted" (e.g. "4.2 GB").
- openApplication: Open or launch an installed Windows application (arguments: { "application": string }). Call this when the user asks to open, launch, or start an application (e.g., "Can you open the Teams app?", "Launch Chrome", "Start Notepad", "Open VS Code", "Open Calculator", "Open File Explorer"). This is a protected ACTION tool that validates the installed application and requests explicit user confirmation before launching.
- getApplicationDetails: Inspect detailed application installation metadata on Windows: installation status, version, install location, publisher, and whether it is currently running. Arguments: { "application": string }. Call this when the user asks "Is <app> installed?", "What version of <app> do I have?", "Where is <app> installed?", or "Is <app> running?".
- getRunningApplications: Retrieve the list of currently open/running desktop applications on the computer. Call this when the user asks "What applications are open?", "What apps are running?", or "Is Teams open?". (READ_ONLY tool).
- getDiskInformation: Retrieve real Windows physical/logical disk drives (C:, D:), total capacities, used space, free space, and percentages. Call this when the user asks about system storage, drive size, disk space, or free disk capacity.
- getSystemInfo: Retrieve real computer hardware specifications: OS version, CPU brand/model, core counts, total RAM, used RAM, and free RAM. Call this when the user asks about their system, CPU, processor, RAM, or memory.
- countFiles: Count files on the computer matching criteria (e.g. extension: "xlsx", "pdf", fileTypes: ["Spreadsheet"], query: string). Call this when the user asks "How many..." files exist. Returns { count: number }.
- searchFolders: Search directories by name or creation/modification date. Call this when the user asks for folders (e.g. "Find the Teams folder", "give me the blimey folder").
- readFile: Read textual contents of a specific file path (up to maxChars). Call this to read file content, such as when summarizing a document.
- getFileMetadata: Get real metadata for a specific file path or content URI.
- openFile: Open a file or folder in default system application.
- revealFile: Show and highlight a file in Windows File Explorer.
- getWhatShouldIDoToday: Synthesize due tasks, high-priority items, pending follow-ups, and active goals to recommend what to focus on today. Call this when the user asks "What should I do today?", "What should I focus on today?", or "Help me plan my day".
- getEndOfDaySummary: Generate a factual end-of-day summary of completed tasks, pending items, and files modified today. Call this when the user asks for "end of day summary" or "what did I accomplish today".
- getDailyActivitySummary: Factual report of verified tasks completed and files modified on the computer today. Call this when the user asks "What did I do today?", "What was I working on today?", or "What files did I modify today?".
- troubleshootComputer: Diagnose why the computer is slow by inspecting real CPU load, RAM usage, top resource-consuming processes, and storage bottlenecks. Call this when the user asks "Why is my computer slow?", "Why is my PC running slow?", or "What is using all my memory/CPU?".
- manageFollowUps: Track promises, deadlines, and items waiting for someone else. Arguments: { action: "list"|"create"|"resolve", title?: string, type?: "task"|"promise"|"deadline"|"waiting_for"|"pending_approval"|"pending_document", targetPerson?: string, id?: string }.
- manageGoals: Track ongoing multi-step goals with progress memory. Arguments: { action: "list"|"create"|"resume"|"update_progress"|"toggle_step", title?: string, query?: string, goalId?: string, progress?: number }. Call with action: "resume" when user says "Continue my interview preparation" or "Continue my goal".
- analyzeStorageCleanup: Scan for duplicate files and large files (>100MB) to identify safe space reclamation opportunities. Call this when user asks "Clean up my digital life", "Find duplicate files", or "Find large files".
- classifyDownloads: Categorize files in Downloads into Documents, Installers, Archives, Images, and Videos. Call when user asks "What's in my Downloads folder?" or "Show my downloads".
- proposeDownloadsOrganization: Propose a plan to organize Downloads into subfolders (requires user review and confirmation before moving). Call when user asks "Organize my Downloads".
- analyzeDocument: Summarize, compare, or extract action items/dates from documents. Arguments: { action: "summarize"|"compare"|"extract_actions"|"extract_dates", path: string, comparePath?: string }. Call when user asks to summarize or compare documents or extract action items.
- search_communications: Search across authorized communications (emails, chat messages, meetings) with optional query, provider filter (outlook, teams, gmail, slack), or sender filter. Arguments: { query?: string, provider?: string, sender?: string, limit?: number }.
- get_communication: Retrieve full details of a specific communication item by its ID, including complete content, recipients, and timestamps. Arguments: { messageId: string }.
- search_commitments: Search tracked commitments, promises, deadlines, and follow-ups by keyword, person, or status. Arguments: { query?: string, person?: string, status?: "PENDING"|"COMPLETED"|"WAITING"|"OVERDUE" }.
- list_pending_commitments: Retrieve categorized commitments across authorized channels (needToDo, waitingFor, peopleWaitingForMe, upcoming, overdue, all) or filtered by person. Arguments: { category?: "needToDo"|"waitingFor"|"peopleWaitingForMe"|"upcoming"|"overdue"|"all", person?: string }.
- search_calendar: Search upcoming meetings, attendees, locations, and agendas from all authorized calendars (Microsoft, Google). Arguments: { query?: string, limit?: number }.
- get_connector_status: Retrieve real-time truthful connection, authentication, and sync statuses for communication connectors. Arguments: { connectorId?: string }.
- sync_connector: Trigger incremental synchronization for all connected providers or a specific provider. Arguments: { connectorId?: string }.
- getWhatAmIForgetting: Synthesize overdue obligations, impending deadlines, and unresolved promises across communication channels and calendar.
- getPendingCommitments: Retrieve tracked commitments, promises, and obligations across authorized communication channels (Teams, Outlook, Gmail, Slack). Arguments: { category?: "needToDo"|"waitingFor"|"peopleWaitingForMe"|"upcoming"|"all", person?: string }.
- prepareForMeeting: Prepare briefing context for upcoming meeting: retrieves participants, relevant recent communications, referenced documents, and unresolved commitments. Arguments: { meetingQuery?: string }.
- searchCrossSourceData: Search across communications (emails, chats), files, and commitments to locate relevant reports, conversations, and obligations. Arguments: { query: string, person?: string }.
- syncConnectors: Trigger incremental sync across all authorized external integrations.

HOW TO CALL A TOOL:
Respond with a JSON object in this exact format:
{
  "tool": "tool_name",
  "arguments": { ... }
}

GUIDELINES:
1. For NETWORK and CONNECTIVITY queries: You MUST call getNetworkInformation.
2. For LARGEST / BIGGEST / FILE SIZE queries: You MUST call searchFiles with sortBy: "size", sortOrder: "desc", limit: 1.
3. For APPLICATION LAUNCHING: You MUST call openApplication.
4. For APPLICATION INSPECTION: You MUST call getApplicationDetails.
5. For RUNNING APPLICATION queries: You can call getApplicationDetails or getRunningApplications.
6. For APPLICATION FOLDERS: Call searchFolders.
7. For COMMITMENTS, DIGITAL LIFE, FOLLOW-THROUGHS, AND COMMUNICATION REASONING: Call list_pending_commitments, search_commitments, search_calendar, and/or search_communications.
8. For GENERAL KNOWLEDGE questions: Answer directly using your general intelligence. DO NOT call any computer tools.
9. For DATE, TIME, and CALENDAR questions: Answer directly using the CURRENT SYSTEM CONTEXT provided above. DO NOT call any computer tools.
10. For SYSTEM / DISK STORAGE questions: You MUST call getDiskInformation or getSystemInfo. Do NOT search filenames!
11. For COUNT queries: You MUST call countFiles. Provide a clean, direct count answer like "You have 5 Excel files."
12. For MULTI-STEP queries: First call searchFiles to locate the file, then call readFile to read its content, then provide the final summary.
13. When answering, be clear, direct, and concise. Avoid unnecessary preamble.
14. Tool calls are internal: NEVER return raw tool JSON in your final conversational response to the user. Always interpret the tool results and answer in helpful natural language.`;
  }

  async run(
    userInput: string,
    context: AgentContext
  ): Promise<DynamicAgentResult> {
    trace('[PIPELINE_TRACE] USER QUERY (Agent Entry):', userInput);
    trace('[PIPELINE_TRACE] AGENT INPUT:', JSON.stringify({ userInput }));
    const executedTools: string[] = [];
    const discoveredFiles: IndexedFile[] = [];
    const discoveredFolders: IndexedFolder[] = [];
    let lastCountResult: { count: number; extension?: string } | null = null;
    let toolCallCount = 0;

    if (!this.aiService) {
      return {
        message: "I'm unable to process your request because my AI capabilities are not available. Please ensure you have an AI provider configured and running.",
        toolsExecuted: executedTools,
        files: [],
        folders: [],
      };
    }

    try {
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = now.toLocaleTimeString('en-US');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const isoDate = now.toISOString().slice(0, 10);

      const intent = this.classifyIntent(userInput);
      trace('[PIPELINE_TRACE] CLASSIFIED INTENT:', intent);

      let systemPrompt: string;
      if (intent === 'general') {
        // The model has no clock: give it today's date so answers that depend on "now" (ages, "how long
        // until", "this year's") are computed from the real date instead of the model's training cut-off.
        systemPrompt = `You are Foundry, an intelligent local AI assistant. Answer the user's question clearly, accurately and briefly (under 150 words unless the user asks for more) in English using your general knowledge.
${clockContext()} Use it whenever the answer depends on today's date.`;
      } else {
        systemPrompt = `You are Foundry, an intelligent local-first assistant that seamlessly combines general AI reasoning with deep computer and system integration.

CURRENT SYSTEM CONTEXT:
- Today's Date: ${formattedDate} (${isoDate})
- Current Time: ${formattedTime}
- System Timezone: ${timezone}

${this.getToolsDescription(intent)}
`;
      }

      const messages: { role: string; content: string }[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userInput,
        },
      ];

      // Bound model round-trips as well as executed tools: a tool that keeps throwing never increments
      // toolCallCount, which previously let the loop call the model forever.
      let modelRounds = 0;
      const maxModelRounds = this.maxToolCalls * 2;
      while (toolCallCount < this.maxToolCalls && modelRounds++ < maxModelRounds) {
        trace(`[PIPELINE_TRACE] MODEL REQUEST (Iteration ${toolCallCount}):`, JSON.stringify(messages));
        const aiResponse = await this.aiService.getProvider().chat(messages);
        trace(`[PIPELINE_TRACE] MODEL RESPONSE (Iteration ${toolCallCount}):`, aiResponse);

        if (!aiResponse || !aiResponse.trim()) {
          break;
        }

        let responseToParse = aiResponse;
        if (/(.)\1{8,}/.test(responseToParse)) {
          responseToParse = responseToParse.replace(/(.)\1{8,}/g, '$1');
        }
        const toolCalls = this.parseToolCalls(responseToParse, userInput);

        // If countFiles was already executed and model calls countFiles again or repeats count,
        // intercept immediately to prevent looping or counting all files.
        if (toolCalls.length > 0 && executedTools.includes('countFiles') && toolCalls.every(tc => tc.name === 'countFiles')) {
          const count = lastCountResult ? lastCountResult.count : 0;
          const ext = lastCountResult?.extension ? `${lastCountResult.extension.toUpperCase()} ` : '';
          const finalMsg = `You have ${count} ${ext}files on your device.`;
          trace('[PIPELINE_TRACE] FINAL AGENT ANSWER (Count Loop Intercept):', finalMsg);
          return {
            message: finalMsg,
            toolsExecuted: executedTools,
            files: discoveredFiles.length > 0 ? discoveredFiles : undefined,
            folders: discoveredFolders.length > 0 ? discoveredFolders : undefined,
          };
        }

        if (toolCalls.length > 0) {
          try {
            for (const toolCall of toolCalls) {
              trace('[PIPELINE_TRACE] TOOL CALL:', toolCall.name);
              trace('[PIPELINE_TRACE] TOOL ARGUMENTS:', JSON.stringify(toolCall.arguments));
              const toolResult = await this.executeTool(toolCall, context, userInput);
              trace('[PIPELINE_TRACE] TOOL RESULT:', JSON.stringify({
                tool: toolCall.name,
                hasData: toolResult.result !== undefined,
                isArray: Array.isArray(toolResult.result),
                count: Array.isArray(toolResult.result) ? toolResult.result.length : undefined,
                sample: typeof toolResult.result === 'string' ? toolResult.result.slice(0, 200) : (Array.isArray(toolResult.result) ? toolResult.result.slice(0, 2) : toolResult.result)
              }));
              executedTools.push(toolCall.name);
              toolCallCount++;

              // Handle ACTION tool: openApplication (requires user confirmation before launching)
              if (toolCall.name === 'openApplication') {
                const appRes = toolResult.result;
                if (!appRes.installed) {
                  return {
                    message: appRes.message,
                    toolsExecuted: executedTools,
                    files: [],
                    folders: [],
                  };
                }
                if (appRes.requiresConfirmation) {
                  return {
                    message: appRes.message,
                    toolsExecuted: executedTools,
                    pendingAction: {
                      type: 'open_application',
                      appName: appRes.appName,
                      targetPath: appRes.targetPath,
                      id: `act_${Date.now()}`,
                    },
                  };
                }
              }

              // Accumulate discovered items for UI cards (COUNT tool explicitly omitted)
              if (toolCall.name === 'searchFiles' && Array.isArray(toolResult.result)) {
                const isShowAll = /\b(all|every|list all|show all)\b/i.test(userInput);
                const candidateFiles = isShowAll ? toolResult.result.slice(0, 20) : toolResult.result.slice(0, 3);
                discoveredFiles.push(...candidateFiles);
              } else if (toolCall.name === 'searchFolders' && Array.isArray(toolResult.result)) {
                const isShowAll = /\b(all|every|list all|show all)\b/i.test(userInput);
                const candidateFolders = isShowAll ? toolResult.result.slice(0, 20) : toolResult.result.slice(0, 3);
                discoveredFolders.push(...candidateFolders);
              } else if (toolCall.name === 'readFile' && toolCall.arguments?.path) {
                const p = toolCall.arguments.path;
                const existing = discoveredFiles.find(f => f.path === p);
                if (!existing) {
                  try {
                    const fileName = p.replace(/^.*[\\/%2F]/, '');
                    const matches = await computerService.searchFilesLive({ query: fileName, limit: 1 });
                    if (matches && matches.length > 0) {
                      discoveredFiles.push(matches[0]);
                    }
                  } catch {}
                }
              }

              let toolResultSummary: string;
              let nextUserPrompt: string;

              if (toolCall.name === 'getBatteryInformation') {
                const b = toolResult.result || {};
                const level = b.level ?? b.batteryPercentage ?? 0;
                const isCharging = Boolean(b.isCharging);
                const chargingText = isCharging ? 'charging' : 'not charging';
                const temp = b.temperatureCelsius ?? b.temperature;
                toolResultSummary = `Battery Level: ${level}%\nCharging: ${chargingText}${temp ? `\nTemperature: ${temp}°C` : ''}`;
                nextUserPrompt = `Tool result for getBatteryInformation:\n${toolResultSummary}\n\nState the device battery level (${level}%) and charging status (${chargingText}) clearly to the user.`;
              } else if (toolCall.name === 'countFiles') {
                const count = typeof toolResult.result?.count === 'number' ? toolResult.result.count : (typeof toolResult.result === 'number' ? toolResult.result : 0);
                const ext = toolCall.arguments?.extension ? `${toolCall.arguments.extension.toUpperCase()} ` : '';
                lastCountResult = { count, extension: toolCall.arguments?.extension };
                toolResultSummary = `Count: ${count} ${ext}file(s) found on device.`;
                nextUserPrompt = `Tool result for countFiles:\nFound ${count} ${ext}file(s) on the device.\n\nState the numeric count (${count}) clearly to the user (e.g., "You have ${count} ${ext}files on your device."). Do not output any more JSON tool calls.`;
              } else if (toolCall.name === 'searchFiles') {
                const isSummarizeOrRead = /\b(summarize|summary|read|content|what does .* say|inspect)\b/i.test(userInput);
                const files = Array.isArray(toolResult.result) ? toolResult.result : [];
                if (files.length > 0 && isSummarizeOrRead) {
                  const first = files[0];
                  const displayName = first.name || 'document';
                  toolResultSummary = `Found file: ${displayName} (${first.sizeFormatted || first.size + ' B'})`;
                  nextUserPrompt = `Tool result for searchFiles:\nFound ${displayName} on the device.\nYou have located the file, but you have NOT read its text contents yet.\nTo read and summarize the file, you MUST call readFile now on this file name:\n{"tool": "readFile", "arguments": {"path": "${displayName}"}}\nRespond ONLY with this single JSON tool call.`;
                } else if (files.length > 0) {
                  const fileListText = files.slice(0, 5).map((f: any) => `- ${f.name} (${f.sizeFormatted || (f.size + ' B')})`).join('\n');
                  toolResultSummary = `Found ${files.length} file(s):\n${fileListText}`;
                  nextUserPrompt = `Tool result for searchFiles:\n${toolResultSummary}\n\nState clearly to the user: "I found your file: ${files[0].name} (${files[0].sizeFormatted || (files[0].size + ' B')})" without mentioning Google search, search engines, or saying you will search again.`;
                } else {
                  toolResultSummary = `No files found matching the search criteria.`;
                  nextUserPrompt = `Tool result for searchFiles:\nNo matching files were found on the device.\n\nState politely that no matching files were found.`;
                }
              } else if (toolCall.name === 'readFile') {
                const text = typeof toolResult.result === 'string' ? toolResult.result.trim() : '';
                if (text && !text.startsWith('File not found')) {
                  toolResultSummary = `File contents:\n---\n${text.slice(0, 3000)}\n---`;
                  nextUserPrompt = `Tool result for readFile:\n${toolResultSummary}\n\nPlease summarize the document contents above clearly for the user. Mention the candidate and any markers found.`;
                } else {
                  toolResultSummary = text || 'File could not be opened or is empty.';
                  nextUserPrompt = `Tool result for readFile:\n${toolResultSummary}\n\nPlease state that the file could not be read or was empty.`;
                }
              } else if (toolCall.name === 'getNetworkInformation') {
                const net = toolResult.result || {};
                const connected = net.isConnected ?? net.connected;
                const ssid = net.ssid || net.wifiSsid;
                const ip = net.ipAddress || net.ip;
                toolResultSummary = `Connected: ${connected ? 'Yes' : 'No'}\nSSID: ${ssid || 'Unknown'}\nIP: ${ip || 'Unknown'}`;
                nextUserPrompt = `Tool result for getNetworkInformation:\n${toolResultSummary}\n\nState the network and Wi-Fi status clearly to the user.`;
              } else if (toolCall.name === 'getDiskInformation') {
                const disk = toolResult.result || {};
                toolResultSummary = typeof disk === 'string' ? disk : JSON.stringify(disk, null, 2);
                nextUserPrompt = `Tool result for getDiskInformation:\n${toolResultSummary}\n\nState the available storage space and capacity clearly to the user.`;
              } else if (toolCall.name === 'getSystemInfo') {
                const sys = toolResult.result || {};
                toolResultSummary = typeof sys === 'string' ? sys : JSON.stringify(sys, null, 2);
                nextUserPrompt = `Tool result for getSystemInfo:\n${toolResultSummary}\n\nState the device system specifications clearly to the user.`;
              } else {
                if (Array.isArray(toolResult.result)) {
                  const count = toolResult.result.length;
                  const sample = toolResult.result.slice(0, 5).map((item: any) => {
                    if (item && typeof item === 'object') {
                      if (item.name) return { name: item.name, size: item.sizeFormatted || item.size };
                      if (item.drive) return { drive: item.drive, total: item.totalFormatted, free: item.freeFormatted, used: item.usedFormatted };
                    }
                    return item;
                  });
                  toolResultSummary = `Found ${count} items. Top matches:\n${JSON.stringify(sample, null, 2)}`;
                } else {
                  const str = typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result, null, 2);
                  toolResultSummary = str.length > 1200 ? str.slice(0, 1200) + '... (truncated)' : str;
                }
                nextUserPrompt = `Tool result for ${toolCall.name}:\n${toolResultSummary}\n\nPlease provide your final helpful response based on these results.`;
              }

              messages.push({
                role: 'assistant',
                content: JSON.stringify({ tool: toolCall.name, arguments: toolCall.arguments }),
              });

              messages.push({
                role: 'user',
                content: nextUserPrompt,
              });
              trace('[PIPELINE_TRACE] MODEL FOLLOW-UP INPUT:', nextUserPrompt);
            }

            continue;
          } catch (error: any) {
            console.error('Error executing tool call:', error);
            messages.push({
              role: 'user',
              content: `Tool execution error: ${error?.message || String(error)}`,
            });
            continue;
          }
        } else {
          let cleanMessage = aiResponse.trim();
          if (/(.)\1{15,}/.test(cleanMessage)) {
            cleanMessage = cleanMessage.replace(/(.)\1{15,}/g, '$1$1$1');
          }
          // Strip prompt echo prefixes like "Tool result for searchFiles:\n"
          cleanMessage = cleanMessage.replace(/^(?:\[?Tool result(?: for \w+)?\]?:?|System result:?|Result for \w+:)\s*/i, '').trim();

          // Sanitization: Ensure raw tool call JSON is NEVER shown directly to the user
          if (cleanMessage.includes('"tool":') || cleanMessage.includes('"arguments":')) {
            cleanMessage = cleanMessage.replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '').trim();
            if (!cleanMessage) {
              cleanMessage = "I have completed your request.";
            }
          }

          // If the answer is raw JSON from small models (e.g. { count: 2 }), format it naturally
          try {
            if (cleanMessage.startsWith('{') && cleanMessage.endsWith('}')) {
              const parsed = JSON.parse(cleanMessage);
              if (parsed && typeof parsed === 'object') {
                if (typeof parsed.count === 'number') {
                  const type = parsed.extension ? `${parsed.extension.toUpperCase()} ` : (lastCountResult?.extension ? `${lastCountResult.extension.toUpperCase()} ` : '');
                  cleanMessage = `You have ${parsed.count} ${type}files.`;
                } else if (parsed.message) {
                  cleanMessage = parsed.message;
                } else if (parsed.response) {
                  cleanMessage = parsed.response;
                }
              }
            }
          } catch {}

          // If answering a count with words like "two PDF files" and no digit, include the digit
          if (!/\d/.test(cleanMessage) && (executedTools.includes('countFiles') || /\b(how many|count)\b/i.test(userInput) || /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+)?files?\b/i.test(cleanMessage))) {
            const wordMap: Record<string, string> = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
            cleanMessage = cleanMessage.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (match) => {
              const digit = wordMap[match.toLowerCase()];
              return digit !== undefined ? `${digit} (${match})` : match;
            });
          }

          if (!cleanMessage && lastCountResult) {
            const type = lastCountResult.extension ? `${lastCountResult.extension.toUpperCase()} ` : '';
            cleanMessage = `You have ${lastCountResult.count} ${type}files on your device.`;
          }

          trace('[PIPELINE_TRACE] FINAL AGENT ANSWER:', cleanMessage);

          return {
            message: cleanMessage,
            toolsExecuted: executedTools,
            files: discoveredFiles.length > 0 ? discoveredFiles : undefined,
            folders: discoveredFolders.length > 0 ? discoveredFolders : undefined,
          };
        }
      }

      // If loop completed max tool calls, request final natural-language summary
      messages.push({
        role: 'user',
        content: 'Please provide your final natural-language response to the user based on the tool results above. Do not output any JSON.',
      });

      try {
        const finalResponse = await this.aiService.getProvider().chat(messages);
        if (finalResponse && finalResponse.trim()) {
          let clean = finalResponse.trim();
          clean = clean.replace(/^(?:\[?Tool result(?: for \w+)?\]?:?|System result:?|Result for \w+:)\s*/i, '').trim();
          if (clean.includes('"tool":')) {
            clean = clean.replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '').trim();
          }
          if (!clean && lastCountResult) {
            const type = lastCountResult.extension ? `${lastCountResult.extension.toUpperCase()} ` : '';
            clean = `You have ${lastCountResult.count} ${type}files on your device.`;
          }
          if (clean) {
            trace('[PIPELINE_TRACE] FINAL AGENT ANSWER (Max Calls Follow-up):', clean);
            return {
              message: clean,
              toolsExecuted: executedTools,
              files: discoveredFiles.length > 0 ? discoveredFiles : undefined,
              folders: discoveredFolders.length > 0 ? discoveredFolders : undefined,
            };
          }
        }
      } catch {}

      return {
        message: "I've completed the tool operations. Here is what I found based on your request.",
        toolsExecuted: executedTools,
        files: discoveredFiles.length > 0 ? discoveredFiles : undefined,
        folders: discoveredFolders.length > 0 ? discoveredFolders : undefined,
      };
    } catch (error: any) {
      console.error('Error in dynamic agent:', error);
      return {
        message: `I encountered an error communicating with the runtime AI: ${error?.message || 'Unknown error'}.`,
        toolsExecuted: executedTools,
        files: [],
        folders: [],
      };
    }
  }

  /**
   * Robust parser that extracts one or multiple tool calls from model output.
   * Handles JSON arrays, multiple concatenated JSON blocks, or embedded code blocks.
   */
  public parseToolCalls(response: string, userInput?: string): ToolCall[] {
    const results: ToolCall[] = [];
    if (!response) return results;

    const knownToolNames = new Set(Object.keys(this.getAvailableTools()));

    const normalizeToolName = (name: string): string => {
      const trimmed = name.trim();
      const map: Record<string, string> = {
        read_file: 'readFile',
        readfile: 'readFile',
        read: 'readFile',
        search_files: 'searchFiles',
        searchfiles: 'searchFiles',
        find_files: 'searchFiles',
        findfiles: 'searchFiles',
        count_files: 'countFiles',
        countfiles: 'countFiles',
        search_folders: 'searchFolders',
        searchfolders: 'searchFolders',
        open_file: 'openFile',
        openfile: 'openFile',
        get_battery_information: 'getBatteryInformation',
        getbatteryinformation: 'getBatteryInformation',
        get_battery_info: 'getBatteryInformation',
        battery_info: 'getBatteryInformation',
        get_network_information: 'getNetworkInformation',
        getnetworkinformation: 'getNetworkInformation',
        get_network_info: 'getNetworkInformation',
        get_disk_information: 'getDiskInformation',
        getdiskinformation: 'getDiskInformation',
        get_disk_info: 'getDiskInformation',
        get_system_info: 'getSystemInfo',
        getsysteminfo: 'getSystemInfo',
      };
      return map[trimmed.toLowerCase()] || trimmed;
    };

    const tryParseJson = (str: string): any => {
      try {
        return JSON.parse(str);
      } catch {
        try {
          // 1. Remove trailing commas before } or ]
          let repaired = str.replace(/,\s*([}\]])/g, '$1');
          // 2. Repair missing commas between lines
          repaired = repaired.replace(/([0-9"truefalsenull\]}])\s*\n\s*(")/g, '$1,\n$2');
          // 3. Fix unescaped backslashes in paths
          repaired = repaired.replace(/\\(?!["\\/bfnrtu])/g, '/');
          return JSON.parse(repaired);
        } catch {
          try {
            // 4. Regex fallback: extract tool name and key arguments if JSON is malformed
            const toolMatch = str.match(/"(?:tool|name|action|function)"\s*:\s*"([^"]+)"/i);
            if (toolMatch) {
              const name = normalizeToolName(toolMatch[1]);
              const args: Record<string, any> = {};
              const pathMatch = str.match(/"path"\s*:\s*"([^"\r\n]*)/i);
              const queryMatch = str.match(/"query"\s*:\s*"([^"\r\n]*)/i);
              const extMatch = str.match(/"extension"\s*:\s*"([^"\r\n]*)/i);
              const countMatch = str.match(/"count"\s*:\s*([0-9]+)/i);
              if (pathMatch) args.path = pathMatch[1].replace(/\\/g, '/');
              if (queryMatch) args.query = queryMatch[1];
              if (extMatch) args.extension = extMatch[1];
              if (countMatch) args.count = parseInt(countMatch[1], 10);
              return { tool: name, arguments: args };
            }
          } catch {}
          return null;
        }
      }
    };

    const addIfValid = (obj: any) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;

      // 1. Direct tool property
      const toolName = obj.tool || obj.name || obj.tool_name || obj.action || obj.function;
      if (typeof toolName === 'string' && toolName.trim()) {
        const name = normalizeToolName(toolName);
        let args = obj.arguments || obj.parameters || obj.args || obj.params;
        if (!args || typeof args !== 'object') {
          const { tool: _tool, name: _n, tool_name: _tn, action: _action, function: _f, ...rest } = obj;
          args = rest;
        }
        results.push({ name, arguments: args || {} });
        return true;
      }

      // 2. Top-level key is a known tool: { "searchFiles": { ... } }
      for (const key of Object.keys(obj)) {
        const normKey = normalizeToolName(key);
        if (knownToolNames.has(normKey)) {
          results.push({
            name: normKey,
            arguments: typeof obj[key] === 'object' && obj[key] !== null ? obj[key] : {},
          });
          return true;
        }
      }

      // 3. Fallback: Model outputted tool arguments directly (e.g. { fileTypes: ["pdf"], ... })
      if (obj.fileTypes || obj.extension || (obj.query && !obj.message)) {
        const isCount = typeof obj.count === 'number' || (userInput && /how many|count/i.test(userInput));
        results.push({
          name: isCount ? 'countFiles' : 'searchFiles',
          arguments: {
            query: obj.query,
            extension: obj.extension,
            fileTypes: obj.fileTypes,
            limit: obj.limit,
            sortBy: obj.sortBy,
            sortOrder: obj.sortOrder,
          },
        });
        return true;
      }

      // 4. Fallback: Model outputted file reading arguments directly (e.g. { path: "..." })
      if (obj.path && !obj.message) {
        results.push({
          name: 'readFile',
          arguments: {
            path: obj.path,
            maxChars: obj.maxChars || 20000,
          },
        });
        return true;
      }

      return false;
    };

    // 1. Try parsing JSON array directly: [ { "tool": ... }, { "tool": ... } ]
    try {
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const cleanStr = (codeBlockMatch ? codeBlockMatch[1] : response).trim();
      if (cleanStr.startsWith('[') && cleanStr.endsWith(']')) {
        const arr = tryParseJson(cleanStr);
        if (Array.isArray(arr)) {
          for (const item of arr) {
            addIfValid(item);
          }
          if (results.length > 0) return results;
        }
      }
    } catch {}

    // 2. Scan for balanced JSON objects: { ... }
    let depth = 0;
    let inString = false;
    let isEscaped = false;
    let startIndex = -1;

    for (let i = 0; i < response.length; i++) {
      const char = response[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        if (depth === 0) {
          startIndex = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && startIndex !== -1) {
          const candidate = response.slice(startIndex, i + 1);
          startIndex = -1;
          const parsed = tryParseJson(candidate);
          if (parsed) {
            addIfValid(parsed);
          }
        } else if (depth < 0) {
          depth = 0;
          startIndex = -1;
        }
      }
    }

    return results;
  }

  // Backward compatibility helper
  public parseToolCall(response: string): ToolCall | null {
    const calls = this.parseToolCalls(response);
    return calls.length > 0 ? calls[0] : null;
  }

  private async executeTool(toolCall: ToolCall, context: AgentContext, userInput?: string): Promise<ToolResult> {
    // Semantic argument normalization for small models
    if ((toolCall.name === 'searchFiles' || toolCall.name === 'countFiles') && toolCall.arguments) {
      const q = typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query.toLowerCase().trim() : '';
      if (!toolCall.arguments.extension) {
        if (/^(?:word\s+files?|word\s+documents?|word)$/i.test(q)) {
          toolCall.arguments.extension = 'docx';
          toolCall.arguments.query = undefined;
        } else if (/^(?:excel\s+files?|excel\s+sheets?|spreadsheets?|excel)$/i.test(q)) {
          toolCall.arguments.extension = 'xlsx';
          toolCall.arguments.query = undefined;
        } else if (/^(?:pdf\s+files?|pdfs?)$/i.test(q)) {
          toolCall.arguments.extension = 'pdf';
          toolCall.arguments.query = undefined;
        }
      }

      // Never trust the small on-device model to get comparative sort/limit semantics right ("the
      // larger video", "which document uses the most storage"): re-derive them deterministically
      // from the user's own words with the same canonical detector directRouter.ts uses, and
      // override whatever the model guessed (including a comparison word it echoed as `query`,
      // which would otherwise become a literal, always-empty filename search).
      if (userInput) {
        const comparison = detectComparison(userInput);
        if (comparison) {
          toolCall.arguments.sortBy = comparison.sortBy;
          toolCall.arguments.sortOrder = comparison.sortOrder;
          const limit = detectLimit(userInput, comparison);
          if (limit !== undefined) toolCall.arguments.limit = limit;
          if (q && q.split(/\s+/).every((w) => COMPARISON_WORDS.has(w))) {
            toolCall.arguments.query = undefined;
          }
        }
        if (!toolCall.arguments.scopePath) {
          const scope = detectScope(userInput);
          if (scope) toolCall.arguments.scopePath = scope;
        }
      }
    }

    if (toolCall.name === 'readFile' && toolCall.arguments) {
      let p = typeof toolCall.arguments.path === 'string' ? toolCall.arguments.path.trim() : '';
      const isFullDocumentContentUri = p.startsWith('content://') && (p.includes('%2F') || p.includes('/document/primary%3A') || p.includes('/document/raw%3A'));
      
      if (!isFullDocumentContentUri) {
        try {
          const cleanQuery = p.replace(/^.*[\\/]/, '').trim() || p;
          let liveMatches = cleanQuery ? await computerService.searchFilesLive({ query: cleanQuery, limit: 1 }) : [];
          if ((!liveMatches || liveMatches.length === 0) && (userInput || p)) {
            const stopWords = new Set([
              'read', 'open', 'show', 'find', 'what', 'does', 'file', 'files', 'my', 'the',
              'please', 'tell', 'about', 'summarize', 'summary', 'password', 'doc', 'document',
              'documents', 'text', 'notes', 'content', 'android', 'storage', 'externalstorage',
              'home', 'user', 'primary'
            ]);
            const tokens = [
              ...p.split(/[^a-zA-Z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase())),
              ...(userInput || '').split(/[^a-zA-Z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
            ];
            for (const token of tokens) {
              const matches = await computerService.searchFilesLive({ query: token, limit: 1 });
              if (matches && matches.length > 0) {
                liveMatches = matches;
                break;
              }
            }
          }
          if (liveMatches && liveMatches.length > 0) {
            toolCall.arguments.path = liveMatches[0].path;
          }
        } catch (err) {
          console.warn('[dynamicAgent] readFile path resolution error:', err);
        }
      }
    }

    const tools = this.getAvailableTools();
    const tool = tools[toolCall.name];

    // Enforce OS and user permissions via PermissionManager
    const permCheck = permissionManager.checkToolPermission(toolCall.name);
    if (!permCheck.allowed) {
      console.warn(`[Foundry Security] Blocked tool execution for ${toolCall.name}: ${permCheck.reason}`);
      return {
        name: toolCall.name,
        result: {
          error: 'PERMISSION_DENIED',
          category: permCheck.category,
          message: permCheck.reason || 'Permission denied by user.',
        },
      };
    }

    if (tool) {
      const result = await tool.execute(toolCall.arguments, context);
      if (toolCall.name === 'readFile' && (!result || !String(result).trim())) {
        return {
          name: toolCall.name,
          result: `File not found or empty at path "${toolCall.arguments?.path || ''}". Please search for the file using searchFiles first.`,
        };
      }
      return { name: toolCall.name, result };
    }

    // Check central toolRegistry
    const registryTool = toolRegistry.getTool(toolCall.name);
    if (registryTool) {
      const result = await registryTool.execute(toolCall.arguments, context);
      if (toolCall.name === 'readFile' && (!result || !String(result).trim())) {
        return {
          name: toolCall.name,
          result: `File not found or empty at path "${toolCall.arguments?.path || ''}". Please search for the file using searchFiles first.`,
        };
      }
      return { name: toolCall.name, result };
    }

    throw new Error(`Tool not found: ${toolCall.name}`);
  }
}

export const dynamicAgent = new DynamicAgent(10, null);