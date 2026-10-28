import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  UserCheck,
  RefreshCw,
  ArrowRight,
  UserPlus,
  Check,
  RotateCcw,
  Sliders,
  AlertCircle
} from 'lucide-react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import {
  fetchOperationalAnalytics,
  fetchOperationalComplaints,
  fetchDepartments,
  fetchStaffList,
  assignOperationalComplaint,
  updateOperationalStatus,
  updateOperationalPriority
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [analyticsRes, complaintsRes, deptsRes] = await Promise.all([
      fetchOperationalAnalytics(),
      fetchOperationalComplaints({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        department: deptFilter !== 'ALL' ? deptFilter : undefined,
        search: search.trim() ? search.trim() : undefined,
        limit: 100
      }),
      fetchDepartments()
    ]);

    if (analyticsRes.success) setAnalytics(analyticsRes.data);
    if (complaintsRes.success) setComplaints(complaintsRes.data?.complaints || []);
    if (deptsRes.success) setDepartments(deptsRes.data || []);

    if (!analyticsRes.success && !complaintsRes.success) {
      setError(analyticsRes.error || complaintsRes.error || 'Failed to load administrative operations.');
    }
    setLoading(false);
  }, [statusFilter, deptFilter, search]);

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

  // Verify and Close
  const handleVerifyAndClose = async (item) => {
    if (!window.confirm(`Verify and officially CLOSE complaint ${item.reference_no}?`)) return;
    setLoading(true);
    const res = await updateOperationalStatus(item.reference_no, {
      to_status: 'Closed',
      comment: 'Operations manager verified completion report. Final closure confirmed.'
    });
    if (res.success) {
      setSuccessMsg(`Complaint ${item.reference_no} verified and closed.`);
      loadData();
    } else {
      setError(res.error || 'Closure failed.');
      setLoading(false);
    }
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
        <StatCard
          label="Pending Verification"
          value={analytics?.pending_verification_count || 0}
          context="Staff completed work"
          trend="Verify & Close"
          icon={UserCheck}
        />
        <StatCard
          label="Overdue / At-Risk"
          value={analytics?.overdue_count || 0}
          context="Elapsed > AI Estimate"
          trend="SLA Risk"
          icon={AlertTriangle}
        />
      </div>

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
                            onClick={() => handleVerifyAndClose(item)}
                          >
                            <Check className="w-3 h-3 mr-1" /> Verify & Close
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
    </div>
  );
}
