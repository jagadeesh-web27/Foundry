import React from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  description,
  icon: Icon,
  accentColor = 'text-blue-500',
}) => {
  return (
    <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col justify-between hover:border-[var(--text-faint)] transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${accentColor}`} aria-hidden="true" />
      </div>
      <div>
        <div className="text-2xl font-bold text-[var(--text-main)] tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {description && (
          <div className="text-xs text-[var(--text-faint)] mt-1">{description}</div>
        )}
      </div>
    </div>
  );
};
