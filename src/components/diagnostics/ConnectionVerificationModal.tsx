import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { VerificationResult } from '@/services/connectors/core/connector';

export interface ProviderVerificationReport {
  connectorId: string;
  name: string;
  provider: string;
  connected: boolean;
  result: VerificationResult;
}

interface ConnectionVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: ProviderVerificationReport[];
  isVerifying: boolean;
  completedAt?: string;
  onReverify?: () => void;
}

export const ConnectionVerificationModal: React.FC<ConnectionVerificationModalProps> = ({
  isOpen,
  onClose,
  reports,
  isVerifying,
  completedAt,
  onReverify,
}) => {
  if (!isOpen) return null;

  const verifiedCount = reports.filter((r) => r.result.verified).length;
  const warningsCount = reports.filter((r) => r.result.error && r.result.error.includes('⚠')).length;
  const failedCount = reports.filter((r) => r.connected && !r.result.verified && !r.result.error?.includes('⚠')).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-modal-title"
    >
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" focusable="false" />
            </div>
            <div>
              <h2 id="verification-modal-title" className="text-base font-bold text-[var(--text-main)] m-0">
                Foundry Connection Verification
              </h2>
              <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                Real API identity validation and endpoint access verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close verification report"
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" focusable="false" />
          </button>
        </div>

        {/* Modal Summary Bar */}
        <div className="px-5 py-3 bg-[var(--bg-tertiary)]/30 border-b border-[var(--border-subtle)] flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" focusable="false" />
              {verifiedCount} Verified
            </span>
            {warningsCount > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" focusable="false" />
                {warningsCount} Limitations
              </span>
            )}
            {failedCount > 0 && (
              <span className="flex items-center gap-1.5 text-red-400 font-medium">
                <XCircle className="w-4 h-4" aria-hidden="true" focusable="false" />
                {failedCount} Failed
              </span>
            )}
          </div>
          {completedAt && (
            <span className="flex items-center gap-1 text-[var(--text-faint)]">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
              Completed: {completedAt}
            </span>
          )}
        </div>

        {/* Report List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {isVerifying ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-[var(--text-muted)]">Pinging live provider endpoints & verifying tokens...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">
              No connectors available to verify.
            </div>
          ) : (
            reports.map((report) => {
              const isVerified = report.result.verified;
              const hasLimitation = report.result.error && report.result.error.includes('⚠');

              return (
                <div
                  key={report.connectorId}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isVerified
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : hasLimitation
                      ? 'bg-amber-500/5 border-amber-500/20'
                      : report.connected
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-[var(--bg-tertiary)]/20 border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      {isVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" focusable="false" />
                      ) : hasLimitation ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" focusable="false" />
                      ) : report.connected ? (
                        <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" aria-hidden="true" focusable="false" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[var(--text-faint)] mt-0.5 shrink-0" />
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text-main)]">
                            {report.name}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                            {report.provider}
                          </span>
                        </div>

                        {report.result.accountName && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 m-0">
                            Connected as: <strong className="text-[var(--text-main)]">{report.result.accountName}</strong>
                            {report.result.accountEmail ? ` (${report.result.accountEmail})` : ''}
                          </p>
                        )}

                        {report.result.error && (
                          <div className={`text-xs mt-1.5 whitespace-pre-line font-medium ${
                            hasLimitation ? 'text-amber-300/90' : 'text-red-400'
                          }`}>
                            {report.result.error}
                          </div>
                        )}

                        {report.result.testedEndpoints && report.result.testedEndpoints.length > 0 && (
                          <div className="mt-2 space-y-1 pl-2 border-l-2 border-[var(--border-subtle)]">
                            {report.result.testedEndpoints.map((ep, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)] font-mono">
                                {ep.success ? (
                                  <span className="text-emerald-400">✓</span>
                                ) : (
                                  <span className="text-red-400">✗</span>
                                )}
                                <span>{ep.endpoint}</span>
                                {ep.error && <span className="text-red-400">({ep.error})</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      isVerified
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : hasLimitation
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : report.connected
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                    }`}>
                      {isVerified
                        ? 'Verified'
                        : hasLimitation
                        ? 'Policy Limitation'
                        : report.connected
                        ? 'Auth Failed'
                        : 'Not Connected'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50 flex items-center justify-between">
          <span className="text-xs text-[var(--text-faint)]">
            Verified with direct API requests. No mock responses.
          </span>
          <div className="flex items-center gap-2">
            {onReverify && (
              <button
                type="button"
                onClick={onReverify}
                disabled={isVerifying}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                Re-Verify
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
