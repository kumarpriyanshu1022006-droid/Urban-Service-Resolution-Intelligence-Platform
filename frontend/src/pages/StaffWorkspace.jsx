import React, { useState, useEffect, useCallback } from 'react';
import { Briefcase, Clock, Play, Pause, CheckCircle2, RefreshCw, FileText, ChevronRight } from 'lucide-react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { fetchOperationalComplaints, updateOperationalStatus, addOperationalNote } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function StaffWorkspace({ onNavigate }) {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Active modal state
  const [modalType, setModalType] = useState(null); // 'hold' | 'resolve' | 'note'
  const [selectedCase, setSelectedCase] = useState(null);
  const [holdReason, setHoldReason] = useState('');
  const [holdUntil, setHoldUntil] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [noteComment, setNoteComment] = useState('');
  const [isPublicNote, setIsPublicNote] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [activeQueueTab, setActiveQueueTab] = useState('my_tasks'); // 'my_tasks' | 'unclaimed' | 'all'

  const loadAssignedQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchOperationalComplaints();
    if (res.success && res.data) {
      setComplaints(res.data.complaints || []);
    } else {
      setError(res.error || 'Failed to load assigned queue.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAssignedQueue();
  }, [loadAssignedQueue, user?.id, user?.department]);

  // Handle direct transition to In Progress
  const handleStartWork = async (item) => {
    setLoading(true);
    setActionSuccess(null);
    const res = await updateOperationalStatus(item.reference_no, {
      to_status: 'In Progress',
      comment: `${user?.full_name || 'Officer'} initiated field investigation and active work.`
    });
    if (res.success) {
      setActionSuccess(`Complaint ${item.reference_no} is now marked 'In Progress'.`);
      loadAssignedQueue();
    } else {
      setError(res.error || 'Failed to update status.');
      setLoading(false);
    }
  };

  // Handle Resume Work from Hold
  const handleResumeWork = async (item) => {
    setLoading(true);
    setActionSuccess(null);
    const res = await updateOperationalStatus(item.reference_no, {
      to_status: 'In Progress',
      comment: 'Operational blocker cleared. Active work resumed.'
    });
    if (res.success) {
      setActionSuccess(`Complaint ${item.reference_no} resumed to 'In Progress'.`);
      loadAssignedQueue();
    } else {
      setError(res.error || 'Failed to resume work.');
      setLoading(false);
    }
  };

  // Submit Modal Actions (Hold, Resolve, Note)
  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;
    setSubmittingAction(true);
    setError(null);

    try {
      if (modalType === 'hold') {
        if (!holdReason.trim()) {
          alert('Hold reason is required.');
          setSubmittingAction(false);
          return;
        }
        const res = await updateOperationalStatus(selectedCase.reference_no, {
          to_status: 'On Hold',
          hold_reason: holdReason.trim(),
          hold_until: holdUntil || null,
          comment: `Placed on hold: ${holdReason.trim()}`
        });
        if (res.success) {
          setActionSuccess(`Complaint ${selectedCase.reference_no} placed on hold.`);
          setModalType(null);
          loadAssignedQueue();
        } else {
          setError(res.error || 'Failed to place on hold.');
        }
      } else if (modalType === 'resolve') {
        if (!resolutionNotes.trim()) {
          alert('Resolution notes are required.');
          setSubmittingAction(false);
          return;
        }
        const res = await updateOperationalStatus(selectedCase.reference_no, {
          to_status: 'Resolved - Pending Verification',
          resolution_notes: resolutionNotes.trim(),
          comment: `Completion reported: ${resolutionNotes.trim()}`
        });
        if (res.success) {
          setActionSuccess(`Complaint ${selectedCase.reference_no} marked resolved and queued for Admin verification.`);
          setModalType(null);
          loadAssignedQueue();
        } else {
          setError(res.error || 'Failed to report completion.');
        }
      } else if (modalType === 'note') {
        if (!noteComment.trim()) {
          alert('Note comment cannot be empty.');
          setSubmittingAction(false);
          return;
        }
        const res = await addOperationalNote(selectedCase.reference_no, {
          comment: noteComment.trim(),
          is_public: isPublicNote
        });
        if (res.success) {
          setActionSuccess(`Progress note added to ${selectedCase.reference_no}.`);
          setModalType(null);
          loadAssignedQueue();
        } else {
          setError(res.error || 'Failed to record note.');
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred.');
    }
    setSubmittingAction(false);
  };

  // Workload tallies
  const myTasks = complaints.filter((c) => c.assigned_staff_id === user?.id);
  const unclaimedTasks = complaints.filter((c) => !c.assigned_staff_id && c.assigned_department === user?.department);
  const displayedTasks = activeQueueTab === 'my_tasks'
    ? myTasks
    : activeQueueTab === 'unclaimed'
    ? unclaimedTasks
    : complaints;

  const assignedCount = complaints.filter((c) => c.status === 'Assigned').length;
  const inProgressCount = complaints.filter((c) => c.status === 'In Progress').length;
  const onHoldCount = complaints.filter((c) => c.status === 'On Hold').length;
  const pendingVerifyCount = complaints.filter((c) => c.status === 'Resolved - Pending Verification').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#DCDDD4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#68716A]">
            <Briefcase className="w-4 h-4 text-[#254A40]" />
            <span>Field Operations & Enforcement Workspace</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
            Staff Work Queue
          </h1>
          <p className="text-xs sm:text-sm text-[#68716A] mt-1">
            Logged in as <strong>{user?.full_name || 'Staff Officer'}</strong> ({user?.department || 'Operations'} Department)
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={loadAssignedQueue}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh Queue
        </Button>
      </div>

      {actionSuccess && (
        <Notice variant="success" title="Status Updated">
          {actionSuccess}
        </Notice>
      )}

      {error && (
        <Notice variant="danger" title="Operational Warning">
          {error}
        </Notice>
      )}

      {/* Workload Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Pending Acknowledgement"
          value={assignedCount}
          context="Assigned, waiting to start"
          trend="Immediate Action"
          icon={Clock}
        />
        <StatCard
          label="Active In-Progress"
          value={inProgressCount}
          context="Under field inspection"
          trend="Operational"
          icon={Play}
        />
        <StatCard
          label="Placed On Hold"
          value={onHoldCount}
          context="Blockers or weather pauses"
          trend="Paused"
          icon={Pause}
        />
        <StatCard
          label="Awaiting Admin Closure"
          value={pendingVerifyCount}
          context="Work reported completed"
          trend="Pending Verification"
          icon={CheckCircle2}
        />
      </div>

      {/* Queue Segmentation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#DCDDD4] pb-2">
        <button
          onClick={() => setActiveQueueTab('my_tasks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeQueueTab === 'my_tasks'
              ? 'bg-[#254A40] text-white'
              : 'bg-[#ECEAE2]/70 text-[#68716A] hover:bg-[#ECEAE2]'
          }`}
        >
          <span>My Assigned Tasks</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeQueueTab === 'my_tasks' ? 'bg-white/20 text-white' : 'bg-[#DCDDD4] text-[#252C29]'
          }`}>
            {myTasks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveQueueTab('unclaimed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeQueueTab === 'unclaimed'
              ? 'bg-[#254A40] text-white'
              : 'bg-[#ECEAE2]/70 text-[#68716A] hover:bg-[#ECEAE2]'
          }`}
        >
          <span>Department Dispatch Queue</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeQueueTab === 'unclaimed' ? 'bg-white/20 text-white' : 'bg-[#DCDDD4] text-[#252C29]'
          }`}>
            {unclaimedTasks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveQueueTab('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeQueueTab === 'all'
              ? 'bg-[#254A40] text-white'
              : 'bg-[#ECEAE2]/70 text-[#68716A] hover:bg-[#ECEAE2]'
          }`}
        >
          <span>All {user?.department || ''} Work</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeQueueTab === 'all' ? 'bg-white/20 text-white' : 'bg-[#DCDDD4] text-[#252C29]'
          }`}>
            {complaints.length}
          </span>
        </button>
      </div>

      {/* Assigned Tasks Table */}
      <Card
        title={
          activeQueueTab === 'my_tasks'
            ? `My Assigned Field Tasks (${myTasks.length})`
            : activeQueueTab === 'unclaimed'
            ? `Unclaimed ${user?.department || ''} Department Queue (${unclaimedTasks.length})`
            : `All ${user?.department || ''} Operations Complaints (${complaints.length})`
        }
        subtitle="Operational tasks requiring inspection, work progress updates, or completion verification"
      >
        {loading ? (
          <div className="py-12 text-center text-xs text-[#68716A]">
            Loading assigned queue...
          </div>
        ) : displayedTasks.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#68716A]">
            {activeQueueTab === 'my_tasks'
              ? 'You have no individually assigned tasks at this moment. You can claim open tickets from the Department Dispatch Queue tab.'
              : activeQueueTab === 'unclaimed'
              ? 'No unclaimed tickets in the departmental queue.'
              : 'No complaints currently in this queue.'}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full min-w-[1020px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                  <th className="px-5 py-3 font-semibold w-[130px] whitespace-nowrap">Reference</th>
                  <th className="px-3 py-3 font-semibold w-[200px]">Issue Details</th>
                  <th className="px-3 py-3 font-semibold w-[170px]">Location</th>
                  <th className="px-3 py-3 font-semibold w-[160px]">Assignment & Priority</th>
                  <th className="px-3 py-3 font-semibold w-[130px]">Status</th>
                  <th className="px-3 py-3 font-semibold w-[100px] whitespace-nowrap">AI Estimate</th>
                  <th className="px-5 py-3 font-semibold text-right w-[210px] whitespace-nowrap">Workflow Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE2]">
                {displayedTasks.map((item) => {
                  const isAssignedToMe = item.assigned_staff_id === user?.id;
                  const isUnclaimedQueue = !item.assigned_staff_id;
                  const isAssignedToOther = item.assigned_staff_id && !isAssignedToMe;

                  return (
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
                      <td className="px-3 py-3 max-w-[160px]">
                        <div className="flex flex-col gap-0.5">
                          <div className="truncate">
                            {isAssignedToMe ? (
                              <span className="text-[#254A40] font-semibold text-[11px]">Assigned to You</span>
                            ) : isUnclaimedQueue ? (
                              <span className="text-[#8F6A2A] font-semibold text-[11px]">Department Queue</span>
                            ) : (
                              <span className="text-[#68716A] text-[11px] truncate" title={`Assigned to ${item.assigned_staff_name}`}>
                                {item.assigned_staff_name || 'Colleague'}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-block whitespace-nowrap ${
                              item.priority === 'Emergency'
                                ? 'bg-[#B4483E]/15 text-[#B4483E] border border-[#B4483E]/30'
                                : item.priority === 'High'
                                ? 'bg-[#C59A52]/15 text-[#8F6A2A] border border-[#C59A52]/30'
                                : 'bg-[#ECEAE2] text-[#68716A]'
                            }`}>
                              {item.priority}
                            </span>
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
                          {/* Case 1: Unclaimed department queue complaint */}
                          {isUnclaimedQueue && (
                            <Button
                              size="xs"
                              variant="primary"
                              onClick={() => handleStartWork(item)}
                              title="Claim this ticket and start field inspection"
                            >
                              <Play className="w-3 h-3 mr-1" /> Claim & Start
                            </Button>
                          )}

                          {/* Case 2: Assigned to current officer */}
                          {isAssignedToMe && item.status === 'Assigned' && (
                            <Button
                              size="xs"
                              variant="primary"
                              onClick={() => handleStartWork(item)}
                            >
                              <Play className="w-3 h-3 mr-1" /> Start Work
                            </Button>
                          )}

                          {isAssignedToMe && item.status === 'In Progress' && (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  setSelectedCase(item);
                                  setModalType('hold');
                                  setHoldReason('');
                                }}
                              >
                                <Pause className="w-3 h-3 mr-1" /> On Hold
                              </Button>
                              <Button
                                size="xs"
                                variant="primary"
                                onClick={() => {
                                  setSelectedCase(item);
                                  setModalType('resolve');
                                  setResolutionNotes('');
                                }}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Report Complete
                              </Button>
                            </>
                          )}

                          {isAssignedToMe && item.status === 'On Hold' && (
                            <Button
                              size="xs"
                              variant="primary"
                              onClick={() => handleResumeWork(item)}
                            >
                              <Play className="w-3 h-3 mr-1" /> Resume Work
                            </Button>
                          )}

                          {isAssignedToMe && item.status === 'Resolved - Pending Verification' && (
                            <span className="text-[11px] text-[#367454] font-medium bg-[#367454]/10 px-2 py-0.5 rounded">
                              Pending Verification
                            </span>
                          )}

                          {/* Case 3: Assigned to another colleague */}
                          {isAssignedToOther && (
                            <span className="text-[11px] text-[#68716A] italic px-1">
                              Assigned to colleague
                            </span>
                          )}

                          {/* Add Note Button */}
                          <Button
                            size="xs"
                            variant="ghost"
                            title="Add Note"
                            onClick={() => {
                              setSelectedCase(item);
                              setModalType('note');
                              setNoteComment('');
                            }}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Button>

                          {/* Track / Inspect Link */}
                          <Button
                            size="xs"
                            variant="ghost"
                            title="View Public Tracker"
                            onClick={() => onNavigate && onNavigate('track', item.reference_no)}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Dialog for Hold / Resolve / Note */}
      {modalType && selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-serif font-bold text-[#252C29]">
              {modalType === 'hold' && `Pause Work: ${selectedCase.reference_no}`}
              {modalType === 'resolve' && `Report Completion: ${selectedCase.reference_no}`}
              {modalType === 'note' && `Add Note: ${selectedCase.reference_no}`}
            </h3>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {modalType === 'hold' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#252C29] mb-1">
                      Reason for Pause / Operational Blocker <span className="text-[#B4483E]">*</span>
                    </label>
                    <textarea
                      value={holdReason}
                      onChange={(e) => setHoldReason(e.target.value)}
                      rows={3}
                      placeholder="e.g. Inclement weather halting paving, waiting on utility shutoff, contractor parts delay..."
                      className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] text-[#252C29]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#252C29] mb-1">
                      Expected Resumption Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={holdUntil}
                      onChange={(e) => setHoldUntil(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] text-[#252C29]"
                    />
                  </div>
                </>
              )}

              {modalType === 'resolve' && (
                <div>
                  <label className="block text-xs font-semibold text-[#252C29] mb-1">
                    Field Resolution Report <span className="text-[#B4483E]">*</span>
                  </label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={4}
                    placeholder="Document exact operational work completed (e.g. Summons issued, vehicle towed, pavement compacted, sewer unclogged)..."
                    className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] text-[#252C29]"
                    required
                  />
                  <span className="text-[11px] text-[#68716A] block mt-1">
                    Once submitted, this complaint will be queued for Admin verification and final closure.
                  </span>
                </div>
              )}

              {modalType === 'note' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#252C29] mb-1">
                      Operational Progress Note <span className="text-[#B4483E]">*</span>
                    </label>
                    <textarea
                      value={noteComment}
                      onChange={(e) => setNoteComment(e.target.value)}
                      rows={3}
                      placeholder="Enter status update or inspection finding..."
                      className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] text-[#252C29]"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isPublicNote"
                      checked={isPublicNote}
                      onChange={(e) => setIsPublicNote(e.target.checked)}
                      className="rounded border-[#DCDDD4] text-[#254A40] focus:ring-[#254A40]"
                    />
                    <label htmlFor="isPublicNote" className="text-xs text-[#252C29]">
                      Make visible on Citizen public tracking timeline
                    </label>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalType(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingAction}
                >
                  {submittingAction ? 'Saving...' : 'Submit Action'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
