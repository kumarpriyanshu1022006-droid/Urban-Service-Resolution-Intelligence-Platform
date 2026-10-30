import React, { useState, useEffect, useCallback } from 'react';
import { PlusCircle, Clock, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Search } from 'lucide-react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { fetchOperationalComplaints } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function CitizenDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = {};
    if (statusFilter !== 'ALL') params.status = statusFilter;
    if (search.trim()) params.search = search.trim();

    const res = await fetchOperationalComplaints(params);
    if (res.success && res.data) {
      setComplaints(res.data.complaints || []);
    } else {
      setError(res.error || 'Failed to load your complaints.');
    }
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints, user?.id]);

  // Compute tallies
  const totalCount = complaints.length;
  const activeCount = complaints.filter((c) => ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'On Hold'].includes(c.status)).length;
  const resolvedCount = complaints.filter((c) => ['Resolved - Pending Verification', 'Closed'].includes(c.status)).length;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Submitted':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#C59A52]/15 text-[#8F6A2A] border border-[#C59A52]/30">Submitted</span>;
      case 'Assigned':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#254A40]/10 text-[#254A40] border border-[#254A40]/20">Assigned</span>;
      case 'In Progress':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#1D70B8]/10 text-[#1D70B8] border border-[#1D70B8]/20">In Progress</span>;
      case 'On Hold':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#B4483E]/10 text-[#B4483E] border border-[#B4483E]/20">On Hold</span>;
      case 'Resolved - Pending Verification':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#8F6A2A]/15 text-[#8F6A2A] border border-[#8F6A2A]/30">Awaiting Verification</span>;
      case 'Closed':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#367454]/15 text-[#367454] border border-[#367454]/30 font-semibold">Closed & Verified</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#DCDDD4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#68716A]">
            Citizen Service Workspace
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
            My Submitted Complaints
          </h1>
          <p className="text-xs sm:text-sm text-[#68716A] mt-1">
            Track real-time progress, department assignments, and resolution timelines for your service requests.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => onNavigate && onNavigate('submit_complaint')}
          className="shrink-0"
        >
          <PlusCircle className="w-4 h-4 mr-1.5 inline" />
          Submit New Complaint
        </Button>
      </div>

      {error && (
        <Notice variant="danger" title="Service Error">
          {error}
        </Notice>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Requests Filed"
          value={totalCount}
          context="Logged under your citizen profile"
          trend="All Time"
          icon={Clock}
        />
        <StatCard
          label="Active / In Progress"
          value={activeCount}
          context="Under operational review or dispatch"
          trend="Actionable"
          icon={AlertTriangle}
        />
        <StatCard
          label="Resolved & Verified"
          value={resolvedCount}
          context="Field work completed or closed"
          trend="Completed"
          icon={CheckCircle2}
        />
      </div>

      {/* Main Table Card */}
      <Card
        title="Your Service Requests"
        subtitle="Chronological list of all complaints submitted through this platform"
        headerAction={
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search requests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs pl-7 pr-3 py-1.5 bg-white border border-[#DCDDD4] rounded-md text-[#252C29] focus:outline-none focus:border-[#254A40]"
              />
              <Search className="w-3.5 h-3.5 text-[#68716A] absolute left-2 top-2" />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
            >
              <option value="ALL">All Statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="On Hold">On Hold</option>
              <option value="Resolved - Pending Verification">Pending Verification</option>
              <option value="Closed">Closed</option>
            </select>

            <Button size="xs" variant="outline" onClick={loadComplaints}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="py-12 text-center text-xs text-[#68716A]">
            Loading your service requests...
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-[#68716A]">No complaints found matching this filter.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate && onNavigate('submit_complaint')}
            >
              Submit Your First Complaint
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full min-w-[960px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                  <th className="px-5 py-3 font-semibold w-[130px] whitespace-nowrap">Reference</th>
                  <th className="px-3 py-3 font-semibold w-[200px]">Issue Category</th>
                  <th className="px-3 py-3 font-semibold w-[180px]">Location / Address</th>
                  <th className="px-3 py-3 font-semibold w-[140px]">Assigned Agency</th>
                  <th className="px-3 py-3 font-semibold w-[130px]">Status</th>
                  <th className="px-3 py-3 font-semibold w-[110px] whitespace-nowrap">AI Estimate</th>
                  <th className="px-5 py-3 font-semibold text-right w-[140px] whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE2]">
                {complaints.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F3ED]/80 transition-colors">
                    <td className="px-5 py-3 font-mono font-semibold text-[#254A40] whitespace-nowrap">
                      {item.reference_no}
                    </td>
                    <td className="px-3 py-3 font-medium text-[#252C29] max-w-[200px]">
                      <div className="truncate font-semibold" title={item.problem}>{item.problem}</div>
                      <div className="text-[11px] text-[#68716A] truncate" title={item.problem_detail}>{item.problem_detail}</div>
                    </td>
                    <td className="px-3 py-3 text-[#252C29] max-w-[180px]">
                      <div className="truncate" title={item.incident_address}>{item.incident_address}</div>
                      <div className="text-[11px] text-[#68716A] truncate">{item.borough} {item.incident_zip}</div>
                    </td>
                    <td className="px-3 py-3 font-medium text-[#252C29] whitespace-nowrap">
                      {item.assigned_department || item.agency}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[#254A40] font-medium whitespace-nowrap">
                      ~{item.predicted_duration_hours ? `${item.predicted_duration_hours.toFixed(1)} hrs` : 'Calculating...'}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => onNavigate && onNavigate('track', item.reference_no)}
                      >
                        Track Live <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
