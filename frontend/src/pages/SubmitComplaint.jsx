import React, { useState } from 'react';
import { Send, CheckCircle2, Clock, ArrowRight, ShieldCheck } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { submitOperationalComplaint, predictResolutionTime } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COMPLAINT_CATEGORIES = [
  {
    category: 'Dirty Conditions',
    agency: 'DSNY',
    agencyName: 'Department of Sanitation',
    details: ['Trash / Illegal Dumping', 'Dumpster Overflow', 'Litter Basket Full', 'Dead Animal']
  },
  {
    category: 'Illegal Parking',
    agency: 'NYPD',
    agencyName: 'New York City Police Department',
    details: ['Blocked Hydrant', 'Blocked Crosswalk', 'Double Parked', 'Commercial Overnight Parking']
  },
  {
    category: 'Street Condition',
    agency: 'DOT',
    agencyName: 'Department of Transportation',
    details: ['Pothole Emergency', 'Cave-in', 'Rough Street', 'Missing Manhole Cover']
  },
  {
    category: 'Noise - Residential',
    agency: 'NYPD',
    agencyName: 'New York City Police Department',
    details: ['Loud Music/Party', 'Banging/Pounding', 'Barking Dog']
  },
  {
    category: 'Water Maintenance',
    agency: 'DEP',
    agencyName: 'Department of Environmental Protection',
    details: ['Leak (Hydrant)', 'No Water', 'Low Water Pressure', 'Water Main Break']
  },
  {
    category: 'Sidewalk Condition',
    agency: 'DOT',
    agencyName: 'Department of Transportation',
    details: ['Broken Sidewalk', 'Raised Sidewalk Slab', 'Missing Curb']
  }
];

const BOROUGHS = ['MANHATTAN', 'BROOKLYN', 'QUEENS', 'BRONX', 'STATEN ISLAND'];

export default function SubmitComplaint({ onNavigate }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    problem: 'Dirty Conditions',
    problem_detail: 'Trash / Illegal Dumping',
    borough: 'MANHATTAN',
    incident_address: '',
    incident_zip: '10001',
    location_type: 'Street/Sidewalk',
    description: '',
    latitude: 40.7505,
    longitude: -73.9934
  });

  const [aiPreview, setAiPreview] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  // Active category config
  const activeCategory = COMPLAINT_CATEGORIES.find((c) => c.category === formData.problem) || COMPLAINT_CATEGORIES[0];

  const handleCategoryChange = (e) => {
    const selected = e.target.value;
    const cat = COMPLAINT_CATEGORIES.find((c) => c.category === selected);
    setFormData((prev) => ({
      ...prev,
      problem: selected,
      problem_detail: cat ? cat.details[0] : 'General'
    }));
    setAiPreview(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Preview AI resolution time
  const handlePreviewEstimate = async () => {
    if (!formData.problem || !formData.borough) return;
    setEstimating(true);
    setError(null);

    const payload = {
      'Problem (formerly Complaint Type)': formData.problem,
      'Problem Detail (formerly Descriptor)': formData.problem_detail,
      'Agency': activeCategory.agency,
      'Agency Name': activeCategory.agencyName,
      'Borough': formData.borough,
      'Location Type': formData.location_type,
      'Incident Zip': formData.incident_zip || '10001',
      'City': formData.borough === 'MANHATTAN' ? 'NEW YORK' : formData.borough,
      'Community Board': '01 MANHATTAN',
      'Council District': 1,
      'Police Precinct': '1',
      'Open Data Channel Type': 'ONLINE',
      'Latitude': parseFloat(formData.latitude) || 40.7128,
      'Longitude': parseFloat(formData.longitude) || -74.0060,
      'Created Date': new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    const res = await predictResolutionTime(payload);
    if (res.success && res.data) {
      setAiPreview(res.data);
    } else {
      setError(res.error || 'AI estimation preview unavailable.');
    }
    setEstimating(false);
  };

  // Submit and persist complaint
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!formData.incident_address.trim()) {
      setError('Incident address is required.');
      return;
    }
    if (!formData.description.trim()) {
      setError('Please provide a short description of the issue.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      ...formData,
      agency: activeCategory.agency,
      agency_name: activeCategory.agencyName
    };

    const res = await submitOperationalComplaint(payload);
    if (res.success && res.data) {
      setSuccessResult(res.data);
    } else {
      setError(res.error || 'Failed to submit complaint.');
    }
    setSubmitting(false);
  };

  // Success view
  if (successResult) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        <div className="bg-[#ECEAE2]/40 border border-[#DCDDD4] rounded-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-[#367454]/10 text-[#367454] rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-serif text-[#252C29]">
            Complaint Successfully Registered
          </h2>

          <p className="text-sm text-[#68716A]">
            Your service request has been logged in the NYC municipal operations system and assigned a permanent reference code.
          </p>

          <div className="p-4 bg-white border border-[#DCDDD4] rounded-lg inline-block text-left w-full max-w-md mx-auto space-y-2">
            <div className="flex justify-between items-center text-xs text-[#68716A] border-b border-[#ECEAE2] pb-2">
              <span>Complaint Reference:</span>
              <span className="font-mono font-bold text-base text-[#254A40]">
                {successResult.reference_no}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-[#68716A]">
              <span>Responsible Agency:</span>
              <span className="font-semibold text-[#252C29]">
                {activeCategory.agency} ({activeCategory.agencyName})
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-[#68716A]">
              <span>Triage Suggested Priority:</span>
              <span className="font-semibold text-[#252C29]">
                {successResult.suggested_priority || 'Medium'} <span className="text-[10px] text-[#254A40] font-normal">(Rule-Based Triage)</span>
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-[#68716A]">
              <span>AI Estimated Turnaround:</span>
              <span className="font-semibold text-[#254A40]">
                ~{successResult.predicted_duration_hours.toFixed(1)} hours ({successResult.predicted_duration_days.toFixed(2)} days)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-[#68716A]">
              <span>Model Inferred By:</span>
              <span className="font-mono text-[11px] text-[#68716A]">
                {successResult.model_version} (Duration Pipeline)
              </span>
            </div>
          </div>

          <p className="text-xs text-[#8F6A2A] bg-[#C59A52]/10 border border-[#C59A52]/20 rounded p-2.5 max-w-md mx-auto">
            Note: This estimated duration is generated by machine learning based on historical closure velocity. Operational staff will prioritize work based on field emergency conditions.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <Button
              variant="primary"
              onClick={() => onNavigate && onNavigate('track', successResult.reference_no)}
            >
              Track Complaint Live <ArrowRight className="w-4 h-4 ml-1 inline" />
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate && onNavigate('citizen_dashboard')}
            >
              View My Complaints
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#DCDDD4]">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#68716A]">
          <ShieldCheck className="w-4 h-4 text-[#254A40]" />
          <span>Municipal Citizen Service Portal</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
          Submit New Service Request
        </h1>
        <p className="text-xs sm:text-sm text-[#68716A] mt-1">
          Submit a non-emergency complaint to NYC municipal agencies. Our AI will automatically estimate the expected resolution duration and track real-time resolution progress.
        </p>
      </div>

      {error && (
        <Notice variant="danger" title="Submission Error">
          {error}
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Issue Classification */}
        <Card
          title="1. Issue Classification & Responsible Agency"
          subtitle="Select the primary issue category and specific descriptor"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                Complaint Category <span className="text-[#B4483E]">*</span>
              </label>
              <select
                name="problem"
                value={formData.problem}
                onChange={handleCategoryChange}
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
              >
                {COMPLAINT_CATEGORIES.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category} ({c.agency})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                Problem Detail <span className="text-[#B4483E]">*</span>
              </label>
              <select
                name="problem_detail"
                value={formData.problem_detail}
                onChange={handleChange}
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
              >
                {activeCategory.details.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 p-3 bg-[#ECEAE2]/40 rounded border border-[#DCDDD4] text-xs flex justify-between items-center text-[#68716A]">
            <span>Responsible Department: <strong className="text-[#252C29]">{activeCategory.agencyName} ({activeCategory.agency})</strong></span>
            <span className="text-[11px] text-[#254A40] font-medium">Auto-Routed</span>
          </div>
        </Card>

        {/* Step 2: Location */}
        <Card
          title="2. Incident Location & Borough"
          subtitle="Specify where the condition was observed"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                Borough <span className="text-[#B4483E]">*</span>
              </label>
              <select
                name="borough"
                value={formData.borough}
                onChange={handleChange}
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
              >
                {BOROUGHS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                Incident Address / Cross Street <span className="text-[#B4483E]">*</span>
              </label>
              <input
                type="text"
                name="incident_address"
                value={formData.incident_address}
                onChange={handleChange}
                placeholder="e.g. 450 7th Ave (between 34th & 35th St)"
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                ZIP Code
              </label>
              <input
                type="text"
                name="incident_zip"
                value={formData.incident_zip}
                onChange={handleChange}
                placeholder="10001"
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                Location Type
              </label>
              <select
                name="location_type"
                value={formData.location_type}
                onChange={handleChange}
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
              >
                <option value="Street/Sidewalk">Street / Sidewalk</option>
                <option value="Residential Building/House">Residential Building</option>
                <option value="Commercial">Store / Commercial Property</option>
                <option value="Park/Playground">Park / Playground</option>
                <option value="Highway">Highway / Expressway</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Step 3: Description & AI Estimate Preview */}
        <Card
          title="3. Issue Description & Expected Resolution Time"
          subtitle="Describe the problem to assist field inspectors"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                Detailed Description <span className="text-[#B4483E]">*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Provide specific details (e.g. size of hazard, recurring times, obstruction level)..."
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
                required
              />
            </div>

            {/* AI Estimation Box */}
            <div className="p-4 bg-[#ECEAE2]/40 border border-[#DCDDD4] rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#254A40]">
                    <Clock className="w-4 h-4 text-[#C59A52]" />
                    <span>AI Resolution-Time Estimation</span>
                  </div>
                  <p className="text-xs text-[#68716A] mt-0.5">
                    Evaluate expected turnaround duration using our LightGBM model before submitting.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePreviewEstimate}
                  disabled={estimating}
                >
                  {estimating ? 'Calculating...' : 'Preview Estimate'}
                </Button>
              </div>

              {aiPreview && (
                <div className="mt-3 pt-3 border-t border-[#DCDDD4] flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[#68716A]">Estimated Closure Duration: </span>
                    <strong className="text-[#254A40] text-sm font-serif">
                      {aiPreview.display_duration}
                    </strong>
                    <span className="text-[#68716A] ml-1">
                      (~{aiPreview.predicted_resolution_days} days)
                    </span>
                  </div>
                  <span className="text-[11px] bg-[#367454]/10 text-[#367454] px-2 py-0.5 rounded font-mono">
                    Model: {aiPreview.model}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-[#68716A]">
            Submitting as: <strong>{user?.full_name || 'Citizen User'}</strong> ({user?.email})
          </span>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={submitting}
          >
            {submitting ? 'Submitting & Predicting...' : (
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" />
                Submit Complaint
              </span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
