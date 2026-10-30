/**
 * Web / Browser Fallback Device Adapter
 * Provides safe in-memory fallbacks when running outside native desktop or mobile environments.
 */

import {
  DeviceInterface,
  FilesystemCapability,
  SystemCapability,
  NetworkCapability,
  ApplicationCapability,
  DocumentCapability,
} from './deviceInterface';
import { db } from '@/services/db/database';
import { IndexedFile, IndexedFolder } from '@/types/file';
import {
  DiskInfo,
  SystemHardwareInfo,
  NetworkInfo,
  RunningApp,
  DiscoveredApplication,
  ApplicationDetails,
  ResolvedApplication,
} from '@/services/native/computerService';

export class WebFallbackDeviceAdapter implements DeviceInterface {
  public platform = 'web' as const;

  public filesystem: FilesystemCapability = {
    searchFiles: async (args): Promise<IndexedFile[]> => {
      const all = await db.getAllIndexedFiles();
      return all.slice(0, args.limit || 50);
    },
    searchFolders: async (args): Promise<IndexedFolder[]> => {
      const all = await db.getAllIndexedFolders();
      return all.slice(0, args.limit || 50);
    },
    countFiles: async (): Promise<number> => {
      const all = await db.getAllIndexedFiles();
      return all.length;
    },
    readFile: async (): Promise<string> => {
      return '';
    },
    openFile: async (): Promise<boolean> => {
      return false;
    },
    revealFile: async (): Promise<boolean> => {
      return false;
    },
  };

  public system: SystemCapability = {
    getSystemInfo: async (): Promise<SystemHardwareInfo> => {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      return {
        osName: nav?.platform || 'Web Browser',
        osVersion: 'Browser Standard',
        hostName: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
        cpuBrand: 'Web Worker Virtualized CPU',
        cpuCores: nav?.hardwareConcurrency || 4,
        cpuLogicalCores: nav?.hardwareConcurrency || 4,
        totalRamBytes: 16 * 1024 * 1024 * 1024,
        totalRamFormatted: '16.00 GB',
        freeRamBytes: 8 * 1024 * 1024 * 1024,
        freeRamFormatted: '8.00 GB',
        usedRamBytes: 8 * 1024 * 1024 * 1024,
        usedRamFormatted: '8.00 GB',
        ramPercentageUsed: 50.0,
      };
    },
    getDiskInformation: async (): Promise<DiskInfo[]> => {
      return [
        {
          drive: 'V:',
          volumeName: 'Web Storage Cache',
          totalBytes: 50 * 1024 * 1024 * 1024,
          totalFormatted: '50.00 GB',
          freeBytes: 25 * 1024 * 1024 * 1024,
          freeFormatted: '25.00 GB',
          usedBytes: 25 * 1024 * 1024 * 1024,
          usedFormatted: '25.00 GB',
          percentageUsed: 50.0,
          percentageFree: 50.0,
          fileSystem: 'IndexedDB',
        },
      ];
    },
  };

  public network: NetworkCapability = {
    getNetworkInformation: async (): Promise<NetworkInfo> => {
      const isOnline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
      return {
        isConnected: isOnline,
        internetAccess: isOnline,
        connectionType: 'Ethernet',
        primaryIp: '127.0.0.1',
        interfaces: [],
      };
    },
    checkInternetConnectivity: async (): Promise<boolean> => {
      return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
    },
  };

  public applications: ApplicationCapability = {
    getRunningApplications: async (): Promise<RunningApp[]> => {
      return [];
    },
    discoverInstalledApplications: async (): Promise<DiscoveredApplication[]> => {
      return [];
    },
    getApplicationDetails: async (appName: string): Promise<ApplicationDetails> => {
      return {
        found: false,
        name: appName,
        displayName: appName,
        source: 'Web Environment',
        isRunning: false,
      };
    },
    resolveInstalledApplication: async (appName: string): Promise<ResolvedApplication> => {
      return {
        found: false,
        appName,
        isRunning: false,
      };
    },
    openApplication: async (): Promise<boolean> => {
      return false;
    },
  };

  public documents: DocumentCapability = {
    extractText: async (): Promise<{ text: string; pageCount?: number; extracted: boolean; ocrNeeded?: boolean }> => {
      return {
        text: '',
        extracted: false,
        ocrNeeded: false,
      };
    },
  };
}
