import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Star,
  MessageSquare,
  Clock,
  ShieldCheck,
  Camera,
  X
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import AuthenticatedImage from '../components/ui/AuthenticatedImage';
import { fetchOperationalComplaintDetail, submitComplaintFeedback } from '../services/api';

export default function ComplaintTracking({ initialRef }) {
  const [refInput, setRefInput] = useState(initialRef || '');
  const [currentRef, setCurrentRef] = useState(initialRef || 'NYC-2026-90412');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(null);

  const loadComplaint = useCallback(async (refToLoad) => {
    if (!refToLoad) return;
    setLoading(true);
    setError(null);
    const res = await fetchOperationalComplaintDetail(refToLoad.trim());
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error || `No record found for complaint reference "${refToLoad}".`);
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (currentRef) {
      loadComplaint(currentRef);
    }
  }, [currentRef, loadComplaint]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (refInput.trim()) {
      setCurrentRef(refInput.trim());
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    setSubmittingFeedback(true);
    const res = await submitComplaintFeedback(currentRef, {
      rating,
      feedback_text: feedbackText.trim()
    });
    if (res.success) {
      setFeedbackSuccess('Thank you! Your feedback has been recorded.');
      setShowFeedbackModal(false);
      loadComplaint(currentRef); // refresh feedback state
    } else {
      alert(res.error || 'Failed to submit feedback.');
    }
    setSubmittingFeedback(false);
  };

  const complaint = data?.complaint;
  const history = useMemo(() => data?.history || [], [data?.history]);
  const feedback = data?.feedback;

  const lastRejection = useMemo(() => {
    return [...history].reverse().find((h) => h.action === 'Resolution Rejected');
  }, [history]);

  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setCurrentTime(Date.now());
  }, [complaint]);

  // Memoize elapsed hours safely based on complaint record and timestamp state
  const elapsedHours = useMemo(() => {
    if (!complaint?.created_at) return 0;
    const createdTime = new Date(complaint.created_at).getTime();
    const endTime = complaint.closed_at ? new Date(complaint.closed_at).getTime() : currentTime;
    return endTime > createdTime ? Math.max(0, (endTime - createdTime) / (1000 * 3600)) : 0;
  }, [complaint, currentTime]);

  const isOverdue = complaint && complaint.status !== 'Closed' && elapsedHours > (complaint.predicted_duration_hours || 24);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header & Lookup Bar */}
      <div className="pb-2 border-b border-[#DCDDD4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#68716A]">
            Public Resolution Tracker
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
            Track Complaint Status
          </h1>
          <p className="text-xs sm:text-sm text-[#68716A] mt-1">
            Real-time public audit timeline, operational updates, and expected resolution telemetry.
          </p>
        </div>

        {/* Lookup input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="e.g. NYC-2026-90412"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              className="text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md font-mono text-[#252C29] focus:outline-none focus:border-[#254A40] w-44 sm:w-56"
            />
          </div>
          <Button size="sm" variant="primary" type="submit">
            <Search className="w-3.5 h-3.5 mr-1" />
            Lookup
          </Button>
        </form>
      </div>

      {error && (
        <Notice variant="danger" title="Lookup Unsuccessful">
          {error}
        </Notice>
      )}

      {feedbackSuccess && (
        <Notice variant="success" title="Feedback Recorded">
          {feedbackSuccess}
        </Notice>
      )}

      {loading && (
        <div className="py-16 text-center text-xs text-[#68716A]">
          Loading complaint tracking details...
        </div>
      )}

      {complaint && !loading && (
        <div className="space-y-6">
          {/* Main Status & Metrics Card */}
          <div className="bg-white border border-[#DCDDD4] rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-[#ECEAE2] pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xl font-bold text-[#254A40]">
                    {complaint.reference_no}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                    complaint.status === 'Closed'
                      ? 'bg-[#367454]/15 text-[#367454] border border-[#367454]/30'
                      : complaint.status === 'Resolved - Pending Verification'
                      ? 'bg-[#8F6A2A]/15 text-[#8F6A2A] border border-[#8F6A2A]/30'
                      : complaint.status === 'In Progress' && lastRejection
                      ? 'bg-[#C59A52]/15 text-[#8F6A2A] border border-[#C59A52]/30'
                      : 'bg-[#254A40]/10 text-[#254A40] border border-[#254A40]/20'
                  }`}>
                    {complaint.status === 'Resolved - Pending Verification'
                      ? 'Resolved – Awaiting Verification'
                      : complaint.status === 'In Progress' && lastRejection
                      ? 'In Progress (Rework)'
                      : complaint.status}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    complaint.priority === 'Emergency'
                      ? 'bg-[#B4483E]/15 text-[#B4483E] font-bold border border-[#B4483E]/30'
                      : complaint.priority === 'High'
                      ? 'bg-[#C59A52]/15 text-[#8F6A2A] font-semibold border border-[#C59A52]/30'
                      : 'bg-[#ECEAE2] text-[#68716A]'
                  }`}>
                    Operational Priority: {complaint.priority}
                  </span>
                  {complaint.suggested_priority && (
                    <span className="px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 border border-blue-200" title="Rule-based triage classification based on municipal hazard matrices">
                      Triage Recommendation: {complaint.suggested_priority}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-serif font-normal text-[#252C29] mt-2">
                  {complaint.problem} — <span className="text-[#68716A] text-sm font-sans">{complaint.problem_detail}</span>
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-[#68716A] mt-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{complaint.incident_address}, {complaint.borough} {complaint.incident_zip}</span>
                </div>
              </div>

              <div className="text-right text-xs text-[#68716A] shrink-0">
                <div>Submitted: <strong className="text-[#252C29]">{complaint.created_at}</strong></div>
                <div>Agency: <strong className="text-[#252C29]">{complaint.assigned_department || complaint.agency}</strong></div>
              </div>
            </div>

            {/* Priority Override Reason Disclosure */}
            {complaint.priority_override_reason && (
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-0.5">
                <span className="font-semibold block">Administrative Priority Modification</span>
                <p>
                  <strong>Override Justification: </strong>
                  {complaint.priority_override_reason}
                </p>
              </div>
            )}

            {/* Turnaround Telemetry Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="p-3 bg-[#ECEAE2]/40 rounded-lg border border-[#DCDDD4]">
                <span className="text-xs text-[#68716A] block">AI Estimated Turnaround</span>
                <span className="text-base font-semibold font-mono text-[#254A40]">
                  ~{complaint.predicted_duration_hours ? complaint.predicted_duration_hours.toFixed(1) : '—'} hrs
                </span>
                <span className="text-[11px] text-[#68716A] block mt-0.5">
                  Model: {complaint.prediction_model_version || 'LightGBM'}
                </span>
              </div>

              <div className="p-3 bg-[#ECEAE2]/40 rounded-lg border border-[#DCDDD4]">
                <span className="text-xs text-[#68716A] block">
                  {complaint.status === 'Closed' ? 'Actual Resolution Time' : 'Elapsed Time Since Submission'}
                </span>
                <span className={`text-base font-semibold font-mono ${isOverdue ? 'text-[#B4483E]' : 'text-[#252C29]'}`}>
                  {complaint.status === 'Closed' && complaint.actual_resolution_hours !== null
                    ? `${complaint.actual_resolution_hours.toFixed(1)} hrs`
                    : `${elapsedHours.toFixed(1)} hrs`}
                </span>
                <span className="text-[11px] text-[#68716A] block mt-0.5">
                  {complaint.status === 'Closed' ? 'Verified Completion' : isOverdue ? 'Operational Delay Alert' : 'On Track'}
                </span>
              </div>

              <div className="p-3 bg-[#ECEAE2]/40 rounded-lg border border-[#DCDDD4]">
                <span className="text-xs text-[#68716A] block">Assigned Officer</span>
                {complaint.assigned_staff_name ? (
                  <>
                    <span className="text-sm font-semibold text-[#252C29] truncate block mt-0.5" title={complaint.assigned_staff_name}>
                      {complaint.assigned_staff_name}
                    </span>
                    <span className="text-[11px] text-[#254A40] block">
                      Field Officer — {complaint.assigned_department || 'Operations'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-[#8F6A2A] truncate block mt-0.5">
                      Awaiting Staff Assignment
                    </span>
                    <span className="text-[11px] text-[#68716A] block">
                      {complaint.assigned_department || complaint.agency || 'Operations'} Department Queue
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* On Hold Blocker Banner */}
            {complaint.status === 'On Hold' && complaint.hold_reason && (
              <div className="p-3.5 bg-[#B4483E]/10 border border-[#B4483E]/30 rounded-lg text-xs text-[#B4483E] space-y-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Work Paused (Operational Blocker Reported)
                </span>
                <p className="text-[#252C29]">
                  {complaint.hold_reason}
                </p>
                {complaint.hold_until && (
                  <span className="text-[11px] text-[#68716A] block">
                    Expected inspection resumption: {complaint.hold_until}
                  </span>
                )}
              </div>
            )}

            {/* Administrative Rework Notice (When Previous Resolution Was Rejected) */}
            {complaint.status === 'In Progress' && lastRejection && (
              <div className="p-4 bg-[#C59A52]/15 border border-[#C59A52]/40 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#8F6A2A] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#8F6A2A]" />
                    Quality Review Update: Field Rework in Progress
                  </span>
                  <span className="text-[11px] text-[#68716A]">Returned: {lastRejection.created_at}</span>
                </div>
                <p className="text-[#252C29]">
                  <strong>Admin Rework Instructions: </strong>
                  {lastRejection.comment}
                </p>
                <span className="text-[11px] text-[#68716A] block">
                  Operations administration reviewed initial field completion and requested corrections before final sign-off. Field staff is currently performing rework.
                </span>
              </div>
            )}

            {/* Awaiting Administrative Verification Banner */}
            {complaint.status === 'Resolved - Pending Verification' && (
              <div className="p-4 bg-[#8F6A2A]/10 border border-[#8F6A2A]/30 rounded-lg text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#8F6A2A] flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#8F6A2A]" />
                    Field Work Completed — Awaiting Administrative Verification
                  </span>
                  {complaint.updated_at && (
                    <span className="text-[11px] text-[#68716A]">Reported: {complaint.updated_at}</span>
                  )}
                </div>
                <p className="text-[#252C29]">
                  <strong>Field Completion Notes: </strong>
                  {complaint.resolution_notes || 'Field staff reported service corrections completed.'}
                </p>

                {/* Optional Field GPS Details */}
                {complaint.resolution_latitude && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#68716A] pt-1">
                    <MapPin className="w-3.5 h-3.5 text-[#8F6A2A]" />
                    <span>
                      Field GPS Provenance: {complaint.resolution_latitude.toFixed(4)}, {complaint.resolution_longitude.toFixed(4)}
                      {complaint.resolution_gps_accuracy ? ` (±${complaint.resolution_gps_accuracy}m accuracy)` : ''}
                    </span>
                  </div>
                )}

                {/* Optional Technical Details */}
                {complaint.completion_details && (
                  <div className="text-[11px] text-[#68716A] pt-1 border-t border-[#8F6A2A]/20">
                    <strong>Technical Details: </strong>
                    <span>{complaint.completion_details}</span>
                  </div>
                )}

                <div className="pt-1 text-[11px] text-[#68716A] italic">
                  Two-party verification in progress: A municipal operations supervisor must review and verify submitted evidence before official closure.
                </div>
              </div>
            )}

            {/* Verified Case Resolution Banner */}
            {complaint.status === 'Closed' && (
              <div className="p-4 bg-[#367454]/10 border border-[#367454]/30 rounded-lg text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#367454] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#367454]" />
                    Verified Case Resolution & Official Closure
                  </span>
                  {complaint.closed_at && (
                    <span className="text-[11px] text-[#68716A]">Closed: {complaint.closed_at}</span>
                  )}
                </div>
                <p className="text-[#252C29]">
                  <strong>Resolution Notes: </strong>
                  {complaint.resolution_notes || 'All requested corrections were performed by municipal field staff and verified by administration.'}
                </p>

                {complaint.actual_resolution_hours !== null && (
                  <div className="text-[11px] text-[#254A40] font-medium">
                    Total Turnaround Duration: {complaint.actual_resolution_hours.toFixed(1)} hours
                  </div>
                )}

                {/* Citizen Feedback Section */}
                <div className="pt-2 border-t border-[#367454]/20 flex items-center justify-between">
                  {feedback ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center text-[#C59A52]">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-3.5 h-3.5 ${i < feedback.rating ? 'fill-current' : 'text-gray-300'}`} />
                        ))}
                      </div>
                      <span className="text-xs text-[#68716A]">"{feedback.feedback_text}"</span>
                    </div>
                  ) : (
                    <Button size="xs" variant="primary" onClick={() => setShowFeedbackModal(true)}>
                      <MessageSquare className="w-3.5 h-3.5 mr-1" />
                      Rate Service & Submit Feedback
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Resolution Evidence Gallery */}
            {data?.evidence && data.evidence.length > 0 ? (
              <div className="p-4 bg-white border border-[#DCDDD4] rounded-lg text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#252C29] flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-[#254A40]" />
                    Field Resolution Evidence Photos ({data.evidence.length})
                  </span>
                  <span className="text-[11px] text-[#68716A]">Authenticated Public Audit Media</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {data.evidence.map((ev) => (
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
              </div>
            ) : (complaint.status === 'Resolved - Pending Verification' || complaint.status === 'Closed') ? (
              <div className="p-3 bg-[#ECEAE2]/40 border border-[#DCDDD4] rounded-lg text-xs text-[#68716A] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#68716A] shrink-0" />
                <span>Field completion photos and diagnostics are restricted to the verified submitting citizen and authorized municipal staff.</span>
              </div>
            ) : null}

            {/* Description quote */}
            <div className="text-xs text-[#68716A] bg-[#ECEAE2]/30 p-3 rounded border border-[#DCDDD4]">
              <strong className="text-[#252C29]">Original Citizen Report: </strong>
              <span>{complaint.description}</span>
            </div>
          </div>

          {/* Chronological Audit Timeline */}
          <Card
            title="Public Service Progress Timeline"
            subtitle="Verified chronological events logged by municipal dispatchers and inspectors"
          >
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#DCDDD4]">
              {history.map((event, idx) => {
                const isApproved = event.action === 'Verified & Closed' || event.to_status === 'Closed';
                const isRejected = event.action === 'Resolution Rejected';
                const isWorkCompleted = event.action === 'Work Completed — Queued for Verification' || event.to_status === 'Resolved - Pending Verification';
                const isOnHold = event.to_status === 'On Hold';

                return (
                  <div key={event.id || idx} className="relative space-y-1">
                    {/* Dot */}
                    <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 bg-white ${
                      isApproved
                        ? 'border-[#367454] bg-[#367454]'
                        : isRejected
                        ? 'border-[#8F6A2A] bg-[#8F6A2A]'
                        : isWorkCompleted
                        ? 'border-[#1D70B8] bg-[#1D70B8]'
                        : isOnHold
                        ? 'border-[#B4483E] bg-[#B4483E]'
                        : 'border-[#254A40]'
                    }`} />

                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${
                        isApproved ? 'text-[#367454]' : isRejected ? 'text-[#8F6A2A]' : 'text-[#252C29]'
                      }`}>
                        {event.action || event.to_status}
                      </span>
                      <span className="text-[11px] text-[#68716A] font-mono">
                        {event.created_at}
                      </span>
                    </div>

                    <p className={`text-xs ${
                      isRejected ? 'p-2 bg-[#C59A52]/10 border border-[#C59A52]/30 rounded text-[#8F6A2A] font-medium' : 'text-[#68716A]'
                    }`}>
                      {event.comment}
                    </p>

                    <div className="text-[11px] text-[#8F6A2A]">
                      Logged by: {event.actor_name} ({event.actor_role})
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#DCDDD4] rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-serif font-bold text-[#252C29]">
              Rate Municipal Service Resolution
            </h3>
            <p className="text-xs text-[#68716A]">
              Your feedback directly impacts municipal agency performance reviews and SLA benchmarks.
            </p>

            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  Satisfaction Rating (1 to 5 Stars)
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 focus:outline-none"
                    >
                      <Star className={`w-6 h-6 ${star <= rating ? 'text-[#C59A52] fill-current' : 'text-gray-300'}`} />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-[#254A40] ml-2">{rating} / 5 Stars</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#252C29] mb-1">
                  Comments & Feedback (Optional)
                </label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={3}
                  placeholder="Share details regarding the quality, speed, and courtesy of the resolution..."
                  className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] text-[#252C29]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFeedbackModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingFeedback}
                >
                  {submittingFeedback ? 'Submitting...' : 'Submit Review'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
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
                className="text-[#68716A] hover:text-[#252C29] p-1 rounded-md"
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
