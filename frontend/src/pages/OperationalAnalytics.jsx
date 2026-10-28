import React, { useState, useEffect } from 'react';
import { BarChart3, AlertTriangle, Clock, CheckCircle2, RefreshCw, Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { fetchOperationalAnalytics } from '../services/api';

export default function OperationalAnalytics({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchOperationalAnalytics();
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error || 'Failed to load operational analytics.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const overdueCases = data?.overdue_cases || [];
  const deptStats = data?.department_stats || [];
  const closedComparisons = data?.closed_duration_comparisons || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#DCDDD4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#68716A]">
            <Activity className="w-4 h-4 text-[#254A40]" />
            <span>Platform Operational Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
            Operational Telemetry & SLA Tracking
          </h1>
          <p className="text-xs sm:text-sm text-[#68716A] mt-1">
            Real-time analytics computed strictly over complaints submitted and resolved through this application.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={loadAnalytics}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate && onNavigate('historical_analytics')}
          >
            View Historical NYC 311 Archive <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
          </Button>
        </div>
      </div>

      {/* Critical Data Separation Notice */}
      <Notice variant="info" title="Operational Data Separation Disclosure">
        Metrics displayed below reflect exclusively the operational SQLite platform database (new citizen submissions, active dispatches, and field verification events). Historical NYC 311 baseline statistics (14.48 GB archive) are accessed separately under the Historical Analytics tab.
      </Notice>

      {error && (
        <Notice variant="danger" title="Telemetry Unavailable">
          {error}
        </Notice>
      )}

      {/* High-Level Operational StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Backlog"
          value={data?.total_active || 0}
          context="Unassigned, assigned, or in-progress"
          trend="Real-Time"
          icon={Clock}
        />
        <StatCard
          label="Overdue / SLA At-Risk"
          value={data?.overdue_count || 0}
          context="Elapsed duration > AI prediction"
          trend={data?.overdue_count > 0 ? 'Action Required' : 'On Track'}
          icon={AlertTriangle}
        />
        <StatCard
          label="Awaiting Admin Verification"
          value={data?.pending_verification_count || 0}
          context="Staff reported work completed"
          trend="Pending Verification"
          icon={CheckCircle2}
        />
        <StatCard
          label="Verified Closed Cases"
          value={data?.closed_count || 0}
          context="Total resolved and closed"
          trend="Operational"
          icon={ShieldCheck}
        />
      </div>

      {/* SLA Overdue / At-Risk Detection Card */}
      <Card
        title="SLA Risk & Overdue Monitoring"
        subtitle="Active complaints where elapsed resolution time has exceeded initial LightGBM duration estimate"
      >
        {loading ? (
          <div className="py-8 text-center text-xs text-[#68716A]">Loading SLA risk telemetry...</div>
        ) : overdueCases.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#367454] bg-[#367454]/5 rounded border border-[#367454]/20">
            No complaints currently exceeding their estimated resolution time. All active tickets are within expected parameters.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-3 py-3 font-semibold">Issue Category</th>
                  <th className="px-3 py-3 font-semibold">Borough</th>
                  <th className="px-3 py-3 font-semibold">Assigned Dept</th>
                  <th className="px-3 py-3 font-semibold">Predicted Time</th>
                  <th className="px-3 py-3 font-semibold">Elapsed Time</th>
                  <th className="px-5 py-3 font-semibold text-right">Overdue Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE2]">
                {overdueCases.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F3ED]/80 transition-colors">
                    <td className="px-5 py-3 font-mono font-semibold text-[#254A40]">
                      <button
                        onClick={() => onNavigate && onNavigate('track', item.reference_no)}
                        className="hover:underline text-left"
                      >
                        {item.reference_no}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-medium text-[#252C29]">
                      {item.problem}
                    </td>
                    <td className="px-3 py-3 text-[#68716A]">
                      {item.borough}
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#252C29]">
                      {item.assigned_department}
                    </td>
                    <td className="px-3 py-3 font-mono text-[#68716A]">
                      ~{item.predicted_duration_hours} hrs
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-[#B4483E]">
                      {item.elapsed_hours} hrs
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#B4483E]/15 text-[#B4483E]">
                        +{item.overdue_hours} hrs late
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Department Workload & Distribution */}
      <Card
        title="Department Caseload & Distribution"
        subtitle="Operational complaint distribution across municipal service departments"
      >
        {deptStats.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#68716A]">No departmental complaint activity recorded.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {deptStats.map((ds) => (
              <div key={ds.assigned_department} className="p-3 bg-[#ECEAE2]/40 rounded-lg border border-[#DCDDD4] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[#252C29] flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-[#254A40]" />
                    {ds.assigned_department}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-[#254A40] bg-white px-1.5 py-0.5 rounded border border-[#DCDDD4]">
                    {ds.total_cases} total
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-[#68716A] pt-1 border-t border-[#DCDDD4]/60">
                  <span>Active Backlog: <strong className="text-[#252C29]">{ds.active_backlog}</strong></span>
                  <span>Closed: <strong className="text-[#367454]">{ds.closed_cases}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Predicted vs Actual Resolution Benchmarks on Closed Cases */}
      <Card
        title="AI Predicted vs. Actual Turnaround Telemetry"
        subtitle="Model accuracy tracking on verified completed platform complaints"
      >
        {loading ? (
          <div className="py-8 text-center text-xs text-[#68716A]">Loading prediction telemetry...</div>
        ) : closedComparisons.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#68716A]">
            No verified closed cases recorded yet. Performance telemetry will populate as administrative staff verify and close tickets.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-3 py-3 font-semibold">Issue Category</th>
                  <th className="px-3 py-3 font-semibold">LightGBM Estimated</th>
                  <th className="px-3 py-3 font-semibold">Actual Time to Close</th>
                  <th className="px-5 py-3 font-semibold text-right">Variance & Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE2]">
                {closedComparisons.map((c, idx) => {
                  const variance = Math.abs(c.actual_resolution_hours - c.predicted_duration_hours);
                  return (
                    <tr key={idx} className="hover:bg-[#F5F3ED]/80 transition-colors">
                      <td className="px-5 py-3 font-mono font-semibold text-[#254A40]">
                        <button
                          onClick={() => onNavigate && onNavigate('track', c.reference_no)}
                          className="hover:underline text-left"
                        >
                          {c.reference_no}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-medium text-[#252C29]">
                        {c.problem}
                      </td>
                      <td className="px-3 py-3 font-mono text-[#68716A]">
                        {c.predicted_duration_hours ? c.predicted_duration_hours.toFixed(1) : '—'} hrs
                      </td>
                      <td className="px-3 py-3 font-mono font-semibold text-[#254A40]">
                        {c.actual_resolution_hours !== null ? c.actual_resolution_hours.toFixed(1) : '—'} hrs
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#254A40]/10 text-[#254A40]">
                          ±{variance.toFixed(1)} hrs variance
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
