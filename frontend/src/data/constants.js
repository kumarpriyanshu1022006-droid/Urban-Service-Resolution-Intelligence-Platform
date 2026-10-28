/**
 * Model specifications and municipal reference options
 * Derived directly from models/urban_resolution_final_config.json
 */

export const MODEL_SPECS = {
  modelName: 'LightGBM_L2',
  target: 'Resolution Days',
  algorithm: 'LightGBM Gradient Boosted Regressor (Level 2 Pipeline)',
  metrics: {
    maeDays: 0.3624,
    maeHours: 8.70,
    rmseDays: 0.7533,
    r2: 0.6938,
    negativeRawPredictionsHandled: 218,
  },
  preprocessing: {
    categorical: 'SimpleImputer(strategy="most_frequent") + OneHotEncoder(min_frequency=20, handle_unknown="ignore")',
    numerical: 'SimpleImputer(strategy="median")',
    postprocessing: 'Clip at zero days (negative duration prevention)',
  },
  derivedFeatures: [
    'Created Hour',
    'Created Day',
    'Created Month',
    'Created DayOfWeek',
    'Project Issue Category'
  ],
  requiredInputKeys: [
    'Agency',
    'Agency Name',
    'Problem (formerly Complaint Type)',
    'Problem Detail (formerly Descriptor)',
    'Location Type',
    'Incident Zip',
    'City',
    'Borough',
    'Community Board',
    'Council District',
    'Police Precinct',
    'Open Data Channel Type',
    'Latitude',
    'Longitude',
    'Created Date'
  ]
};

export const AGENCIES = [
  { code: 'DSNY', name: 'Department of Sanitation' },
  { code: 'NYPD', name: 'New York City Police Department' },
  { code: 'DEP', name: 'Department of Environmental Protection' },
  { code: 'DOT', name: 'Department of Transportation' },
  { code: 'DPR', name: 'Department of Parks and Recreation' },
  { code: 'DOB', name: 'Department of Buildings' },
  { code: 'HPD', name: 'Department of Housing Preservation and Development' }
];

export const COMPLAINT_PROBLEMS = [
  {
    type: 'Dirty Conditions',
    agency: 'DSNY',
    agencyName: 'Department of Sanitation',
    details: ['Trash / Illegal Dumping', 'E-Waste', 'Dumpster Overflow', 'Litter Basket / Request', 'Sidewalk Obstruction']
  },
  {
    type: 'Illegal Parking',
    agency: 'NYPD',
    agencyName: 'New York City Police Department',
    details: ['Blocked Hydrant', 'Blocked Sidewalk', 'Commercial Overnight Parking', 'Double Parked', 'Posted Sign Violation']
  },
  {
    type: 'Noise - Street/Sidewalk',
    agency: 'NYPD',
    agencyName: 'New York City Police Department',
    details: ['Loud Music/Party', 'Loud Talking', 'Street Vendor', 'Vehicle Noise']
  },
  {
    type: 'Noise - Commercial',
    agency: 'DEP',
    agencyName: 'Department of Environmental Protection',
    details: ['Loud Music/Party', 'Banging/Pounding', 'Exhaust Fan', 'Construction Equipment']
  },
  {
    type: 'Noise - Residential',
    agency: 'NYPD',
    agencyName: 'New York City Police Department',
    details: ['Loud Music/Party', 'Banging/Pounding', 'Loud Talking']
  },
  {
    type: 'Water Maintenance',
    agency: 'DEP',
    agencyName: 'Department of Environmental Protection',
    details: ['Street Flooding', 'Hydrant Running', 'No Water', 'Leak (Hydrant)', 'Sewer Backup']
  },
  {
    type: 'Street Light Condition',
    agency: 'DOT',
    agencyName: 'Department of Transportation',
    details: ['Lamppost Missing', 'Fixture Missing/Out', 'Glass Broken', 'Dayburner (On in Day)']
  },
  {
    type: 'Street Condition',
    agency: 'DOT',
    agencyName: 'Department of Transportation',
    details: ['Pothole', 'Cave-in', 'Defective Curb', 'Rough Surface', 'Line Painting']
  },
  {
    type: 'Rodent',
    agency: 'DSNY',
    agencyName: 'Department of Sanitation',
    details: ['Rat Sighting', 'Mouse Sighting', 'Signs of Rodents']
  }
];

export const BOROUGHS = [
  { name: 'MANHATTAN', defaultCity: 'NEW YORK', defaultZip: '10001', defaultLat: 40.7505, defaultLng: -73.9934, defaultBoard: '05 MANHATTAN', defaultPrecinct: '14', defaultDistrict: 3 },
  { name: 'BROOKLYN', defaultCity: 'BROOKLYN', defaultZip: '11201', defaultLat: 40.6928, defaultLng: -73.9903, defaultBoard: '02 BROOKLYN', defaultPrecinct: '84', defaultDistrict: 33 },
  { name: 'QUEENS', defaultCity: 'QUEENS', defaultZip: '11101', defaultLat: 40.7498, defaultLng: -73.9392, defaultBoard: '02 QUEENS', defaultPrecinct: '108', defaultDistrict: 26 },
  { name: 'BRONX', defaultCity: 'BRONX', defaultZip: '10451', defaultLat: 40.8174, defaultLng: -73.9242, defaultBoard: '01 BRONX', defaultPrecinct: '40', defaultDistrict: 17 },
  { name: 'STATEN ISLAND', defaultCity: 'STATEN ISLAND', defaultZip: '10301', defaultLat: 40.6425, defaultLng: -74.0768, defaultBoard: '01 STATEN ISLAND', defaultPrecinct: '120', defaultDistrict: 49 }
];

export const LOCATION_TYPES = [
  'Sidewalk',
  'Street',
  'Street/Sidewalk',
  'Residential Building/House',
  'Commercial',
  'Park/Playground',
  'Catch Basin/Sewer',
  'Highway',
  'Other (Explain Below)'
];

export const CHANNELS = ['ONLINE', 'PHONE', 'MOBILE', 'OTHER'];

export const PRESET_SCENARIOS = [
  {
    id: 'sanitation-manhattan',
    title: 'Illegal Dumping — Midtown Manhattan',
    description: 'Bulk debris reported on sidewalk via online portal.',
    data: {
      'Agency': 'DSNY',
      'Agency Name': 'Department of Sanitation',
      'Problem (formerly Complaint Type)': 'Dirty Conditions',
      'Problem Detail (formerly Descriptor)': 'Trash / Illegal Dumping',
      'Location Type': 'Sidewalk',
      'Incident Zip': '10001',
      'City': 'NEW YORK',
      'Borough': 'MANHATTAN',
      'Community Board': '05 MANHATTAN',
      'Council District': 3,
      'Police Precinct': '14',
      'Open Data Channel Type': 'ONLINE',
      'Latitude': 40.7505,
      'Longitude': -73.9934,
      'Created Date': '2024-04-10T08:30:00'
    }
  },
  {
    id: 'water-queens',
    title: 'Hydrant Leak — Long Island City, Queens',
    description: 'Running hydrant causing street pooling, reported by phone.',
    data: {
      'Agency': 'DEP',
      'Agency Name': 'Department of Environmental Protection',
      'Problem (formerly Complaint Type)': 'Water Maintenance',
      'Problem Detail (formerly Descriptor)': 'Leak (Hydrant)',
      'Location Type': 'Street',
      'Incident Zip': '11101',
      'City': 'QUEENS',
      'Borough': 'QUEENS',
      'Community Board': '02 QUEENS',
      'Council District': 26,
      'Police Precinct': '108',
      'Open Data Channel Type': 'PHONE',
      'Latitude': 40.7498,
      'Longitude': -73.9392,
      'Created Date': '2024-04-10T11:15:00'
    }
  },
  {
    id: 'pothole-brooklyn',
    title: 'Roadway Pothole — Brooklyn Heights',
    description: 'Severe roadway depression reported through 311 mobile app.',
    data: {
      'Agency': 'DOT',
      'Agency Name': 'Department of Transportation',
      'Problem (formerly Complaint Type)': 'Street Condition',
      'Problem Detail (formerly Descriptor)': 'Pothole',
      'Location Type': 'Street',
      'Incident Zip': '11201',
      'City': 'BROOKLYN',
      'Borough': 'BROOKLYN',
      'Community Board': '02 BROOKLYN',
      'Council District': 33,
      'Police Precinct': '84',
      'Open Data Channel Type': 'MOBILE',
      'Latitude': 40.6928,
      'Longitude': -73.9903,
      'Created Date': '2024-04-10T14:45:00'
    }
  },
  {
    id: 'streetlight-staten',
    title: 'Broken Lamppost — St. George, Staten Island',
    description: 'Fixture damaged during storm, reported via online form.',
    data: {
      'Agency': 'DOT',
      'Agency Name': 'Department of Transportation',
      'Problem (formerly Complaint Type)': 'Street Light Condition',
      'Problem Detail (formerly Descriptor)': 'Lamppost Missing',
      'Location Type': 'Sidewalk',
      'Incident Zip': '10301',
      'City': 'STATEN ISLAND',
      'Borough': 'STATEN ISLAND',
      'Community Board': '01 STATEN ISLAND',
      'Council District': 49,
      'Police Precinct': '120',
      'Open Data Channel Type': 'ONLINE',
      'Latitude': 40.6425,
      'Longitude': -74.0768,
      'Created Date': '2024-04-10T16:20:00'
    }
  }
];
