import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Eye,
  RotateCcw,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle
} from 'lucide-react';

import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import Modal from '../components/ui/Modal';
import {
  fetchHistoricalComplaints,
  fetchHistoricalFilters,
  fetchHistoricalComplaintDetail
} from '../services/api';

export default function Complaints({ onSelectComplaintForPredict }) {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Request sequence ref to prevent stale responses from overwriting newer queries
  const requestSeq = useRef(0);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [windowMatchingRecords, setWindowMatchingRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [scanWindowSize, setScanWindowSize] = useState(50000);
  const [scopeDisclosure, setScopeDisclosure] = useState('');

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBorough, setSelectedBorough] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_date');
  const [sortOrder, setSortOrder] = useState('desc');

  // Dynamic filter options from backend
  const [filterOptions, setFilterOptions] = useState({
    boroughs: [],
    categories: [],
    statuses: []
  });

  // Modal inspection state
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce search input by 400ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on new search
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load distinct filter options on mount
  useEffect(() => {
    let ignore = false;
    async function loadFilters() {
      const res = await fetchHistoricalFilters();
      if (!ignore && res.success && res.data) {
        setFilterOptions({
          boroughs: res.data.boroughs || [],
          categories: res.data.categories || [],
          statuses: res.data.statuses || []
        });
      }
    }
    loadFilters();
    return () => { ignore = true; };
  }, []);

  // Fetch paginated complaints
  const loadComplaints = useCallback(async () => {
    const currentSeq = ++requestSeq.current;
    setLoading(true);
    setError(null);

    const params = {
      page,
      page_size: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder
    };

    if (selectedBorough && selectedBorough !== 'ALL') params.borough = selectedBorough;
    if (selectedCategory && selectedCategory !== 'ALL') params.category = selectedCategory;
    if (selectedStatus && selectedStatus !== 'ALL') params.status = selectedStatus;
    if (debouncedSearch && debouncedSearch.trim()) params.search = debouncedSearch.trim();

    const response = await fetchHistoricalComplaints(params);

    if (currentSeq !== requestSeq.current) {
      // Discard stale response
      return;
    }

    if (response.success && response.data) {
      setComplaints(response.data.records || []);
      setTotalPages(response.data.total_pages || 1);
      setWindowMatchingRecords(response.data.window_matching_records || response.data.total_matching || 0);
      setHasNext(Boolean(response.data.has_next));
      setHasPrev(Boolean(response.data.has_prev));
      setScanWindowSize(response.data.scan_window_size || 50000);
      setScopeDisclosure(response.data.scope_disclosure || '');
    } else {
      setError(response.error || 'Failed to load historical complaints.');
    }

    setLoading(false);
  }, [page, pageSize, selectedBorough, selectedCategory, selectedStatus, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  // Reset all filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedBorough('ALL');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSortBy('created_date');
    setSortOrder('desc');
    setPage(1);
  };

  // Open detail modal with full point lookup
  const handleOpenDetail = async (complaint) => {
    setActiveComplaint(complaint);
    setDetailLoading(true);

    const res = await fetchHistoricalComplaintDetail(complaint.unique_key);
    if (res.success && res.data) {
      setActiveComplaint(res.data);
    }
    setDetailLoading(false);
  };

  // Simulate in Prediction Form
  const handleSimulateInPrediction = (record) => {
    if (!onSelectComplaintForPredict || !record) return;
    const mapped = {
      'Agency': record.agency || 'DSNY',
      'Agency Name': record.agency_name || 'Department of Sanitation',
      'Problem (formerly Complaint Type)': record.problem || 'Dirty Conditions',
      'Problem Detail (formerly Descriptor)': record.problem_detail || 'Trash / Illegal Dumping',
      'Location Type': record.location_type || 'Sidewalk',
      'Borough': record.borough || 'MANHATTAN',
      'Incident Zip': record.incident_zip || '10001',
      'City': record.city || 'NEW YORK',
      'Community Board': record.community_board || '05 MANHATTAN',
      'Council District': Number(record.council_district) || 3,
      'Police Precinct': String(record.police_precinct || '14'),
      'Open Data Channel Type': record.channel || 'ONLINE',
      'Latitude': parseFloat(record.latitude) || 40.7505,
      'Longitude': parseFloat(record.longitude) || -73.9934,
      'Created Date': record.created_date || new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    onSelectComplaintForPredict(mapped);
    setActiveComplaint(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-2 border-b border-[#DCDDD4]">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#68716A]">
              Historical Service Records & Triage
            </span>
            <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
              Complaints workspace
            </h1>
          </div>
          <Badge variant="muted">Bounded Scan Window: 50,000 Records</Badge>
        </div>
        <p className="text-xs sm:text-sm text-[#68716A] mt-1">
          Review, filter, and inspect verified municipal service requests streamed from the historical dataset. Results and match counts apply to the bounded scan window.
        </p>
      </div>

      {/* Explicit Bounded Window Disclosure Notice */}
      <Notice variant="info" title="Historical Dataset Disclosure (Bounded Scan Window)">
        {scopeDisclosure || `Results and match counts apply strictly within the bounded scan window of up to ${scanWindowSize.toLocaleString()} records from export.csv, not the full 14.48 GB archive. Unresolved requests strictly have no fabricated resolution duration.`}
      </Notice>

      {/* Backend Error Alert if query failed */}
      {error && (
        <div className="p-4 bg-[#B4483E]/10 border border-[#B4483E]/30 rounded-lg flex items-start gap-3 text-xs text-[#B4483E]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Query Error</span>
            <span>{error}</span>
          </div>
          <Button size="xs" variant="outline" onClick={loadComplaints}>
            Retry Query
          </Button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white border border-[#DCDDD4] rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search box */}
          <div className="relative lg:col-span-1">
            <Search className="w-4 h-4 text-[#68716A] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search ID, type, ZIP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            />
          </div>

          {/* Borough Filter */}
          <div>
            <select
              value={selectedBorough}
              onChange={(e) => {
                setSelectedBorough(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              <option value="ALL">All Boroughs (5 Jurisdictions)</option>
              {filterOptions.boroughs.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              {filterOptions.boroughs.length === 0 && (
                <>
                  <option value="BRONX">BRONX</option>
                  <option value="BROOKLYN">BROOKLYN</option>
                  <option value="MANHATTAN">MANHATTAN</option>
                  <option value="QUEENS">QUEENS</option>
                  <option value="STATEN ISLAND">STATEN ISLAND</option>
                </>
              )}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              <option value="ALL">All Problem Categories</option>
              {filterOptions.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {filterOptions.categories.length === 0 && (
                <>
                  <option value="Dirty Conditions">Dirty Conditions</option>
                  <option value="Illegal Parking">Illegal Parking</option>
                  <option value="Noise">Noise</option>
                  <option value="Water Maintenance">Water Maintenance</option>
                  <option value="Street Condition">Street Condition</option>
                  <option value="Street Light Condition">Street Light Condition</option>
                </>
              )}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              <option value="ALL">All Statuses</option>
              {filterOptions.statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              {filterOptions.statuses.length === 0 && (
                <>
                  <option value="In Progress">In Progress</option>
                  <option value="Closed">Closed</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Open">Open</option>
                  <option value="Pending">Pending</option>
                </>
              )}
            </select>
          </div>

          {/* Sort By / Order */}
          <div>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split(':');
                setSortBy(sb);
                setSortOrder(so);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-white border border-[#DCDDD4] rounded-md focus:border-[#254A40] focus:ring-1 focus:ring-[#254A40] text-[#252C29]"
            >
              <option value="created_date:desc">Newest First (Created Date)</option>
              <option value="created_date:asc">Oldest First (Created Date)</option>
              <option value="agency:asc">Agency (A–Z)</option>
              <option value="borough:asc">Borough (A–Z)</option>
              <option value="unique_key:desc">Unique Key (High–Low)</option>
            </select>
          </div>
        </div>

        {/* Toolbar Summary & Reset */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-[#68716A] pt-1 gap-2">
          <div>
            Showing <strong className="text-[#252C29]">{complaints.length}</strong> of{' '}
            <strong className="text-[#252C29]">{windowMatchingRecords.toLocaleString()}</strong> matching records{' '}
            <span className="text-[#8F6A2A] font-medium">
              (within bounded window of {scanWindowSize.toLocaleString()} records)
            </span>
          </div>

          {(searchTerm || selectedBorough !== 'ALL' || selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || sortBy !== 'created_date' || sortOrder !== 'desc') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[#A85D3B] hover:text-[#8c4b2e] flex items-center gap-1 cursor-pointer font-medium self-start sm:self-auto"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset active filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Complaints Data Table */}
      <Card>
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#254A40] mx-auto" />
            <p className="text-xs text-[#68716A]">Querying historical records from DuckDB engine...</p>
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-sm font-semibold text-[#252C29]">
              No complaints match these filters in the scanned window.
            </p>
            <p className="text-xs text-[#68716A]">
              Try clearing search terms or expanding your filter criteria.
            </p>
            <div className="pt-2">
              <Button size="sm" variant="outline" onClick={handleResetFilters}>
                Clear Filter Criteria
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto -mx-5 -my-5">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#DCDDD4] bg-[#ECEAE2]/60 text-[#68716A]">
                    <th className="px-5 py-3 font-semibold">Request ID</th>
                    <th className="px-3 py-3 font-semibold">Agency</th>
                    <th className="px-3 py-3 font-semibold">Category / Problem</th>
                    <th className="px-3 py-3 font-semibold">Borough & ZIP</th>
                    <th className="px-3 py-3 font-semibold">Intake Channel</th>
                    <th className="px-3 py-3 font-semibold">Created Timestamp</th>
                    <th className="px-3 py-3 font-semibold">Actual Turnaround</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEAE2]">
                  {complaints.map((item) => (
                    <tr
                      key={item.unique_key}
                      className="hover:bg-[#F5F3ED]/80 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono font-medium text-[#252C29]">
                        {item.unique_key}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-semibold text-[#254A40]">{item.agency}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-[#252C29]">{item.problem}</div>
                        <div className="text-[11px] text-[#68716A]">{item.problem_detail}</div>
                      </td>
                      <td className="px-3 py-3 text-[#252C29]">
                        <div>{item.borough}</div>
                        <div className="text-[11px] text-[#68716A] font-mono">{item.incident_zip}</div>
                      </td>
                      <td className="px-3 py-3 text-[#68716A]">
                        {item.channel}
                      </td>
                      <td className="px-3 py-3 text-[#68716A] whitespace-nowrap">
                        {item.created_date}
                      </td>
                      <td className="px-3 py-3 font-semibold text-[#254A40] tabular-nums">
                        {item.actual_resolution_days !== null && item.actual_resolution_days !== undefined ? (
                          <span>{item.actual_resolution_days.toFixed(2)} d</span>
                        ) : (
                          <span className="text-[#68716A] font-normal italic">Active / In Progress</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            item.status === 'Closed'
                              ? 'success'
                              : item.status === 'Assigned'
                              ? 'primary'
                              : 'warning'
                          }
                          size="xs"
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(item)}
                            className="p-1 text-[#68716A] hover:text-[#252C29] hover:bg-[#ECEAE2] rounded-md transition-colors cursor-pointer"
                            title="Inspect Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSimulateInPrediction(item)}
                            className="p-1 text-[#254A40] hover:text-[#19352E] hover:bg-[#ECEAE2] rounded-md transition-colors cursor-pointer"
                            title="Simulate in Prediction Tool"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            <div className="mt-4 pt-3 border-t border-[#DCDDD4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-[#68716A]">
              <div>
                Page <strong className="text-[#252C29]">{page}</strong> of{' '}
                <strong className="text-[#252C29]">{totalPages}</strong> ({windowMatchingRecords.toLocaleString()} window matches)
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || !hasPrev || loading}
                  icon={ChevronLeft}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext || page >= totalPages || loading}
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Inspection Modal */}
      {activeComplaint && (
        <Modal
          isOpen={Boolean(activeComplaint)}
          onClose={() => setActiveComplaint(null)}
          title={`Complaint Record: ${activeComplaint.unique_key}`}
          subtitle={`Logged on ${activeComplaint.created_date} • Intake via ${activeComplaint.channel}`}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveComplaint(null)}
              >
                Close View
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateInPrediction(activeComplaint)}
              >
                Estimate with Prediction Form
              </Button>
            </>
          }
        >
          {detailLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#254A40] mx-auto mb-2" />
              <p className="text-xs text-[#68716A]">Loading full record metadata...</p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-[#F5F3ED] border border-[#DCDDD4] rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-[#68716A] uppercase font-semibold">Verified Turnaround</span>
                  <p className="text-xl font-bold text-[#254A40] tabular-nums mt-0.5">
                    {activeComplaint.actual_resolution_days !== null && activeComplaint.actual_resolution_days !== undefined
                      ? `${activeComplaint.actual_resolution_days.toFixed(2)} days (${activeComplaint.actual_resolution_hours ?? (activeComplaint.actual_resolution_days * 24).toFixed(1)} hours)`
                      : 'Active / In Progress (Unresolved)'}
                  </p>
                  {activeComplaint.closed_date && (
                    <p className="text-[11px] text-[#367454] mt-0.5 font-medium">
                      Closed timestamp: {activeComplaint.closed_date}
                    </p>
                  )}
                </div>
                <Badge
                  variant={activeComplaint.status === 'Closed' ? 'success' : 'warning'}
                >
                  {activeComplaint.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[#68716A] block">Complaint Type:</span>
                  <span className="font-semibold text-[#252C29]">{activeComplaint.problem}</span>
                </div>
                <div>
                  <span className="text-[#68716A] block">Specific Descriptor:</span>
                  <span className="font-semibold text-[#252C29]">{activeComplaint.problem_detail || activeComplaint.problemDetail}</span>
                </div>
                <div>
                  <span className="text-[#68716A] block">Agency:</span>
                  <span className="font-semibold text-[#252C29]">{activeComplaint.agency} — {activeComplaint.agency_name || activeComplaint.agencyName}</span>
                </div>
                <div>
                  <span className="text-[#68716A] block">Location Classification:</span>
                  <span className="font-semibold text-[#252C29]">{activeComplaint.location_type || activeComplaint.locationType}</span>
                </div>
                <div>
                  <span className="text-[#68716A] block">Address:</span>
                  <span className="font-semibold text-[#252C29]">{activeComplaint.incident_address || 'Unspecified'}</span>
                </div>
                <div>
                  <span className="text-[#68716A] block">Borough & ZIP:</span>
                  <span className="font-semibold text-[#252C29]">{activeComplaint.borough} {activeComplaint.incident_zip || activeComplaint.incidentZip}</span>
                </div>
                <div>
                  <span className="text-[#68716A] block">Community District:</span>
                  <span className="font-semibold text-[#252C29]">
                    {activeComplaint.community_board || 'N/A'} • Council {activeComplaint.council_district || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[#68716A] block">Coordinates:</span>
                  <span className="font-mono text-[#68716A]">
                    {activeComplaint.latitude ? `${parseFloat(activeComplaint.latitude).toFixed(4)}, ${parseFloat(activeComplaint.longitude).toFixed(4)}` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
