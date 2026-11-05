import React from 'react';
import { Database, Cpu, WifiOff, ShieldCheck } from 'lucide-react';
import { useApp } from '@/stores/AppContext';
import { useIndexStatus, describeIndexStatus } from '@/hooks/useIndexStatus';

export const StatusBar: React.FC = () => {
  const { aiStatus, stats } = useApp();
  const index = useIndexStatus();

  return (
    <footer
      className="h-7 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 flex items-center justify-between text-[11px] text-[var(--text-faint)] select-none"
      role="contentinfo"
      aria-label="Application Status"
    >
      <div className="flex items-center space-x-4">
        {/* File index (desktop app): real counts from the local index; browser builds show the cache size */}
        <div
          className="flex items-center space-x-1.5"
          title={index ? `Indexed folders: ${index.roots.join(', ')}` : 'All data stored strictly on this device'}
          role="status"
          aria-live="polite"
        >
          <Database className={`w-3 h-3 ${index && index.state !== 'ready' ? 'text-amber-500 animate-pulse' : 'text-blue-500'}`} aria-hidden="true" />
          <span>{index ? describeIndexStatus(index) : `${stats.totalIndexedFiles.toLocaleString()} files cached`}</span>
        </div>

        {/* Offline first indicator */}
        <div className="flex items-center space-x-1.5" title="Core functionality operates 100% offline">
          <WifiOff className="w-3 h-3 text-[var(--text-faint)]" />
          <span>Offline First</span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* AI Provider Status */}
        <div className="flex items-center space-x-1.5" title={aiStatus.isAvailable ? `Connected to ${aiStatus.providerType} (${aiStatus.modelName})` : 'AI Provider Offline'}>
          <Cpu className="w-3 h-3" />
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              aiStatus.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span>
            {aiStatus.isAvailable
              ? `AI: ${aiStatus.providerType} (${aiStatus.latencyMs ?? 0}ms)`
              : 'AI: Offline (Check Settings)'}
          </span>
        </div>

        {/* Local-First Guarantee */}
        <div className="flex items-center space-x-1 text-emerald-500 font-medium">
          <ShieldCheck className="w-3 h-3" />
          <span>Zero Cloud Telemetry</span>
        </div>
      </div>
    </footer>
  );
};
