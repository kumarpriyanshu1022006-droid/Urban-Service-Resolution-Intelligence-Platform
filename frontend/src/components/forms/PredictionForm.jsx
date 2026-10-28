import React, { useState } from 'react';
import {
  COMPLAINT_PROBLEMS,
  AGENCIES,
  BOROUGHS,
  LOCATION_TYPES,
  CHANNELS,
  PRESET_SCENARIOS
} from '../../data/constants';
import Button from '../ui/Button';
import Notice from '../ui/Notice';
import { Send, Sparkles, RotateCcw } from 'lucide-react';

// Initial state helper
function getInitialDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export default function PredictionForm({ onSubmit, loading, error, _validationDetails, initialData }) {


  const defaultFormData = React.useMemo(() => ({
    'Problem (formerly Complaint Type)': 'Dirty Conditions',
    'Problem Detail (formerly Descriptor)': 'Trash / Illegal Dumping',
    'Agency': 'DSNY',
    'Agency Name': 'Department of Sanitation',
    'Location Type': 'Sidewalk',
    'Borough': 'MANHATTAN',
    'Incident Zip': '10001',
    'City': 'NEW YORK',
    'Community Board': '05 MANHATTAN',
    'Council District': 3,
    'Police Precinct': '14',
    'Open Data Channel Type': 'ONLINE',
    'Latitude': 40.7505,
    'Longitude': -73.9934,
    'Created Date': getInitialDateTime(),
  }), []);

  const [formData, setFormData] = useState(initialData ? { ...defaultFormData, ...initialData } : defaultFormData);
  const [formErrors, setFormErrors] = useState({});

  // Sync if initialData is provided after mount
  React.useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...defaultFormData,
        ...prev,
        ...initialData,
        'Problem (formerly Complaint Type)':
          initialData['Problem (formerly Complaint Type)'] ||
          initialData.problem ||
          prev['Problem (formerly Complaint Type)'] ||
          'Dirty Conditions',
      }));
      setFormErrors({});
    }
  }, [initialData, defaultFormData]);

  // When problem type changes, synchronize agency and update available problem details
  const handleProblemChange = (e) => {
    const selectedProblem = e.target.value;
    const problemConfig = COMPLAINT_PROBLEMS.find((p) => p.type === selectedProblem);

    setFormData((prev) => ({
      ...prev,
      'Problem (formerly Complaint Type)': selectedProblem,
      'Problem Detail (formerly Descriptor)': problemConfig?.details[0] || prev['Problem Detail (formerly Descriptor)'] || 'Other',
      'Agency': problemConfig ? problemConfig.agency : prev['Agency'],
      'Agency Name': problemConfig ? problemConfig.agencyName : prev['Agency Name'],
    }));

    if (formErrors['Problem (formerly Complaint Type)']) {
      setFormErrors((prev) => ({ ...prev, 'Problem (formerly Complaint Type)': null }));
    }
  };

  // When borough changes, update reasonable administrative defaults
  const handleBoroughChange = (e) => {
    const selectedBorough = e.target.value;
    const boroughConfig = BOROUGHS.find((b) => b.name === selectedBorough);

    if (boroughConfig) {
      setFormData((prev) => ({
        ...prev,
        'Borough': selectedBorough,
        'City': boroughConfig.defaultCity,
        'Incident Zip': boroughConfig.defaultZip,
        'Latitude': boroughConfig.defaultLat,
        'Longitude': boroughConfig.defaultLng,
        'Community Board': boroughConfig.defaultBoard,
        'Police Precinct': boroughConfig.defaultPrecinct,
        'Council District': boroughConfig.defaultDistrict,
      }));
    } else {
      setFormData((prev) => ({ ...prev, 'Borough': selectedBorough }));
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? (value === '' ? '' : Number(value)) : value;

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));

    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Load preset scenario
  const handleApplyPreset = (scenario) => {
    setFormData({
      ...defaultFormData,
      ...scenario.data,
      'Created Date': getInitialDateTime(), // refresh to current timestamp
    });
    setFormErrors({});
  };

  // Validate and submit
  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;

    const errors = {};
    const problemValue = (formData['Problem (formerly Complaint Type)'] || '').trim();

    if (!problemValue) {
      errors['Problem (formerly Complaint Type)'] = 'Complaint type is required';
    }
    if (!formData['Created Date']) {
      errors['Created Date'] = 'Creation date and time is required';
    }
    if (!formData['Borough']) {
      errors['Borough'] = 'Borough selection is required';
    }
    if (!formData['Agency']) {
      errors['Agency'] = 'Agency is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    const formattedPayload = {
      'Agency': formData['Agency'] || 'DSNY',
      'Agency Name': formData['Agency Name'] || 'Department of Sanitation',
      'Problem (formerly Complaint Type)': problemValue,
      'Problem Detail (formerly Descriptor)': formData['Problem Detail (formerly Descriptor)'] || 'General',
      'Location Type': formData['Location Type'] || 'Sidewalk',
      'Incident Zip': String(formData['Incident Zip'] || '10001'),
      'City': formData['City'] || 'NEW YORK',
      'Borough': formData['Borough'] || 'MANHATTAN',
      'Community Board': formData['Community Board'] || '05 MANHATTAN',
      'Council District': formData['Council District'] !== '' && formData['Council District'] !== null ? Number(formData['Council District']) : 3,
      'Police Precinct': String(formData['Police Precinct'] || '14'),
      'Open Data Channel Type': formData['Open Data Channel Type'] || 'ONLINE',
      'Latitude': formData['Latitude'] !== '' && formData['Latitude'] !== null ? parseFloat(formData['Latitude']) : 40.7505,
      'Longitude': formData['Longitude'] !== '' && formData['Longitude'] !== null ? parseFloat(formData['Longitude']) : -73.9934,
      'Created Date': formData['Created Date'] ? formData['Created Date'].replace('T', ' ') : new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    onSubmit(formattedPayload);
  };

  const selectedProblemType = formData['Problem (formerly Complaint Type)'] || 'Dirty Conditions';
  const isCustomProblem = Boolean(
    selectedProblemType && COMPLAINT_PROBLEMS.every((p) => p.type !== selectedProblemType)
  );

  // Find currently selected problem to list its descriptor options
  const activeProblemConfig = COMPLAINT_PROBLEMS.find(
    (p) => p.type === selectedProblemType
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Scenario Presets Bar */}
      <div className="bg-[#ECEAE2]/60 border border-[#DCDDD4] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[#254A40] uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-[#C59A52]" />
          <span>Operational Scenario Presets (Quick Fill)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => handleApplyPreset(scenario)}
              className="text-xs px-3 py-1.5 rounded-md bg-white border border-[#DCDDD4] text-[#252C29] hover:border-[#254A40] hover:bg-[#F5F3ED] transition-colors text-left cursor-pointer"
            >
              <span className="font-semibold block">{scenario.title}</span>
              <span className="text-[11px] text-[#68716A]">{scenario.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <Notice variant="danger" title="Prediction Request Failed">
          {error}
        </Notice>
      )}

      {/* Section 1: Complaint & Agency Classification */}
      <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
        <h4 className="text-sm font-semibold text-[#252C29] mb-4 pb-2 border-b border-[#ECEAE2]">
          1. Issue Classification & Responsible Agency
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Complaint Type */}
          <div>
            <label
              htmlFor="complaintType"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Complaint Type <span className="text-[#B4483E]">*</span>
            </label>
            <select
              id="complaintType"
              name="Problem (formerly Complaint Type)"
              value={selectedProblemType}
              onChange={handleProblemChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              {isCustomProblem && (
                <option key={selectedProblemType} value={selectedProblemType}>
                  {selectedProblemType}
                </option>
              )}
              {COMPLAINT_PROBLEMS.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.type}
                </option>
              ))}
            </select>
            {formErrors['Problem (formerly Complaint Type)'] && (
              <p className="text-xs text-[#B4483E] mt-1">
                {formErrors['Problem (formerly Complaint Type)']}
              </p>
            )}
            <p className="text-[11px] text-[#68716A] mt-1">
              Model feature: <code className="font-mono text-[10px]">Problem (formerly Complaint Type)</code>
            </p>
          </div>

          {/* Problem Detail */}
          <div>
            <label
              htmlFor="problemDetail"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Problem Detail (Descriptor)
            </label>
            {activeProblemConfig && activeProblemConfig.details.length > 0 ? (
              <select
                id="problemDetail"
                name="Problem Detail (formerly Descriptor)"
                value={formData['Problem Detail (formerly Descriptor)']}
                onChange={handleChange}
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
              >
                {activeProblemConfig.details.map((detail) => (
                  <option key={detail} value={detail}>
                    {detail}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="problemDetail"
                type="text"
                name="Problem Detail (formerly Descriptor)"
                value={formData['Problem Detail (formerly Descriptor)']}
                onChange={handleChange}
                className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
              />
            )}
            <p className="text-[11px] text-[#68716A] mt-1">
              Specific issue detail observed on site
            </p>
          </div>

          {/* Agency Code */}
          <div>
            <label
              htmlFor="agency"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Agency Code <span className="text-[#B4483E]">*</span>
            </label>
            <select
              id="agency"
              name="Agency"
              value={formData['Agency']}
              onChange={(e) => {
                const code = e.target.value;
                const match = AGENCIES.find((a) => a.code === code);
                setFormData((prev) => ({
                  ...prev,
                  Agency: code,
                  'Agency Name': match ? match.name : prev['Agency Name'],
                }));
              }}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              {AGENCIES.map((agency) => (
                <option key={agency.code} value={agency.code}>
                  {agency.code} — {agency.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reporting Channel */}
          <div>
            <label
              htmlFor="channel"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Reporting Intake Channel
            </label>
            <select
              id="channel"
              name="Open Data Channel Type"
              value={formData['Open Data Channel Type']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section 2: Geographic & Municipal Location */}
      <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
        <h4 className="text-sm font-semibold text-[#252C29] mb-4 pb-2 border-b border-[#ECEAE2]">
          2. Geographic Location & Jurisdiction
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Borough */}
          <div>
            <label
              htmlFor="borough"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Borough <span className="text-[#B4483E]">*</span>
            </label>
            <select
              id="borough"
              name="Borough"
              value={formData['Borough']}
              onChange={handleBoroughChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              {BOROUGHS.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Location Type */}
          <div>
            <label
              htmlFor="locationType"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Location Type
            </label>
            <select
              id="locationType"
              name="Location Type"
              value={formData['Location Type']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              {LOCATION_TYPES.map((lt) => (
                <option key={lt} value={lt}>
                  {lt}
                </option>
              ))}
            </select>
          </div>

          {/* Incident ZIP */}
          <div>
            <label
              htmlFor="incidentZip"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Incident ZIP Code
            </label>
            <input
              id="incidentZip"
              type="text"
              name="Incident Zip"
              value={formData['Incident Zip']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            />
          </div>

          {/* City */}
          <div>
            <label
              htmlFor="city"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              City
            </label>
            <input
              id="city"
              type="text"
              name="City"
              value={formData['City']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            />
          </div>

          {/* Community Board */}
          <div>
            <label
              htmlFor="communityBoard"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Community Board
            </label>
            <input
              id="communityBoard"
              type="text"
              name="Community Board"
              value={formData['Community Board']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            />
          </div>

          {/* Council District */}
          <div>
            <label
              htmlFor="councilDistrict"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Council District
            </label>
            <input
              id="councilDistrict"
              type="number"
              name="Council District"
              value={formData['Council District']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            />
          </div>

          {/* Police Precinct */}
          <div>
            <label
              htmlFor="policePrecinct"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Police Precinct
            </label>
            <input
              id="policePrecinct"
              type="text"
              name="Police Precinct"
              value={formData['Police Precinct']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            />
          </div>

          {/* Latitude */}
          <div>
            <label
              htmlFor="latitude"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Latitude Coordinates
            </label>
            <input
              id="latitude"
              type="number"
              step="0.0001"
              name="Latitude"
              value={formData['Latitude']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29] tabular-nums"
            />
          </div>

          {/* Longitude */}
          <div>
            <label
              htmlFor="longitude"
              className="block text-xs font-semibold text-[#252C29] mb-1"
            >
              Longitude Coordinates
            </label>
            <input
              id="longitude"
              type="number"
              step="0.0001"
              name="Longitude"
              value={formData['Longitude']}
              onChange={handleChange}
              className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29] tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Temporal Intake Context */}
      <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
        <h4 className="text-sm font-semibold text-[#252C29] mb-4 pb-2 border-b border-[#ECEAE2]">
          3. Intake Timing (Creation Timestamp)
        </h4>

        <div className="max-w-md">
          <label
            htmlFor="createdDate"
            className="block text-xs font-semibold text-[#252C29] mb-1"
          >
            Creation Date & Time <span className="text-[#B4483E]">*</span>
          </label>
          <input
            id="createdDate"
            type="datetime-local"
            name="Created Date"
            value={formData['Created Date']}
            onChange={handleChange}
            className="w-full text-sm px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
          />
          {formErrors['Created Date'] && (
            <p className="text-xs text-[#B4483E] mt-1">
              {formErrors['Created Date']}
            </p>
          )}
          <p className="text-[11px] text-[#68716A] mt-1.5 leading-relaxed">
            Note: The backend automatically derives <code>Created Hour</code>, <code>Created Day</code>, <code>Created Month</code>, and <code>Created DayOfWeek</code> from this timestamp. Closed dates and actual durations are never submitted.
          </p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={() => setFormData(defaultFormData)}
          className="text-xs text-[#68716A] hover:text-[#252C29] flex items-center gap-1.5 cursor-pointer py-2 px-3 rounded-md hover:bg-[#ECEAE2]"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Form Defaults</span>
        </button>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          icon={Send}
        >
          Estimate resolution time
        </Button>
      </div>
    </form>
  );
}
