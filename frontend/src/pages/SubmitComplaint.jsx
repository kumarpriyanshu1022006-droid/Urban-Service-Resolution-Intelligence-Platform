import React, { useState, useEffect, useRef } from 'react';
import { Send, CheckCircle2, Clock, ArrowRight, ShieldCheck, MapPin, Crosshair, Loader2, X, AlertTriangle } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { submitOperationalComplaint, predictResolutionTime, fetchAddressSuggestions, reverseGeocodeCoordinates, checkComplaintDuplicates } from '../services/api';
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
    incident_zip: '',
    location_type: 'Street/Sidewalk',
    description: '',
    latitude: null,
    longitude: null,
    location_source: 'MANUAL',
    gps_accuracy: null
  });

  const [aiPreview, setAiPreview] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  // Phase 2: Duplicate Advisory Detection States
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  // Geocoding and Location States
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [geoNotice, setGeoNotice] = useState(null);
  const addressContainerRef = useRef(null);
  const locationRequestIdRef = useRef(0);

  // Active category config
  const activeCategory = COMPLAINT_CATEGORIES.find((c) => c.category === formData.problem) || COMPLAINT_CATEGORIES[0];

  const handleCategoryChange = (e) => {
    const selected = e.target.value;
    const cat = COMPLAINT_CATEGORIES.find((c) => c.category === selected);
    setFormData((prev) => ({
      ...prev,
      problem: selected,
      problem_detail: cat && cat.details.length > 0 ? cat.details[0] : 'General'
    }));
    setAiPreview(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'incident_address') {
      // Invalidate any pending in-flight reverse-geocode requests
      locationRequestIdRef.current += 1;
    }
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'incident_address') {
        // If the user manually edits the incident address after GPS or geocoding,
        // mark coordinate provenance as MANUAL and clear device GPS accuracy so stale
        // GPS coordinates are not misleadingly bound to an edited address
        if (prev.location_source === 'DEVICE_GPS' || prev.location_source === 'GEOCODER') {
          updated.location_source = 'MANUAL';
          updated.gps_accuracy = null;
        }
      }
      return updated;
    });
    setAiPreview(null);
  };

  // Debounced address autocomplete
  useEffect(() => {
    const text = formData.incident_address ? formData.incident_address.trim() : '';
    if (text.length < 3 || formData.location_source === 'GEOCODER') {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetchAddressSuggestions(text, formData.borough);
        if (res && res.success && Array.isArray(res.data)) {
          setSuggestions(res.data);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(true); // Allow showing empty-state notice when query has >=3 chars
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.incident_address, formData.borough, formData.location_source]);

  // Click outside to close suggestion dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (addressContainerRef.current && !addressContainerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (sug) => {
    if (!sug) return;
    setFormData((prev) => ({
      ...prev,
      incident_address: sug.incident_address || sug.label || '',
      incident_zip: sug.incident_zip || prev.incident_zip || '',
      borough: sug.borough || prev.borough,
      latitude: sug.latitude !== null && sug.latitude !== undefined && !isNaN(Number(sug.latitude)) ? Number(sug.latitude) : null,
      longitude: sug.longitude !== null && sug.longitude !== undefined && !isNaN(Number(sug.longitude)) ? Number(sug.longitude) : null,
      location_source: 'GEOCODER',
      gps_accuracy: null
    }));
    setShowSuggestions(false);
  };

  const handleDetectLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoNotice({
        type: 'warning',
        message: 'Geolocation is not supported by your browser.'
      });
      return;
    }
    setDetectingLocation(true);
    setGeoNotice(null);
    const reqId = ++locationRequestIdRef.current;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (reqId !== locationRequestIdRef.current) return;
        const { latitude, longitude, accuracy } = pos.coords;
        const lat = Number(latitude.toFixed(6));
        const lon = Number(longitude.toFixed(6));
        const acc = Math.round(accuracy);

        // Pre-save genuine GPS coordinates & accuracy
        setFormData((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lon,
          gps_accuracy: acc,
          location_source: 'DEVICE_GPS'
        }));

        // Reverse-geocode coordinates into a readable street address
        try {
          const res = await reverseGeocodeCoordinates(lat, lon);
          if (reqId !== locationRequestIdRef.current) return;

          if (res && res.success && res.data && res.data.incident_address) {
            const resolvedAddress = res.data.incident_address;
            const resolvedBorough = res.data.borough;
            const resolvedZip = res.data.incident_zip;
            const isOutsideNYC = res.data.outside_service_area || !res.data.is_nyc;

            // Automatically fill the existing Incident Address / Cross Street field
            setFormData((prev) => ({
              ...prev,
              incident_address: resolvedAddress,
              latitude: lat,
              longitude: lon,
              gps_accuracy: acc,
              location_source: 'DEVICE_GPS',
              ...(resolvedZip ? { incident_zip: resolvedZip } : {}),
              ...(resolvedBorough ? { borough: resolvedBorough } : {})
            }));

            if (isOutsideNYC) {
              setGeoNotice({
                type: 'warning',
                message: `Current location auto-filled: "${resolvedAddress}" (GPS ±${acc}m). Notice: This location is outside the NYC municipal service area.`
              });
            } else {
              setGeoNotice({
                type: 'success',
                message: `Current location detected: ${resolvedAddress} (GPS ±${acc}m accuracy)`
              });
            }
          } else if (res && res.data && res.data.outside_service_area) {
            setGeoNotice({
              type: 'warning',
              message: `GPS coordinates acquired (${lat}, ${lon} ±${acc}m), but position is outside NYC and street address could not be resolved. Please enter address manually.`
            });
          } else {
            setGeoNotice({
              type: 'info',
              message: `GPS coordinates acquired (±${acc}m), but street address could not be resolved. Please enter address manually.`
            });
          }
        } catch {
          if (reqId !== locationRequestIdRef.current) return;
          setGeoNotice({
            type: 'info',
            message: `GPS coordinates acquired (±${acc}m). Please enter the street address manually.`
          });
        } finally {
          if (reqId === locationRequestIdRef.current) {
            setDetectingLocation(false);
          }
        }
      },
      (err) => {
        if (reqId !== locationRequestIdRef.current) return;
        setDetectingLocation(false);
        if (err.code === 1) {
          setGeoNotice({
            type: 'warning',
            message: 'Location permission was denied. You can enter the address manually.'
          });
        } else if (err.code === 2) {
          setGeoNotice({
            type: 'warning',
            message: 'Location unavailable. You can enter the address manually.'
          });
        } else if (err.code === 3) {
          setGeoNotice({
            type: 'warning',
            message: 'Location request timed out. You can enter the address manually.'
          });
        } else {
          setGeoNotice({
            type: 'warning',
            message: 'Unable to acquire GPS signal. You can enter the address manually.'
          });
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  const handleClearLocation = () => {
    locationRequestIdRef.current += 1;
    setFormData((prev) => ({
      ...prev,
      latitude: null,
      longitude: null,
      gps_accuracy: null,
      location_source: 'MANUAL'
    }));
    setGeoNotice(null);
  };

  // Preview AI resolution time
  const handlePreviewEstimate = async () => {
    if (!formData.problem || !formData.borough) return;
    setEstimating(true);
    setError(null);

    const boroughCentroids = {
      'MANHATTAN': [40.7831, -73.9712],
      'BROOKLYN': [40.6782, -73.9442],
      'QUEENS': [40.7282, -73.7949],
      'BRONX': [40.8448, -73.8648],
      'STATEN ISLAND': [40.5795, -74.1502]
    };
    const centroid = boroughCentroids[formData.borough] || [40.7831, -73.9712];
    const previewLat = formData.latitude !== null && !isNaN(Number(formData.latitude)) ? Number(formData.latitude) : centroid[0];
    const previewLon = formData.longitude !== null && !isNaN(Number(formData.longitude)) ? Number(formData.longitude) : centroid[1];

    const payload = {
      'Problem (formerly Complaint Type)': formData.problem,
      'Problem Detail (formerly Descriptor)': formData.problem_detail,
      'Agency': activeCategory.agency,
      'Agency Name': activeCategory.agencyName,
      'Borough': formData.borough,
      'Location Type': formData.location_type,
      'Incident Zip': formData.incident_zip ? formData.incident_zip.trim() : 'UNKNOWN',
      'City': formData.borough === 'MANHATTAN' ? 'NEW YORK' : formData.borough,
      'Community Board': '01 MANHATTAN',
      'Council District': 1,
      'Police Precinct': '1',
      'Open Data Channel Type': 'ONLINE',
      'Latitude': previewLat,
      'Longitude': previewLon,
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

  // Execute actual submission and persistence
  const executeSubmission = async (payload) => {
    setSubmitting(true);
    setError(null);
    const res = await submitOperationalComplaint(payload);
    if (res.success && res.data) {
      setSuccessResult(res.data);
      setShowDuplicateModal(false);
      setDuplicateCandidates([]);
      setPendingPayload(null);
    } else {
      setError(res.error || 'Failed to submit complaint.');
    }
    setSubmitting(false);
  };

  // Submit handler with pre-submission duplicate detection advisory
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

    const payload = {
      ...formData,
      agency: activeCategory.agency,
      agency_name: activeCategory.agencyName,
      incident_zip: (formData.incident_zip || '').trim(),
      latitude: formData.latitude !== null ? Number(formData.latitude) : null,
      longitude: formData.longitude !== null ? Number(formData.longitude) : null,
      location_source: formData.location_source || 'MANUAL',
      gps_accuracy: formData.gps_accuracy !== null ? Number(formData.gps_accuracy) : null
    };

    setSubmitting(true);
    setError(null);

    // Run privacy-preserving advisory duplicate check
    try {
      const dupCheckRes = await checkComplaintDuplicates({
        problem: payload.problem,
        problem_detail: payload.problem_detail,
        incident_address: payload.incident_address,
        borough: payload.borough,
        incident_zip: payload.incident_zip,
        latitude: payload.latitude,
        longitude: payload.longitude,
        location_source: payload.location_source
      });

      if (dupCheckRes.success && dupCheckRes.data?.has_duplicates && dupCheckRes.data.candidates.length > 0) {
        setDuplicateCandidates(dupCheckRes.data.candidates);
        setPendingPayload(payload);
        setShowDuplicateModal(true);
        setSubmitting(false);
        return;
      }
    } catch {
      // Degrade gracefully on check failure
    }

    await executeSubmission(payload);
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
                ~{Number(successResult.predicted_duration_hours || 0).toFixed(1)} hours ({Number(successResult.predicted_duration_days || 0).toFixed(2)} days)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-[#68716A]">
              <span>Model Inferred By:</span>
              <span className="font-mono text-[11px] text-[#68716A]">
                {successResult.model_version} (Duration Pipeline)
              </span>
            </div>
            {successResult.latitude !== null && successResult.latitude !== undefined && (
              <div className="flex justify-between items-center text-xs text-[#68716A]">
                <span>Attached Coordinates:</span>
                <span className="font-mono text-[11px] text-[#252C29]">
                  {Number(successResult.latitude).toFixed(4)}, {Number(successResult.longitude).toFixed(4)} ({successResult.location_source || 'VERIFIED'})
                </span>
              </div>
            )}
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
          subtitle="Specify where the condition was observed (with address autocomplete & optional GPS)"
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

            <div className="md:col-span-2 relative" ref={addressContainerRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[#252C29]">
                  Incident Address / Cross Street <span className="text-[#B4483E]">*</span>
                </label>
                {loadingSuggestions && (
                  <span className="text-[11px] text-[#68716A] flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-[#254A40]" /> Searching NYC addresses...
                  </span>
                )}
              </div>
              <input
                type="text"
                name="incident_address"
                value={formData.incident_address}
                onChange={handleChange}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Type address, e.g. 350 5th Ave or 450 7th Ave..."
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
                required
                autoComplete="off"
              />

              {/* Autocomplete Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#DCDDD4] rounded-md shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-[#ECEAE2]">
                  {suggestions.map((sug, idx) => (
                    <li
                      key={idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSuggestion(sug);
                      }}
                      className="p-2.5 hover:bg-[#F5F3ED] cursor-pointer text-xs flex items-start gap-2 transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-[#254A40] shrink-0 mt-0.5" />
                      <div className="flex-1 truncate">
                        <div className="font-semibold text-[#252C29] truncate">{sug.label}</div>
                        <div className="text-[11px] text-[#68716A]">
                          {sug.borough} {sug.incident_zip ? `• ZIP ${sug.incident_zip}` : ''}
                          {sug.latitude !== null && sug.latitude !== undefined && !isNaN(Number(sug.latitude))
                            ? ` • Coordinates: ${Number(sug.latitude).toFixed(4)}, ${Number(sug.longitude).toFixed(4)}`
                            : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {showSuggestions && suggestions.length === 0 && !loadingSuggestions && formData.incident_address.trim().length >= 3 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#DCDDD4] rounded-md shadow-lg z-50 p-3 text-xs text-[#68716A]">
                  No matching NYC address found. You can enter your address manually.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#252C29] mb-1">
                ZIP Code <span className="text-[11px] font-normal text-[#68716A]">(Optional)</span>
              </label>
              <input
                type="text"
                name="incident_zip"
                value={formData.incident_zip}
                onChange={handleChange}
                placeholder="Optional, e.g. 10001"
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

            {/* Geolocation feedback & manual clear */}
            {formData.latitude !== null && formData.longitude !== null ? (
              <div className="md:col-span-3 p-2.5 bg-[#367454]/10 border border-[#367454]/30 rounded-md flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#367454]">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Location Coordinates Attached:</strong> {formData.latitude.toFixed(4)}, {formData.longitude.toFixed(4)}
                    <span className="ml-1 text-[11px] text-[#68716A]">
                      ({formData.location_source === 'DEVICE_GPS' ? 'Device GPS' : 'Geocoded Address'}
                      {formData.gps_accuracy ? ` ±${formData.gps_accuracy}m accuracy` : ''})
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="text-[11px] text-[#B4483E] hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                >
                  <X className="w-3.5 h-3.5" /> Remove GPS
                </button>
              </div>
            ) : (
              <div className="md:col-span-3 p-2.5 bg-[#ECEAE2]/60 border border-[#DCDDD4] rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-[#68716A]">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#68716A] shrink-0" />
                  <span>Exact GPS coordinates unattached. You may submit without GPS or attach your device position.</span>
                </div>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={detectingLocation}
                  className="text-xs text-[#254A40] font-semibold hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {detectingLocation ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting location...
                    </>
                  ) : (
                    <>
                      <Crosshair className="w-3.5 h-3.5 text-[#254A40]" /> Detect My Location
                    </>
                  )}
                </button>
              </div>
            )}

            {geoNotice && (
              <div className={`md:col-span-3 text-xs rounded p-2.5 flex items-center justify-between transition-all ${
                (typeof geoNotice === 'object' && geoNotice.type === 'success')
                  ? 'bg-[#367454]/10 border border-[#367454]/30 text-[#367454]'
                  : (typeof geoNotice === 'object' && geoNotice.type === 'warning')
                  ? 'bg-[#B4483E]/10 border border-[#B4483E]/30 text-[#B4483E]'
                  : 'bg-[#C59A52]/10 border border-[#C59A52]/30 text-[#8F6A2A]'
              }`}>
                <div className="flex items-center gap-2">
                  {typeof geoNotice === 'object' && geoNotice.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-[#367454]" />}
                  <span>{typeof geoNotice === 'object' ? geoNotice.message : geoNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setGeoNotice(null)}
                  className="p-0.5 hover:opacity-75 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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

      {/* Phase 2: Duplicate Advisory Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF9F5] border border-[#DCDDD4] rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-[#E5A83B]/15 text-[#A26D14] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg text-[#252C29]">
                    Similar Active Report Detected
                  </h3>
                  <p className="text-xs text-[#68716A]">
                    {duplicateCandidates.length === 1 ? '1 existing service request matches' : `${duplicateCandidates.length} existing service requests match`} this location and category.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="text-[#68716A] hover:text-[#252C29] p-1 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {duplicateCandidates.slice(0, 3).map((cand) => (
                <div key={cand.reference_no} className="p-3.5 bg-white border border-[#DCDDD4] rounded-lg text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-[#254A40]">{cand.reference_no}</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#367454]/10 text-[#367454]">
                      {cand.status}
                    </span>
                  </div>
                  <div className="text-[#252C29] font-medium">
                    {cand.problem} — <span className="text-[#68716A] font-normal">{cand.problem_detail}</span>
                  </div>
                  <div className="text-[#68716A] flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#68716A] shrink-0" />
                    <span>{cand.incident_address} {cand.distance_meters ? `(~${cand.distance_meters}m away)` : ''}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-[#68716A] pt-1 border-t border-[#ECEAE2]">
                    <span>Reported: {cand.created_at}</span>
                    <span>{cand.has_assigned_staff ? 'Field team assigned' : 'Awaiting dispatch'}</span>
                  </div>
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => {
                        setShowDuplicateModal(false);
                        onNavigate && onNavigate('track', cand.reference_no);
                      }}
                    >
                      Track Existing Complaint ({cand.reference_no})
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[#DCDDD4] flex flex-col sm:flex-row items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDuplicateModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={submitting}
                onClick={() => {
                  if (pendingPayload) {
                    executeSubmission(pendingPayload);
                  }
                }}
              >
                Report Separate Issue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
