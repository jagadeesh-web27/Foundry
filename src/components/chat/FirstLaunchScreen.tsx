import React from 'react';
import { ShieldCheck, HardDrive, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { useApp } from '@/stores/AppContext';

export const FirstLaunchScreen: React.FC = () => {
  const { connectComputer, isConnecting } = useApp();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-8 select-none">
      {/* Brand Icon */}
      <div className="space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-white text-2xl shadow-xl shadow-blue-600/20 mx-auto">
          F
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-main)] m-0">
            Foundry
          </h1>
          <p className="text-sm text-blue-400 font-medium mt-1">Your local AI computer assistant</p>
        </div>
      </div>

      {/* Value proposition */}
      <div className="space-y-2">
        <p className="text-base font-semibold text-[var(--text-main)]">
          Ask anything about your computer.
        </p>
        <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
          Foundry indexes your accessible files (Documents, Downloads, Desktop, Pictures, Videos) so you can find and work with your files using natural speech or text.
        </p>
      </div>

      {/* Primary Connect Button */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={connectComputer}
          disabled={isConnecting}
          className="inline-flex items-center space-x-2.5 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 cursor-pointer"
          aria-label="Connect Foundry to your computer"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting to computer...</span>
            </>
          ) : (
            <>
              <HardDrive className="w-4 h-4" />
              <span>Connect</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="flex items-center justify-center space-x-1.5 text-xs text-emerald-500 font-medium pt-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Your data stays on your device.</span>
        </div>
      </div>

      {/* Permissions Transparency */}
      <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-faint)] space-y-1 text-left w-full max-w-md">
        <div className="flex items-center space-x-1.5 text-[var(--text-muted)] font-medium">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Computer-wide accessible locations:</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Documents, Downloads, Desktop, Pictures, Videos, Music, and user-accessible folders. Operating system security controls & protected locations remain fully enforced.
        </p>
      </div>
    </div>
  );
};
