/**
 * Foundry Cross-Platform Device Interface
 * Defines platform-neutral contracts for physical device capabilities across Windows, Android, and Web fallbacks.
 */

import { IndexedFile, IndexedFolder, ComputerFileType } from '@/types/file';
import {
  DiskInfo,
  BatteryInfo,
  SystemHardwareInfo,
  NetworkInfo,
  RunningApp,
  DiscoveredApplication,
  ApplicationDetails,
  ResolvedApplication,
} from '@/services/native/computerService';

export interface FilesystemCapability {
  searchFiles(args: {
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
  }): Promise<IndexedFile[]>;

  searchFolders(args: {
    nameQuery?: string;
    createdAfter?: string;
    createdBefore?: string;
    modifiedAfter?: string;
    modifiedBefore?: string;
    limit?: number;
  }): Promise<IndexedFolder[]>;

  countFiles(args: {
    query?: string;
    fileTypes?: ComputerFileType[];
    extension?: string;
    createdAfter?: string;
    createdBefore?: string;
    modifiedAfter?: string;
    modifiedBefore?: string;
  }): Promise<number>;

  readFile(path: string, maxChars?: number): Promise<string>;
  openFile(path: string): Promise<boolean>;
  revealFile(path: string): Promise<boolean>;
  getFileMetadata?(path: string): Promise<IndexedFile | null>;
}

export interface SystemCapability {
  getSystemInfo(): Promise<SystemHardwareInfo>;
  getDiskInformation(): Promise<DiskInfo[]>;
  getBatteryInformation?(): Promise<BatteryInfo>;
}

export interface NetworkCapability {
  getNetworkInformation(): Promise<NetworkInfo>;
  checkInternetConnectivity(): Promise<boolean>;
}

export interface ApplicationCapability {
  getRunningApplications(): Promise<RunningApp[]>;
  discoverInstalledApplications(forceRefresh?: boolean): Promise<DiscoveredApplication[]>;
  getApplicationDetails(appName: string): Promise<ApplicationDetails>;
  resolveInstalledApplication(appName: string): Promise<ResolvedApplication>;
  openApplication(targetPathOrId: string): Promise<boolean>;
}

export interface DocumentCapability {
  extractText(path: string, maxChars?: number): Promise<{ text: string; pageCount?: number; extracted: boolean; ocrNeeded?: boolean }>;
}

export interface DeviceInterface {
  platform: 'windows' | 'android' | 'web';
  filesystem: FilesystemCapability;
  system: SystemCapability;
  network: NetworkCapability;
  applications: ApplicationCapability;
  documents: DocumentCapability;
}
