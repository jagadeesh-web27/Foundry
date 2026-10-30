import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { db, DatabaseStats } from '@/services/db/database';
import { AIService } from '@/services/ai/aiService';
import { computerService } from '@/services/native/computerService';
import { AIProviderStatus } from '@/types/ai';
import { AppSettings } from '@/types/settings';
import { IndexedFile, IndexedFolder, UserDirectoryAccess } from '@/types/file';
import { DEFAULT_SETTINGS } from '@/services/settings/defaultSettings';

interface AppContextType {
  stats: DatabaseStats;
  aiStatus: AIProviderStatus;
  settings: AppSettings;
  aiService: AIService;
  isConnected: boolean;
  isConnecting: boolean;
  isIndexing: boolean;
  indexingCategory: string;
  indexedFiles: IndexedFile[];
  indexedFolders: IndexedFolder[];
  accessibleDirs: UserDirectoryAccess[];
  connectComputer: () => Promise<void>;
  refreshIndexedFiles: () => Promise<void>;
  refreshIndexedFolders: () => Promise<void>;
  refreshStats: () => Promise<void>;
  checkAIStatus: () => Promise<void>;
  updateSettings: (newSettings: AppSettings) => Promise<void>;
  openFile: (path: string) => Promise<boolean>;
  revealFile: (path: string) => Promise<boolean>;
}

const defaultStats: DatabaseStats = {
  totalDocuments: 0,
  totalNotes: 0,
  totalChunks: 0,
  totalConcepts: 0,
  totalRelationships: 0,
  totalCollections: 0,
  totalBookmarks: 0,
  totalIndexedFiles: 0,
  totalIndexedFolders: 0,
  storageUsageBytes: 0,
};

const initialAIStatus: AIProviderStatus = {
  isAvailable: false,
  providerType: DEFAULT_SETTINGS.ai.provider,
  endpoint: DEFAULT_SETTINGS.ai.endpoint,
  modelName: DEFAULT_SETTINGS.ai.model,
  embeddingModel: DEFAULT_SETTINGS.ai.embeddingModel,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [stats, setStats] = useState<DatabaseStats>(defaultStats);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [aiStatus, setAIStatus] = useState<AIProviderStatus>(initialAIStatus);
  const [aiService, setAIService] = useState<AIService>(() => new AIService(DEFAULT_SETTINGS.ai));
  
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isIndexing, setIsIndexing] = useState<boolean>(false);
  const [indexingCategory, setIndexingCategory] = useState<string>('');
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([]);
  const [indexedFolders, setIndexedFolders] = useState<IndexedFolder[]>([]);
  const [accessibleDirs, setAccessibleDirs] = useState<UserDirectoryAccess[]>([]);

  const refreshStats = useCallback(async () => {
    try {
      const s = await db.getStats();
      setStats(s);
    } catch (err) {
      console.error('Error reading stats:', err);
    }
  }, []);

  const refreshIndexedFiles = useCallback(async () => {
    try {
      const files = await db.getAllIndexedFiles();
      setIndexedFiles(files);
      await refreshStats();
    } catch (err) {
      console.error('Error loading indexed files:', err);
    }
  }, [refreshStats]);

  const refreshIndexedFolders = useCallback(async () => {
    try {
      const folders = await db.getAllIndexedFolders();
      setIndexedFolders(folders);
      await refreshStats();
    } catch (err) {
      console.error('Error loading indexed folders:', err);
    }
  }, [refreshStats]);

  const checkAIStatus = useCallback(async () => {
    try {
      const status = await aiService.checkStatus();
      setAIStatus(status);
    } catch {
      setAIStatus((prev) => ({ ...prev, isAvailable: false }));
    }
  }, [aiService]);

  const updateSettings = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await db.saveSettings(newSettings);
    const newAIService = new AIService(newSettings.ai);
    setAIService(newAIService);
  }, []);

  const connectComputer = useCallback(async () => {
    setIsConnecting(true);
    setIsIndexing(true);

    try {
      // 1. Discover user accessible directories
      const dirs = await computerService.getAccessibleDirectories();
      setAccessibleDirs(dirs);

      // Immediately mark as connected so UI transitions without blocking
      await db.setIsConnected(true);
      setIsConnected(true);
      setIsConnecting(false);

      const allDiscoveredFiles: IndexedFile[] = [];
      const allDiscoveredFolders: IndexedFolder[] = [];

      // 2. Scan each accessible directory in background with progress updates
      for (const d of dirs) {
        if (!d.exists) continue;
        setIndexingCategory(d.name);
        try {
          const files = await computerService.scanDirectory(d.path, 500);
          const folders = await computerService.scanFolders(d.path, 200);
          allDiscoveredFiles.push(...files);
          allDiscoveredFolders.push(...folders);
        } catch (dirErr) {
          console.warn(`[AppContext] Error scanning directory ${d.name}:`, dirErr);
        }
      }

      // 3. Upsert discovered files and folders to persistent index
      await db.upsertIndexedFiles(allDiscoveredFiles);
      await db.upsertIndexedFolders(allDiscoveredFolders);

      setIndexedFiles(allDiscoveredFiles);
      setIndexedFolders(allDiscoveredFolders);
      await refreshStats();
    } catch (err) {
      console.error('Failed to connect and index computer:', err);
    } finally {
      setIsConnecting(false);
      setIsIndexing(false);
      setIndexingCategory('');
    }
  }, [refreshStats]);

  const openFile = useCallback(async (path: string): Promise<boolean> => {
    return computerService.openFile(path);
  }, []);

  const revealFile = useCallback(async (path: string): Promise<boolean> => {
    return computerService.revealFile(path);
  }, []);

  useEffect(() => {
    const init = async () => {
      const [loadedSettings, connected, files, folders, dirs] = await Promise.all([
        db.getSettings(),
        db.getIsConnected(),
        db.getAllIndexedFiles(),
        db.getAllIndexedFolders(),
        computerService.getAccessibleDirectories(),
      ]);

      let effectiveSettings = loadedSettings;
      const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

      // On Android, Foundry runs standalone with on-device local AI
      if (isAndroid && effectiveSettings.ai.provider !== 'android_local') {
        effectiveSettings = {
          ...effectiveSettings,
          ai: {
            ...effectiveSettings.ai,
            provider: 'android_local',
            endpoint: 'android-local://',
            model: 'foundry-android-local-model',
          },
        };
        db.saveSettings(effectiveSettings).catch(console.error);
      }

      // On the desktop app, move untouched installs off the old external-proxy default
      // (port 8082 / retired Claude model) onto the bundled on-device AI.
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      const ai = effectiveSettings.ai;
      if (
        isTauri &&
        !isAndroid &&
        ai.provider === 'anthropic_local' &&
        ai.endpoint.replace(/\/$/, '') === 'http://127.0.0.1:8082'
      ) {
        effectiveSettings = {
          ...effectiveSettings,
          ai: {
            ...ai,
            provider: 'desktop_local',
            endpoint: 'http://127.0.0.1:8172',
            model: 'foundry-desktop-local-model',
          },
        };
        db.saveSettings(effectiveSettings).catch(console.error);
      }

      setSettings(effectiveSettings);
      const newAIService = new AIService(effectiveSettings.ai);
      setAIService(newAIService);
      newAIService.checkStatus().then(setAIStatus).catch(() => {});

      setIsConnected(connected);
      setIndexedFiles(files);
      setIndexedFolders(folders);
      setAccessibleDirs(dirs);
      await refreshStats();
    };

    init();
  }, [refreshStats]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(() => {
      if (isMounted) void checkAIStatus();
    });
    // Poll less aggressively on mobile to reduce background CPU pressure
    const isMobile =
      (typeof navigator !== 'undefined' && /android|iphone|ipad/i.test(navigator.userAgent)) ||
      (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
    const pollInterval = isMobile ? 60000 : 15000; // 60s on mobile, 15s on desktop
    const interval = setInterval(() => {
      if (isMounted) void checkAIStatus();
    }, pollInterval);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [checkAIStatus]);

  return (
    <AppContext.Provider
      value={{
        stats,
        aiStatus,
        settings,
        aiService,
        isConnected,
        isConnecting,
        isIndexing,
        indexingCategory,
        indexedFiles,
        indexedFolders,
        accessibleDirs,
        connectComputer,
        refreshIndexedFiles,
        refreshIndexedFolders,
        refreshStats,
        checkAIStatus,
        updateSettings,
        openFile,
        revealFile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    return {
      stats: defaultStats,
      settings: DEFAULT_SETTINGS,
      aiStatus: initialAIStatus,
      aiService: new AIService(DEFAULT_SETTINGS.ai),
      isConnected: false,
      isConnecting: false,
      isIndexing: false,
      indexingCategory: '',
      indexedFiles: [],
      indexedFolders: [],
      accessibleDirs: [],
      connectComputer: async () => {},
      refreshIndexedFiles: async () => {},
      refreshIndexedFolders: async () => {},
      refreshStats: async () => {},
      checkAIStatus: async () => {},
      updateSettings: async () => {},
      openFile: async () => false,
      revealFile: async () => false,
    };
  }
  return context;
};
