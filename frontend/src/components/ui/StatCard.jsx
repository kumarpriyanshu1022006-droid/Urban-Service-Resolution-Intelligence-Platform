import React from 'react';

export default function StatCard({
  label,
  value,
  unit,
  context,
  icon: Icon,
  trend,
  className = '',
}) {
  return (
    <div className={`bg-white border border-[#DCDDD4] rounded-lg p-5 shadow-[0_1px_3px_rgba(37,44,41,0.03)] flex flex-col justify-between ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-[#68716A] uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <div className="w-8 h-8 rounded-md bg-[#ECEAE2] flex items-center justify-center text-[#254A40] shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl md:text-3xl font-bold text-[#252C29] tabular-nums tracking-tight">
            {value}
          </span>
          {unit && (
            <span className="text-sm font-medium text-[#68716A]">
              {unit}
            </span>
          )}
        </div>

        {context && (
          <p className="mt-1.5 text-xs text-[#68716A] leading-relaxed">
            {context}
          </p>
        )}

        {trend && (
          <div className="mt-2 text-xs font-medium">
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}
