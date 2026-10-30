import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Briefcase,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  RefreshCw,
  FileText,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  MapPin,
  X,
  AlertTriangle,
  Eye,
  ShieldCheck,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import AuthenticatedImage from '../components/ui/AuthenticatedImage';
import {
  fetchOperationalComplaints,
  fetchOperationalComplaintDetail,
  updateOperationalStatus,
  addOperationalNote,
  uploadCompletionEvidence
} from '../services/api';
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
  const [submittingAction, setSubmittingAction] = useState(false);
  const [activeQueueTab, setActiveQueueTab] = useState('my_tasks'); // 'my_tasks' | 'unclaimed' | 'all'

  // Hold modal form state
  const [holdReason, setHoldReason] = useState('');
  const [holdUntil, setHoldUntil] = useState('');

  // Note modal form state
  const [noteComment, setNoteComment] = useState('');
  const [isPublicNote, setIsPublicNote] = useState(true);

  // Completion Evidence Modal state (Phase 3 Stage 2)
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [completionDetails, setCompletionDetails] = useState('');
  const [evidencePhotos, setEvidencePhotos] = useState([]); // array of { file, name, size, previewUrl }
  const [resolutionGps, setResolutionGps] = useState(null); // { latitude, longitude, accuracy }
  const [detectingGps, setDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [rejectionNotice, setRejectionNotice] = useState(null); // if case was previously rejected by admin
  const [priorEvidence, setPriorEvidence] = useState([]);
  const fileInputRef = useRef(null);

  // Case Inspection Detail Modal State
  const [inspectingCase, setInspectingCase] = useState(null);
  const [caseDetail, setCaseDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Zoomed Image Modal State
  const [zoomedImage, setZoomedImage] = useState(null);

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

  // Clean up object URLs on component unmount
  useEffect(() => {
    return () => {
      evidencePhotos.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [evidencePhotos]);

  // Handle direct transition to In Progress
  const handleStartWork = async (item) => {
    setLoading(true);
    setActionSuccess(null);
    setError(null);
    const res = await updateOperationalStatus(item.reference_no, {
      to_status: 'In Progress',
      comment: `${user?.full_name || 'Officer'} initiated field investigation and active work.`
    });
    if (res.success) {
      setActionSuccess(`Complaint ${item.reference_no} is now marked 'In Progress'.`);
      loadAssignedQueue();
      if (inspectingCase && inspectingCase.reference_no === item.reference_no) {
        handleOpenCaseDetail(item);
      }
    } else {
      setError(res.error || 'Failed to update status.');
      setLoading(false);
    }
  };

  // Handle Resume Work from Hold
  const handleResumeWork = async (item) => {
    setLoading(true);
    setActionSuccess(null);
    setError(null);
    const res = await updateOperationalStatus(item.reference_no, {
      to_status: 'In Progress',
      comment: 'Operational blocker cleared. Active work resumed.'
    });
    if (res.success) {
      setActionSuccess(`Complaint ${item.reference_no} resumed to 'In Progress'.`);
      loadAssignedQueue();
      if (inspectingCase && inspectingCase.reference_no === item.reference_no) {
        handleOpenCaseDetail(item);
      }
    } else {
      setError(res.error || 'Failed to resume work.');
      setLoading(false);
    }
  };

  // Open Completion Modal and load any prior admin rejection / evidence context
  const handleOpenResolveModal = async (item) => {
    setSelectedCase(item);
    setResolutionNotes('');
    setCompletionDetails('');
    setResolutionGps(null);
    setGpsError(null);
    setPhotoError(null);
    setRejectionNotice(null);
    setPriorEvidence([]);

    // Clear any previous previews
    evidencePhotos.forEach((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
    setEvidencePhotos([]);

    // Fetch complaint history to inspect if this complaint had a prior admin rejection
    try {
      const res = await fetchOperationalComplaintDetail(item.reference_no);
      if (res.success && res.data) {
        const hist = res.data.history || [];
        const lastRejection = [...hist].reverse().find((h) => h.action === 'Resolution Rejected');
        if (lastRejection) {
          setRejectionNotice({
            reason: lastRejection.comment || 'Admin requested rework.',
            date: lastRejection.created_at,
            actor: lastRejection.actor_name
          });
        }
        if (res.data.evidence && res.data.evidence.length > 0) {
          setPriorEvidence(res.data.evidence);
        }
      }
    } catch {
      // Non-blocking metadata enrichment
    }

    setModalType('resolve');
  };

  // Handle Photo File Selection with Validation
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoError(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxBytes = 5 * 1024 * 1024; // 5 MB

    const currentCount = evidencePhotos.length;
    if (currentCount + files.length > 5) {
      setPhotoError(`Maximum 5 evidence photos allowed. (Currently selected: ${currentCount}, tried to add: ${files.length})`);
      return;
    }

    const validItems = [];
    for (const f of files) {
      if (!allowedTypes.includes(f.type.toLowerCase())) {
        setPhotoError(`File '${f.name}' has an unsupported format. Only JPEG, PNG, and WEBP images are permitted.`);
        return;
      }
      if (f.size > maxBytes) {
        setPhotoError(`File '${f.name}' (${(f.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit.`);
        return;
      }
      validItems.push({
        file: f,
        name: f.name,
        size: (f.size / 1024).toFixed(0) + ' KB',
        previewUrl: URL.createObjectURL(f)
      });
    }

    setEvidencePhotos((prev) => [...prev, ...validItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (index) => {
    setEvidencePhotos((prev) => {
      const item = prev[index];
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Handle GPS detection
  const handleDetectResolutionLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setResolutionGps({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy * 10) / 10 : null
        });
        setDetectingGps(false);
      },
      (err) => {
        setDetectingGps(false);
        setGpsError(`Unable to capture GPS coordinates (${err.message}). You may submit completion evidence without GPS.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Submit Modal Actions (Hold, Resolve with Evidence, Note)
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
        // Validation checks
        if (!resolutionNotes.trim() || resolutionNotes.trim().length < 5) {
          setPhotoError('Work completion notes are required (minimum 5 characters).');
          setSubmittingAction(false);
          return;
        }
        if (evidencePhotos.length === 0) {
          setPhotoError('At least 1 resolution photo is required as completion evidence.');
          setSubmittingAction(false);
          return;
        }
        if (evidencePhotos.length > 5) {
          setPhotoError('Maximum 5 resolution photos are permitted.');
          setSubmittingAction(false);
          return;
        }

        // Build FormData
        const formData = new FormData();
        formData.append('notes', resolutionNotes.trim());
        if (completionDetails.trim()) {
          formData.append('completion_details', completionDetails.trim());
        }
        if (resolutionGps) {
          formData.append('latitude', String(resolutionGps.latitude));
          formData.append('longitude', String(resolutionGps.longitude));
          if (resolutionGps.accuracy !== null && resolutionGps.accuracy !== undefined) {
            formData.append('gps_accuracy', String(resolutionGps.accuracy));
          }
          formData.append('location_source', 'DEVICE_GPS');
        }
        evidencePhotos.forEach((item) => {
          formData.append('photos', item.file, item.name);
        });

        const res = await uploadCompletionEvidence(selectedCase.reference_no, formData);
        if (res.success) {
          setActionSuccess(
            `Complaint ${selectedCase.reference_no} marked 'Resolved – Pending Verification'. Queued for administrative review and final closure.`
          );
          // Revoke previews
          evidencePhotos.forEach((p) => {
            if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
          });
          setEvidencePhotos([]);
          setModalType(null);
          loadAssignedQueue();
          if (inspectingCase && inspectingCase.reference_no === selectedCase.reference_no) {
            handleOpenCaseDetail(selectedCase);
          }
        } else {
          setError(res.error || 'Failed to submit completion evidence.');
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
          if (inspectingCase && inspectingCase.reference_no === selectedCase.reference_no) {
            handleOpenCaseDetail(selectedCase);
          }
        } else {
          setError(res.error || 'Failed to record note.');
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred.');
    }
    setSubmittingAction(false);
  };

  // Open Full Case Details & Audit Timeline Drawer
  const handleOpenCaseDetail = async (item) => {
    setInspectingCase(item);
    setDetailLoading(true);
    const res = await fetchOperationalComplaintDetail(item.reference_no);
    if (res.success && res.data) {
      setCaseDetail(res.data);
    } else {
      setCaseDetail(null);
    }
    setDetailLoading(false);
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
        <Notice variant="danger" title="Operational Notice">
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
                  <th className="px-3 py-3 font-semibold w-[140px]">Status</th>
                  <th className="px-3 py-3 font-semibold w-[100px] whitespace-nowrap">AI Estimate</th>
                  <th className="px-5 py-3 font-semibold text-right w-[240px] whitespace-nowrap">Workflow Actions</th>
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
                          onClick={() => handleOpenCaseDetail(item)}
                          className="hover:underline text-left cursor-pointer flex items-center gap-1"
                          title={`Inspect ${item.reference_no}`}
                        >
                          <span>{item.reference_no}</span>
                          <Eye className="w-3 h-3 text-[#68716A]" />
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
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium inline-block ${
                          item.status === 'Resolved - Pending Verification'
                            ? 'bg-[#367454]/15 text-[#367454] border border-[#367454]/30'
                            : item.status === 'In Progress'
                            ? 'bg-[#254A40]/10 text-[#254A40]'
                            : item.status === 'On Hold'
                            ? 'bg-[#8F6A2A]/15 text-[#8F6A2A]'
                            : item.status === 'Closed'
                            ? 'bg-[#68716A]/15 text-[#68716A]'
                            : 'bg-[#ECEAE2] text-[#68716A]'
                        }`}>
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
                                onClick={() => handleOpenResolveModal(item)}
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
                              Pending Admin Review
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

                          {/* Inspect Detail Button */}
                          <Button
                            size="xs"
                            variant="ghost"
                            title="Inspect Case Details & Timeline"
                            onClick={() => handleOpenCaseDetail(item)}
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

      {/* Case Details & Audit Timeline Drawer / Modal */}
      {inspectingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#DCDDD4]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[#254A40]">
                    {inspectingCase.reference_no}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    inspectingCase.priority === 'Emergency'
                      ? 'bg-[#B4483E]/15 text-[#B4483E]'
                      : inspectingCase.priority === 'High'
                      ? 'bg-[#C59A52]/15 text-[#8F6A2A]'
                      : 'bg-[#ECEAE2] text-[#68716A]'
                  }`}>
                    {inspectingCase.priority} Priority
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#254A40]/10 text-[#254A40]">
                    {inspectingCase.status}
                  </span>
                </div>
                <h3 className="text-base font-serif font-bold text-[#252C29] mt-1">
                  {inspectingCase.problem}
                </h3>
                <span className="text-xs text-[#68716A]">
                  {inspectingCase.problem_detail} — {inspectingCase.incident_address}, {inspectingCase.borough}
                </span>
              </div>
              <button
                onClick={() => setInspectingCase(null)}
                className="text-[#68716A] hover:text-[#252C29] p-1 rounded cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-8 text-center text-xs text-[#68716A]">
                Loading complaint details and timeline...
              </div>
            ) : caseDetail ? (
              <div className="space-y-4">
                {/* Check for Admin Rejection in History */}
                {(() => {
                  const hist = caseDetail.history || [];
                  const lastRej = [...hist].reverse().find((h) => h.action === 'Resolution Rejected');
                  if (lastRej && caseDetail.complaint.status === 'In Progress') {
                    return (
                      <div className="p-3.5 bg-[#C59A52]/15 border border-[#C59A52]/40 rounded-lg text-xs space-y-1">
                        <div className="font-semibold text-[#8F6A2A] flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-[#8F6A2A]" />
                          Action Required: Admin Rejected Previous Resolution
                        </div>
                        <p className="text-[#252C29]">
                          <strong>Rejection Reason:</strong> {lastRej.comment || 'Field rework required.'}
                        </p>
                        <span className="text-[11px] text-[#68716A] block">
                          Recorded on {lastRej.created_at} by {lastRej.actor_name}. Please perform field corrections and submit fresh evidence.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Complaint Meta Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-[#F5F3ED] rounded-lg text-xs">
                  <div>
                    <span className="text-[11px] text-[#68716A] block">Department</span>
                    <span className="font-semibold text-[#252C29]">{caseDetail.complaint.assigned_department || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#68716A] block">Assigned Officer</span>
                    <span className="font-semibold text-[#252C29]">{caseDetail.complaint.assigned_staff_name || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#68716A] block">Channel</span>
                    <span className="font-semibold text-[#252C29]">{caseDetail.complaint.channel || 'ONLINE'}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#68716A] block">Reported On</span>
                    <span className="font-semibold text-[#252C29]">{caseDetail.complaint.created_at}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#68716A] block">AI Turnaround Estimate</span>
                    <span className="font-semibold font-mono text-[#254A40]">
                      ~{caseDetail.complaint.predicted_duration_hours ? caseDetail.complaint.predicted_duration_hours.toFixed(1) : '—'} hrs
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#68716A] block">Coordinates</span>
                    <span className="font-mono text-[#252C29]">
                      {caseDetail.complaint.latitude ? `${caseDetail.complaint.latitude.toFixed(4)}, ${caseDetail.complaint.longitude.toFixed(4)}` : 'None'}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-xs font-semibold text-[#252C29] mb-1">Citizen Description</h4>
                  <p className="text-xs text-[#252C29] p-3 bg-white border border-[#DCDDD4] rounded-md">
                    {caseDetail.complaint.description || 'No description provided.'}
                  </p>
                </div>

                {/* Completion Details (if present) */}
                {caseDetail.complaint.resolution_notes && (
                  <div className="p-3 bg-[#367454]/10 border border-[#367454]/30 rounded-lg text-xs space-y-1">
                    <span className="font-semibold text-[#367454] block">Field Completion Report</span>
                    <p className="text-[#252C29]">{caseDetail.complaint.resolution_notes}</p>
                    {caseDetail.complaint.completion_details && (
                      <p className="text-[#68716A] text-[11px]">
                        <strong>Technical Details:</strong> {caseDetail.complaint.completion_details}
                      </p>
                    )}
                  </div>
                )}

                {/* Uploaded Evidence Gallery (Phase 3 Stage 2 Authenticated Viewing) */}
                {caseDetail.evidence && caseDetail.evidence.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-[#252C29] mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-[#254A40]" />
                        Completion Evidence Photos ({caseDetail.evidence.length})
                      </span>
                      <span className="text-[11px] text-[#68716A] font-normal">Click photo to zoom</span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {caseDetail.evidence.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => setZoomedImage(ev)}
                          className="group relative border border-[#DCDDD4] rounded-lg overflow-hidden bg-black/5 hover:border-[#254A40] transition-colors cursor-pointer"
                        >
                          <AuthenticatedImage
                            evidenceId={ev.id}
                            alt={ev.original_filename}
                            className="w-full h-24 object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="p-1.5 bg-white text-[10px] space-y-0.5">
                            <span className="truncate block font-medium text-[#252C29]" title={ev.original_filename}>
                              {ev.original_filename}
                            </span>
                            <span className="text-[#68716A] block">
                              {(ev.file_size / 1024).toFixed(0)} KB • {ev.created_at ? ev.created_at.substring(5, 16) : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chronological Audit Timeline */}
                <div>
                  <h4 className="text-xs font-semibold text-[#252C29] mb-2">Audit History Timeline</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {(caseDetail.history || []).map((h) => (
                      <div key={h.id} className="p-2.5 bg-white border border-[#DCDDD4] rounded-md text-xs space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-[#254A40]">{h.action}</span>
                          <span className="text-[#68716A] font-mono">{h.created_at}</span>
                        </div>
                        {h.comment && (
                          <p className="text-[#252C29] text-[11px]">{h.comment}</p>
                        )}
                        <span className="text-[10px] text-[#68716A] block">
                          by {h.actor_name} ({h.actor_role})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workflow Actions from Drawer */}
                <div className="pt-3 border-t border-[#DCDDD4] flex flex-wrap items-center justify-end gap-2">
                  {caseDetail.complaint.assigned_staff_id === user?.id && caseDetail.complaint.status === 'Assigned' && (
                    <Button size="sm" variant="primary" onClick={() => handleStartWork(caseDetail.complaint)}>
                      <Play className="w-3.5 h-3.5 mr-1" /> Start Work
                    </Button>
                  )}
                  {caseDetail.complaint.assigned_staff_id === user?.id && caseDetail.complaint.status === 'On Hold' && (
                    <Button size="sm" variant="primary" onClick={() => handleResumeWork(caseDetail.complaint)}>
                      <Play className="w-3.5 h-3.5 mr-1" /> Resume Work
                    </Button>
                  )}
                  {caseDetail.complaint.assigned_staff_id === user?.id && caseDetail.complaint.status === 'In Progress' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedCase(caseDetail.complaint);
                          setModalType('hold');
                        }}
                      >
                        <Pause className="w-3.5 h-3.5 mr-1" /> Put On Hold
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleOpenResolveModal(caseDetail.complaint)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Report Complete & Upload Evidence
                      </Button>
                    </>
                  )}
                  {caseDetail.complaint.status === 'Resolved - Pending Verification' && (
                    <span className="text-xs text-[#367454] bg-[#367454]/10 px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" /> Awaiting Administrative Verification & Closure
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (onNavigate) {
                        onNavigate('track', caseDetail.complaint.reference_no);
                      }
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Public Tracker
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#B4483E]">
                Failed to load case details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zoomed Image Lightbox */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="max-w-3xl w-full bg-white rounded-xl overflow-hidden shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#DCDDD4] pb-2">
              <span className="text-xs font-semibold text-[#252C29] truncate">
                {zoomedImage.original_filename}
              </span>
              <button
                onClick={() => setZoomedImage(null)}
                className="text-[#68716A] hover:text-[#252C29] p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center bg-black/5 rounded-lg overflow-hidden max-h-[70vh]">
              <AuthenticatedImage
                evidenceId={zoomedImage.id}
                alt={zoomedImage.original_filename}
                className="max-h-[70vh] object-contain w-auto h-auto"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#68716A] pt-1">
              <span>Size: {(zoomedImage.file_size / 1024).toFixed(0)} KB</span>
              <span>Uploaded: {zoomedImage.created_at}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Operational Action Modal (Hold, Note, or Phase 3 Stage 2 Evidence Upload) */}
      {modalType && selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#DCDDD4] pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-[#252C29]">
                  {modalType === 'hold' && `Pause Work: ${selectedCase.reference_no}`}
                  {modalType === 'resolve' && `Field Completion & Evidence: ${selectedCase.reference_no}`}
                  {modalType === 'note' && `Add Progress Note: ${selectedCase.reference_no}`}
                </h3>
                <span className="text-xs text-[#68716A]">
                  {selectedCase.problem} • {selectedCase.incident_address}
                </span>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="text-[#68716A] hover:text-[#252C29] p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {/* Case 1: Hold Modal */}
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

              {/* Case 2: Phase 3 Stage 2 Completion Evidence Upload Form */}
              {modalType === 'resolve' && (
                <div className="space-y-4">
                  {/* Prominent Admin Rejection Alert if applicable */}
                  {rejectionNotice && (
                    <div className="p-3 bg-[#C59A52]/15 border border-[#C59A52]/40 rounded-lg text-xs space-y-1">
                      <div className="font-semibold text-[#8F6A2A] flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-[#8F6A2A]" />
                        Admin Rework Instructions
                      </div>
                      <p className="text-[#252C29]">
                        <strong>Previous Rejection Reason:</strong> {rejectionNotice.reason}
                      </p>
                      <span className="text-[11px] text-[#68716A] block">
                        Rejected on {rejectionNotice.date}. Please perform necessary field corrections and upload new evidence photos below.
                      </span>
                    </div>
                  )}

                  {/* Prior Evidence Thumbnails if rework */}
                  {priorEvidence.length > 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-[#68716A] block mb-1">
                        Previously Uploaded Evidence ({priorEvidence.length})
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {priorEvidence.map((ev) => (
                          <div key={ev.id} className="w-16 h-16 shrink-0 rounded border border-[#DCDDD4] overflow-hidden">
                            <AuthenticatedImage
                              evidenceId={ev.id}
                              alt={ev.original_filename}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Required Work Report Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-[#252C29] mb-1">
                      Field Resolution Report <span className="text-[#B4483E]">*</span>
                    </label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      rows={3}
                      placeholder="Detail exact corrective actions completed (e.g. Cleared 2 catch basins, resurfaced 15 ft of asphalt, tested drainage flow)..."
                      className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] text-[#252C29]"
                      required
                      minLength={5}
                    />
                    <div className="flex items-center justify-between text-[11px] text-[#68716A] mt-1">
                      <span>Minimum 5 characters required</span>
                      <span>{resolutionNotes.length} characters</span>
                    </div>
                  </div>

                  {/* Optional Technical Details */}
                  <div>
                    <label className="block text-xs font-semibold text-[#252C29] mb-1">
                      Technical Completion Details (Optional)
                    </label>
                    <input
                      type="text"
                      value={completionDetails}
                      onChange={(e) => setCompletionDetails(e.target.value)}
                      placeholder="e.g. Work Order #4092, Crew of 3, 1.5 tons asphalt, Water pressure 65 psi"
                      className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] text-[#252C29]"
                    />
                  </div>

                  {/* 1–5 Photos Upload Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-[#252C29]">
                        Completion Evidence Photos <span className="text-[#B4483E]">*</span>
                      </label>
                      <span className="text-[11px] text-[#68716A]">
                        {evidencePhotos.length}/5 photos attached
                      </span>
                    </div>

                    {photoError && (
                      <div className="p-2 mb-2 bg-[#B4483E]/10 border border-[#B4483E]/30 rounded text-xs text-[#B4483E] flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{photoError}</span>
                      </div>
                    )}

                    {/* Previews Grid */}
                    {evidencePhotos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                        {evidencePhotos.map((item, idx) => (
                          <div key={idx} className="relative group border border-[#DCDDD4] rounded-lg overflow-hidden bg-black/5">
                            <img
                              src={item.previewUrl}
                              alt={item.name}
                              className="w-full h-20 object-cover"
                            />
                            <div className="p-1 bg-white text-[10px] flex items-center justify-between">
                              <span className="truncate max-w-[80px]" title={item.name}>{item.name}</span>
                              <span className="text-[#68716A]">{item.size}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(idx)}
                              className="absolute top-1 right-1 bg-black/60 hover:bg-[#B4483E] text-white p-1 rounded-full cursor-pointer transition-colors"
                              title="Remove photo"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* File Input Box */}
                    {evidencePhotos.length < 5 && (
                      <label className="border-2 border-dashed border-[#DCDDD4] hover:border-[#254A40] rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer bg-[#F5F3ED]/50 transition-colors">
                        <Upload className="w-5 h-5 text-[#68716A] mb-1" />
                        <span className="text-xs font-medium text-[#254A40]">
                          Choose Photos (1–5 required)
                        </span>
                        <span className="text-[10px] text-[#68716A] mt-0.5">
                          JPEG, PNG, or WEBP up to 5 MB each
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handlePhotoSelect}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Resolution GPS Capture (Optional) */}
                  <div className="p-3 bg-[#ECEAE2]/40 border border-[#DCDDD4] rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#252C29] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#254A40]" />
                        Resolution GPS Location
                      </span>
                      {resolutionGps ? (
                        <button
                          type="button"
                          onClick={() => setResolutionGps(null)}
                          className="text-[11px] text-[#B4483E] hover:underline cursor-pointer"
                        >
                          Clear GPS
                        </button>
                      ) : (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={handleDetectResolutionLocation}
                          disabled={detectingGps}
                        >
                          {detectingGps ? (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Detecting...
                            </>
                          ) : (
                            <>
                              <MapPin className="w-3 h-3 mr-1" /> Capture GPS
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {resolutionGps ? (
                      <div className="text-xs text-[#254A40] font-mono bg-white p-2 rounded border border-[#DCDDD4]">
                        Lat: {resolutionGps.latitude}, Lon: {resolutionGps.longitude}
                        {resolutionGps.accuracy && ` (±${resolutionGps.accuracy}m)`}
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#68716A]">
                        Optional: Capturing your current location verifies on-site proximity to the reported incident address.
                      </p>
                    )}

                    {gpsError && (
                      <p className="text-[11px] text-[#B4483E]">{gpsError}</p>
                    )}
                  </div>

                  {/* Verification Workflow Advisory Notice */}
                  <div className="p-3 bg-[#254A40]/10 border border-[#254A40]/20 rounded-lg text-xs space-y-1">
                    <span className="font-semibold text-[#254A40] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" /> Two-Party Verification Workflow
                    </span>
                    <p className="text-[#252C29]">
                      Once submitted, this ticket transitions to <strong>Resolved – Pending Verification</strong>. Only an authorized operations administrator can inspect evidence and approve official closure.
                    </p>
                  </div>
                </div>
              )}

              {/* Case 3: Note Modal */}
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

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DCDDD4]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalType(null)}
                  disabled={submittingAction}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingAction}
                >
                  {submittingAction ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                      Submitting...
                    </>
                  ) : modalType === 'resolve' ? (
                    'Submit Completion Evidence'
                  ) : (
                    'Save Action'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
