import axios from 'axios';

// Default to configured base URL, or fall back to local FastAPI server
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Attach bearer token if present in localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('civic_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Health check endpoint: GET /health
 * Returns status, model_loaded, pipeline_includes_preprocessing, model_version
 */
export async function fetchHealth() {
  try {
    const response = await apiClient.get('/health');
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 0,
    };
  }
}

/**
 * Root metadata endpoint: GET /
 */
export async function fetchApiInfo() {
  try {
    const response = await apiClient.get('/');
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
    };
  }
}

/**
 * Predict resolution time: POST /predict
 * @param {Object} complaint - Complaint dictionary matching exact model feature keys
 */
export async function predictResolutionTime(complaint) {
  try {
    const response = await apiClient.post('/predict', { complaint });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 500,
      validationDetails: error.response?.data?.detail,
    };
  }
}

/**
 * Historical dataset accessibility check: GET /api/historical/status
 */
export async function fetchHistoricalStatus() {
  try {
    const response = await apiClient.get('/api/historical/status');
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 500,
    };
  }
}

/**
 * Paginated historical complaints: GET /api/historical/complaints
 */
export async function fetchHistoricalComplaints(params = {}) {
  try {
    const response = await apiClient.get('/api/historical/complaints', { params });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 500,
    };
  }
}

/**
 * Single historical complaint point-lookup: GET /api/historical/complaints/{unique_key}
 */
export async function fetchHistoricalComplaintDetail(uniqueKey, scanLimit) {
  try {
    const params = scanLimit ? { scan_limit: scanLimit } : {};
    const response = await apiClient.get(`/api/historical/complaints/${encodeURIComponent(uniqueKey)}`, { params });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 500,
    };
  }
}

/**
 * Historical analytics summary: GET /api/historical/analytics/summary
 */
export async function fetchHistoricalSummary(forceRefresh = false, scanLimit) {
  try {
    const params = {};
    if (forceRefresh) params.force_refresh = true;
    if (scanLimit) params.scan_limit = scanLimit;
    const response = await apiClient.get('/api/historical/analytics/summary', { params });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 500,
    };
  }
}

/**
 * Historical chart distributions: GET /api/historical/analytics/distributions
 */
export async function fetchHistoricalDistributions(forceRefresh = false, scanLimit) {
  try {
    const params = {};
    if (forceRefresh) params.force_refresh = true;
    if (scanLimit) params.scan_limit = scanLimit;
    const response = await apiClient.get('/api/historical/analytics/distributions', { params });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 500,
    };
  }
}

/**
 * Dynamic filter options: GET /api/historical/filters
 */
export async function fetchHistoricalFilters(scanLimit) {
  try {
    const params = scanLimit ? { scan_limit: scanLimit } : {};
    const response = await apiClient.get('/api/historical/filters', { params });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      status: error.response?.status || 500,
    };
  }
}

/**
 * Format Axios errors into clean, user-facing error strings
 */
function formatApiError(error) {
  if (error.response) {
    const detail = error.response.data?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (detail && typeof detail === 'object') {
      if (detail.message) {
        const missing = detail.missing_features ? ` (Missing: ${detail.missing_features.join(', ')})` : '';
        return `${detail.message}${missing}`;
      }
      return JSON.stringify(detail);
    }
    return `Server responded with status ${error.response.status}`;
  } else if (error.request) {
    return 'The backend service is unavailable. Check that the FastAPI server is running on port 8000.';
  } else {
    return error.message || 'An unexpected request error occurred.';
  }
}

/**
 * --------------------------------------------------
 * OPERATIONAL APPLICATION API CLIENT FUNCTIONS
 * --------------------------------------------------
 */

export async function loginUser(email, password) {
  try {
    const res = await apiClient.post('/api/operations/auth/login', { email, password });
    if (res.data?.token) {
      localStorage.setItem('civic_auth_token', res.data.token);
    }
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function registerUser(userData) {
  try {
    const res = await apiClient.post('/api/operations/auth/register', userData);
    if (res.data?.token) {
      localStorage.setItem('civic_auth_token', res.data.token);
    }
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchCurrentUser() {
  try {
    const res = await apiClient.get('/api/operations/auth/me');
    return { success: true, data: res.data?.user };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchDepartments() {
  try {
    const res = await apiClient.get('/api/operations/departments');
    return { success: true, data: res.data?.departments || [] };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchStaffList(department) {
  try {
    const params = department && department !== 'ALL' ? { department } : {};
    const res = await apiClient.get('/api/operations/staff-list', { params });
    return { success: true, data: res.data?.staff || [] };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchAddressSuggestions(query, borough) {
  try {
    const params = { query };
    if (borough && borough !== 'ALL') params.borough = borough;
    const res = await apiClient.get('/api/operations/geocoding/autocomplete', { params });
    return { success: true, data: res.data?.suggestions || [] };
  } catch (error) {
    return { success: false, error: formatApiError(error), data: [] };
  }
}

export async function reverseGeocodeCoordinates(latitude, longitude) {
  try {
    const params = { lat: latitude, lon: longitude };
    const res = await apiClient.get('/api/operations/geocoding/reverse', { params });
    return { success: res.data?.success ?? false, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error), data: null };
  }
}

export async function submitOperationalComplaint(complaintData) {
  try {
    const res = await apiClient.post('/api/operations/complaints', complaintData);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchOperationalComplaints(params = {}) {
  try {
    const res = await apiClient.get('/api/operations/complaints', { params });
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchOperationalComplaintDetail(referenceNo) {
  try {
    const res = await apiClient.get(`/api/operations/complaints/${referenceNo}`);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function assignOperationalComplaint(referenceNo, payload) {
  try {
    const res = await apiClient.post(`/api/operations/complaints/${referenceNo}/assign`, payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function updateOperationalPriority(referenceNo, payload) {
  try {
    const res = await apiClient.post(`/api/operations/complaints/${referenceNo}/priority`, payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function updateOperationalStatus(referenceNo, payload) {
  try {
    const res = await apiClient.post(`/api/operations/complaints/${referenceNo}/status`, payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function addOperationalNote(referenceNo, payload) {
  try {
    const res = await apiClient.post(`/api/operations/complaints/${referenceNo}/notes`, payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function submitComplaintFeedback(referenceNo, payload) {
  try {
    const res = await apiClient.post(`/api/operations/complaints/${referenceNo}/feedback`, payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchUserNotifications() {
  try {
    const res = await apiClient.get('/api/operations/notifications');
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function markNotificationRead(notificationId) {
  try {
    const res = await apiClient.post(`/api/operations/notifications/${notificationId}/read`);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export async function fetchOperationalAnalytics() {
  try {
    const res = await apiClient.get('/api/operations/analytics/overview');
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

/**
 * Pre-submission duplicate check advisory: POST /api/operations/complaints/check-duplicate
 */
export async function checkComplaintDuplicates(payload) {
  try {
    const res = await apiClient.post('/api/operations/complaints/check-duplicate', payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

/**
 * Admin Duplicate Review Queue: GET /api/operations/duplicates?status={status}
 */
export async function fetchDuplicateReviewQueue(status = 'PENDING') {
  try {
    const res = await apiClient.get(`/api/operations/duplicates?status=${encodeURIComponent(status)}`);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

/**
 * Admin Duplicate Action: POST /api/operations/duplicates/{id}/review
 * @param {number|string} id - Candidate pair ID
 * @param {Object} payload - { action: 'LINK' | 'DISMISS', reason: string }
 */
export async function reviewDuplicateCandidate(id, payload) {
  try {
    const res = await apiClient.post(`/api/operations/duplicates/${id}/review`, payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

/**
 * Phase 3: Staff upload completion evidence (multipart/form-data)
 * @param {string} referenceNo
 * @param {FormData} formData
 */
export async function uploadCompletionEvidence(referenceNo, formData) {
  try {
    const res = await apiClient.post(`/api/operations/complaints/${referenceNo}/evidence`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

/**
 * Phase 3: Fetch evidence metadata list for complaint
 * @param {string} referenceNo
 */
export async function fetchComplaintEvidence(referenceNo) {
  try {
    const res = await apiClient.get(`/api/operations/complaints/${referenceNo}/evidence`);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

/**
 * Phase 3: Securely fetch evidence image blob with Authorization header (no URL query token leakage)
 * @param {number|string} evidenceId
 */
export async function fetchEvidenceImageBlob(evidenceId) {
  try {
    const res = await apiClient.get(`/api/operations/evidence/${evidenceId}/file`, {
      responseType: 'blob',
    });
    const blobUrl = URL.createObjectURL(res.data);
    return { success: true, url: blobUrl };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

/**
 * Phase 3: Admin verify complaint resolution (APPROVE or REJECT)
 * @param {string} referenceNo
 * @param {Object} payload - { action: 'APPROVE' | 'REJECT', rejection_reason?: string, notes?: string }
 */
export async function verifyComplaintResolution(referenceNo, payload) {
  try {
    const res = await apiClient.post(`/api/operations/complaints/${referenceNo}/verify`, payload);
    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: formatApiError(error) };
  }
}

export default apiClient;
