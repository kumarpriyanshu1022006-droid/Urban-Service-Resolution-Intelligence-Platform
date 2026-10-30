import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  UserPlus,
  Check,
  RotateCcw,
  Sliders,
  AlertCircle,
  Link2,
  XCircle,
  MapPin,
  Eye,
  Camera,
  X,
  FileText
} from 'lucide-react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import AuthenticatedImage from '../components/ui/AuthenticatedImage';
import {
  fetchOperationalAnalytics,
  fetchOperationalComplaints,
  fetchOperationalComplaintDetail,
  fetchDepartments,
  fetchStaffList,
  assignOperationalComplaint,
  updateOperationalStatus,
  updateOperationalPriority,
  fetchDuplicateReviewQueue,
  reviewDuplicateCandidate,
  verifyComplaintResolution
} from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Modals
  // 1. Assignment Modal
  const [assignModalCase, setAssignModalCase] = useState(null);
  const [assignDept, setAssignDept] = useState('DSNY');
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignPriority, setAssignPriority] = useState('Medium');
  const [assignPriorityReason, setAssignPriorityReason] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [submittingAssign, setSubmittingAssign] = useState(false);
  const [modalEligibleStaff, setModalEligibleStaff] = useState([]);
  const [loadingEligibleStaff, setLoadingEligibleStaff] = useState(false);

  // 2. Direct Priority Override / Escalation Modal
  const [priorityModalCase, setPriorityModalCase] = useState(null);
  const [newPriority, setNewPriority] = useState('High');
  const [priorityReason, setPriorityReason] = useState('');
  const [submittingPriority, setSubmittingPriority] = useState(false);

  // 3. Reopen Modal
  const [reopenCase, setReopenCase] = useState(null);
  const [reopenReason, setReopenReason] = useState('');
  const [submittingReopen, setSubmittingReopen] = useState(false);

  // 4. Duplicate Review Queue
  const [activeTab, setActiveTab] = useState('roster'); // 'roster' | 'verification' | 'duplicates'
  const [duplicateList, setDuplicateList] = useState([]);
  const [dupFilter, setDupFilter] = useState('PENDING'); // 'PENDING' | 'LINKED' | 'DISMISSED' | 'ALL'
  const [dupModalItem, setDupModalItem] = useState(null);
  const [dupModalAction, setDupModalAction] = useState('LINK'); // 'LINK' | 'DISMISS'
  const [dupModalReason, setDupModalReason] = useState('');
  const [submittingDupReview, setSubmittingDupReview] = useState(false);

  // 5. Admin Verification Queue State
  const [verificationQueue, setVerificationQueue] = useState([]);
  const [verifyDeptFilter, setVerifyDeptFilter] = useState('ALL');
  const [verifySearch, setVerifySearch] = useState('');
  const [inspectingVerifyCase, setInspectingVerifyCase] = useState(null);
  const [verifyCaseDetail, setVerifyCaseDetail] = useState(null);
  const [loadingVerifyDetail, setLoadingVerifyDetail] = useState(false);
  const [verifyAction, setVerifyAction] = useState('APPROVE'); // 'APPROVE' | 'REJECT'
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyRejectionReason, setVerifyRejectionReason] = useState('');
  const [verifyConfirmRequired, setVerifyConfirmRequired] = useState(false);
  const [submittingVerify, setSubmittingVerify] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [analyticsRes, complaintsRes, deptsRes, dupRes, verifyRes] = await Promise.all([
      fetchOperationalAnalytics(),
      fetchOperationalComplaints({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        department: deptFilter !== 'ALL' ? deptFilter : undefined,
        search: search.trim() ? search.trim() : undefined,
        limit: 100
      }),
      fetchDepartments(),
      fetchDuplicateReviewQueue(dupFilter),
      fetchOperationalComplaints({
        status: 'Resolved - Pending Verification',
        limit: 100
      })
    ]);

    if (analyticsRes.success) setAnalytics(analyticsRes.data);
    if (complaintsRes.success) setComplaints(complaintsRes.data?.complaints || []);
    if (deptsRes.success) setDepartments(deptsRes.data || []);
    if (dupRes.success) setDuplicateList(dupRes.data?.duplicates || []);
    if (verifyRes.success) setVerificationQueue(verifyRes.data?.complaints || []);

    if (!analyticsRes.success && !complaintsRes.success) {
      setError(analyticsRes.error || complaintsRes.error || 'Failed to load administrative operations.');
    }
    setLoading(false);
  }, [statusFilter, deptFilter, search, dupFilter]);

  useEffect(() => {
    loadData();
  }, [loadData, user?.id]);

  // Dynamically fetch eligible officers for a selected municipal department
  const loadEligibleStaffForDept = async (dept, currentStaffId) => {
    setLoadingEligibleStaff(true);
    const res = await fetchStaffList(dept);
    if (res.success && res.data) {
      const eligible = res.data.filter((st) => st.department === dept && st.role === 'staff');
      setModalEligibleStaff(eligible);
      const isCurrentEligible = eligible.some((st) => String(st.id) === String(currentStaffId));
      if (!isCurrentEligible) {
        setAssignStaffId('');
      } else {
        setAssignStaffId(String(currentStaffId));
      }
    } else {
      setModalEligibleStaff([]);
      setAssignStaffId('');
    }
    setLoadingEligibleStaff(false);
  };

  // Open Assign Modal
  const handleOpenAssign = (item) => {
    setAssignModalCase(item);
    const initialDept = item.assigned_department || item.agency || 'DSNY';
    setAssignDept(initialDept);
    setAssignPriority(item.priority || item.suggested_priority || 'Medium');
    setAssignPriorityReason(item.priority_override_reason || '');
    setAssignNotes('');
    loadEligibleStaffForDept(initialDept, item.assigned_staff_id);
  };

  // Department selector change handler (fetches eligible staff dynamically for new department)
  const handleAssignDeptChange = (newDept) => {
    setAssignDept(newDept);
    loadEligibleStaffForDept(newDept, assignStaffId);
  };

  // Submit Assignment
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignModalCase) return;

    // Check if priority differs from suggested priority and require reason
    const isOverride = assignPriority !== (assignModalCase.suggested_priority || 'Medium');
    if (isOverride && !assignPriorityReason.trim()) {
      alert('A justification reason is mandatory when setting operational priority different from the rule-based recommendation.');
      return;
    }

    setSubmittingAssign(true);
    const res = await assignOperationalComplaint(assignModalCase.reference_no, {
      department: assignDept,
      staff_id: assignStaffId ? Number(assignStaffId) : null,
      priority: assignPriority,
      priority_reason: assignPriorityReason.trim() || undefined,
      notes: assignNotes.trim() || undefined
    });
    if (res.success) {
      setSuccessMsg(`Complaint ${assignModalCase.reference_no} assigned to ${assignDept}.`);
      setAssignModalCase(null);
      loadData();
    } else {
      alert(res.error || 'Assignment failed.');
    }
    setSubmittingAssign(false);
  };

  // Open Direct Priority Modal
  const handleOpenPriority = (item) => {
    setPriorityModalCase(item);
    setNewPriority(item.priority || 'Medium');
    setPriorityReason(item.priority_override_reason || '');
  };

  // Submit Direct Priority Override
  const handlePrioritySubmit = async (e) => {
    e.preventDefault();
    if (!priorityModalCase) return;
    if (!priorityReason.trim()) {
      alert('A justification reason is mandatory for operational priority overrides.');
      return;
    }

    setSubmittingPriority(true);
    const res = await updateOperationalPriority(priorityModalCase.reference_no, {
      priority: newPriority,
      reason: priorityReason.trim()
    });
    if (res.success) {
      setSuccessMsg(`Priority for complaint ${priorityModalCase.reference_no} updated to ${newPriority}.`);
      setPriorityModalCase(null);
      loadData();
    } else {
      alert(res.error || 'Priority update failed.');
    }
    setSubmittingPriority(false);
  };

  // Admin Verification Handlers (Phase 3 Stage 3)
  const handleOpenVerifyModal = async (item) => {
    setInspectingVerifyCase(item);
    setVerifyAction('APPROVE');
    setVerifyNotes('');
    setVerifyRejectionReason('');
    setVerifyConfirmRequired(false);
    setVerifyError(null);
    setLoadingVerifyDetail(true);

    const res = await fetchOperationalComplaintDetail(item.reference_no);
    if (res.success && res.data) {
      setVerifyCaseDetail(res.data);
    } else {
      setVerifyCaseDetail(null);
      setVerifyError(res.error || 'Failed to load case completion details.');
    }
    setLoadingVerifyDetail(false);
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!inspectingVerifyCase) return;
    setVerifyError(null);

    if (verifyAction === 'REJECT') {
      const reason = verifyRejectionReason.trim();
      if (!reason || reason.length < 5) {
        setVerifyError('A mandatory rejection reason (minimum 5 characters) is required to request rework.');
        return;
      }
    }

    if (!verifyConfirmRequired) {
      setVerifyConfirmRequired(true);
      return;
    }

    setSubmittingVerify(true);
    const payload = {
      action: verifyAction,
      notes: verifyNotes.trim() || undefined,
      rejection_reason: verifyAction === 'REJECT' ? verifyRejectionReason.trim() : undefined
    };

    const res = await verifyComplaintResolution(inspectingVerifyCase.reference_no, payload);
    if (res.success) {
      setSuccessMsg(
        verifyAction === 'APPROVE'
          ? `Complaint ${inspectingVerifyCase.reference_no} verified and officially closed. Resolution duration logged.`
          : `Complaint ${inspectingVerifyCase.reference_no} rejected for rework and returned to assigned field officer.`
      );
      setInspectingVerifyCase(null);
      setVerifyCaseDetail(null);
      setVerifyConfirmRequired(false);
      loadData();
    } else {
      setVerifyError(res.error || 'Verification processing failed.');
      // If concurrent status change occurred, refresh the queue
      if (res.error && (res.error.toLowerCase().includes('status') || res.error.toLowerCase().includes('cannot verify'))) {
        loadData();
      }
    }
    setSubmittingVerify(false);
  };

  // Reopen Case
  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!reopenCase || !reopenReason.trim()) return;
    setSubmittingReopen(true);
    const res = await updateOperationalStatus(reopenCase.reference_no, {
      to_status: 'In Progress',
      comment: `Reopened by Admin: ${reopenReason.trim()}`
    });
    if (res.success) {
      setSuccessMsg(`Complaint ${reopenCase.reference_no} reopened to In Progress.`);
      setReopenCase(null);
      loadData();
    } else {
      alert(res.error || 'Reopen failed.');
    }
    setSubmittingReopen(false);
  };

  // Duplicate Review Action Handler (Link or Dismiss)
  const handleReviewDuplicateSubmit = async (e) => {
    e.preventDefault();
    if (!dupModalItem || !dupModalReason.trim()) return;
    setSubmittingDupReview(true);
    const res = await reviewDuplicateCandidate(dupModalItem.id, {
      action: dupModalAction,
      reason: dupModalReason.trim()
    });
    if (res.success) {
      setSuccessMsg(
        dupModalAction === 'LINK'
          ? `Complaint ${dupModalItem.duplicate.reference_no} successfully linked as duplicate of ${dupModalItem.original.reference_no}.`
          : `Duplicate candidate match between ${dupModalItem.duplicate.reference_no} and ${dupModalItem.original.reference_no} dismissed.`
      );
      setDupModalItem(null);
      setDupModalReason('');
      loadData();
    } else {
      setError(res.error || 'Failed to process duplicate review.');
    }
    setSubmittingDupReview(false);
  };

  const filteredVerifyQueue = verificationQueue.filter((item) => {
    if (verifyDeptFilter !== 'ALL' && item.assigned_department !== verifyDeptFilter) return false;
    if (verifySearch.trim()) {
      const q = verifySearch.toLowerCase();
      const refMatch = (item.reference_no || '').toLowerCase().includes(q);
      const probMatch = (item.problem || '').toLowerCase().includes(q);
      const addrMatch = (item.incident_address || '').toLowerCase().includes(q);
      const staffMatch = (item.assigned_staff_name || '').toLowerCase().includes(q);
      if (!refMatch && !probMatch && !addrMatch && !staffMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#DCDDD4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#68716A]">
            <ShieldCheck className="w-4 h-4 text-[#254A40]" />
            <span>Municipal Administrative Operations</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
            Operations Management Console
          </h1>
          <p className="text-xs sm:text-sm text-[#68716A] mt-1">
            Real-time oversight across all platforms, SLA compliance tracking, department dispatch, and resolution verification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onNavigate && onNavigate('operational_analytics')}
          >
            Operational Analytics <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
          </Button>
        </div>
      </div>

      {successMsg && (
        <Notice variant="success" title="Action Completed">
          {successMsg}
        </Notice>
      )}

      {error && (
        <Notice variant="danger" title="Operational Error">
          {error}
        </Notice>
      )}

      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total Registered"
          value={analytics?.total_complaints || 0}
          context="Platform total"
          trend="Total"
          icon={Clock}
        />
        <StatCard
          label="Unassigned"
          value={analytics?.unassigned_count || 0}
          context="Awaiting dispatch"
          trend="Action Needed"
          icon={UserPlus}
        />
        <StatCard
          label="In Progress"
          value={analytics?.in_progress_count || 0}
          context="Field work active"
          trend="Operational"
          icon={CheckCircle2}
        />
        <StatCard
          label="On Hold (Paused)"
          value={analytics?.on_hold_count || 0}
          context="Blockers reported"
          trend="Delayed"
          icon={AlertTriangle}
        />
        <div onClick={() => setActiveTab('verification')} className="cursor-pointer transition-transform hover:scale-[1.02]">
          <StatCard
            label="Pending Verification"
            value={verificationQueue.length || analytics?.pending_verification_count || 0}
            context="Staff completed work"
            trend="Verify & Close"
            icon={ShieldCheck}
          />
        </div>
        <StatCard
          label="Overdue / At-Risk"
          value={analytics?.overdue_count || 0}
          context="Elapsed > AI Estimate"
          trend="SLA Risk"
          icon={AlertTriangle}
        />
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-[#DCDDD4] space-x-6 text-sm pt-2">
        <button
          type="button"
          onClick={() => setActiveTab('roster')}
          className={`pb-3 font-medium transition-colors cursor-pointer ${
            activeTab === 'roster'
              ? 'border-b-2 border-[#254A40] text-[#254A40]'
              : 'text-[#68716A] hover:text-[#252C29]'
          }`}
        >
          Operational Complaints Roster ({complaints.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('verification')}
          className={`pb-3 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'verification'
              ? 'border-b-2 border-[#254A40] text-[#254A40]'
              : 'text-[#68716A] hover:text-[#252C29]'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-[#8F6A2A]" />
          <span>Resolution Verification Queue</span>
          {verificationQueue.length > 0 ? (
            <span className="bg-[#8F6A2A] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {verificationQueue.length} pending
            </span>
          ) : (
            <span className="bg-[#ECEAE2] text-[#68716A] text-[10px] px-1.5 py-0.2 rounded-full">
              0
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('duplicates')}
          className={`pb-3 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'duplicates'
              ? 'border-b-2 border-[#254A40] text-[#254A40]'
              : 'text-[#68716A] hover:text-[#252C29]'
          }`}
        >
          <span>Duplicate Review Queue</span>
          {duplicateList.filter((d) => d.review_status === 'PENDING').length > 0 ? (
            <span className="bg-[#B4483E] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {duplicateList.filter((d) => d.review_status === 'PENDING').length} pending
            </span>
          ) : (
            <span className="bg-[#ECEAE2] text-[#68716A] text-[10px] px-1.5 py-0.2 rounded-full">
              {duplicateList.length}
            </span>
          )}
        </button>
      </div>

      {/* VIEW 1: Operational Complaints Roster */}
      {activeTab === 'roster' && (
        <>
          {/* Department Backlog Table */}
      {analytics?.department_stats && analytics.department_stats.length > 0 && (
        <Card
          title="Departmental Workload & Backlog Summary"
          subtitle="Active cases distributed by municipal enforcement division"
        >
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                  <th className="px-5 py-3 font-semibold">Department Division</th>
                  <th className="px-3 py-3 font-semibold">Total Cases</th>
                  <th className="px-3 py-3 font-semibold">Active Backlog</th>
                  <th className="px-3 py-3 font-semibold">Closed Cases</th>
                  <th className="px-5 py-3 font-semibold text-right">Operational Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE2]">
                {analytics.department_stats.map((dept, idx) => (
                  <tr key={idx} className="hover:bg-[#F5F3ED]/80 transition-colors">
                    <td className="px-5 py-3 font-semibold text-[#252C29]">
                      {dept.department || 'Unassigned'}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[#68716A]">
                      {dept.total_cases}
                    </td>
                    <td className="px-3 py-3 tabular-nums font-semibold text-[#254A40]">
                      {dept.active_backlog}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[#68716A]">
                      {dept.closed_cases}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        dept.active_backlog > 4
                          ? 'bg-[#B4483E]/10 text-[#B4483E]'
                          : 'bg-[#367454]/10 text-[#367454]'
                      }`}>
                        {dept.active_backlog > 4 ? 'High Load' : 'Normal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Main Operational Complaints Table */}
      <Card
        title="Active Operational Complaints Roster"
        subtitle="Manage assignments, monitor progress, and verify completions"
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search reference, address, issue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-white border border-[#DCDDD4] rounded-md text-[#252C29] w-48"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
            >
              <option value="ALL">All Statuses</option>
              <option value="Submitted">Submitted (Unassigned)</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="On Hold">On Hold</option>
              <option value="Resolved - Pending Verification">Pending Verification</option>
              <option value="Closed">Closed</option>
            </select>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
            >
              <option value="ALL">All Departments</option>
              {departments.length > 0 ? (
                departments.map((d) => (
                  <option key={d.code} value={d.code}>{d.code} ({d.name})</option>
                ))
              ) : (
                <>
                  <option value="DSNY">DSNY (Sanitation)</option>
                  <option value="DOT">DOT (Transportation)</option>
                  <option value="NYPD">NYPD (Police)</option>
                  <option value="DEP">DEP (Environmental)</option>
                </>
              )}
            </select>
          </div>
        }
      >
        {loading ? (
          <div className="py-12 text-center text-xs text-[#68716A]">
            Loading operational complaints...
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#68716A]">
            No complaints found matching the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full min-w-[1020px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                  <th className="px-5 py-3 font-semibold w-[130px] whitespace-nowrap">Reference</th>
                  <th className="px-3 py-3 font-semibold w-[200px]">Issue Details</th>
                  <th className="px-3 py-3 font-semibold w-[170px]">Location</th>
                  <th className="px-3 py-3 font-semibold w-[160px]">Assigned Staff / Dept</th>
                  <th className="px-3 py-3 font-semibold w-[140px]">Operational Priority</th>
                  <th className="px-3 py-3 font-semibold w-[130px]">Status</th>
                  <th className="px-3 py-3 font-semibold w-[100px] whitespace-nowrap">AI Turnaround</th>
                  <th className="px-5 py-3 font-semibold text-right w-[190px] whitespace-nowrap">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE2]">
                {complaints.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F3ED]/80 transition-colors">
                    <td className="px-5 py-3 font-mono font-semibold text-[#254A40] whitespace-nowrap">
                      <button
                        onClick={() => onNavigate && onNavigate('track', item.reference_no)}
                        className="hover:underline text-left cursor-pointer"
                        title={`Track ${item.reference_no}`}
                      >
                        {item.reference_no}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-medium text-[#252C29] max-w-[200px]">
                      <div className="truncate font-semibold" title={item.problem}>{item.problem}</div>
                      <div className="text-[11px] text-[#68716A] truncate" title={item.problem_detail}>{item.problem_detail}</div>
                    </td>
                    <td className="px-3 py-3 text-[#252C29] max-w-[170px]">
                      <div className="truncate" title={item.incident_address}>{item.incident_address}</div>
                      <div className="text-[11px] text-[#68716A] truncate">{item.borough} {item.incident_zip}</div>
                    </td>
                    <td className="px-3 py-3 text-[#252C29] max-w-[160px]">
                      <div className="font-semibold truncate">{item.assigned_department || 'Unassigned'}</div>
                      <div className="text-[11px] text-[#68716A] truncate" title={item.assigned_staff_name || 'Department Dispatch Queue'}>
                        {item.assigned_staff_name || 'Department Dispatch Queue'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold inline-block whitespace-nowrap ${
                          item.priority === 'Emergency'
                            ? 'bg-[#B4483E]/15 text-[#B4483E] border border-[#B4483E]/30'
                            : item.priority === 'High'
                            ? 'bg-[#C59A52]/15 text-[#8F6A2A] border border-[#C59A52]/30'
                            : 'bg-[#ECEAE2] text-[#68716A]'
                        }`}>
                          {item.priority}
                        </span>
                        {item.priority_override_reason && (
                          <span className="block text-[10px] text-[#8F6A2A] font-medium mt-0.5 truncate max-w-[130px]" title={item.priority_override_reason}>
                            Override: {item.priority_override_reason}
                          </span>
                        )}
                        <div className="text-[10px] text-[#68716A] mt-0.5 whitespace-nowrap">
                          Sugg: <span className="font-medium text-[#254A40]">{item.suggested_priority || 'Medium'}</span> <span className="text-[9px] text-[#68716A]">(Rule)</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#254A40]/10 text-[#254A40] inline-block">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[#254A40] whitespace-nowrap">
                      ~{item.predicted_duration_hours ? item.predicted_duration_hours.toFixed(1) : '—'} hrs
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Assign / Reassign Button */}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleOpenAssign(item)}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          {item.assigned_staff_id ? 'Reassign' : 'Assign'}
                        </Button>

                        {/* Adjust / Escalate Priority Button */}
                        <Button
                          size="xs"
                          variant="ghost"
                          title="Adjust or Escalate Priority"
                          onClick={() => handleOpenPriority(item)}
                        >
                          <Sliders className="w-3 h-3 mr-1 text-[#68716A]" />
                          Priority
                        </Button>

                        {/* Verify & Close for Resolved tickets */}
                        {item.status === 'Resolved - Pending Verification' && (
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={() => handleOpenVerifyModal(item)}
                          >
                            <ShieldCheck className="w-3 h-3 mr-1" /> Inspect & Verify
                          </Button>
                        )}

                        {/* Reopen Button for Closed tickets */}
                        {item.status === 'Closed' && (
                          <Button
                            size="xs"
                            variant="ghost"
                            title="Reopen Case"
                            onClick={() => {
                              setReopenCase(item);
                              setReopenReason('');
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}

      {/* VIEW 2: Resolution Verification Queue */}
      {activeTab === 'verification' && (
        <Card
          title="Admin Resolution Verification & Quality Oversight"
          subtitle="Two-party verification console: Review field staff evidence photos, GPS telemetry, and work notes before official case closure"
          headerAction={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={verifyDeptFilter}
                onChange={(e) => setVerifyDeptFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-white border border-[#DCDDD4] rounded-lg text-[#252C29] focus:outline-none focus:border-[#254A40]"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search ref, staff, address..."
                value={verifySearch}
                onChange={(e) => setVerifySearch(e.target.value)}
                className="text-xs px-3 py-1.5 bg-white border border-[#DCDDD4] rounded-lg text-[#252C29] placeholder-[#68716A] focus:outline-none focus:border-[#254A40] w-48 sm:w-60"
              />

              <Button size="xs" variant="outline" onClick={loadData}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          }
        >
          {loading ? (
            <div className="py-12 text-center text-xs text-[#68716A]">
              Loading resolution verification queue...
            </div>
          ) : filteredVerifyQueue.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#68716A] space-y-1">
              <div className="font-semibold text-[#252C29]">All Completion Reports Verified</div>
              <p>No complaints are currently awaiting administrative review in this filter view.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#DCDDD4] text-[#68716A] bg-[#ECEAE2]/40">
                    <th className="px-3 py-3 font-semibold">Complaint Ref</th>
                    <th className="px-3 py-3 font-semibold">Problem / Category</th>
                    <th className="px-3 py-3 font-semibold">Location</th>
                    <th className="px-3 py-3 font-semibold">Assigned Staff</th>
                    <th className="px-3 py-3 font-semibold">Field Completion Notes</th>
                    <th className="px-3 py-3 font-semibold">GPS Telemetry</th>
                    <th className="px-5 py-3 font-semibold text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEAE2]">
                  {filteredVerifyQueue.map((item) => (
                    <tr key={item.id} className="hover:bg-[#ECEAE2]/20 transition-colors">
                      <td className="px-3 py-3 font-mono font-bold text-[#254A40] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigate) {
                              onNavigate('track', item.reference_no);
                            }
                          }}
                          className="hover:underline flex items-center gap-1 cursor-pointer text-left"
                          title="Open Public Resolution Tracker"
                        >
                          <span>{item.reference_no}</span>
                          <Eye className="w-3 h-3 text-[#68716A]" />
                        </button>
                        <div className="text-[10px] text-[#68716A] font-sans font-normal mt-0.5">
                          Reported: {item.created_at ? item.created_at.split(' ')[0] : '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-[#252C29] max-w-[200px]">
                        <div className="truncate font-semibold">{item.problem}</div>
                        <div className="text-[11px] text-[#68716A] truncate">{item.problem_detail}</div>
                      </td>
                      <td className="px-3 py-3 text-[#252C29] max-w-[180px]">
                        <div className="truncate">{item.incident_address}</div>
                        <div className="text-[11px] text-[#68716A] truncate">{item.borough} {item.incident_zip}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-medium text-[#252C29]">{item.assigned_staff_name || 'Assigned Officer'}</div>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-[#254A40]/10 text-[#254A40]">
                          {item.assigned_department || 'Operations'}
                        </span>
                      </td>
                      <td className="px-3 py-3 max-w-[220px]">
                        <div className="text-[#252C29] line-clamp-2 text-xs">
                          {item.resolution_notes || 'Field work reported completed.'}
                        </div>
                        {item.completion_details && (
                          <div className="text-[10px] text-[#68716A] truncate mt-0.5" title={item.completion_details}>
                            Details: {item.completion_details}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px]">
                        {item.resolution_latitude ? (
                          <div className="flex flex-col text-[#252C29]">
                            <span className="font-mono">{item.resolution_latitude.toFixed(4)}, {item.resolution_longitude.toFixed(4)}</span>
                            <span className="text-[10px] text-[#68716A]">
                              ±{item.resolution_gps_accuracy || 5}m ({item.location_source || 'GPS'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#68716A] italic">No GPS recorded</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => handleOpenVerifyModal(item)}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Inspect & Verify
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* VIEW 3: Duplicate Review Queue */}
      {activeTab === 'duplicates' && (
        <Card
          title="Cross-Citizen Duplicate Complaints & Linking Queue"
          subtitle="Audit candidate matches detected by address normalization and GPS proximity"
          headerAction={
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#68716A]">Filter Status:</span>
              <select
                value={dupFilter}
                onChange={(e) => setDupFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
              >
                <option value="PENDING">Pending Review</option>
                <option value="LINKED">Linked Duplicates</option>
                <option value="DISMISSED">Dismissed Matches</option>
                <option value="ALL">All Candidates</option>
              </select>
            </div>
          }
        >
          {loading ? (
            <div className="py-12 text-center text-xs text-[#68716A]">
              Loading duplicate candidate queue...
            </div>
          ) : duplicateList.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#68716A]">
              No duplicate candidate records found matching filter "{dupFilter}".
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 -my-5">
              <table className="w-full min-w-[980px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                    <th className="px-5 py-3 font-semibold w-[200px]">Match Detection</th>
                    <th className="px-3 py-3 font-semibold w-[280px]">Canonical Complaint (Original)</th>
                    <th className="px-3 py-3 font-semibold w-[280px]">Suspected Duplicate</th>
                    <th className="px-3 py-3 font-semibold w-[120px]">Review Status</th>
                    <th className="px-5 py-3 font-semibold text-right w-[160px]">Admin Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEAE2]">
                  {duplicateList.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F5F3ED]/80 transition-colors">
                      <td className="px-5 py-3 align-top">
                        <div className="space-y-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.match_tier === 'STRONG'
                              ? 'bg-[#B4483E]/10 text-[#B4483E]'
                              : 'bg-[#A26D14]/10 text-[#A26D14]'
                          }`}>
                            {item.match_tier} MATCH
                          </span>
                          <div className="text-[11px] text-[#68716A] leading-tight">
                            {item.match_reason}
                          </div>
                          {item.distance_meters !== null && item.distance_meters !== undefined && (
                            <div className="text-[11px] text-[#254A40] font-mono">
                              Distance: {item.distance_meters}m
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onNavigate && onNavigate('track', item.original.reference_no)}
                              className="font-mono font-bold text-[#254A40] hover:underline cursor-pointer"
                            >
                              {item.original.reference_no}
                            </button>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-[#367454]/10 text-[#367454]">
                              {item.original.status}
                            </span>
                          </div>
                          <div className="font-medium text-[#252C29]">
                            {item.original.problem} — <span className="text-[#68716A] font-normal">{item.original.problem_detail}</span>
                          </div>
                          <div className="text-[#68716A] flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>{item.original.incident_address}, {item.original.borough}</span>
                          </div>
                          <div className="text-[10px] text-[#68716A]">
                            Reported: {item.original.created_at}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onNavigate && onNavigate('track', item.duplicate.reference_no)}
                              className="font-mono font-bold text-[#B4483E] hover:underline cursor-pointer"
                            >
                              {item.duplicate.reference_no}
                            </button>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-[#367454]/10 text-[#367454]">
                              {item.duplicate.status}
                            </span>
                          </div>
                          <div className="font-medium text-[#252C29]">
                            {item.duplicate.problem} — <span className="text-[#68716A] font-normal">{item.duplicate.problem_detail}</span>
                          </div>
                          <div className="text-[#68716A] flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>{item.duplicate.incident_address}, {item.duplicate.borough}</span>
                          </div>
                          <div className="text-[10px] text-[#68716A]">
                            Reported: {item.duplicate.created_at}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top">
                        <div>
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                            item.review_status === 'LINKED'
                              ? 'bg-[#367454]/10 text-[#367454]'
                              : item.review_status === 'DISMISSED'
                              ? 'bg-[#68716A]/10 text-[#68716A]'
                              : 'bg-[#E5A83B]/20 text-[#A26D14]'
                          }`}>
                            {item.review_status}
                          </span>
                          {item.reviewed_at && (
                            <div className="text-[10px] text-[#68716A] mt-1">
                              By {item.reviewer_name || 'Admin'} on {item.reviewed_at.substring(0, 10)}
                            </div>
                          )}
                          {item.review_notes && (
                            <div className="text-[10px] italic text-[#68716A] mt-0.5 line-clamp-2">
                              "{item.review_notes}"
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-3 align-top text-right">
                        {item.review_status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[11px] px-2 py-1 text-[#254A40]"
                              onClick={() => {
                                setDupModalItem(item);
                                setDupModalAction('LINK');
                                setDupModalReason(`Confirmed duplicate report of canonical ticket ${item.original.reference_no}.`);
                              }}
                            >
                              <Link2 className="w-3 h-3 mr-1" />
                              Link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[11px] px-2 py-1 text-[#68716A] hover:text-[#B4483E]"
                              onClick={() => {
                                setDupModalItem(item);
                                setDupModalAction('DISMISS');
                                setDupModalReason('Distinct incident occurring in vicinity.');
                              }}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#68716A]">
                            Finalized
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Duplicate Review Action Confirmation Modal */}
      {dupModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-serif font-bold text-[#252C29]">
              {dupModalAction === 'LINK' ? 'Link Complaint as Duplicate' : 'Dismiss Duplicate Candidate'}
            </h3>
            <p className="text-xs text-[#68716A]">
              {dupModalAction === 'LINK'
                ? `You are linking complaint ${dupModalItem.duplicate.reference_no} to canonical ticket ${dupModalItem.original.reference_no}. Both records remain preserved and auditable.`
                : `You are dismissing the suspected duplicate relationship between ${dupModalItem.duplicate.reference_no} and ${dupModalItem.original.reference_no}.`}
            </p>

            <form onSubmit={handleReviewDuplicateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  Audit Justification Reason <span className="text-[#B4483E]">*</span>
                </label>
                <textarea
                  value={dupModalReason}
                  onChange={(e) => setDupModalReason(e.target.value)}
                  rows={3}
                  placeholder="Enter administrative review notes..."
                  className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDupModalItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={dupModalAction === 'LINK' ? 'primary' : 'outline'}
                  size="sm"
                  disabled={submittingDupReview}
                >
                  {submittingDupReview ? 'Processing...' : dupModalAction === 'LINK' ? 'Confirm Link' : 'Confirm Dismissal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assignment Modal with Dynamic Department & Officer Filtering */}
      {assignModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#C59A52]">
                Dispatch & Workload Allocation
              </span>
              <h3 className="text-base font-serif font-bold text-[#252C29]">
                Assign Complaint {assignModalCase.reference_no}
              </h3>
              <p className="text-xs text-[#68716A]">
                Issue: <strong>{assignModalCase.problem}</strong> ({assignModalCase.incident_address}, {assignModalCase.borough})
              </p>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  Responsible Municipal Department <span className="text-[#B4483E]">*</span>
                </label>
                <select
                  value={assignDept}
                  onChange={(e) => handleAssignDeptChange(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                >
                  {departments.length > 0 ? (
                    departments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.name} ({d.staff_count} active staff)
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="DSNY">DSNY — Department of Sanitation</option>
                      <option value="DOT">DOT — Department of Transportation</option>
                      <option value="NYPD">NYPD — New York City Police Department</option>
                      <option value="DEP">DEP — Department of Environmental Protection</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#252C29]">
                    Assign Eligible Field Officer ({assignDept})
                  </label>
                  <span className="text-[11px] text-[#68716A]">
                    Filtered by {assignDept}
                  </span>
                </div>

                {loadingEligibleStaff ? (
                  <div className="py-3 px-3 bg-[#ECEAE2]/40 rounded text-xs text-[#68716A] text-center border border-[#DCDDD4]">
                    Loading eligible officers for {assignDept}...
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <select
                      value={assignStaffId}
                      onChange={(e) => setAssignStaffId(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                    >
                      <option value="">Department Dispatch Queue ({assignDept} General Queue)</option>
                      {modalEligibleStaff.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.full_name} ({st.department}) — {st.active_ticket_count || 0} active tickets
                        </option>
                      ))}
                    </select>

                    {modalEligibleStaff.length === 0 && (
                      <div className="p-2 bg-[#C59A52]/10 border border-[#C59A52]/20 rounded text-[11px] text-[#8F6A2A]">
                        No individual field officers are currently registered for {assignDept}. The complaint will be routed to the general {assignDept} departmental dispatch queue.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-3 bg-[#ECEAE2]/40 border border-[#DCDDD4] rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#68716A]">Triage Suggested Priority:</span>
                  <span className="font-semibold text-[#254A40] flex items-center gap-1">
                    {assignModalCase.suggested_priority || 'Medium'}
                    <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-[#254A40]/10 text-[#254A40]">Rule-Based</span>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#252C29] mb-1">
                    Operational Priority Level
                  </label>
                  <select
                    value={assignPriority}
                    onChange={(e) => setAssignPriority(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority (Standard)</option>
                    <option value="High">High Priority</option>
                    <option value="Emergency">Emergency (Immediate Dispatch)</option>
                  </select>
                </div>

                {assignPriority !== (assignModalCase.suggested_priority || 'Medium') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#8F6A2A] mb-1">
                      Override Reason (Required when altering triage recommendation) <span className="text-[#B4483E]">*</span>
                    </label>
                    <input
                      type="text"
                      value={assignPriorityReason}
                      onChange={(e) => setAssignPriorityReason(e.target.value)}
                      placeholder="e.g. Council district escalation; safety vulnerability..."
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#C59A52]/40 rounded-md text-[#252C29]"
                      required
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  Dispatch Instructions / Notes (Optional)
                </label>
                <textarea
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Expedited sweep requested; verify hydrant clearance..."
                  className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignModalCase(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingAssign}
                >
                  {submittingAssign ? 'Assigning...' : 'Confirm Assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Priority Override & Escalation Modal */}
      {priorityModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#C59A52]">
                Administrative Triage Control
              </span>
              <h3 className="text-base font-serif font-bold text-[#252C29]">
                Adjust Priority: {priorityModalCase.reference_no}
              </h3>
              <p className="text-xs text-[#68716A]">
                Issue: <strong>{priorityModalCase.problem}</strong> ({priorityModalCase.incident_address})
              </p>
            </div>

            {newPriority === 'Emergency' && (
              <div className="p-3 bg-[#B4483E]/10 border border-[#B4483E]/30 rounded-lg text-xs text-[#B4483E] space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Emergency Escalation Protocol
                </div>
                <p className="text-[11px] text-[#252C29]">
                  Escalating to Emergency broadcasts high-urgency notifications to assigned staff and marks the complaint for immediate field response.
                </p>
              </div>
            )}

            <form onSubmit={handlePrioritySubmit} className="space-y-4">
              <div className="flex items-center justify-between text-xs p-2.5 bg-[#ECEAE2]/40 rounded border border-[#DCDDD4]">
                <div>
                  <span className="text-[#68716A] block text-[10px]">Current Operational:</span>
                  <span className="font-semibold text-[#252C29]">{priorityModalCase.priority}</span>
                </div>
                <div className="text-right">
                  <span className="text-[#68716A] block text-[10px]">Triage Recommendation:</span>
                  <span className="font-semibold text-[#254A40]">{priorityModalCase.suggested_priority || 'Medium'} (Rule)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  New Operational Priority Level <span className="text-[#B4483E]">*</span>
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority (Standard)</option>
                  <option value="High">High Priority</option>
                  <option value="Emergency">Emergency (Immediate Dispatch)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  Mandatory Override / Escalation Justification <span className="text-[#B4483E]">*</span>
                </label>
                <textarea
                  value={priorityReason}
                  onChange={(e) => setPriorityReason(e.target.value)}
                  rows={3}
                  placeholder="State the operational reason for this priority adjustment..."
                  className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPriorityModalCase(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingPriority}
                >
                  {submittingPriority ? 'Saving...' : 'Apply Priority Change'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {reopenCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-serif font-bold text-[#252C29]">
              Reopen Complaint {reopenCase.reference_no}
            </h3>
            <p className="text-xs text-[#68716A]">
              Provide an auditable justification for reopening this closed case back to active status.
            </p>

            <form onSubmit={handleReopenSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  Reason for Reopening <span className="text-[#B4483E]">*</span>
                </label>
                <textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Citizen disputed resolution; hazard remains present on follow-up..."
                  className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReopenCase(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingReopen}
                >
                  {submittingReopen ? 'Reopening...' : 'Confirm Reopen'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Resolution Verification Modal (Phase 3 Stage 3) */}
      {inspectingVerifyCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#DCDDD4]">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8F6A2A]">
                  Quality Gate & Resolution Verification
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-lg font-serif font-bold text-[#252C29]">
                    Verify Complaint {inspectingVerifyCase.reference_no}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#8F6A2A]/15 text-[#8F6A2A] border border-[#8F6A2A]/30">
                    Resolved – Pending Verification
                  </span>
                </div>
                <div className="text-xs text-[#68716A] mt-1">
                  <strong>{inspectingVerifyCase.problem}</strong> — {inspectingVerifyCase.problem_detail}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingVerifyCase(null)}
                className="text-[#68716A] hover:text-[#252C29] p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {verifyError && (
              <Notice variant="danger" title="Verification Notice">
                {verifyError}
              </Notice>
            )}

            {loadingVerifyDetail ? (
              <div className="py-12 text-center text-xs text-[#68716A]">
                Loading case details, GPS telemetry, and evidence photos...
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* 1. Case Summary & Reported Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[#ECEAE2]/40 rounded-lg border border-[#DCDDD4]">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#68716A] block">Reported Incident Location</span>
                    <span className="text-xs font-medium text-[#252C29] block mt-0.5">
                      {inspectingVerifyCase.incident_address}, {inspectingVerifyCase.borough} {inspectingVerifyCase.incident_zip}
                    </span>
                    <span className="text-[11px] text-[#68716A] block mt-0.5">
                      Submitted: {inspectingVerifyCase.created_at}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#68716A] block">Assigned Enforcement Unit</span>
                    <span className="text-xs font-medium text-[#252C29] block mt-0.5">
                      {inspectingVerifyCase.assigned_staff_name || 'Staff Officer'} ({inspectingVerifyCase.assigned_department || 'Operations'})
                    </span>
                    <span className="text-[11px] text-[#68716A] block mt-0.5">
                      Operational Priority: {inspectingVerifyCase.priority}
                    </span>
                  </div>
                </div>

                {/* 2. Field Staff Completion Report */}
                <div className="p-3.5 bg-white border border-[#DCDDD4] rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#252C29] flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#254A40]" />
                      Field Work Completion Report
                    </span>
                    {inspectingVerifyCase.updated_at && (
                      <span className="text-[11px] text-[#68716A]">
                        Completed: {inspectingVerifyCase.updated_at}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 bg-[#ECEAE2]/20 rounded border border-[#ECEAE2] text-[#252C29]">
                    <strong className="block text-[11px] text-[#68716A] mb-1">Officer Work Notes:</strong>
                    <p className="whitespace-pre-wrap">{inspectingVerifyCase.resolution_notes || 'No work notes provided.'}</p>
                  </div>

                  {/* Technical details if present */}
                  {inspectingVerifyCase.completion_details && (
                    <div className="text-[11px] text-[#68716A] pt-1">
                      <strong>Technical Completion Details: </strong>
                      <span>{inspectingVerifyCase.completion_details}</span>
                    </div>
                  )}

                  {/* Field GPS Provenance */}
                  {inspectingVerifyCase.resolution_latitude && (
                    <div className="flex items-center gap-1.5 text-[11px] text-[#68716A] pt-1 border-t border-[#ECEAE2]">
                      <MapPin className="w-3.5 h-3.5 text-[#8F6A2A]" />
                      <span>
                        Field GPS Provenance: {inspectingVerifyCase.resolution_latitude.toFixed(4)}, {inspectingVerifyCase.resolution_longitude.toFixed(4)}
                        {inspectingVerifyCase.resolution_gps_accuracy ? ` (±${inspectingVerifyCase.resolution_gps_accuracy}m accuracy, ${inspectingVerifyCase.location_source || 'DEVICE_GPS'})` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Submitted Evidence Photos Gallery */}
                <div className="p-3.5 bg-white border border-[#DCDDD4] rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#252C29] flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-[#254A40]" />
                      Submitted Field Evidence Photos ({verifyCaseDetail?.evidence?.length || 0})
                    </span>
                    <span className="text-[10px] text-[#68716A]">Click image to inspect full-size</span>
                  </div>

                  {verifyCaseDetail?.evidence && verifyCaseDetail.evidence.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                      {verifyCaseDetail.evidence.map((ev) => (
                        <div
                          key={ev.id}
                          className="group relative rounded-lg overflow-hidden border border-[#DCDDD4] bg-[#ECEAE2]/30 cursor-pointer hover:border-[#254A40] transition-colors"
                          onClick={() => setLightboxImage(ev)}
                        >
                          <AuthenticatedImage
                            evidenceId={ev.id}
                            alt={ev.original_filename || 'Evidence Photo'}
                            className="w-full h-24 sm:h-28 object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="p-1.5 bg-white/95 border-t border-[#DCDDD4] text-[10px] text-[#68716A] truncate">
                            <span className="truncate block font-medium text-[#252C29]">{ev.original_filename}</span>
                            <span>{(ev.file_size / 1024).toFixed(0)} KB • {ev.created_at ? ev.created_at.split(' ')[0] : ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-[#68716A] text-xs italic">
                      No photographic evidence files recorded for this case.
                    </div>
                  )}
                </div>

                {/* 4. Admin Quality Verification Decision Form */}
                <form onSubmit={handleVerifySubmit} className="p-4 bg-[#ECEAE2]/30 rounded-lg border border-[#DCDDD4] space-y-3.5">
                  <div className="font-semibold text-[#252C29] text-xs">
                    Administrative Quality Decision <span className="text-[#B4483E]">*</span>
                  </div>

                  {/* Radio Choice */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                        verifyAction === 'APPROVE'
                          ? 'border-[#367454] bg-[#367454]/10 text-[#367454]'
                          : 'border-[#DCDDD4] bg-white text-[#252C29] hover:bg-[#ECEAE2]/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="verifyAction"
                        value="APPROVE"
                        checked={verifyAction === 'APPROVE'}
                        onChange={() => {
                          setVerifyAction('APPROVE');
                          setVerifyConfirmRequired(false);
                          setVerifyError(null);
                        }}
                        className="mt-0.5 accent-[#367454]"
                      />
                      <div>
                        <span className="font-semibold block text-xs">Approve & Close</span>
                        <span className="text-[11px] text-[#68716A] block mt-0.5">
                          Work confirmed verified. Officially marks complaint Closed and computes turnaround SLA.
                        </span>
                      </div>
                    </label>

                    <label
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                        verifyAction === 'REJECT'
                          ? 'border-[#B4483E] bg-[#B4483E]/10 text-[#B4483E]'
                          : 'border-[#DCDDD4] bg-white text-[#252C29] hover:bg-[#ECEAE2]/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="verifyAction"
                        value="REJECT"
                        checked={verifyAction === 'REJECT'}
                        onChange={() => {
                          setVerifyAction('REJECT');
                          setVerifyConfirmRequired(false);
                          setVerifyError(null);
                        }}
                        className="mt-0.5 accent-[#B4483E]"
                      />
                      <div>
                        <span className="font-semibold block text-xs">Reject for Rework</span>
                        <span className="text-[11px] text-[#68716A] block mt-0.5">
                          Resolution rejected. Returns ticket to In Progress and notifies field staff with instructions.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Conditional Inputs */}
                  {verifyAction === 'APPROVE' ? (
                    <div>
                      <label className="block text-xs font-semibold text-[#252C29] mb-1">
                        Optional Administrative Closing Remarks
                      </label>
                      <input
                        type="text"
                        value={verifyNotes}
                        onChange={(e) => setVerifyNotes(e.target.value)}
                        placeholder="e.g. Field inspection verified compliant with municipal standards."
                        className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29] focus:outline-none focus:border-[#254A40]"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-[#B4483E]">
                          Mandatory Rejection & Rework Reason <span className="text-[#B4483E]">*</span>
                        </label>
                        <span className={`text-[10px] ${verifyRejectionReason.trim().length >= 5 ? 'text-[#367454]' : 'text-[#68716A]'}`}>
                          {verifyRejectionReason.trim().length}/5 chars minimum
                        </span>
                      </div>
                      <textarea
                        value={verifyRejectionReason}
                        onChange={(e) => {
                          setVerifyRejectionReason(e.target.value);
                          if (verifyError) setVerifyError(null);
                        }}
                        rows={3}
                        placeholder="Detail exactly why the resolution is insufficient and what rework the officer must perform..."
                        className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md text-[#252C29] focus:outline-none focus:border-[#B4483E]"
                        required
                      />
                    </div>
                  )}

                  {/* Irreversible Action Confirmation Box */}
                  {verifyConfirmRequired && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        Please Confirm Action
                      </div>
                      <p>
                        Are you sure you want to officially{' '}
                        <strong>{verifyAction === 'APPROVE' ? 'APPROVE & CLOSE' : 'REJECT FOR REWORK'}</strong>{' '}
                        complaint {inspectingVerifyCase.reference_no}?
                        {verifyAction === 'APPROVE'
                          ? ' The ticket will be permanently closed and the citizen notified.'
                          : ' The ticket will revert to In Progress and the officer instructed to perform rework.'}
                      </p>
                    </div>
                  )}

                  {/* Submit / Cancel Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DCDDD4]">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInspectingVerifyCase(null)}
                      disabled={submittingVerify}
                    >
                      Cancel
                    </Button>

                    {!verifyConfirmRequired ? (
                      <Button
                        type="submit"
                        variant={verifyAction === 'APPROVE' ? 'primary' : 'danger'}
                        size="sm"
                        disabled={submittingVerify}
                      >
                        {verifyAction === 'APPROVE' ? (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1" /> Approve & Close...
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Request Rework...
                          </>
                        )}
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setVerifyConfirmRequired(false)}
                          disabled={submittingVerify}
                        >
                          Back
                        </Button>
                        <Button
                          type="submit"
                          variant={verifyAction === 'APPROVE' ? 'primary' : 'danger'}
                          size="sm"
                          disabled={submittingVerify}
                        >
                          {submittingVerify
                            ? 'Applying...'
                            : verifyAction === 'APPROVE'
                            ? 'Yes, Confirm & Close'
                            : 'Yes, Confirm & Reject'}
                        </Button>
                      </>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enlarged Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-2 border-b border-[#DCDDD4]">
              <div className="text-xs font-semibold text-[#252C29] truncate max-w-[400px]">
                {lightboxImage.original_filename || 'Evidence Photo'}
              </div>
              <button
                type="button"
                className="text-[#68716A] hover:text-[#252C29] p-1 rounded-md cursor-pointer"
                onClick={() => setLightboxImage(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-center p-2 bg-[#252C29]/5">
              <AuthenticatedImage
                evidenceId={lightboxImage.id}
                alt={lightboxImage.original_filename || 'Enlarged Evidence'}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
