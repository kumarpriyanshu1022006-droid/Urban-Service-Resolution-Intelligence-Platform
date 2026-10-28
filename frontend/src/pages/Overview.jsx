import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Eye,
  FileSpreadsheet,
  Loader2
} from 'lucide-react';

import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import Modal from '../components/ui/Modal';
import ResolutionDistributionChart from '../components/charts/ResolutionDistributionChart';
import CategoryWorkloadChart from '../components/charts/CategoryWorkloadChart';
import BoroughComparisonChart from '../components/charts/BoroughComparisonChart';
import {
  fetchHistoricalSummary,
  fetchHistoricalDistributions,
  fetchHistoricalComplaints
} from '../services/api';
import { OPERATIONAL_OBSERVATIONS } from '../data/sampleData';
import { AlertCircle } from 'lucide-react';

export default function Overview({ onNavigatePredict, onNavigateComplaints, onSelectComplaintForPredict }) {
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // Live historical summary and charts state
  const [summary, setSummary] = useState(null);
  const [distributions, setDistributions] = useState(null);
  const [recentComplaints, setRecentComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOverviewData = async () => {
    setLoading(true);
    setError(null);

    const [sumRes, distRes, compRes] = await Promise.all([
      fetchHistoricalSummary(),
      fetchHistoricalDistributions(),
      fetchHistoricalComplaints({ page: 1, page_size: 6, sort_by: 'created_date', sort_order: 'desc' })
    ]);

    if (!sumRes.success && !distRes.success && !compRes.success) {
      setError(sumRes.error || distRes.error || compRes.error || 'The backend service is unavailable.');
    } else {
      if (sumRes.success && sumRes.data) {
        setSummary(sumRes.data);
      }
      if (distRes.success && distRes.data) {
        setDistributions(distRes.data);
      }
      if (compRes.success && compRes.data && compRes.data.records) {
        setRecentComplaints(compRes.data.records);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOverviewData();
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

  const handleSimulateInPrediction = (record) => {
    if (!onSelectComplaintForPredict || !record) return;
    const mapped = {
      'Agency': record.agency || 'DSNY',
      'Agency Name': record.agency_name || record.agencyName || 'Department of Sanitation',
      'Problem (formerly Complaint Type)': record.problem || 'Dirty Conditions',
      'Problem Detail (formerly Descriptor)': record.problem_detail || record.problemDetail || 'Trash / Illegal Dumping',
      'Location Type': record.location_type || record.locationType || 'Sidewalk',
      'Borough': record.borough || 'MANHATTAN',
      'Incident Zip': record.incident_zip || record.incidentZip || '10001',
      'City': record.city || 'NEW YORK',
      'Community Board': record.community_board || record.communityBoard || '05 MANHATTAN',
      'Council District': Number(record.council_district || record.councilDistrict) || 3,
      'Police Precinct': String(record.police_precinct || record.policePrecinct || '14'),
      'Open Data Channel Type': record.channel || 'ONLINE',
      'Latitude': parseFloat(record.latitude) || 40.7505,
      'Longitude': parseFloat(record.longitude) || -73.9934,
      'Created Date': record.created_date || record.createdDate || new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    onSelectComplaintForPredict(mapped);
    setSelectedComplaint(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#DCDDD4]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#68716A]">
            Operational Workspace
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
            Operations overview
          </h1>
          <p className="text-xs sm:text-sm text-[#68716A] mt-1">
            Verified turnaround distributions and incoming service request velocity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateComplaints}
            icon={FileSpreadsheet}
          >
            Complaints Workspace
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onNavigatePredict}
            icon={ArrowRight}
          >
            Estimate New Request
          </Button>
        </div>
      </div>

      {/* Backend Error Banner */}
      {error && (
        <div className="p-4 bg-[#B4483E]/10 border border-[#B4483E]/30 rounded-lg flex items-start gap-3 text-xs text-[#B4483E]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Historical Data Unavailable</span>
            <span>{error}</span>
          </div>
          <Button size="xs" variant="outline" onClick={loadOverviewData}>
            Retry Request
          </Button>
        </div>
      )}

      {/* Verified Bounded Window Disclosure Notice */}
      <Notice variant="info" title="Historical Dataset Disclosure (Bounded Scan Window)">
        {summary?.scope_disclosure ||
          'Operational statistics below reflect the bounded scan window of up to 50,000 records from export.csv, not the entire 14.48 GB archive. Unresolved requests strictly have no fabricated resolution duration.'}
      </Notice>

      {/* KPI Summaries - Live Bounded Window & Model Benchmarks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Window Scanned Cases"
          value={summary ? summary.window_scanned_records.toLocaleString() : (loading ? '...' : '—')}
          context={summary ? `${summary.window_closed_records.toLocaleString()} closed cases verified` : 'Bounded scan window'}
          trend="Bounded Window"
          icon={CheckCircle2}
        />
        <StatCard
          label="Window Median Turnaround"
          value={summary ? summary.median_resolution_days.toFixed(2) : (loading ? '...' : '—')}
          unit={summary ? 'days' : ''}
          context={summary ? `${summary.median_resolution_hours} hours median turnaround` : 'Verified closed cases'}
          trend="50,000 Window"
          icon={Clock}
        />
        <StatCard
          label="Model Mean Absolute Error"
          value="8.7"
          unit="hrs"
          context="0.36 days MAE (LightGBM_L2)"
          trend="Offline Validation R² = 0.694"
          icon={TrendingUp}
        />
        <StatCard
          label="Window Active Backlog"
          value={summary ? summary.window_active_backlog.toLocaleString() : (loading ? '...' : '—')}
          unit={summary ? 'cases' : ''}
          context={summary ? `${summary.sub_24h_rate}% resolved in < 24 hrs` : 'Unresolved / In Progress'}
          trend="Bounded Window"
          icon={AlertTriangle}
        />
      </div>

      {/* Operational Insights Panel */}
      <Card
        title="Evidence-Based Operational Insights (Historical Patterns)"
        subtitle="Key turnaround observations derived from historical complaint velocity"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {OPERATIONAL_OBSERVATIONS.map((obs, idx) => (
            <div
              key={idx}
              className="p-4 rounded-md border border-[#DCDDD4] bg-[#F5F3ED]/70 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={obs.type === 'warning' ? 'warning' : 'primary'}>
                    {obs.type === 'warning' ? 'Turnaround Notice' : 'Operational Status'}
                  </Badge>
                </div>
                <h4 className="text-xs font-bold text-[#252C29] mb-1">
                  {obs.title}
                </h4>
                <p className="text-xs text-[#68716A] leading-relaxed">
                  {obs.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Analytical Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Resolution Time Distribution */}
        <div className="lg:col-span-6">
          <Card
            title="Resolution-Time Distribution (Bounded Window)"
            subtitle="Frequency distribution of complaint closure times from historical scan"
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#254A40]" />
              </div>
            ) : (
              <ResolutionDistributionChart data={resolutionData} />
            )}
            <div className="mt-4 pt-3 border-t border-[#ECEAE2] text-[11px] text-[#68716A] flex justify-between">
              <span>{summary ? `${summary.sub_24h_rate}% resolved within 24 hours` : 'Sub-24h verified'}</span>
              <span className="text-[#A85D3B] font-medium">{summary ? `${summary.extended_duration_rate}% require 4+ days` : 'Extended cases'}</span>
            </div>
          </Card>
        </div>

        {/* Right: Borough Comparison */}
        <div className="lg:col-span-6">
          <Card
            title="Borough Resolution Comparison (Bounded Window)"
            subtitle="Median days to resolution across all five NYC boroughs"
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#254A40]" />
              </div>
            ) : (
              <BoroughComparisonChart data={boroughData} />
            )}
            <div className="mt-4 pt-3 border-t border-[#ECEAE2] text-[11px] text-[#68716A] flex justify-between">
              <span>Calculated from verified closed tickets</span>
              <span>Pending cases tracked in backlog</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Category Workload Horizontal Breakdown */}
      <Card
        title="Complaint Category Workload & Resolution Times (Bounded Window)"
        subtitle="Median duration in days across major service categories"
      >
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#254A40]" />
          </div>
        ) : (
          <CategoryWorkloadChart data={categoryData} />
        )}
      </Card>

      {/* Recent Activity Table */}
      <Card
        title="Recent Service Requests Activity"
        subtitle="Latest service requests streamed from the historical dataset"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateComplaints}
            icon={ArrowRight}
          >
            View All in Workspace
          </Button>
        }
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/40 text-[#68716A]">
                <th className="px-5 py-2.5 font-semibold">Service Request</th>
                <th className="px-3 py-2.5 font-semibold">Agency</th>
                <th className="px-3 py-2.5 font-semibold">Problem / Detail</th>
                <th className="px-3 py-2.5 font-semibold">Borough</th>
                <th className="px-3 py-2.5 font-semibold">Intake Time</th>
                <th className="px-3 py-2.5 font-semibold">Actual Turnaround</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEAE2]">
              {recentComplaints.map((req) => (
                <tr
                  key={req.unique_key || req.id}
                  className="hover:bg-[#F5F3ED]/60 transition-colors"
                >
                  <td className="px-5 py-3 font-mono font-medium text-[#252C29]">
                    {req.unique_key || req.id}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-[#254A40]">{req.agency}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-[#252C29]">{req.problem}</div>
                    <div className="text-[11px] text-[#68716A]">{req.problem_detail || req.problemDetail}</div>
                  </td>
                  <td className="px-3 py-3 text-[#252C29]">
                    {req.borough}
                  </td>
                  <td className="px-3 py-3 text-[#68716A] whitespace-nowrap">
                    {req.created_date || req.createdDate}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-[#254A40]">
                    {req.actual_resolution_days !== null && req.actual_resolution_days !== undefined
                      ? `${req.actual_resolution_days.toFixed(2)} d`
                      : <span className="text-[#68716A] font-normal italic">Active / In Progress</span>}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      variant={
                        req.status === 'Closed'
                          ? 'success'
                          : req.status === 'Assigned'
                          ? 'primary'
                          : 'warning'
                      }
                      size="xs"
                    >
                      {req.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedComplaint(req)}
                      className="p-1 text-[#68716A] hover:text-[#252C29] hover:bg-[#ECEAE2] rounded-md transition-colors cursor-pointer"
                      title="Inspect Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inspection Modal */}
      {selectedComplaint && (
        <Modal
          isOpen={Boolean(selectedComplaint)}
          onClose={() => setSelectedComplaint(null)}
          title={`Service Request Details: ${selectedComplaint.unique_key || selectedComplaint.id}`}
          subtitle={`Submitted on ${selectedComplaint.created_date || selectedComplaint.createdDate} via ${selectedComplaint.channel}`}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedComplaint(null)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateInPrediction(selectedComplaint)}
              >
                Simulate in Prediction Form
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-[#F5F3ED] border border-[#DCDDD4] rounded-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#68716A] uppercase font-semibold">Verified Turnaround</span>
                <p className="text-xl font-bold text-[#254A40] tabular-nums mt-0.5">
                  {selectedComplaint.actual_resolution_days !== null && selectedComplaint.actual_resolution_days !== undefined
                    ? `${(selectedComplaint.actual_resolution_days * 24).toFixed(1)} hours (${selectedComplaint.actual_resolution_days.toFixed(2)} days)`
                    : 'Active / In Progress (Unresolved)'}
                </p>
              </div>
              <Badge variant={selectedComplaint.status === 'Closed' ? 'success' : 'warning'}>
                {selectedComplaint.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[#68716A] block">Complaint Type:</span>
                <span className="font-semibold text-[#252C29]">{selectedComplaint.problem}</span>
              </div>
              <div>
                <span className="text-[#68716A] block">Problem Detail:</span>
                <span className="font-semibold text-[#252C29]">{selectedComplaint.problem_detail || selectedComplaint.problemDetail}</span>
              </div>
              <div>
                <span className="text-[#68716A] block">Responsible Agency:</span>
                <span className="font-semibold text-[#252C29]">{selectedComplaint.agency} — {selectedComplaint.agency_name || selectedComplaint.agencyName}</span>
              </div>
              <div>
                <span className="text-[#68716A] block">Location Type:</span>
                <span className="font-semibold text-[#252C29]">{selectedComplaint.location_type || selectedComplaint.locationType}</span>
              </div>
              <div>
                <span className="text-[#68716A] block">Borough & ZIP:</span>
                <span className="font-semibold text-[#252C29]">{selectedComplaint.borough} {selectedComplaint.incident_zip || selectedComplaint.incidentZip}</span>
              </div>
              <div>
                <span className="text-[#68716A] block">Administrative District:</span>
                <span className="font-semibold text-[#252C29]">
                  District {selectedComplaint.council_district || 'N/A'} • Precinct {selectedComplaint.police_precinct || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
