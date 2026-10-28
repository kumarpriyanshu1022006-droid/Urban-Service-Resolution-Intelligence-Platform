import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Notice from '../components/ui/Notice';
import Button from '../components/ui/Button';
import ResolutionDistributionChart from '../components/charts/ResolutionDistributionChart';
import CategoryWorkloadChart from '../components/charts/CategoryWorkloadChart';
import BoroughComparisonChart from '../components/charts/BoroughComparisonChart';
import TemporalTrendChart from '../components/charts/TemporalTrendChart';
import {
  fetchHistoricalSummary,
  fetchHistoricalDistributions
} from '../services/api';
import { Clock, TrendingUp, BarChart2, Activity, Loader2, AlertCircle } from 'lucide-react';

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [distributions, setDistributions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    const [sumRes, distRes] = await Promise.all([
      fetchHistoricalSummary(),
      fetchHistoricalDistributions()
    ]);

    if (!sumRes.success && !distRes.success) {
      setError(sumRes.error || distRes.error || 'The backend service is unavailable.');
    } else {
      if (sumRes.success && sumRes.data) {
        setSummary(sumRes.data);
      }
      if (distRes.success && distRes.data) {
        setDistributions(distRes.data);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  // Format real charts data with zero fallback to sample mock datasets
  const resolutionData = distributions?.resolution_distribution || [];

  const boroughData = distributions?.borough_stats
    ? distributions.borough_stats.map((b) => ({
        borough: b.borough,
        total: b.total,
        medianDays: b.median_days,
        reviewNeeded: b.active_backlog || 0
      }))
    : [];

  const categoryData = distributions?.category_workload
    ? distributions.category_workload.map((c) => ({
        category: c.category,
        requests: c.requests,
        medianDays: c.median_days,
        avgHours: c.avg_hours
      }))
    : [];

  const temporalData = distributions?.weekly_volume_trend
    ? distributions.weekly_volume_trend.map((t) => ({
        day: t.day,
        requests: t.requests,
        avgResolutionHours: t.avg_resolution_hours
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-2 border-b border-[#DCDDD4]">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#68716A]">
              Historical Performance Analytics
            </span>
            <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
              Service resolution analytics
            </h1>
          </div>
          <span className="text-xs text-[#8F6A2A] font-medium bg-[#C59A52]/15 px-2.5 py-1 rounded-md border border-[#C59A52]/30">
            Bounded Scan Window: 50,000 Records
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#68716A] mt-1">
          Historical turnaround distributions, inter-borough workload velocity, and weekly volume dynamics from the historical dataset scan.
        </p>
      </div>

      {/* Backend Error Banner if API unavailable */}
      {error && (
        <div className="p-4 bg-[#B4483E]/10 border border-[#B4483E]/30 rounded-lg flex items-start gap-3 text-xs text-[#B4483E]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Historical Analytics Unavailable</span>
            <span>{error}</span>
          </div>
          <Button size="xs" variant="outline" onClick={loadAnalytics}>
            Retry Request
          </Button>
        </div>
      )}

      {/* Explanatory Data Notice */}
      <Notice variant="info" title="Historical Analytics Scope Disclosure (Bounded Scan Window)">
        {summary?.scope_disclosure ||
          'Analytics below describe strictly the bounded scan window of up to 50,000 records from export.csv, not the full 14.48 GB archive. Unresolved requests strictly have no fabricated resolution duration.'}
      </Notice>

      {/* Key Analytical Benchmark Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Window Median Turnaround"
          value={summary ? summary.median_resolution_hours.toFixed(2) : (loading ? '...' : '—')}
          unit={summary ? 'hours' : ''}
          context={summary ? `${summary.median_resolution_days.toFixed(2)} days median turnaround` : 'Across closed cases in window'}
          trend="Bounded Window"
          icon={Clock}
        />
        <StatCard
          label="Window Sub-24h Resolution"
          value={summary ? `${summary.sub_24h_rate}%` : (loading ? '...' : '—')}
          context={summary ? `${summary.window_closed_records.toLocaleString()} closed cases analyzed` : 'Closed within first 24h'}
          trend="Bounded Window"
          icon={TrendingUp}
        />
        <StatCard
          label="Extended Duration Share"
          value={summary ? `${summary.extended_duration_rate}%` : (loading ? '...' : '—')}
          context="Requires 4+ days to resolve"
          trend="Bounded Window"
          icon={Activity}
        />
        <StatCard
          label="Window Scanned Cases"
          value={summary ? summary.window_scanned_records.toLocaleString() : (loading ? '...' : '—')}
          context={summary ? `${summary.window_active_backlog.toLocaleString()} active backlog cases` : 'Bounded scan window'}
          trend="Bounded Window"
          icon={BarChart2}
        />
      </div>

      {/* Primary Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <Card
            title="Resolution Duration Distribution (Bounded Window)"
            subtitle="Histogram of elapsed closure time across verified closed requests"
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#254A40]" />
              </div>
            ) : (
              <ResolutionDistributionChart data={resolutionData} />
            )}
          </Card>
        </div>

        <div className="lg:col-span-6">
          <Card
            title="Weekly Volume & Resolution Velocity (Bounded Window)"
            subtitle="Daily request intake volume vs. average turnaround duration"
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#254A40]" />
              </div>
            ) : (
              <TemporalTrendChart data={temporalData} />
            )}
          </Card>
        </div>
      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <Card
            title="Category Workload & Median Days (Bounded Window)"
            subtitle="Operational duration comparison by primary complaint classification"
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#254A40]" />
              </div>
            ) : (
              <CategoryWorkloadChart data={categoryData} />
            )}
          </Card>
        </div>

        <div className="lg:col-span-5">
          <Card
            title="Borough Turnaround Comparison (Bounded Window)"
            subtitle="Median resolution duration across all five boroughs"
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#254A40]" />
              </div>
            ) : (
              <BoroughComparisonChart data={boroughData} />
            )}
          </Card>
        </div>
      </div>

      {/* Detailed Analytical Table */}
      <Card
        title="Category Benchmark Summary Table (Bounded Window)"
        subtitle="Operational metrics across major tracked municipal categories"
      >
        <div className="overflow-x-auto -mx-5 -my-5">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                <th className="px-5 py-3 font-semibold">Service Category</th>
                <th className="px-3 py-3 font-semibold">Total Requests</th>
                <th className="px-3 py-3 font-semibold">Median Resolution</th>
                <th className="px-3 py-3 font-semibold">Average Turnaround</th>
                <th className="px-5 py-3 font-semibold text-right">Operational Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEAE2]">
              {categoryData.map((cat, idx) => (
                <tr key={idx} className="hover:bg-[#F5F3ED]/80 transition-colors">
                  <td className="px-5 py-3 font-medium text-[#252C29]">
                    {cat.category}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-[#68716A]">
                    {cat.requests.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-[#254A40]">
                    {cat.medianDays !== undefined ? `${cat.medianDays.toFixed(2)} days` : '—'}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-[#68716A]">
                    {cat.avgHours !== undefined ? `${cat.avgHours} hours` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                        cat.medianDays > 2
                          ? 'bg-[#A85D3B]/10 text-[#A85D3B]'
                          : 'bg-[#367454]/10 text-[#367454]'
                      }`}
                    >
                      {cat.medianDays > 2 ? 'Review Needed' : 'Target Met'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
