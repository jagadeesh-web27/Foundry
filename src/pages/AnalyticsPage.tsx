import React, { useEffect, useState, useCallback } from 'react';
import {
  Cpu,
  HardDrive,
  Wifi,
  Activity,
  RefreshCw,
  Server,
  Layers,
  CheckCircle2,
  AlertCircle,
  Radio,
  Search,
} from 'lucide-react';
import { computerService, DiskInfo, SystemHardwareInfo as SystemInfo, NetworkInfo, RunningApp, NetworkInterfaceInfo } from '@/services/native/computerService';

export const AnalyticsPage: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [apps, setApps] = useState<RunningApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [appSearch, setAppSearch] = useState('');

  const fetchMetrics = useCallback(async () => {
    try {
      const [sys, dsk, net, rApps] = await Promise.all([
        computerService.getSystemInfo(),
        computerService.getDiskInformation(),
        computerService.getNetworkInformation(),
        computerService.getRunningApplications(),
      ]);
      setSystemInfo(sys);
      setDisks(dsk);
      setNetwork(net);
      setApps(rApps);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching system metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      computerService.getSystemInfo(),
      computerService.getDiskInformation(),
      computerService.getNetworkInformation(),
      computerService.getRunningApplications(),
    ]).then(([sys, dsk, net, rApps]) => {
      if (!cancelled) {
        setSystemInfo(sys);
        setDisks(dsk);
        setNetwork(net);
        setApps(rApps);
        setLastUpdated(new Date().toLocaleTimeString());
        setIsLoading(false);
      }
    }).catch((err) => {
      console.error('Error fetching system metrics:', err);
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMetrics();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const filteredApps = apps.filter(
    (a) =>
      a.name.toLowerCase().includes(appSearch.toLowerCase()) ||
      a.processName.toLowerCase().includes(appSearch.toLowerCase()) ||
      String(a.pid).includes(appSearch)
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6 space-y-6 max-w-6xl mx-auto w-full select-text">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-500" />
            <h1 className="text-lg font-bold text-[var(--text-main)] m-0">System Analytics & Graphs</h1>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Authoritative real-time data from Windows operating system tools
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          {lastUpdated && (
            <span className="text-[var(--text-faint)]">
              Updated: <span className="text-[var(--text-main)] font-mono">{lastUpdated}</span>
            </span>
          )}

          <label className="flex items-center space-x-1.5 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-[var(--border-subtle)]"
            />
            <span>Auto-refresh (3s)</span>
          </label>

          <button
            type="button"
            onClick={fetchMetrics}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Grid: CPU & Memory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPU Hardware & Usage */}
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs">
              <Cpu className="w-4 h-4" />
              <span>Processor (CPU)</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-faint)]">
              {systemInfo ? `${systemInfo.cpuCores} physical / ${systemInfo.cpuLogicalCores} logical` : 'Detecting...'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-semibold text-[var(--text-main)] truncate">
              {systemInfo?.cpuBrand || 'Generic x86_64 Processor'}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Host: <span className="text-[var(--text-main)] font-mono">{systemInfo?.hostName || 'Localhost'}</span> · OS: {systemInfo?.osName} {systemInfo?.osVersion}
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>Logical Processing Units</span>
              <span className="font-mono text-blue-400 font-semibold">{systemInfo?.cpuLogicalCores || 0} Cores</span>
            </div>
            <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* RAM Usage */}
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
              <Server className="w-4 h-4" />
              <span>Memory (RAM)</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {systemInfo?.ramPercentageUsed ?? 0}% Used
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center py-1">
            <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="text-[10px] text-[var(--text-faint)] uppercase">Total</div>
              <div className="text-xs font-bold text-[var(--text-main)] font-mono mt-0.5">
                {systemInfo?.totalRamFormatted || '0 GB'}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="text-[10px] text-[var(--text-faint)] uppercase">In Use</div>
              <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
                {systemInfo?.usedRamFormatted || '0 GB'}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="text-[10px] text-[var(--text-faint)] uppercase">Available</div>
              <div className="text-xs font-bold text-blue-400 font-mono mt-0.5">
                {systemInfo?.freeRamFormatted || '0 GB'}
              </div>
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, systemInfo?.ramPercentageUsed || 0))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Disk Storage Drives */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs">
          <HardDrive className="w-4 h-4" />
          <span>Storage & Volumes</span>
        </div>

        {disks.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] py-4 text-center">No drives detected</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {disks.map((d, i) => (
              <div key={i} className="p-3 rounded-lg bg-[var(--bg-tertiary)] space-y-2 border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono font-bold text-xs">
                      {d.drive}
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-main)] truncate">
                      {d.volumeName || 'Local Disk'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-faint)]">
                    {d.fileSystem}
                  </span>
                </div>

                <div className="w-full bg-[var(--bg-primary)] rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      d.percentageUsed > 90 ? 'bg-rose-500' : d.percentageUsed > 75 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${d.percentageUsed}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
                  <span>{d.freeFormatted} free of {d.totalFormatted}</span>
                  <span className="font-mono font-semibold">{d.percentageUsed}% used</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Network & Connectivity */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs">
            <Wifi className="w-4 h-4" />
            <span>Network & Wi-Fi Status</span>
          </div>

          <div className="flex items-center space-x-2">
            {network?.internetAccess ? (
              <span className="flex items-center space-x-1 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Internet Connected</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 text-amber-400 text-xs font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Local Only / Offline</span>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="text-[10px] text-[var(--text-faint)] uppercase">Connection Type</div>
            <div className="font-semibold text-[var(--text-main)] mt-0.5">{network?.connectionType || 'Disconnected'}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="text-[10px] text-[var(--text-faint)] uppercase">Wi-Fi SSID</div>
            <div className="font-semibold text-cyan-400 truncate mt-0.5">{network?.wifiSsid || 'None'}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="text-[10px] text-[var(--text-faint)] uppercase">Wi-Fi Signal</div>
            <div className="font-semibold font-mono text-[var(--text-main)] mt-0.5">
              {network?.wifiSignalPercent !== null && network?.wifiSignalPercent !== undefined
                ? `${network.wifiSignalPercent}%`
                : 'N/A'}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="text-[10px] text-[var(--text-faint)] uppercase">Primary IP</div>
            <div className="font-semibold font-mono text-[var(--text-main)] mt-0.5">{network?.primaryIp || '127.0.0.1'}</div>
          </div>
        </div>

        {/* Network Interfaces */}
        {network?.interfaces && network.interfaces.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center space-x-1">
              <Radio className="w-3 h-3 text-cyan-400" />
              <span>Active Network Interfaces ({network.interfaces.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {network.interfaces.map((iface: NetworkInterfaceInfo, idx: number) => (
                <div key={idx} className="p-2 rounded bg-[var(--bg-tertiary)] text-[11px] space-y-1">
                  <div className="flex justify-between font-semibold text-[var(--text-main)]">
                    <span className="truncate">{iface.name}</span>
                    <span className={iface.isUp ? 'text-emerald-400' : 'text-[var(--text-faint)]'}>
                      {iface.isUp ? 'Active' : 'Down'}
                    </span>
                  </div>
                  <div className="text-[var(--text-faint)] font-mono truncate">
                    {iface.ipAddresses.filter((ip: string) => !ip.includes(':')).join(', ') || 'No IPv4'}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] flex justify-between">
                    <span>↓ {iface.receivedFormatted}</span>
                    <span>↑ {iface.transmittedFormatted}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Running Applications */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-purple-400 font-semibold text-xs">
            <Layers className="w-4 h-4" />
            <span>Running Applications ({apps.length})</span>
          </div>

          <div className="relative flex items-center">
            <Search className="w-3 h-3 absolute left-2 text-[var(--text-faint)]" />
            <input
              type="text"
              placeholder="Filter running apps..."
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] outline-none"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[var(--bg-tertiary)] text-[var(--text-faint)] text-[10px] uppercase sticky top-0">
              <tr>
                <th className="p-2 font-medium">Application</th>
                <th className="p-2 font-medium">Process</th>
                <th className="p-2 font-medium text-right">PID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-xs text-[var(--text-muted)]">
                    No matching applications found
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr key={app.pid} className="hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                    <td className="p-2 font-medium text-[var(--text-main)]">{app.name}</td>
                    <td className="p-2 text-[var(--text-muted)] font-mono text-[11px]">{app.processName}</td>
                    <td className="p-2 text-[var(--text-faint)] font-mono text-right">{app.pid}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
