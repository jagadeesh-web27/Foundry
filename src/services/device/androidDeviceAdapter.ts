import {
  DeviceInterface,
  FilesystemCapability,
  SystemCapability,
  NetworkCapability,
  ApplicationCapability,
  DocumentCapability,
} from './deviceInterface';
import { computerService } from '@/services/native/computerService';
import { IndexedFile, IndexedFolder } from '@/types/file';
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

/** Device adapter for the native Tauri Android runtime. */
/**
 * Android exposes dozens of mounts (read-only system images, APEX modules, FUSE views, per-app bind
 * mounts). The storage a person means by "how much space do I have" is the shared user-data volume,
 * mounted at /storage/emulated (backed by /data). Report that single volume.
 */
export function pickAndroidUserStorage(disks: DiskInfo[]): DiskInfo | null {
  const usable = disks.filter((d) => d.totalBytes > 0);
  const chosen =
    usable.find((d) => d.drive === '/storage/emulated') ||
    usable.find((d) => d.drive === '/data') ||
    usable.filter((d) => !/^\/(apex|bootstrap-apex|system|vendor|product|odm|oem|dev|config|mnt)\b/.test(d.drive) && d.drive !== '/')
      .sort((a, b) => b.totalBytes - a.totalBytes)[0];
  return chosen ? { ...chosen, drive: 'Phone storage' } : null;
}

export class AndroidDeviceAdapter implements DeviceInterface {
  public platform = 'android' as const;

  public filesystem: FilesystemCapability = {
    searchFiles: async (args): Promise<IndexedFile[]> => {
      try {
        return await computerService.searchFilesLive(args);
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] Live file search failed:', err);
        return [];
      }
    },

    searchFolders: async (args): Promise<IndexedFolder[]> => {
      try {
        return await computerService.searchFoldersLive(args);
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] Live folder search failed:', err);
        return [];
      }
    },

    countFiles: async (args): Promise<number> => {
      try {
        const files = await computerService.searchFilesLive({ ...args, limit: 10000 });
        return files.length;
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] Live file count failed:', err);
        return 0;
      }
    },

    readFile: async (path, maxChars = 20000): Promise<string> => {
      try {
        return await computerService.readFileContent(path, maxChars);
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] Live file read failed:', err);
        return '';
      }
    },

    openFile: async (path): Promise<boolean> => {
      try {
        return await computerService.openFile(path);
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] openFile failed:', err);
        return false;
      }
    },

    revealFile: async (path): Promise<boolean> => {
      try {
        return await computerService.revealFile(path);
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] revealFile failed:', err);
        return false;
      }
    },

    getFileMetadata: async (path): Promise<IndexedFile | null> => {
      return computerService.getFileMetadata(path);
    },
  };

  public system: SystemCapability = {
    getSystemInfo: async (): Promise<SystemHardwareInfo> => {
      const info = await computerService.getSystemInfo();
      const isAndroid = info.osName.toLowerCase().includes('android') || info.osName.toLowerCase().includes('linux');
      if (!isAndroid) {
        throw new Error(`Android adapter received non-Android system information: ${info.osName}`);
      }
      return {
        ...info,
        osName: 'Android',
      };
    },

    getDiskInformation: async (): Promise<DiskInfo[]> => {
      const storage = pickAndroidUserStorage(await computerService.getDiskInformation());
      return storage ? [storage] : [];
    },

    getBatteryInformation: async (): Promise<BatteryInfo> => {
      return computerService.getBatteryInformation();
    },
  };

  public network: NetworkCapability = {
    getNetworkInformation: async (): Promise<NetworkInfo> => {
      return computerService.getNetworkInformation();
    },

    checkInternetConnectivity: async (): Promise<boolean> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        await fetch('https://clients3.google.com/generate_204', {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return true;
      } catch {
        return typeof navigator !== 'undefined' ? navigator.onLine : false;
      }
    },
  };

  public applications: ApplicationCapability = {
    getRunningApplications: async (): Promise<RunningApp[]> => [],

    discoverInstalledApplications: async (): Promise<DiscoveredApplication[]> => {
      try {
        return await computerService.discoverInstalledApplications();
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] discoverInstalledApplications failed:', err);
        return [];
      }
    },

    getApplicationDetails: async (appName: string): Promise<ApplicationDetails> => {
      try {
        return await computerService.getApplicationDetails(appName);
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] getApplicationDetails failed:', err);
        return { found: false, name: appName, displayName: appName, source: 'Android PackageManager', isRunning: false };
      }
    },

    resolveInstalledApplication: async (appName: string): Promise<ResolvedApplication> => {
      try {
        return await computerService.resolveInstalledApplication(appName);
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] resolveInstalledApplication failed:', err);
        return { found: false, appName, isRunning: false };
      }
    },

    openApplication: async (targetPathOrId: string): Promise<boolean> => {
      try {
        const result = await computerService.launchApplication(targetPathOrId);
        return result.success;
      } catch (err) {
        console.warn('[AndroidDeviceAdapter] openApplication failed:', err);
        return false;
      }
    },
  };

  public documents: DocumentCapability = {
    extractText: async (path, maxChars = 20000) => {
      try {
        const text = await this.filesystem.readFile(path, maxChars);
        const isPdf = path.toLowerCase().endsWith('.pdf');
        return { text, extracted: text.trim().length > 0, ocrNeeded: isPdf && text.trim().length === 0 };
      } catch {
        return { text: '', extracted: false, ocrNeeded: true };
      }
    },
  };
}
