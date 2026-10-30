/**
 * Windows Native Device Adapter
 * Bridges the platform-neutral DeviceInterface to the Tauri/Rust Windows implementation.
 */

import {
  DeviceInterface,
  FilesystemCapability,
  SystemCapability,
  NetworkCapability,
  ApplicationCapability,
  DocumentCapability,
} from './deviceInterface';
import { computerService } from '@/services/native/computerService';

export class WindowsDeviceAdapter implements DeviceInterface {
  public platform = 'windows' as const;

  public filesystem: FilesystemCapability = {
    searchFiles: async (args) => {
      return computerService.searchFilesLive(args);
    },
    searchFolders: async (args) => {
      return computerService.searchFoldersLive(args);
    },
    countFiles: async (args) => {
      const files = await computerService.searchFilesLive({ ...args, limit: 10000 });
      return files.length;
    },
    readFile: async (path, maxChars = 20000) => {
      const content = await computerService.readFileContent(path, maxChars);
      return content || '';
    },
    openFile: async (path) => {
      return computerService.openFile(path);
    },
    revealFile: async (path) => {
      return computerService.revealFile(path);
    },
  };

  public system: SystemCapability = {
    getSystemInfo: async () => {
      return computerService.getSystemInfo();
    },
    getDiskInformation: async () => {
      return computerService.getDiskInformation();
    },
  };

  public network: NetworkCapability = {
    getNetworkInformation: async () => {
      return computerService.getNetworkInformation();
    },
    checkInternetConnectivity: async () => {
      const net = await computerService.getNetworkInformation();
      return net.internetAccess;
    },
  };

  public applications: ApplicationCapability = {
    getRunningApplications: async () => {
      return computerService.getRunningApplications();
    },
    discoverInstalledApplications: async () => {
      return computerService.discoverInstalledApplications();
    },
    getApplicationDetails: async (appName) => {
      return computerService.getApplicationDetails(appName);
    },
    resolveInstalledApplication: async (appName) => {
      return computerService.resolveInstalledApplication(appName);
    },
    openApplication: async (targetPathOrId) => {
      const res = await computerService.launchApplication(targetPathOrId);
      return res.success;
    },
  };

  public documents: DocumentCapability = {
    extractText: async (path, maxChars = 20000) => {
      const text = await computerService.readFileContent(path, maxChars);
      const isPdf = path.toLowerCase().endsWith('.pdf');
      const isEmpty = !text || text.trim().length === 0;

      return {
        text: text || '',
        extracted: !isEmpty,
        ocrNeeded: isPdf && isEmpty,
      };
    },
  };
}
