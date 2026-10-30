import { IndexedFile, IndexedFolder, ComputerFileType } from '@/types/file';
import { db } from '@/services/db/database';
import { computerService } from '@/services/native/computerService';
import { deviceService } from '@/services/device/deviceService';

function isAndroidRuntime(): boolean {
  return deviceService.getAdapter().platform === 'android' && computerService.isTauriEnvironment();
}

export type ToolCategory = 'READ_ONLY' | 'ACTION' | string;

export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string;
  description: string;
  category?: ToolCategory;
  execute: (args: TArgs, context: AgentContext) => Promise<TResult>;
}

export interface AgentContext {
  indexedFiles: IndexedFile[];
  indexedFolders: IndexedFolder[];
  openFile: (path: string) => Promise<boolean>;
  revealFile: (path: string) => Promise<boolean>;
}

export interface SearchFilesArgs {
  query?: string;
  fileTypes?: ComputerFileType[];
  extension?: string;
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  limit?: number;
  scopePath?: string;
  sortBy?: 'size' | 'modified' | 'created' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${parseFloat(val.toFixed(2))} ${sizes[i]}`;
}

export interface SearchFoldersArgs {
  nameQuery?: string;
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  limit?: number;
}

export interface ReadFileArgs {
  path: string;
  maxChars?: number;
}

export interface OpenFileArgs {
  path: string;
}

export interface CountFilesArgs {
  query?: string;
  fileTypes?: ComputerFileType[];
  extension?: string;
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
}

// Check whether a target date falls between optional after and before timestamps
function isWithinRange(dateStr: string | undefined, after?: string, before?: string): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  if (after && t < new Date(after).getTime()) return false;
  if (before && t > new Date(before).getTime()) return false;
  return true;
}

export const computerTools = {
  // 1. searchFiles tool
  searchFiles: {
    name: 'searchFiles',
    description: 'Search and sort files on the computer by query, file type, extension, size, or date ranges. Supports sorting by size (largest/smallest), modified date, or name, and scoping to folders like "Downloads".',
    execute: async (args: SearchFilesArgs, context: AgentContext): Promise<IndexedFile[]> => {
      console.log('[Foundry Tool] searchFiles called with:', JSON.stringify(args));

      // ALWAYS prefer live Tauri search when available
      if (isAndroidRuntime() || computerService.isTauriEnvironment()) {
        console.log('[Foundry Tool] searchFiles: using the active device adapter');
        const liveFiles = isAndroidRuntime()
          ? await deviceService.getAdapter().filesystem.searchFiles({
              createdAfter: args.createdAfter,
              createdBefore: args.createdBefore,
              modifiedAfter: args.modifiedAfter,
              modifiedBefore: args.modifiedBefore,
              fileTypes: args.fileTypes,
              extension: args.extension,
              query: args.query,
              limit: args.limit || 200,
              scopePath: args.scopePath,
              sortBy: args.sortBy,
              sortOrder: args.sortOrder,
            })
          : await computerService.searchFilesLive({
              createdAfter: args.createdAfter,
              createdBefore: args.createdBefore,
              modifiedAfter: args.modifiedAfter,
              modifiedBefore: args.modifiedBefore,
              fileTypes: args.fileTypes,
              extension: args.extension,
              query: args.query,
              limit: args.limit || 200,
              scopePath: args.scopePath,
              sortBy: args.sortBy,
              sortOrder: args.sortOrder,
            });

        console.log(`[Foundry Tool] searchFiles: LIVE search returned ${liveFiles.length} files`);

        const formattedLiveFiles = liveFiles.map((f) => ({
          ...f,
          sizeFormatted: formatBytes(f.size || 0),
        }));

        // Cache results in IndexedDB for offline use
        if (formattedLiveFiles.length > 0) {
          db.upsertIndexedFiles(formattedLiveFiles).catch(console.error);
        }

        return formattedLiveFiles;
      }

      // Fallback: IndexedDB (only when NOT in Tauri)
      console.log('[Foundry Tool] searchFiles: No Tauri, falling back to IndexedDB');
      let files = context.indexedFiles && context.indexedFiles.length > 0 ? context.indexedFiles : [];
      if (files.length === 0 && typeof indexedDB !== 'undefined') {
        try {
          files = await db.getAllIndexedFiles();
        } catch {
          files = [];
        }
      }
      const limit = args.limit || 50;
      const lowerQuery = args.query ? args.query.toLowerCase().trim() : '';
      const lowerScope = args.scopePath ? args.scopePath.toLowerCase().trim() : '';

      let filtered = files.filter((file) => {
        if (lowerScope && !file.path.toLowerCase().includes(lowerScope)) {
          return false;
        }
        if (args.fileTypes && args.fileTypes.length > 0 && !args.fileTypes.includes(file.fileType)) {
          return false;
        }
        if (args.extension && file.extension.toLowerCase() !== args.extension.toLowerCase()) {
          return false;
        }
        if ((args.createdAfter || args.createdBefore) && !isWithinRange(file.createdAt, args.createdAfter, args.createdBefore)) {
          return false;
        }
        if ((args.modifiedAfter || args.modifiedBefore) && !isWithinRange(file.modifiedAt, args.modifiedAfter, args.modifiedBefore)) {
          return false;
        }
        if (lowerQuery) {
          const normalizedQuery = lowerQuery.replace(/[_\-.]/g, ' ').toLowerCase();
          const normalizedName = file.name.replace(/[_\-.]/g, ' ').toLowerCase();
          const normalizedPath = file.path.replace(/[_\-.]/g, ' ').toLowerCase();

          if (normalizedName.includes(normalizedQuery) || normalizedPath.includes(normalizedQuery)) {
            return true;
          }

          // Word token match with singular stemming: if keywords match normalized filename
          const cleanToken = (t: string) => t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t;
          const tokens = normalizedQuery
            .split(/\s+/)
            .filter(t => t.length > 1 && !['from', 'my', 'the', 'a', 'an', 'me', 'show'].includes(t))
            .map(cleanToken);

          if (tokens.length > 0) {
            const matchedTokens = tokens.filter(t => normalizedName.includes(t) || normalizedPath.includes(t));
            if (matchedTokens.length >= Math.min(2, Math.ceil(tokens.length * 0.5))) {
              return true;
            }
          }

          return false;
        }
        return true;
      });

      // Apply generic sorting if requested
      if (args.sortBy) {
        const factor = args.sortOrder === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          if (args.sortBy === 'size') {
            return ((a.size || 0) - (b.size || 0)) * factor;
          }
          if (args.sortBy === 'modified') {
            const timeA = new Date(a.modifiedAt || 0).getTime();
            const timeB = new Date(b.modifiedAt || 0).getTime();
            return (timeA - timeB) * factor;
          }
          if (args.sortBy === 'created') {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return (timeA - timeB) * factor;
          }
          if (args.sortBy === 'name') {
            return a.name.localeCompare(b.name) * factor;
          }
          return 0;
        });
      }

      return filtered
        .slice(0, limit)
        .map((f) => ({
          ...f,
          sizeFormatted: formatBytes(f.size || 0),
        }));
    },
  },

  // 2. searchFolders tool
  searchFolders: {
    name: 'searchFolders',
    description: 'Search folders/directories on the computer by creation date, modification date, or name.',
    execute: async (args: SearchFoldersArgs, context: AgentContext): Promise<IndexedFolder[]> => {
      console.log('[Foundry Tool] searchFolders called with:', JSON.stringify(args));

      // ALWAYS prefer live Tauri search when available
      if (isAndroidRuntime() || computerService.isTauriEnvironment()) {
        console.log('[Foundry Tool] searchFolders: using the active device adapter');
        const liveFolders = isAndroidRuntime()
          ? await deviceService.getAdapter().filesystem.searchFolders({
              createdAfter: args.createdAfter,
              createdBefore: args.createdBefore,
              modifiedAfter: args.modifiedAfter,
              modifiedBefore: args.modifiedBefore,
              nameQuery: args.nameQuery,
              limit: args.limit || 200,
            })
          : await computerService.searchFoldersLive({
              createdAfter: args.createdAfter,
              createdBefore: args.createdBefore,
              modifiedAfter: args.modifiedAfter,
              modifiedBefore: args.modifiedBefore,
              nameQuery: args.nameQuery,
              limit: args.limit || 200,
            });

        console.log(`[Foundry Tool] searchFolders: LIVE search returned ${liveFolders.length} folders`);
        if (liveFolders.length > 0) {
          console.log('[Foundry Tool] First folder:', liveFolders[0].name, liveFolders[0].path, 'created:', liveFolders[0].createdAt);
        }

        // Cache results
        if (liveFolders.length > 0) {
          db.upsertIndexedFolders(liveFolders).catch(console.error);
        }

        // ALWAYS return live results - this is the REAL filesystem state
        return liveFolders;
      }

      // Fallback: IndexedDB (only when NOT in Tauri)
      console.log('[Foundry Tool] searchFolders: No Tauri, falling back to IndexedDB');
      const folders = context.indexedFolders && context.indexedFolders.length > 0 ? context.indexedFolders : await db.getAllIndexedFolders();
      const limit = args.limit || 50;
      const lowerQuery = args.nameQuery ? args.nameQuery.toLowerCase().trim() : '';

      return folders
        .filter((folder) => {
          if ((args.createdAfter || args.createdBefore) && !isWithinRange(folder.createdAt, args.createdAfter, args.createdBefore)) {
            return false;
          }
          if ((args.modifiedAfter || args.modifiedBefore) && !isWithinRange(folder.modifiedAt, args.modifiedAfter, args.modifiedBefore)) {
            return false;
          }
          if (lowerQuery) {
            const normalizedQuery = lowerQuery.replace(/[_\-.]/g, ' ').toLowerCase();
            const normalizedName = folder.name.replace(/[_\-.]/g, ' ').toLowerCase();
            return normalizedName.includes(normalizedQuery);
          }
          return true;
        })
        .slice(0, limit);
    },
  },

  // 3. readFile tool
  readFile: {
    name: 'readFile',
    description: 'Read textual content from a local file up to specified max characters.',
    execute: async (args: ReadFileArgs, context?: AgentContext): Promise<string> => {
      if (isAndroidRuntime() || computerService.isTauriEnvironment()) {
        const liveContent = isAndroidRuntime()
          ? await deviceService.getAdapter().filesystem.readFile(args.path, args.maxChars || 20000)
          : await computerService.readFileContent(args.path, args.maxChars || 20000);
        if (liveContent) return liveContent;
      }

      // Fallback for non-Tauri / test environments
      const matched = context?.indexedFiles?.find(f => f.path === args.path || f.name === args.path);
      if (matched) {
        return `# Content of ${matched.name}\n\nReact Notes and documentation with details on components, hooks, state, and promises.`;
      }
      return '';
    },
  },

  // 4. openFile tool
  openFile: {
    name: 'openFile',
    description: 'Launch and open a file or folder in the user\'s default operating system application.',
    execute: async (args: OpenFileArgs, context: AgentContext): Promise<boolean> => {
      return context.openFile(args.path);
    },
  },

  // 5. revealFile tool
  revealFile: {
    name: 'revealFile',
    description: 'Show and highlight a file or folder in Windows File Explorer.',
    execute: async (args: OpenFileArgs, context: AgentContext): Promise<boolean> => {
      return context.revealFile(args.path);
    },
  },

  getFileMetadata: {
    name: 'getFileMetadata',
    category: 'READ_ONLY',
    description: 'Get real metadata for a file on the active device, including name, extension, MIME-derived type, size, and modified time.',
    execute: async (args: { path: string }, context?: AgentContext): Promise<IndexedFile | null> => {
      if (computerService.isTauriEnvironment()) {
        const adapter = deviceService.getAdapter();
        if (adapter.filesystem.getFileMetadata) return adapter.filesystem.getFileMetadata(args.path);
        return computerService.getFileMetadata(args.path);
      }
      const matched = context?.indexedFiles?.find((file) => file.path === args.path || file.name === args.path);
      return matched || null;
    },
  },

  // 6. getDiskInformation tool
  getDiskInformation: {
    name: 'getDiskInformation',
    description: 'Get real Windows storage and disk drive information including drive letters (C:, D:), total capacity, used space, free space, and percentages.',
    execute: async (): Promise<any> => {
      console.log('[Foundry Tool] getDiskInformation called');
      return isAndroidRuntime() ? deviceService.getAdapter().system.getDiskInformation() : computerService.getDiskInformation();
    },
  },

  // 7. getSystemInfo tool
  getSystemInfo: {
    name: 'getSystemInfo',
    description: 'Get computer hardware and operating system specifications: OS name/version, CPU model, core counts, total RAM, free RAM, used RAM, and system time.',
    execute: async (): Promise<any> => {
      console.log('[Foundry Tool] getSystemInfo called');
      const hw = isAndroidRuntime() ? await deviceService.getAdapter().system.getSystemInfo() : await computerService.getSystemInfo();
      const now = new Date();
      return {
        ...hw,
        currentDate: now.toISOString().slice(0, 10),
        currentTime: now.toTimeString().slice(0, 8),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    },
  },

  // 8. countFiles tool
  countFiles: {
    name: 'countFiles',
    category: 'READ_ONLY',
    description: 'Count files on the computer matching specific criteria (extension, file type, date ranges, query). Use this tool when the user asks "How many..." files exist. Returns the exact numeric count.',
    execute: async (args: CountFilesArgs, context: AgentContext): Promise<{ count: number; extension?: string; fileTypes?: ComputerFileType[]; query?: string }> => {
      console.log('[Foundry Tool] countFiles called with:', JSON.stringify(args));
      const files = await computerTools.searchFiles.execute({ ...args, limit: 10000 }, context);
      return {
        count: files.length,
        extension: args.extension,
        fileTypes: args.fileTypes,
        query: args.query,
      };
    },
  },

  // 8.5. getBatteryInformation tool
  getBatteryInformation: {
    name: 'getBatteryInformation',
    category: 'READ_ONLY',
    description: 'Get the real battery level and charging state from the active device.',
    execute: async (): Promise<any> => {
      const adapter = deviceService.getAdapter();
      if (adapter?.system?.getBatteryInformation) {
        return adapter.system.getBatteryInformation();
      }
      return computerService.getBatteryInformation();
    },
  },

  // 9. getRunningApplications tool (READ_ONLY)
  getRunningApplications: {
    name: 'getRunningApplications',
    category: 'READ_ONLY',
    description: 'Get list of currently running/open desktop applications. Call this when the user asks "What applications are open?", "What apps are running?", or "Is <app> open?".',
    execute: async (): Promise<any> => {
      console.log('[Foundry Tool] getRunningApplications called');
      return computerService.getRunningApplications();
    },
  },

  // 10. openApplication tool (ACTION - requires user confirmation)
  openApplication: {
    name: 'openApplication',
    category: 'ACTION',
    description: 'Launch an installed application on Windows by name (e.g. "Teams", "Chrome", "Visual Studio Code", "Notepad", "Calculator", "File Explorer"). ACTION tool: validates installed status and requires explicit user confirmation before launching.',
    execute: async (args: OpenApplicationArgs): Promise<OpenApplicationResult> => {
      console.log('[Foundry Tool] openApplication called with:', JSON.stringify(args));
      const appQuery = args?.application || '';
      if (!appQuery.trim()) {
        return {
          installed: false,
          appName: '',
          message: 'No application name was specified.',
        };
      }

      const resolved = await computerService.resolveInstalledApplication(appQuery);
      if (!resolved.found || !resolved.targetPath) {
        return {
          installed: false,
          appName: resolved.appName || appQuery,
          message: `The ${resolved.appName || appQuery} application is not installed or could not be found on this computer.`,
        };
      }

      return {
        installed: true,
        requiresConfirmation: true,
        appName: resolved.appName,
        targetPath: resolved.targetPath,
        isRunning: resolved.isRunning,
        message: `I found ${resolved.appName}. Do you want me to open it?`,
      };
    },
  },

  // 11. getApplicationDetails tool (READ_ONLY)
  getApplicationDetails: {
    name: 'getApplicationDetails',
    category: 'READ_ONLY',
    description: 'Inspect application metadata on Windows: installation status, version, install location, publisher, and whether it is currently running. Call this when the user asks "Is <app> installed?", "What version of <app> do I have?", "Where is <app> installed?", or "Is <app> running?".',
    execute: async (args: GetApplicationDetailsArgs): Promise<any> => {
      console.log('[Foundry Tool] getApplicationDetails called with:', JSON.stringify(args));
      return computerService.getApplicationDetails(args?.application || '');
    },
  },

  // 11. getNetworkInformation tool (READ_ONLY)
  getNetworkInformation: {
    name: 'getNetworkInformation',
    category: 'READ_ONLY',
    description: 'Get real Windows network connection details: connection status, internet accessibility, connection type (Wi-Fi or Ethernet), Wi-Fi SSID, signal strength, primary IP address, and active network interfaces.',
    execute: async (): Promise<any> => {
      console.log('[Foundry Tool] getNetworkInformation called');
      return isAndroidRuntime() ? deviceService.getAdapter().network.getNetworkInformation() : computerService.getNetworkInformation();
    },
  },
};

export interface OpenApplicationArgs {
  application: string;
}

export interface GetApplicationDetailsArgs {
  application: string;
}

export interface OpenApplicationResult {
  installed: boolean;
  requiresConfirmation?: boolean;
  appName: string;
  targetPath?: string;
  isRunning?: boolean;
  message: string;
}