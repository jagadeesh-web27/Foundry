/**
 * Foundry Device Permission Manager & Security Engine
 * Enforces least-privilege access control between the AI Agent and physical device capabilities.
 * Respects OS boundaries, prevents arbitrary execution, and requires explicit user confirmation.
 */

import { PermissionLevel } from '@/services/tools/toolRegistry';

export type DevicePermissionCategory =
  | 'filesystem'
  | 'systemInfo'
  | 'networkInfo'
  | 'runningApps'
  | 'openApplications'
  | 'microphone'
  | 'memory'
  | 'productivity'
  | 'developer'
  | 'accessibility'
  | 'communications'
  | 'calendar'
  | 'sendCommunication';

export type PermissionStatus = 'allowed' | 'ask' | 'denied';

export interface CategoryPermissionConfig {
  category: DevicePermissionCategory;
  name: string;
  description: string;
  defaultStatus: PermissionStatus;
  type: 'READ_ONLY' | 'ACTION';
  level: PermissionLevel;
}

export const PERMISSION_CONFIGS: Record<DevicePermissionCategory, CategoryPermissionConfig> = {
  filesystem: {
    category: 'filesystem',
    name: 'Filesystem Access',
    description: 'Permit searching, counting, and reading authorized user files and folders.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  systemInfo: {
    category: 'systemInfo',
    name: 'System & Hardware Information',
    description: 'Permit inspecting CPU, RAM, and Disk storage capacity.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  networkInfo: {
    category: 'networkInfo',
    name: 'Network Status & Connectivity',
    description: 'Permit checking Wi-Fi status, connection state, and internet availability.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  runningApps: {
    category: 'runningApps',
    name: 'Running Applications',
    description: 'Permit reading the list of currently open user desktop windows.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  openApplications: {
    category: 'openApplications',
    name: 'Application Launching',
    description: 'Permit launching installed desktop applications upon explicit user confirmation.',
    defaultStatus: 'ask',
    type: 'ACTION',
    level: 'ACTION',
  },
  microphone: {
    category: 'microphone',
    name: 'Microphone & Voice Input',
    description: 'Permit microphone access for speech-to-text voice conversations.',
    defaultStatus: 'ask',
    type: 'ACTION',
    level: 'ACTION',
  },
  memory: {
    category: 'memory',
    name: 'Personal Memory & Preferences',
    description: 'Permit remembering and recalling user preferences, projects, and notes.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  productivity: {
    category: 'productivity',
    name: 'Tasks & Productivity Reminders',
    description: 'Permit managing tasks, reminders, and daily briefings.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  developer: {
    category: 'developer',
    name: 'Developer Mode Tools',
    description: 'Permit inspecting project directories, dependencies, and build diagnostics.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  accessibility: {
    category: 'accessibility',
    name: 'Accessibility Diagnostics',
    description: 'Permit WCAG compliance checks, contrast calculation, and accessible name auditing.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  communications: {
    category: 'communications',
    name: 'Communications & Messages',
    description: 'Permit reading authorized emails, chats, and conversation history.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  calendar: {
    category: 'calendar',
    name: 'Calendar & Meetings',
    description: 'Permit reading upcoming calendar events and meeting schedules.',
    defaultStatus: 'allowed',
    type: 'READ_ONLY',
    level: 'READ',
  },
  sendCommunication: {
    category: 'sendCommunication',
    name: 'Send Messages & Emails',
    description: 'Permit dispatching emails or chat messages upon explicit user confirmation.',
    defaultStatus: 'ask',
    type: 'ACTION',
    level: 'ACTION',
  },
};

const STORAGE_KEY = 'foundry_device_permissions';

export class PermissionManager {
  private permissions: Record<DevicePermissionCategory, PermissionStatus>;

  constructor() {
    this.permissions = this.loadPermissions();
  }

  private loadPermissions(): Record<DevicePermissionCategory, PermissionStatus> {
    const defaults: Record<DevicePermissionCategory, PermissionStatus> = {
      filesystem: 'allowed',
      systemInfo: 'allowed',
      networkInfo: 'allowed',
      runningApps: 'allowed',
      openApplications: 'ask',
      microphone: 'ask',
      memory: 'allowed',
      productivity: 'allowed',
      developer: 'allowed',
      accessibility: 'allowed',
      communications: 'allowed',
      calendar: 'allowed',
      sendCommunication: 'ask',
    };

    if (typeof window === 'undefined' || !window.localStorage) {
      return defaults;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaults, ...parsed };
      }
    } catch (e) {
      console.warn('[PermissionManager] Failed to load permissions from localStorage:', e);
    }

    return defaults;
  }

  public savePermissions(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.permissions));
      } catch (e) {
        console.warn('[PermissionManager] Failed to save permissions to localStorage:', e);
      }
    }
  }

  public getPermission(category: DevicePermissionCategory): PermissionStatus {
    return this.permissions[category] || PERMISSION_CONFIGS[category]?.defaultStatus || 'allowed';
  }

  public setPermission(category: DevicePermissionCategory, status: PermissionStatus): void {
    this.permissions[category] = status;
    this.savePermissions();
  }

  public getAllPermissions(): Record<DevicePermissionCategory, PermissionStatus> {
    return { ...this.permissions };
  }

  public resetToDefaults(): void {
    for (const [key, cfg] of Object.entries(PERMISSION_CONFIGS)) {
      this.permissions[key as DevicePermissionCategory] = cfg.defaultStatus;
    }
    this.savePermissions();
  }

  /**
   * Map any tool name to its governing security category
   */
  public mapToolToCategory(toolName: string): DevicePermissionCategory {
    switch (toolName) {
      case 'searchFiles':
      case 'searchFolders':
      case 'countFiles':
      case 'readFile':
      case 'openFile':
      case 'revealFile':
      case 'find_largest_file':
        return 'filesystem';

      case 'getDiskInformation':
      case 'getSystemInfo':
      case 'diagnose_system_performance':
      case 'get_top_processes':
        return 'systemInfo';

      case 'getNetworkInformation':
      case 'checkInternetConnectivity':
        return 'networkInfo';

      case 'getRunningApplications':
      case 'getApplicationDetails':
      case 'discoverInstalledApplications':
        return 'runningApps';

      case 'openApplication':
        return 'openApplications';

      case 'save_memory':
      case 'recall_memory':
      case 'delete_memory':
        return 'memory';

      case 'manage_tasks':
      case 'create_reminder':
      case 'get_daily_briefing':
      case 'get_recent_activity':
        return 'productivity';

      case 'inspect_project_structure':
      case 'check_dev_environment':
      case 'explain_build_error':
        return 'developer';

      case 'analyze_contrast_ratio':
      case 'audit_accessibility_guidelines':
        return 'accessibility';

      case 'getPendingCommitments':
      case 'getWhatAmIForgetting':
        return 'productivity';

      case 'analyzeCommunicationForCommitments':
      case 'searchCrossSourceData':
      case 'syncConnectors':
        return 'communications';

      case 'prepareForMeeting':
      case 'readCalendar':
        return 'calendar';

      case 'sendEmail':
      case 'sendTeamsMessage':
      case 'replyMessage':
        return 'sendCommunication';

      default:
        return 'filesystem';
    }
  }

  /**
   * Check if a specific tool call is authorized to proceed
   */
  public checkToolPermission(toolName: string): {
    allowed: boolean;
    requiresConfirmation: boolean;
    category: DevicePermissionCategory;
    level: PermissionLevel;
    reason?: string;
  } {
    // 1. Strict blocking of privileged/restricted actions
    const privilegedTools = ['execute_command', 'run_powershell', 'edit_registry', 'modify_firewall', 'extract_credentials'];
    if (privilegedTools.includes(toolName)) {
      return {
        allowed: false,
        requiresConfirmation: false,
        category: 'developer',
        level: 'PRIVILEGED',
        reason: 'Privileged/arbitrary execution is strictly forbidden by Foundry Security Architecture.',
      };
    }

    const category = this.mapToolToCategory(toolName);
    const status = this.getPermission(category);
    const config = PERMISSION_CONFIGS[category] || {
      category,
      name: category,
      description: '',
      defaultStatus: 'allowed',
      type: 'READ_ONLY',
      level: 'READ',
    };

    if (status === 'denied') {
      return {
        allowed: false,
        requiresConfirmation: false,
        category,
        level: config.level,
        reason: `Access to ${config.name} is denied in Foundry Settings. The user has disabled this device capability.`,
      };
    }

    if (status === 'ask' || config.level === 'ACTION' || config.level === 'WRITE') {
      return {
        allowed: true,
        requiresConfirmation: true,
        category,
        level: config.level,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      category,
      level: config.level,
    };
  }
}

export const permissionManager = new PermissionManager();
