import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface StorageAccess {
  /** True on desktop (always) and on Android once the user has granted "All files access". */
  allFiles: boolean;
  platform: 'desktop' | 'android';
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Whether Foundry can see the user's documents, not only photos/videos (Android's "All files
 * access"). Desktop always reports granted. Re-checks when the app returns to the foreground, so
 * granting access in Settings and switching back updates the banner without a restart.
 */
export function useStorageAccess(): { access: StorageAccess | null; requestAccess: () => void } {
  const [access, setAccess] = useState<StorageAccess | null>(null);

  const check = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const res = await invoke<StorageAccess>('storage_access_status');
      setAccess(res);
    } catch {
      setAccess(null);
    }
  }, []);

  useEffect(() => {
    void check();
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  const requestAccess = useCallback(() => {
    if (!isTauri()) return;
    invoke('request_storage_access').catch(() => {});
  }, []);

  return { access, requestAccess };
}
