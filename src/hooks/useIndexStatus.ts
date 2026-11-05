import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface IndexStatus {
  state: 'starting' | 'crawling' | 'extracting' | 'ready' | 'error' | 'unavailable';
  ready: boolean;
  filesIndexed: number;
  contentIndexed: number;
  contentPending: number;
  contentFailed: number;
  scannedThisCrawl: number;
  lastCrawlCompleted?: string | null;
  watching: boolean;
  roots: string[];
  error?: string | null;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Live status of the desktop file index. Polls quickly while indexing and slowly once ready; pauses
 * while the window is hidden. Returns null outside the native app or where there is no index (Android).
 */
export function useIndexStatus(): IndexStatus | null {
  const [status, setStatus] = useState<IndexStatus | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      let next: IndexStatus | null = null;
      try {
        next = await invoke<IndexStatus>('index_status');
      } catch {
        next = null;
      }
      if (cancelled) return;
      setStatus(next && next.state !== 'unavailable' ? next : null);
      const busy = next && next.state !== 'ready' && next.state !== 'error' && next.state !== 'unavailable';
      const delay = document.hidden ? 30_000 : busy ? 2_000 : 15_000;
      timer = setTimeout(poll, delay);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return status;
}

/** One-line human description, e.g. "Indexing your files… 12,400 scanned". */
export function describeIndexStatus(s: IndexStatus): string {
  const n = (x: number) => x.toLocaleString();
  switch (s.state) {
    case 'starting':
      return 'Preparing file index…';
    case 'crawling':
      return s.ready
        ? `Checking for changes… ${n(s.scannedThisCrawl)} scanned`
        : `Indexing your files… ${n(s.scannedThisCrawl)} scanned`;
    case 'extracting':
      return `${n(s.filesIndexed)} files indexed · reading documents (${n(s.contentPending)} left)`;
    case 'ready':
      return `${n(s.filesIndexed)} files indexed · ${n(s.contentIndexed)} searchable by content${s.watching ? ' · up to date' : ''}`;
    case 'error':
      return `File index problem: ${s.error || 'unknown error'}`;
    default:
      return '';
  }
}
