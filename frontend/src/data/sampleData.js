/**
 * Demonstration dataset for UI previews and analytical distribution views.
 * 
 * NOTICE: As documented in the model configuration, the current backend 
 * only exposes prediction and health check endpoints. The complaints log 
 * and historical aggregate series below are sample records derived from 
 * public NYC 311 distributions to demonstrate UI capabilities.
 */

export const IS_DEMO_DATA = true;
export const DEMO_DATA_NOTICE = 'Demonstration Data Preview: Historical analytics and complaints archive are sample records and offline evaluation benchmarks, not a live operational database or streaming telemetry.';

export const SAMPLE_COMPLAINTS = [
  {
    id: 'SR-2024-88412',
    agency: 'DSNY',
    agencyName: 'Department of Sanitation',
    problem: 'Dirty Conditions',
    problemDetail: 'Trash / Illegal Dumping',
    locationType: 'Sidewalk',
    borough: 'MANHATTAN',
    incidentZip: '10001',
    city: 'NEW YORK',
    communityBoard: '05 MANHATTAN',
    councilDistrict: 3,
    policePrecinct: '14',
    channel: 'ONLINE',
    createdDate: '2024-04-14 09:15',
    status: 'In Progress',
    predictedDays: 2.08,
    actualDays: null,
    priority: 'Standard'
  },
  {
    id: 'SR-2024-88395',
    agency: 'DEP',
    agencyName: 'Department of Environmental Protection',
    problem: 'Water Maintenance',
    problemDetail: 'Leak (Hydrant)',
    locationType: 'Street',
    borough: 'QUEENS',
    incidentZip: '11101',
    city: 'QUEENS',
    communityBoard: '02 QUEENS',
    councilDistrict: 26,
    policePrecinct: '108',
    channel: 'PHONE',
    createdDate: '2024-04-14 08:30',
    status: 'Assigned',
    predictedDays: 0.94,
    actualDays: null,
    priority: 'Elevated'
  },
  {
    id: 'SR-2024-88310',
    agency: 'DOT',
    agencyName: 'Department of Transportation',
    problem: 'Street Condition',
    problemDetail: 'Pothole',
    locationType: 'Street',
    borough: 'BROOKLYN',
    incidentZip: '11201',
    city: 'BROOKLYN',
    communityBoard: '02 BROOKLYN',
    councilDistrict: 33,
    policePrecinct: '84',
    channel: 'MOBILE',
    createdDate: '2024-04-13 16:45',
    status: 'In Progress',
    predictedDays: 3.42,
    actualDays: null,
    priority: 'Standard'
  },
  {
    id: 'SR-2024-88289',
    agency: 'NYPD',
    agencyName: 'New York City Police Department',
    problem: 'Illegal Parking',
    problemDetail: 'Blocked Hydrant',
    locationType: 'Street',
    borough: 'BRONX',
    incidentZip: '10451',
    city: 'BRONX',
    communityBoard: '01 BRONX',
    councilDistrict: 17,
    policePrecinct: '40',
    channel: 'PHONE',
    createdDate: '2024-04-13 14:10',
    status: 'Closed',
    predictedDays: 0.45,
    actualDays: 0.38,
    priority: 'Immediate'
  },
  {
    id: 'SR-2024-88155',
    agency: 'DOT',
    agencyName: 'Department of Transportation',
    problem: 'Street Light Condition',
    problemDetail: 'Lamppost Missing',
    locationType: 'Sidewalk',
    borough: 'STATEN ISLAND',
    incidentZip: '10301',
    city: 'STATEN ISLAND',
    communityBoard: '01 STATEN ISLAND',
    councilDistrict: 49,
    policePrecinct: '120',
    channel: 'ONLINE',
    createdDate: '2024-04-12 11:20',
    status: 'Under Review',
    predictedDays: 5.15,
    actualDays: null,
    priority: 'Standard'
  },
  {
    id: 'SR-2024-88092',
    agency: 'DEP',
    agencyName: 'Department of Environmental Protection',
    problem: 'Noise - Commercial',
    problemDetail: 'Exhaust Fan',
    locationType: 'Commercial',
    borough: 'MANHATTAN',
    incidentZip: '10013',
    city: 'NEW YORK',
    communityBoard: '02 MANHATTAN',
    councilDistrict: 1,
    policePrecinct: '05',
    channel: 'ONLINE',
    createdDate: '2024-04-12 09:00',
    status: 'Closed',
    predictedDays: 4.80,
    actualDays: 4.65,
    priority: 'Low'
  },
  {
    id: 'SR-2024-87980',
    agency: 'NYPD',
    agencyName: 'New York City Police Department',
    problem: 'Noise - Residential',
    problemDetail: 'Loud Music/Party',
    locationType: 'Residential Building/House',
    borough: 'BROOKLYN',
    incidentZip: '11211',
    city: 'BROOKLYN',
    communityBoard: '01 BROOKLYN',
    councilDistrict: 34,
    policePrecinct: '94',
    channel: 'MOBILE',
    createdDate: '2024-04-11 23:15',
    status: 'Closed',
    predictedDays: 0.25,
    actualDays: 0.22,
    priority: 'Immediate'
  },
  {
    id: 'SR-2024-87840',
    agency: 'DSNY',
    agencyName: 'Department of Sanitation',
    problem: 'Rodent',
    problemDetail: 'Rat Sighting',
    locationType: 'Sidewalk',
    borough: 'QUEENS',
    incidentZip: '11377',
    city: 'WOODSIDE',
    communityBoard: '02 QUEENS',
    councilDistrict: 26,
    policePrecinct: '108',
    channel: 'ONLINE',
    createdDate: '2024-04-11 15:30',
    status: 'Assigned',
    predictedDays: 6.20,
    actualDays: null,
    priority: 'Standard'
  }
];

export const RESOLUTION_DISTRIBUTION = [
  { range: '< 12 hrs', count: 4120, percentage: 28.4 },
  { range: '12–24 hrs', count: 3250, percentage: 22.4 },
  { range: '1–2 days', count: 2890, percentage: 19.9 },
  { range: '2–4 days', count: 2150, percentage: 14.8 },
  { range: '4–7 days', count: 1320, percentage: 9.1 },
  { range: '> 7 days', count: 770, percentage: 5.3 }
];

export const CATEGORY_WORKLOAD = [
  { category: 'Illegal Parking', requests: 4890, medianDays: 0.42, avgHours: 10.1 },
  { category: 'Noise Complaints', requests: 3740, medianDays: 0.28, avgHours: 6.7 },
  { category: 'Dirty Conditions', requests: 2810, medianDays: 1.85, avgHours: 44.4 },
  { category: 'Water Maintenance', requests: 1920, medianDays: 1.15, avgHours: 27.6 },
  { category: 'Street Condition', requests: 1640, medianDays: 3.40, avgHours: 81.6 },
  { category: 'Street Lighting', requests: 1120, medianDays: 5.60, avgHours: 134.4 },
  { category: 'Rodent Sightings', requests: 880, medianDays: 6.10, avgHours: 146.4 }
];

export const BOROUGH_STATS = [
  { borough: 'MANHATTAN', total: 4210, medianDays: 1.2, reviewNeeded: 84 },
  { borough: 'BROOKLYN', total: 4850, medianDays: 1.6, reviewNeeded: 112 },
  { borough: 'QUEENS', total: 3920, medianDays: 1.9, reviewNeeded: 96 },
  { borough: 'BRONX', total: 2980, medianDays: 1.4, reviewNeeded: 72 },
  { borough: 'STATEN ISLAND', total: 1040, medianDays: 2.3, reviewNeeded: 31 }
];

export const WEEKLY_VOLUME_TREND = [
  { day: 'Mon', requests: 2420, avgResolutionHours: 28 },
  { day: 'Tue', requests: 2650, avgResolutionHours: 26 },
  { day: 'Wed', requests: 2580, avgResolutionHours: 25 },
  { day: 'Thu', requests: 2710, avgResolutionHours: 29 },
  { day: 'Fri', requests: 2890, avgResolutionHours: 34 },
  { day: 'Sat', requests: 2130, avgResolutionHours: 22 },
  { day: 'Sun', requests: 1620, avgResolutionHours: 21 }
];

export const OPERATIONAL_OBSERVATIONS = [
  {
    type: 'warning',
    title: 'Street Lighting backlogs in Outer Boroughs',
    body: 'Street lighting requests in Staten Island and Eastern Queens average 5.6 days to resolve, exceeding the municipal service standard by 42%.'
  },
  {
    type: 'info',
    title: 'Noise response turnaround stable',
    body: 'NYPD and DEP commercial noise dispatches consistently resolve under 8 hours (median: 6.7 hours) across all five boroughs.'
  },
  {
    type: 'warning',
    title: 'Weather-related water maintenance surge',
    body: 'Hydrant and street pooling reports have increased 18% over the trailing 7 days following seasonal precipitation.'
  }
];
