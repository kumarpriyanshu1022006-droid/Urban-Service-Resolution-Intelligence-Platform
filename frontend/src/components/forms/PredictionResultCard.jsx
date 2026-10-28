import React from 'react';
import { Clock } from 'lucide-react';
import Badge from '../ui/Badge';


export default function PredictionResultCard({ result, requestPayload }) {
  if (!result) return null;

  const days = result.predicted_resolution_days;
  const hours = result.predicted_resolution_hours;
  const minutes = result.predicted_resolution_minutes;
  const displayDuration = result.display_duration;

  // Operational triage tier based on duration
  const getTriageTier = (d) => {
    if (d < 0.5) return { label: 'Immediate Turnaround (< 12 hrs)', variant: 'success' };
    if (d < 1.5) return { label: 'Standard Turnaround (1–2 days)', variant: 'primary' };
    if (d < 4.0) return { label: 'Scheduled Service (2–4 days)', variant: 'warning' };
    return { label: 'Complex / Extended Service (> 4 days)', variant: 'secondary' };
  };

  const triage = getTriageTier(days);

  return (
    <div className="bg-white border-2 border-[#254A40] rounded-lg p-6 shadow-md transition-all animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#DCDDD4]">
        <div>
          <span className="text-xs font-semibold text-[#68716A] uppercase tracking-wider">
            Model Prediction Result
          </span>
          <h3 className="text-xl font-bold text-[#252C29] mt-0.5">
            Estimated Resolution Duration
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={triage.variant}>
            {triage.label}
          </Badge>
          <span className="text-xs text-[#68716A] font-mono">
            {result.model || 'LightGBM_L2'}
          </span>
        </div>
      </div>

      {/* Main duration metric readout */}
      <div className="my-6 p-5 bg-[#F5F3ED] border border-[#DCDDD4] rounded-lg">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#254A40]">
          <Clock className="w-4 h-4 text-[#254A40]" />
          <span>Expected Total Duration</span>
        </div>

        <div className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#254A40] tabular-nums tracking-tight font-sans">
          {displayDuration}
        </div>

        <p className="mt-2 text-xs text-[#68716A] leading-relaxed">
          {result.note || 'This is an ML estimate, not a guaranteed resolution deadline.'}
        </p>
      </div>

      {/* Numerical breakdown grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-white border border-[#DCDDD4] rounded-md">
          <span className="text-[11px] font-semibold text-[#68716A] uppercase tracking-wider block">
            Calendar Days
          </span>
          <span className="text-xl font-bold text-[#252C29] tabular-nums block mt-1">
            {days.toFixed(2)}
          </span>
          <span className="text-[11px] text-[#68716A]">Decimal days</span>
        </div>

        <div className="p-3 bg-white border border-[#DCDDD4] rounded-md">
          <span className="text-[11px] font-semibold text-[#68716A] uppercase tracking-wider block">
            Total Hours
          </span>
          <span className="text-xl font-bold text-[#252C29] tabular-nums block mt-1">
            {hours.toFixed(1)}
          </span>
          <span className="text-[11px] text-[#68716A]">Elapsed hours</span>
        </div>

        <div className="p-3 bg-white border border-[#DCDDD4] rounded-md">
          <span className="text-[11px] font-semibold text-[#68716A] uppercase tracking-wider block">
            Total Minutes
          </span>
          <span className="text-xl font-bold text-[#252C29] tabular-nums block mt-1">
            {minutes.toLocaleString()}
          </span>
          <span className="text-[11px] text-[#68716A]">Discrete minutes</span>
        </div>
      </div>

      {/* Request parameters review */}
      {requestPayload && (
        <div className="mt-5 pt-4 border-t border-[#DCDDD4] text-xs">
          <span className="font-semibold text-[#68716A] block mb-2">
            Evaluated Input Characteristics:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[#252C29]">
            <div>
              <span className="text-[#68716A] block text-[11px]">Problem:</span>
              <span className="font-medium">{requestPayload['Problem (formerly Complaint Type)']}</span>
            </div>
            <div>
              <span className="text-[#68716A] block text-[11px]">Agency:</span>
              <span className="font-medium">{requestPayload['Agency']}</span>
            </div>
            <div>
              <span className="text-[#68716A] block text-[11px]">Borough:</span>
              <span className="font-medium">{requestPayload['Borough']}</span>
            </div>
            <div>
              <span className="text-[#68716A] block text-[11px]">Channel:</span>
              <span className="font-medium">{requestPayload['Open Data Channel Type']}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
